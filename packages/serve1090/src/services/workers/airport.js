const logger = require('../../lib/logger').get('airport-service');
const RedisService = require('../../services/redis-service');
const { point, polygon } = require('@turf/helpers');
const pointInPolygon = require('@turf/boolean-point-in-polygon').default;
const modulePath = require('worker_threads').workerData.job.modulePath;

const redis = new RedisService();

(async () => {
  try {
    const airspace = require(`../${modulePath}`);
    const aircraft = await redis.hgetAllJsonValues('store:valid');
    const {
      arrivals,
      departures,
      onRunway
    } = await partitionAndLogAirspace(aircraft, airspace);
    logger.info(airspace.name, {
      arrivals: arrivals.map(a => a.flight),
      departures: departures.map(a => a.flight),
      runway: onRunway.map(a => a.flight)
    });
    exit(0);
  } catch (e) {
    logger.error(e.message);
    exit(1);
  }
})();

async function partitionAndLogAirspace (aircraft, airspace) {
  const toArrive = await reduceAndLog(aircraft, airspace.approach());
  const departed = await reduceAndLog(aircraft, airspace.departure());
  const onRunway = await reduceAndLog(aircraft, airspace.runway());

  const {
    arrived,
    toDepart
  } = await partitionAndLogRunway(onRunway, airspace);

  const arrivals = [...toArrive, ...arrived];
  const departures = [...toDepart, ...departed];

  return {
    arrivals,
    departures,
    onRunway
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
      redis.saddEx(airspace.key, aircraft.hex, 5);
      acc.push(aircraft);
    }
    return acc;
  }, []);
  await redis.exec();
  return matches;
}

async function partitionAndLogRunway (aircraftOnRunway, airspace) {
  const arrivalHexes = await redis.smembers(airspace.approach().key);
  redis.pipeline();
  const partition = aircraftOnRunway.reduce((acc, aircraft) => {
    const hex = aircraft.hex;
    if (arrivalHexes.includes(hex)) {
      acc.arrived.push(aircraft);
      redis.expiremember(airspace.approach().key, hex, 5);
    } else {
      acc.toDepart.push(aircraft);
      redis.expiremember(airspace.departure().key, hex, 5);
    }
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