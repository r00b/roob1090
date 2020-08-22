const logger = require('../../lib/logger').get('api-service');
const workerLogger = require('../../lib/logger').get('worker');
const RedisService = require('../../services/redis-service');
const configPath = require('worker_threads').workerData.job.configPath;
const fetch = require('node-fetch');
const base64 = require('base-64');

const redis = new RedisService();

(async () => {
  try {
    const start = Date.now();

    // const airspace = require(`../${configPath}`);
    // const routes = airspace.getRoutes();
    // const routeEnrichments = routes.map(enrichRoute);
    // await Promise.all(routeEnrichments);

    await enrichAircraft('A997E5');

    workerLogger.info('enrichments worker completed', { duration: Date.now() - start });
    exit(0);
  } catch (e) {
    logger.error(e.message, { ...e.details });
    exit(1);
  }
})();

async function enrichRoute (route) {
  const ops = route.regions.map(enrichRegion);
  return Promise.all(ops);
}

async function enrichRegion (region) {
  const hexes = await redis.smembers(`${region.key}:aircraft`);
  const aircraftEnrichments = hexes.map(enrichAircraft);
  return Promise.all(aircraftEnrichments);
}

async function enrichAircraft (hex) {
  const hasEnrichments = await redis.hexists(`store:enrichments`, hex);
  if (hasEnrichments) return;

  // const dumpData = await redis.hgetJson('store:valid', hex);
  // if (!dumpData) return;
  const dumpData = {
    hex,
    flight: 'AAL1489'
  }

  // first, aircraft metadata
  try {
    const res = await fetch(
      `https://opensky-network.org/api/metadata/aircraft/icao/${hex}`,
      {
        headers: {
          Authorization: 'Basic ' + base64.encode(process.env.USERNAME + ':' + process.env.opensky)
        }
      });
    const aircraftMetadata = await res.json();
    Object.assign(dumpData, aircraftMetadata);
  } catch (e) {
    logger.error('metadata error', e);
  }

  let hasRouteData = false;
  // then, route data
  try {
    const res = await fetch(
      `https://opensky-network.org/api/routes?callsign=${dumpData.flight}`,
      {
        headers: {
          Authorization: 'Basic ' + base64.encode(process.env.USERNAME + ':' + process.env.opensky)
        }
      });
    const routeData = await res.json();
    if (routeData.route.length === 2) {
      dumpData.origin = routeData.route[0];
      dumpData.destination = routeData.route[1];
      hasRouteData = true;
    }
  } catch (e) {
    logger.error('route error', e);
  }

  // then, FA if fail
  if (!hasRouteData) {
    try {
      const res = await fetch(
        `https://flightxml.flightaware.com/json/FlightXML2/InFlightInfo?ident=${dumpData.flight}`,
        {
          headers: {
            Authorization: 'Basic ' + base64.encode(process.env.USERNAME + ':' + process.env.fa)
          }
        });
      const json = await res.json();
      const faData = json.InFlightInfoResult;
      Object.assign(dumpData, faData);
      logger.info('hit FA api');
    } catch (e) {
      logger.error('FA error', e);
    }
  }

  debugger;

  // await redis.hsetJsonEx('store:enrichments', hex, dumpData, 9999999)

}

function exit (code) {
  // flush logger and console
  logger.on('finish', function (info) {
    process.stdout.write('', () => {
      process.exit(code);
    });
  });
  logger.end();
}