const logger = require('../../lib/logger')().scope('worker airport');
const _ = require('lodash');

const airspacePath = require('worker_threads').workerData.job.airspacePath;
const RedisService = require('../../services/redis-service');
const store = require('../../stores/aircraft-store');

const { point, polygon } = require('@turf/helpers');
const pointInPolygon = require('@turf/boolean-point-in-polygon').default;
const { exit } = require('../../lib/utils');

const redis = new RedisService();

(async () => {
  try {
    const start = Date.now();
    const airport = require(`../${airspacePath}`);

    const validStore = await store.getAllValidAircraft();
    if (!validStore.aircraft.length) { // nothing to do
      return exit(0);
    }

    const board = await computeAirportBoard(validStore.aircraft, airport);
    await redis.setex(`board:${airport.key}`, 60, JSON.stringify(board));

    logger.scope('worker meta').info('airport worker completed', { module: airport.key, duration: Date.now() - start });
    exit(0);
  } catch (e) {
    logger.error(e.message, e);
    exit(1);
  }
})();

async function computeAirportBoard (aircraft, airport) {
  const routes = airport.getRoutes();

  const runs = routes.reduce(async (acc, route) => {
    const routeBoard = await partitionAndLogRoute(aircraft, route);
    if (routeBoard) {
      return _.mergeWith(acc, routeBoard, mergeBoards);
    }
    logger.warn('unable to determine approach/departure without active runway', {
      airport: airport.key,
      route: route.key
    });
    return acc;
  }, {
    arriving: [],
    arrived: [],
    departing: [],
    departed: [],
    onRunway: [],
    runways: []
  });
  const f = await runs;
  return f;
}

async function partitionAndLogRoute (aircraft, route) {
  // first, compute the aircraft in each of the three regions the comprises an airport route
  // runway worker will consume the resulting redis stores to compute the active runway
  const partition = {
    [route.head.key]: await reduceAndWriteRegion(aircraft, route.head),
    [route.runway.key]: await reduceAndWriteRegion(aircraft, route.runway),
    [route.tail.key]: await reduceAndWriteRegion(aircraft, route.tail)
  };

  // check if the active runway is already known (thus making it possible to determine approach/departure)
  const activeRunway = await redis.get(`${route.key}:activeRunway`);
  if (!activeRunway) return false;

  // get the keys of the approach and departure region
  const approachRegionKey = route.getApproachRouteKey(activeRunway);
  const departureRegionKey = route.getDepartureRouteKey(activeRunway);
  if (!approachRegionKey || !departureRegionKey) return false;

  // determine the semantic meaning of each region
  const arriving = partition[approachRegionKey];
  const departed = partition[departureRegionKey].reverse(); // sort in order of most recent departure
  const onRunway = partition[route.runway.key];

  // partition the aircraft currently on the runway
  const {
    arrived,
    departing
  } = await partitionAndWriteRunway(onRunway, route.parent);

  // write the aircraft into each store
  // TODO consider avoiding all of these map operations
  const pipeline = redis.pipeline();
  const parentKey = route.parent;
  const ex = 2;
  pipeline.saddEx(`${parentKey}:arrived`, ex, ...arrived.map(hex));
  pipeline.saddEx(`${parentKey}:departing`, ex, ...departing.map(hex));
  pipeline.saddEx(`${parentKey}:onRunway`, ex, ...onRunway.map(hex));
  // arriving and departed are sorted, so a sorted set is used
  pipeline.zaddEx(`${parentKey}:arriving`, ex, ...scoreArray(arriving.map(hex)));
  pipeline.zaddEx(`${parentKey}:departed`, ex, ...scoreArray(departed.map(hex)));
  await pipeline.exec();

  return {
    arriving,
    arrived,
    departing,
    departed,
    onRunway,
    runways: [activeRunway]
  };
}

/**
 * Reduces an array of aircraft to those currently located within the region, as
 * defined by the region's boundary property; write them to their respective stores
 *
 * @param {aircraft[]} aircraft - array of hashes for all valid aircraft
 * @param region - a region object taken from the route object
 * @returns array of aircraft objects currently located within the region
 */
async function reduceAndWriteRegion (aircraft, region) {
  const pipeline = redis.pipeline();
  const matches = aircraft.reduce((acc, aircraft) => {
    const ac = point([aircraft.lon, aircraft.lat]);
    const boundary = polygon(region.coordinates);
    const inAirspace = pointInPolygon(ac, boundary);
    const validAltitude = aircraft.alt_baro < region.maxAltitude;
    if (inAirspace && validAltitude) {
      pipeline.saddEx(`${region.key}:aircraft`, 5, aircraft.hex);
      acc.push(aircraft);
    }
    return acc;
  }, []);
  await pipeline.exec();

  // sort the array if the region has a sort fn
  if (region.sort) {
    matches.sort(region.sort);
  }

  const enrichedMatches = matches.reduce(async (acc, a) => {
    const hex = a.hex;
    const enrichments = await redis.hgetJson('store:enrichments', hex) || {};
    const results = {};
    Object.assign(results, a, enrichments);
    acc.push(results);
    return acc;
  }, []);
  const result = await enrichedMatches;

  return result;
}

/**
 * Partition an array of aircraft known to be currently located in the runway region
 * into arrivals and departures; write them to their respective stores
 *
 * @param {aircraft[]} onRunway - array of aircraft objects in the runway region
 * @param {string} parentKey - route key
 * @returns hash containing two arrays of aircraft objects, one for arrived and one
 *          for departed aircraft
 */
async function partitionAndWriteRunway (onRunway, parentKey) {
  // get all aircraft that are arriving on the route
  const arrivalHexes = await redis.zmembers(`${parentKey}:arriving`);
  const arrivedHexes = await redis.smembers(`${parentKey}:arrived`);
  return onRunway.reduce((acc, aircraft) => {
    const hex = aircraft.hex;
    if ([...arrivedHexes, ...arrivalHexes].includes(hex)) {
      // aircraft was previously arriving or already arrived, so it must be inbound
      // and thus an arrival
      acc.arrived.push(aircraft);
    } else {
      // aircraft was previously in no region, so it must be outbound
      acc.departing.push(aircraft);
    }
    return acc;
  }, {
    arrived: [],
    departing: []
  });
}

/**
 * Merge two airport boards; assumes that each board is not malformed and contains only
 * arrays as properties; does not eliminate duplicates, since this would require deep
 * object comparison
 *
 * @param a - array from first board
 * @param b - array from second board
 * @returns merged airport boards
 */
function mergeBoards (a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    return [...a, ...b];
  } else throw new Error('expected boards to only contain arrays');
}

/**
 * Map an array of values to an array of their indices followed by the value
 *
 * @param {any[]} arr - array of values
 * @returns {String<index, value>[]}
 */
function scoreArray (arr) {
  const res = [];
  // could be done via reduce or one-liner, but would not be as performant
  for (let i = 0; i < arr.length; i++) {
    res.push(`${i}`, arr[i]);
  }
  return res;
}

function hex (aircraft) {
  return aircraft.hex;
}