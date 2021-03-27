const got = require('got');
const { airframe: airframeSchema } = require('./schemas');
const FLIGHT_TTL = 900; // 15 min

module.exports = (config, redis, logger) => {
  const apis = generateApis(config);
  const scopedLogger = logger.scope('enrichments');
  return {
    fetchRoute: fetchRoute(redis, apis, scopedLogger),
    fetchAirframe: fetchAirframe(redis, apis, scopedLogger)
  };
};

const generateApis = function (config) {
  const openSkyCredentials = {
    username: config.openSkyUsername,
    password: config.openSkyPassword
  };
  return {
    openSkyAirframes: got.extend({
      prefixUrl: `${config.openSkyApi}/api/metadata/aircraft/icao`,
      ...openSkyCredentials,
      responseType: 'json'
    }),
    openSkyRoutes: got.extend({
      prefixUrl: `${config.openSkyApi}/api/routes`,
      ...openSkyCredentials,
      responseType: 'json'
    }),
    flightAwareRoutes: got.extend({
      prefixUrl: `${config.faApi}/InFlightInfo`,
      username: config.faUsername,
      password: config.faPassword,
      responseType: 'json'
    })
  };
};

/**
 * Return a function that tests a flight's route, checking redis for a cached route,
 * followed by the OpenSky API and finally the FlightAware API
 */
const fetchRoute = function (redis, { openSkyRoutes, flightAwareRoutes }, logger) {
  /**
   * @param {Object} aircraft - aircraft ADSB hash
   * @param {string} airport - airport key for checking route cache
   * @param {boolean} forceFallbackToFA - override restrictions on querying the FlightAware API
   */
  return async (aircraft, airport, forceFallbackToFA = false) => {
    const flight = aircraft.flight.toLowerCase();
    try {
      // first, see if the route is cached
      let result = await redis.hgetJson('routes', flight);
      // next, check OpenSky
      if (!result) {
        result = await fetchOpenSkyRoute(aircraft, airport, openSkyRoutes, redis, logger);
      }
      // next, fallback to FlightAware if there is a current broadcast client OR if forceFallbackToFA = true
      const shouldQueryFA = (!result && await hasBroadcastClients(redis)) || forceFallbackToFA;
      if (shouldQueryFA) {
        result = await fetchFlightAwareRoute(aircraft, flightAwareRoutes, logger);
      }
      // finally, cache the result
      if (result) {
        redis.hsetJsonEx('routes', flight, result, FLIGHT_TTL); // fire and forget
      }
      return result || {};
    } catch (e) {
      logger.warn(`error resolving route data for ${flight}`, e);
      return {};
    }
  };
};

const fetchOpenSkyRoute = async function ({ flight, hex }, airport, openSkyRoutes, redis, logger) {
  try {
    const { body: { route } } = await openSkyRoutes.get(`?callsign=${flight}`);
    if (route.length === 2) {
      return {
        origin: route[0],
        destination: route[1]
      };
    } else if (route.length === 3) {
      return simplifyConnectingRoute(hex, route, airport, redis);
    }
  } catch (e) {
    logger.warn(`error resolving route data from OpenSky for ${flight}`, e);
  }
};

/**
 * Sometimes a route has more than 2 airports, so use the current airport
 * being flown into or out of to deduce the current leg of the route
 */
const simplifyConnectingRoute = async function (hex, route, airport, redis) {
  const arrivals = await redis.get(`${airport.toLowerCase()}:arrivals`) || [];
  if (arrivals.includes(hex)) {
    // [KADW, KDCA, KVKX] => KADW to KDCA
    // [KDCA, KVKX, KDCA] => KVKX to KDCA
    const arrivalIdx = route.lastIndexOf(airport.toUpperCase());
    if (arrivalIdx > 0) {
      return {
        origin: route[arrivalIdx - 1],
        destination: route[arrivalIdx]
      };
    }
  } else {
    const departures = await redis.get(`${airport.toLowerCase()}:departures`) || [];
    if (departures.includes(hex)) {
      // [KDW, KDCA, KVKX] => KDCA to KVKX
      // [KDCA, KADW, KDCA] => KDCA to KADW
      const departureIdx = route.indexOf(airport.toUpperCase());
      if (departureIdx >= 0) {
        return {
          origin: route[departureIdx],
          destination: route[departureIdx + 1]
        };
      }
    }
  }
};

/**
 * Determine if there are currently any clients receiving data from the server
 */
const hasBroadcastClients = async function (redis) {
  const numClients = await redis.get('broadcastClientCount');
  return numClients > 0;
};

const fetchFlightAwareRoute = async function ({ flight }, flightAwareRoutes, logger) {
  try {
    const { body: { InFlightInfoResult: result } } = await flightAwareRoutes(`?ident=${flight}`);
    if (result.timeout === 'ok') { // FA can return stale data, indicated by timeout = 'timed_out'
      return {
        origin: result.origin,
        destination: result.destination
      };
    }
  } catch (e) {
    logger.warn(`error resolving route data from FlightAware for ${flight}`, e);
  }
};

/**
 * Return a function that fetches data about an airframe specified by its ICAO
 * hexadecimal code
 */
const fetchAirframe = function (redis, { openSkyAirframes }, logger) {
  /**
   * @param {object} aircraft - aircraft hash
   */
  return async (aircraft) => {
    const hex = aircraft.hex.toLowerCase();
    try {
      // first, see if the airframe is cached
      const cachedAirframe = await redis.hgetJson('airframes', hex);
      if (cachedAirframe) {
        return cachedAirframe;
      }
      // next, attempt to fetch airframe from OpenSky
      const fetchedAirframe = await fetchOpenSkyAirframe(hex, openSkyAirframes, logger);
      if (fetchedAirframe && !cachedAirframe) {
        redis.hsetJson('airframes', hex, fetchedAirframe); // fire and forget
      }
      return fetchedAirframe || {};
    } catch (e) {
      logger.warn(`error resolving airframe data for ${hex}`, e);
      return {};
    }
  };
};

const fetchOpenSkyAirframe = async function (hex, openSkyAirframes, logger) {
  try {
    const { body } = await openSkyAirframes.get(hex);
    const { value: airframe, error } = airframeSchema.validate(body);
    if (error) {
      logger.warn(`error validating airframe data from OpenSky for ${hex}`, error);
      return {};
    }
    if (!airframe.typecode) {
      // sometimes type is empty, so try to replace it with model
      airframe.typecode = airframe.model;
    }
    return airframe;
  } catch (e) {
    logger.warn(`error resolving airframe data from OpenSky for ${hex}`, e);
  }
};
