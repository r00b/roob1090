const _ = require('lodash');
const logger = require('../../lib/logger').get('api-service');
const workerLogger = require('../../lib/logger').get('worker');

const airspacePath = require('worker_threads').workerData.job.airspacePath;
const config = require('../../config');
const RedisService = require('../../services/redis-service');
const store = require('../../stores/aircraft-store');

const { get } = require('../../lib/utils');
const { ENRICHMENTS_SCHEMA } = require('../../stores/schemas');
const ENRICHMENT_LIFETIME_SECS = 900; // 15 min

const redis = new RedisService();

(async () => {
  try {
    const start = Date.now();

    const airspace = require(`../${airspacePath}`);
    const routes = airspace.getRoutes();
    const routeEnrichments = routes.map(enrichRoute);
    await Promise.all(routeEnrichments);

    workerLogger.info('enrichment worker completed', { duration: Date.now() - start });
    exit(0);
  } catch (e) {
    logger.error(e.message, { ...e.details });
    exit(1);
  }
})();

async function enrichRoute (route) {
  const regions = Object.values(route.regions);
  return Promise.all(regions.map(enrichRegion));
}

async function enrichRegion (region) {
  const hexes = await redis.smembers(`${region.key}:aircraft`);
  return Promise.all(hexes.map(enrichAircraft));
}

async function enrichAircraft (hex) {
  const flight = await hasEnrichments(hex);
  if (!flight) {
    // the aircraft already has enrichments, or it's not in the valid store
    return;
  }

  const airframeEnrichments = await queryAirframe(hex);
  const routeEnrichments = await queryRoute(flight);
  let faEnrichments = {};
  if (!routeEnrichments.origin || !airframeEnrichments.typecode) {
    faEnrichments = await queryFa(flight);
  }

  const rawEnrichments = _.merge({}, airframeEnrichments, routeEnrichments, faEnrichments);
  const { value: validatedEnrichments, error } = ENRICHMENTS_SCHEMA.validate(rawEnrichments);

  if (!error) {
    await redis.hsetJsonEx('store:enrichments', hex, validatedEnrichments, ENRICHMENT_LIFETIME_SECS);
  }
}

/**
 * Determine if enrichments should be fetched for this aircraft; return false if enrichments
 * already exist and have not expired, or if the aircraft is not currently in the valid aircraft
 * store
 *
 * @param {string} hex - icao24 of the aircraft
 * @returns aircraft callsign if enrichments should be fetched, false otherwise
 */
async function hasEnrichments (hex) {
  const hasEnrichments = await redis.hexists(`store:enrichments`, hex);
  if (hasEnrichments) {
    return false;
  }
  const aircraft = await store.getValidatedAircraft(hex);
  return aircraft ? aircraft.flight : false;
}

/**
 * Query the OpenSky metadata endpoint for metadata about a specific aircraft
 *
 * @param {string} hex - icao24 code to query
 * @returns hash of metadata
 */
async function queryAirframe (hex) {
  try {
    const { body } = await get(
      `https://opensky-network.org/api/metadata/aircraft/icao/${hex}`,
      config.openSkyUsername,
      config.openSkyPassword
    );
    return body || {};
  } catch (e) {
    logger.warn('failed to fetch airframe metadata from OpenSky', e);
    return {};
  }
}

/**
 * Query the OpenSky routes endpoint for metadata about the flight's *usual* route;
 * will return nothing if a route of a single origin destination pair is not
 * returned by the API
 *
 * @param {string} flight - callsign to query
 * @returns hash of metadata
 */
async function queryRoute (flight) {
  try {
    const { body } = await get(
      `https://opensky-network.org/api/routes?callsign=${flight}`,
      config.openSkyUsername,
      config.openSkyPassword
    );
    // todo this is probably wrong
    if (_.get(body, 'route.length') <= 2) {
      return {
        origin: body.route[0],
        destination: body.route[1]
      };
    } else {
      return {};
    }
  } catch (e) {
    logger.warn('failed to fetch route from OpenSky', e);
    return {};
  }
}

/**
 * Query the FlightXML2 InFlightInfo endpoint for metadata about the flight
 *
 * @param {string} flight - callsign to query
 * @returns hash of metadata
 */
async function queryFa (flight) {
  try {
    const { body } = await get(
      `https://flightxml.flightaware.com/json/FlightXML2/InFlightInfo?ident=${flight}`,
      config.faUsername,
      config.faPassword
    );
    return body.InFlightInfoResult || {};
  } catch (e) {
    logger.warn('failed to fetch enrichments from FlightAware', e);
    return {};
  }
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