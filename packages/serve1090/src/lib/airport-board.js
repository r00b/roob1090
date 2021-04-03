const _ = require('lodash');
const {
  compareDistance,
  hex
} = require('./utils');
const partitionAircraft = require('./partition-aircraft');

const BOARD_TTL = 15;
const STATUS_TTL = 60;
const REGION_TTL = 2;
const FAIL_MESSAGE = 'unable to compute airport board';

module.exports = (store, redis, logger) => {
  const scopedLogger = logger.scope('airport-board');
  const partitionFns = partitionAircraft(redis, logger);
  return {
    computeAirportBoard: computeAirportBoard(partitionFns, store, redis, scopedLogger),
    boardTemplate
  };
};

/**
 * Return a function that will compute the aircraft board for a specified airport
 */
function computeAirportBoard (partitionFns, store, redis, logger) {
  return async (airport) => {
    try {
      const start = Date.now();
      const aircraftStore = await store.getValidAircraft();
      if (!_.get(aircraftStore, 'aircraft.length')) {
        logger.warn(FAIL_MESSAGE, { reason: 'no valid aircraft in store' });
        return;
      }
      const board = await buildAndWriteBoard(airport, aircraftStore.aircraft, partitionFns, redis, logger);
      if (board) { // board will be false if it could not be computed
        logger.info('computed airport board', { airport: airport.key, duration: Date.now() - start });
      }
      return board;
    } catch (e) {
      logger.error(FAIL_MESSAGE, { error: e });
    }
  };
}

/**
 * Build a board for an airport and write it and its associated regions to redis
 */
async function buildAndWriteBoard (airport, aircraftHashes, partitionFns, redis, logger) {
  const routes = airport.routes || [];
  let airportBoard = boardTemplate();

  for (const route of routes) {
    const routeBoard = await computeBoardForRoute(route, aircraftHashes, partitionFns, redis, logger);
    if (!routeBoard) {
      // bail out if unable to compute any route, since returning an empty or incomplete
      // board implies there are no aircraft, which might not be the case
      return;
    }
    _.mergeWith(airportBoard, routeBoard, mergeRouteIntoAirport);
  }

  airportBoard = sortBoard(airportBoard, airport);

  const arrivals = [...airportBoard.arrived, ...airportBoard.arriving];
  const departures = [...airportBoard.departing, ...airportBoard.departed];

  await redis.execPipeline([
    {
      op: 'saddEx',
      args: [`${airport.key}:arrivals`, STATUS_TTL, ...arrivals.map(hex)]
    }, {
      op: 'saddEx',
      args: [`${airport.key}:departures`, STATUS_TTL, ...departures.map(hex)]
    }, {
      op: 'setex',
      args: [`${airport.key}:board`, BOARD_TTL, JSON.stringify(airportBoard)]
    }
  ]);

  return airportBoard;
}

/**
 * Compute board for a specified route
 */
async function computeBoardForRoute (route, aircraftHashes, partitionFns, redis, logger) {
  const {
    partitionAircraftInRegion,
    partitionAircraftInRunway
  } = partitionFns;
  const partition = {
    [route.runway.key]: partitionAircraftInRegion(aircraftHashes, route.runway)
  };

  for (const region of route.regions) {
    partition[region.key] = partitionAircraftInRegion(aircraftHashes, region);
  }

  await writePartition(partition, route, redis); // write regions to store so that active runway can be calculated by runway worker

  // check if the active runway is already known (thus making it possible to determine approach/departure)
  const activeRunway = await redis.get(`${route.parentKey}:${route.key}:activeRunway`);
  if (!activeRunway) {
    logger.info(FAIL_MESSAGE, { reason: 'no active runway' });
    return;
  }

  const approachRegionKey = route.getApproachRouteKey(activeRunway);
  const departureRegionKey = route.getDepartureRouteKey(activeRunway);

  if (!approachRegionKey || !departureRegionKey) {
    logger.warn(FAIL_MESSAGE, { reason: 'failed to compute approach/departure route' });
    return;
  }

  // TODO - go-arounds
  // determine the semantic meaning of each region
  const arriving = partition[approachRegionKey]; // these should be sorted from next arrival to last arrival
  const departed = partition[departureRegionKey]; // .reverse() these come sorted from most recent departure to least recent departure; reverse to sort from least recent to most recent departure
  const onRunway = partition[route.runway.key]; // these should not be sorted since hopefully there should never be more than one departure or one arrival on the runway at a time

  if (!arriving || !departed || !onRunway) {
    logger.warn(FAIL_MESSAGE, { reason: 'computed approach/departure route, but failed to find all routes in partition' });
    return;
  }

  // partition the aircraft currently on the runway
  const {
    arrived,
    departing
  } = await partitionAircraftInRunway(onRunway, route.parentKey);

  if (!arrived || !departing) {
    logger.warn(FAIL_MESSAGE, { reason: 'failed to partition aircraft on runway' });
    return;
  }

  return boardTemplate({
    arriving,
    arrived,
    departing,
    departed,
    onRunway,
    activeRunway
  });
}

/**
 * Merge a route board's aircraft hashes into an airport board's aircraft
 *
 * @param {aircraft[]} airportValues
 * @param {aircraft[]} routeValues
 * @returns {aircraft[]} array of merged aircraft hashes
 */
function mergeRouteIntoAirport (airportValues, routeValues) {
  if (Array.isArray(airportValues) && Array.isArray(routeValues)) {
    const newValues = routeValues.filter(v => !airportValues.includes(v));
    return [...airportValues, ...newValues];
  } else throw new Error('found non-array value in board');
}

/**
 * Write a route partition to redis
 */
async function writePartition (partition, route, redis) {
  const pipeline = Object.entries(partition).reduce((acc, [regionKey, aircraft]) => {
    acc.push({
      op: 'saddEx',
      args: [`${route.parentKey}:${route.key}:${regionKey}:aircraft`, REGION_TTL, ...aircraft.map(hex)]
    });
    return acc;
  }, []);
  return redis.execPipeline(pipeline);
}

/**
 * Sort the arriving and departing arrays in a board according to distance;
 * aircraft located on the runway are not sorted since theoretically/hopefully
 * there should never be more than one departing or arriving aircraft on the
 * runway at a time
 */
function sortBoard (airportBoard, airport) {
  const comparator = (a, b) => compareDistance(a, b, airport.locus);
  airportBoard.arriving.sort(comparator); // sort from next arrival to last arrival
  airportBoard.departing.sort(comparator).reverse(); // sort from least recent to most recent departure
  return airportBoard;
}

function boardTemplate (values = {}) {
  const {
    arriving,
    arrived,
    departing,
    departed,
    onRunway,
    activeRunway,
    activeRunways
  } = values;
  return {
    arriving: arriving || [],
    arrived: arrived || [],
    departing: departing || [],
    departed: departed || [],
    onRunway: onRunway || [],
    activeRunways: activeRunway ? [activeRunway] : (activeRunways || [])
  };
}