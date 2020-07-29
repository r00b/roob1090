const logger = require('../../lib/logger').get('airport-service');
const _ = require('lodash');
const RedisService = require('../../services/redis-service');
const { point, polygon } = require('@turf/helpers');
const pointInPolygon = require('@turf/boolean-point-in-polygon').default;
const configPath = require('worker_threads').workerData.job.configPath;

const redis = new RedisService();

(async () => {
  try {
    const airport = require(`../${configPath}`);
    const aircraft = await redis.hgetAllJsonValues('store:valid');
    if (!aircraft.length) return exit(0);

    const {
      arrivals,
      departures,
      onRunway
    } = await computeAirportBoard(aircraft, airport);
    // TODO do something with this data
    exit(0);
  } catch (e) {
    logger.error(e.message);
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
    logger.warn(`unable to determine approach/departure without active runway`, {
      airport: airport.key,
      route: route.key
    });
    return acc;
  }, {
    arrivals: [],
    departures: [],
    onRunway: [],
    runways: []
  });
  const board = await runs;

  logger.info(`${airport.key} board`, {
    arrivals: board.arrivals.map(a => a.flight),
    departures: board.departures.map(a => a.flight),
    onRunway: board.onRunway.map(a => a.flight),
    runways: board.runways
  });

  return board;
}

/**
 * Merge two airport boards; assumes that each board is not malformed and contains only
 * arrays as properties; does not eliminate duplicates, since this would require deep
 * object comparison
 *
 * @param a array from first board
 * @param b array from second board
 * @returns merged airport boards
 */
function mergeBoards (a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    return [...a, ...b];
  } else throw new Error('expected boards to only contain arrays');
}

async function partitionAndLogRoute (aircraft, route) {
  // first, get aircraft in the two regions on either side of and inside the runway
  // this will write each region to redis so that the runway job can compute
  // the active runway
  const inHead = await reduceAndLog(aircraft, route.head);
  const inTail = await reduceAndLog(aircraft, route.tail);
  const onRunway = await reduceAndLog(aircraft, route.runway);

  // check if the active runway is already known (and thus can determine approach/departure)
  const activeRunway = await redis.get(`${route.key}:activeRunway`);
  if (!activeRunway) return false;

  // get the keys of the approach and departure region
  const approachRegion = route.getApproachRouteKey(activeRunway);
  const departureRegion = route.getDepartureRouteKey(activeRunway);

  // correspond those keys to the hashes containing the aircraft in each route
  const toArrive = approachRegion === route.head.key ? inHead : inTail;
  const departed = departureRegion === route.tail.key ? inTail : inHead;

  // partition the aircraft currently on the runway
  const {
    arrived,
    toDepart
  } = await partitionAndLogRunway(onRunway, approachRegion, departureRegion);

  return {
    arrivals: [...toArrive, ...arrived],
    departures: [...toDepart, ...departed],
    onRunway,
    runways: [activeRunway]
  };
}

async function reduceAndLog (aircraft, airspace) {
  redis.pipeline();
  const matches = aircraft.reduce((acc, aircraft) => {
    const acLoc = point([aircraft.lon, aircraft.lat]);
    const boundary = polygon(airspace.coordinates);
    const inAirspace = pointInPolygon(acLoc, boundary);
    const validAltitude = aircraft.alt_baro < airspace.maxAltitude;
    if (inAirspace && validAltitude) {
      redis.saddEx(`${airspace.key}:aircraft`, aircraft.hex, 5);
      acc.push(aircraft);
    }
    return acc;
  }, []);
  await redis.exec();
  return matches;
}

async function partitionAndLogRunway (onRunway, approachRegionKey, departureRegionKey) {
  const arrivalHexes = await redis.smembers(`${approachRegionKey}:aircraft`); // todo this string concat is bad
  redis.pipeline();
  const partition = onRunway.reduce((acc, aircraft) => {
    const hex = aircraft.hex;
    let regionKey;
    if (arrivalHexes.includes(hex)) { // aircraft was previously in arrival region
      acc.arrived.push(aircraft);
      regionKey = approachRegionKey;
    } else { // aircraft was previously in no region, must be a departure
      acc.toDepart.push(aircraft);
      regionKey = departureRegionKey;
    }
    redis.expiremember(`${regionKey}:aircraft`, hex, 5);
    return acc;
  }, {
    arrived: [],
    toDepart: []
  });
  await redis.exec();
  return partition;
}

function exit (code) {
  // flush winston and console
  logger.on('finish', function (info) {
    process.stdout.write('', () => {
      process.exit(code);
    });
  });
  logger.end();
}