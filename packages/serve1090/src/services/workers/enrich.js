const logger = require('../../lib/logger')().scope('worker enrich');
const _ = require('lodash');

const airspacePath = require('worker_threads').workerData.job.airspacePath;
const config = require('../../config');
const RedisService = require('../../services/redis-service');
const store = require('../../stores/aircraft-store');

const { get, exit } = require('../../lib/utils');
const pMap = require('p-map');
const { ENRICHMENTS_SCHEMA } = require('../../stores/schemas');

const ENRICHMENT_TTL = 900; // 15 min

const redis = new RedisService();

(async () => {
  try {
    const start = Date.now();

    const airspace = require(`../${airspacePath}`);
    const routes = airspace.getRoutes();
    await pMap(routes, enrichRoute);

    logger.scope('worker meta').info('enrichment worker completed', { duration: Date.now() - start });
    exit(0);
  } catch (e) {
    logger.error(e.message, e);
    exit(1);
  }
})();

async function enrichRoute (route) {
  const regions = Object.values(route.regions);
  return pMap(regions, enrichRegion);
}

async function enrichRegion (region) {
  const hexes = await redis.smembers(`${region.key}:aircraft`);
  return pMap(hexes, enrichAircraft);
}

async function enrichAircraft (hex) {
  if (await hasEnrichments(hex)) {
    return;
  }
  const aircraft = await store.getValidatedAircraft(hex);
  if (!aircraft) {
    return;
  }

  const airframeEnrichments = await queryAirframe(hex);
  const routeEnrichments = await queryRoute(aircraft.flight);
  let faEnrichments = {};
  if (!routeEnrichments.origin || !_.get(airframeEnrichments, 'typecode.length')) { // typecode may just be empty string
    faEnrichments = await queryFa(aircraft.flight);
  }

  const rawEnrichments = _.merge({}, airframeEnrichments, routeEnrichments, faEnrichments);
  const { value: validatedEnrichments, error } = ENRICHMENTS_SCHEMA.validate(rawEnrichments);

  if (!error) {
    await redis.hsetJsonEx('store:enrichments', hex, validatedEnrichments, ENRICHMENT_TTL);
  }
}

/**
 * Determine if enrichments should be fetched for this aircraft; return true if enrichments
 * already exist and have not expired
 *
 * @param {string} hex - icao24 of the aircraft
 * @returns aircraft callsign if enrichments should be fetched, false otherwise
 */
async function hasEnrichments (hex) {
  const enrichments = await redis.hexists(`store:enrichments`, hex);
  return !!enrichments;
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
    if (_.get(body, 'route.length') <= 2) {
      return {
        origin: body.route[0],
        destination: body.route[1]
      };
    } else {
      return {};
    }
  } catch (e) {
    logger.warn('failed to fetch route data from OpenSky', e);
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
    const res = body.InFlightInfoResult;
    if (res.timeout === 'ok') { // FA can return stale data, marked by timeout = 'timed_out'
      return res;
    }
    return {};
  } catch (e) {
    logger.warn('failed to fetch flight data from FlightAware', e);
    return {};
  }
}
