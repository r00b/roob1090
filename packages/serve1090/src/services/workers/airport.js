const logger = require('../../lib/logger').get('airport-service');
const workerLogger = require('../../lib/logger').get('worker');
const _ = require('lodash');
const RedisService = require('../../services/redis-service');
const { point, polygon } = require('@turf/helpers');
const pointInPolygon = require('@turf/boolean-point-in-polygon').default;
const configPath = require('worker_threads').workerData.job.configPath;

const redis = new RedisService();

(async () => {
  try {
    const start = Date.now();
    const airport = require(`../${configPath}`);

    const aircraft = await redis.hgetAllAsJsonValues('store:valid');
    if (!aircraft.length) {
      return exit(0);
    }

    await computeAirportBoard(aircraft, airport);
    workerLogger.info('airport worker completed', { module: airport.key, duration: Date.now() - start });
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
    arriving: [],
    arrived: [],
    departing: [],
    departed: [],
    onRunway: [],
    runways: []
  });
  const board = await runs;


  const arriving = await redis.zmembers(`kdca:arriving`);
  const departed = await redis.zmembers(`kdca:departed`);


  // const arriving = [];
  // const departed = [];

  logger.info(`${airport.key} board`, {
    arriving: arriving,
    arrived: board.arrived.map(flight),
    departing: board.departing.map(flight),
    departed: departed,
    onRunway: board.onRunway.map(flight),
    runways: board.runways
  });

  return board;
}

async function partitionAndLogRoute (aircraft, route) {
  // first, get aircraft in the two regions on either side of and inside the runway
  // this will write each region to redis so that the runway job can compute
  // the active runway
  const inHead = await reduceAndLogRegion(aircraft, route.head);
  const inTail = await reduceAndLogRegion(aircraft, route.tail);
  const onRunway = await reduceAndLogRegion(aircraft, route.runway);

  // check if the active runway is already known (and thus can determine approach/departure)
  const activeRunway = await redis.get(`${route.key}:activeRunway`);
  if (!activeRunway) return false;

  // get the keys of the approach and departure region
  const approachRegionKey = route.getApproachRouteKey(activeRunway);
  const departureRegionKey = route.getDepartureRouteKey(activeRunway);

  // correspond those keys to the hashes containing the aircraft in each route
  const arriving = approachRegionKey === route.head.key ? inHead : inTail;
  const departed = departureRegionKey === route.tail.key ? inTail : inHead;

  arriving.sort(approachRegionKey === route.head.key ? route.head.rank : route.tail.rank);
  departed.sort(departureRegionKey === route.tail.key ? route.tail.rank : route.head.rank);

  // partition the aircraft currently on the runway
  const {
    arrived,
    departing
  } = await partitionAndLogRunway(onRunway, route);


  const p = redis.pipeli{route.pne();
  p.saddEx(`$arent}:arrived`, 5, ...arrived.map(flight));
  p.saddEx(`${route.parent}:departing`, 5, ...departing.map(flight));
  arriving.forEach((a, index) => p.zaddEx(`${route.parent}:arriving`, 5, index, a.flight));
  departed.forEach((d, index) => p.zaddEx(`${route.parent}:departed`, 5, index, d.flight));
  await p.exec();

  // todo do we want to store like this?
  const arrivals = [...arriving, ...arrived];
  const departures = [...departing, ...departed];
  const pipeline = redis.pipeline();
  if (arrivals.length) {
    pipeline.saddEx(`${route.parent}:arrivals`, 5, ...arrivals.map(hex));
  }
  if (departures.length) {
    pipeline.saddEx(`${route.parent}:departures`, 5, ...departures.map(hex));
  }
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

async function reduceAndLogRegion (aircraft, airspace) {
  const pipeline = redis.pipeline();
  const matches = aircraft.reduce((acc, aircraft) => {
    const acLoc = point([aircraft.lon, aircraft.lat]);
    const boundary = polygon(airspace.coordinates);
    const inAirspace = pointInPolygon(acLoc, boundary);
    const validAltitude = aircraft.alt_baro < airspace.maxAltitude;
    if (inAirspace && validAltitude) {
      pipeline.saddEx(`${airspace.key}:aircraft`, 5, aircraft.hex);
      acc.push(aircraft);
    }
    return acc;
  }, []);
  await pipeline.exec();
  return matches;
}

async function partitionAndLogRunway (onRunway, route) {
  // get all aircraft that are arriving on the route
  const arrivalHexes = await redis.smembers(`${route.parent}:arrivals`);
  return onRunway.reduce((acc, aircraft) => {
    const hex = aircraft.hex;
    if (arrivalHexes.includes(hex)) {
      // aircraft was previously put into arrival region, so it must be coming in
      // to land and thus an arrival
      acc.arrived.push(aircraft);
    } else {
      // aircraft was previously in no region, so it must be a departure
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
 * @param a array from first board
 * @param b array from second board
 * @returns merged airport boards
 */
function mergeBoards (a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    return [...a, ...b];
  } else throw new Error('expected boards to only contain arrays');
}

function hex (aircraft) {
  return aircraft.hex;
}

function flight (aircraft) {
  return aircraft.flight;
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