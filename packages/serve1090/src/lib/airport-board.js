const _ = require('lodash');
const {
  compareDistance,
  hex
} = require('./utils');
const partitionAircraft = require('./partition-aircraft');
const activeRunway = require('./active-runway');
const pMap = require('p-map');

const {
  BOARD,
  ARRIVALS,
  DEPARTURES,
  REGION_AIRCRAFT,
  ENRICHMENTS
} = require('../lib/redis-keys');
const BOARD_TTL = 15;
const STATUS_TTL = 60;
const REGION_TTL = 2;
const FAIL_MESSAGE = 'unable to compute airport board';

module.exports = (store, redis, logger) => {
  const scopedLogger = logger.scope('airport-board');
  const partitionFns = partitionAircraft(redis, logger);
  const { getActiveRunway } = activeRunway(redis, store);
  partitionFns.getActiveRunway = getActiveRunway;
  return {
    computeAirportBoard: computeAirportBoard(partitionFns, store, redis, scopedLogger),
    boardTemplate
  };
};

/**
 * Return a function that will compute the aircraft board for a specified airport
 */
function computeAirportBoard (partitionFns, store, redis, logger) {
  /**
   * @param airport {object} - airport hash
   */
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
 *
 * @param airport {object}
 * @param aircraftHashes {aircraft[]}
 * @param partitionFns {object} - hash containing functions necessary to partition
 *                                aircraft into regions
 * @param redis
 * @param logger
 * @returns {Promise<{departing: aircraft[], arrived: aircraft[], onRunway: aircraft[], departed: aircraft[], arriving: aircraft[], activeRunways: string[]}|undefined>}
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

  const pipeline = redis.pipeline();
  // arrivals and departure sets are not sorted (only the board); this set will be consumed
  // to generate enrichments, but it does not depend on them being sorted
  pipeline.saddEx(ARRIVALS(airport.key), STATUS_TTL, ...arrivals.map(hex));
  pipeline.saddEx(DEPARTURES(airport.key), STATUS_TTL, ...departures.map(hex));
  pipeline.setex(BOARD(airport.key), BOARD_TTL, JSON.stringify(airportBoard));
  await pipeline.exec();

  return airportBoard;
}

/**
 * Compute board for a specified route; note that an empty board is NOT returned if, for any
 * reason, it is not possible to compute the board, since an empty board implies there are no
 * aircraft in the route
 *
 * @param route {object}
 * @param aircraftHashes {aircraft[]}
 * @param partitionFns {object}
 * @param redis
 * @param logger
 * @returns {Promise<{departing: aircraft[], arrived: aircraft[], onRunway: aircraft[], departed: aircraft[], arriving: aircraft[], activeRunways: string[]}|undefined>}
 */
async function computeBoardForRoute (route, aircraftHashes, partitionFns, redis, logger) {
  const {
    partitionAircraftInRegion,
    partitionAircraftInRunway,
    getActiveRunway
  } = partitionFns;

  // first get and enrich aircraft located in the runway
  const aircraftInRunway = partitionAircraftInRegion(aircraftHashes, route.runway);
  const partition = {
    [route.runway.key]: await pMap(aircraftInRunway, enrich(redis))
  };

  // then get and enrich aircraft located in each of the regions
  for (const region of route.regions) {
    const aircraftInRegion = partitionAircraftInRegion(aircraftHashes, region);
    partition[region.key] = await pMap(aircraftInRegion, enrich(redis));
  }

  // write regions to redis so that active runway can be calculated by runway worker
  await writePartition(partition, route, redis);

  // check if the active runway is already known (thus making it possible to determine approach/departure)
  const activeRunway = await getActiveRunway(route);
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

  // determine the semantic meaning of each region
  const arriving = partition[approachRegionKey];
  const departed = partition[departureRegionKey];
  // go-arounds: could intersect routeKey:arrivals with departed to compute aircraft that are going around and exclude them
  // from this array; however, probably not worth the extra read from memory since go-arounds are rare
  const onRunway = partition[route.runway.key];

  if (!arriving || !departed || !onRunway) {
    logger.warn(FAIL_MESSAGE, { reason: 'computed approach/departure keys, but failed to find all respective routes in partition' });
    return;
  }

  // partition the aircraft currently on the runway
  const {
    arrived,
    departing
  } = await partitionAircraftInRunway(onRunway, route.key);

  const arrivals = [...arrived, ...arriving];
  const departures = [...departing, ...departed];

  // store arrivals and departures on the route so that the runway can be partitioned by
  // partition-aircraft into arrivals and departures
  const pipeline = redis.pipeline();
  pipeline.saddEx(ARRIVALS(route.key), STATUS_TTL, ...arrivals.map(hex));
  pipeline.saddEx(DEPARTURES(route.key), STATUS_TTL, ...departures.map(hex));
  await pipeline.exec();

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
 * Merge a route board's aircraft hashes into an airport board's aircraft;
 * note: this does not consider sorting, so any sorting should be done after
 * the merge
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
 *
 * @param partition {object} - has of partition arrays containing aircraft
 * @param route {object}
 * @param redis
 */
function writePartition (partition, route, redis) {
  const pipeline = redis.pipeline();
  for (const [regionKey, aircraft] of Object.entries(partition)) {
    pipeline.saddEx(REGION_AIRCRAFT(regionKey), REGION_TTL, ...aircraft.map(hex));
  }
  return pipeline.exec();
}

/**
 * Augment an aircraft hash with enrichments already generated and stored in redis
 */
function enrich (redis) {
  /**
   * @param aircraft {object}
   */
  return async (aircraft) => {
    const enrichments = await redis.hgetAsJson(ENRICHMENTS, aircraft.hex);
    return enrichments ? _.merge(aircraft, enrichments) : aircraft;
  };
}

/**
 * Sort the arriving and departing arrays in a board according to distance;
 * aircraft located on the runway are not sorted since theoretically/hopefully
 * there should never be more than one departing or arriving aircraft on the
 * runway at a time :)
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
