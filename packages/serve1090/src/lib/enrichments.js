const _ = require('lodash');
const logger = require('../lib/logger')('enrichments');
const got = require('got');
const { airframe: airframeSchema } = require('./schemas');

const ROUTE_TTL = 900; // 15 min
const {
  ARRIVALS,
  DEPARTURES,
  ROUTES,
  AIRFRAMES,
  BROADCAST_CLIENT_COUNT,
} = require('../lib/redis-keys');

module.exports = (config, redis) => {
  const apis = generateApis(config);
  return {
    fetchRoute: fetchRoute(redis, apis),
    fetchAirframe: fetchAirframe(redis, apis),
  };
};

const generateApis = function (config) {
  const {
    openSkyApi,
    openSkyUsername,
    openSkyPassword,
    faApi,
    faUsername,
    faPassword,
  } = config;
  const apis = {};

  if (openSkyApi && openSkyUsername && openSkyPassword) {
    const openSkyCredentials = {
      username: config.openSkyUsername,
      password: config.openSkyPassword,
    };
    apis.openSkyAirframes = got.extend({
      prefixUrl: `${config.openSkyApi}/api/metadata/aircraft/icao`,
      ...openSkyCredentials,
      responseType: 'json',
    });
    apis.openSkyRoutes = got.extend({
      prefixUrl: `${config.openSkyApi}/api/routes`,
      ...openSkyCredentials,
      responseType: 'json',
    });
  } else {
    logger.warn('unable to find OpenSky API credentials');
  }

  if (faApi && faUsername && faPassword) {
    apis.flightAwareRoutes = got.extend({
      prefixUrl: `${config.faApi}/InFlightInfo`,
      username: config.faUsername,
      password: config.faPassword,
      responseType: 'json',
    });
  } else {
    logger.warn('unable to find FlightAware API credentials');
  }

  return apis;
};

/**
 * Return a function that tests a flight's route, checking redis for a cached route,
 * followed by the OpenSky API and finally the FlightAware API
 */
const fetchRoute = function (redis, { openSkyRoutes, flightAwareRoutes }) {
  /**
   * @param {Object} aircraft - aircraft ADSB hash
   * @param {string} airport - airport key for checking route cache
   * @param {boolean} forceFallbackToFA - override restrictions on querying the FlightAware API
   */
  return async (aircraft, airportKey, forceFallbackToFA = false) => {
    const flight = aircraft.flight.toLowerCase();
    try {
      // first, see if the route is cached
      let result = await redis.hgetAsJson(ROUTES, flight);
      // next, check OpenSky
      if (!result && openSkyRoutes) {
        result = await fetchOpenSkyRoute(
          aircraft,
          airportKey,
          openSkyRoutes,
          redis
        );
      }
      // next, fallback to FlightAware if there is a current broadcast client OR if forceFallbackToFA = true
      const shouldQueryFA =
        flightAwareRoutes &&
        ((!result && (await hasBroadcastClients(redis))) || forceFallbackToFA);
      if (shouldQueryFA) {
        result = await fetchFlightAwareRoute(aircraft, flightAwareRoutes);
      }
      // finally, cache the result
      if (result) {
        redis.hsetJsonEx(ROUTES, flight, result, ROUTE_TTL); // fire and forget
        return result;
      }
      logger.warn(`unable to resolve route for ${flight}`);
    } catch (e) {
      logger.warn(e, 'error resolving route for ${flight}');
      return {};
    }
  };
};

/**
 * Fetch a route from OpenSky, simplifying it if necessary
 *
 * @param flight {string} - callsign from ADSB
 * @param hex {string} - hex from ADSB
 * @param airport {string}
 * @param openSkyRoutes {Object} - OpenSky routes API
 * @param redis
 * @returns {Promise<{origin, destination}|undefined>}
 */
const fetchOpenSkyRoute = async function (
  { flight, hex },
  airport,
  openSkyRoutes,
  redis
) {
  const airportKey = airport.toUpperCase();
  try {
    const {
      body: { route: rawRoute },
    } = await openSkyRoutes.get(`?callsign=${flight}`);
    const route = rawRoute.map(a => a.toUpperCase());
    if (!route.includes(airportKey)) {
      return;
    }
    if (route.length === 2) {
      return {
        origin: route[0],
        destination: route[1],
      };
    } else if (route.length > 2) {
      return findCurrentLeg(hex, route, airportKey, redis);
    }
  } catch (e) {
    if (_.get(e, 'message', '').includes('404')) {
      return;
    }
    logger.warn(e, `error resolving route data from OpenSky for ${flight}`);
  }
};

/**
 * Extract the leg being currently flown from a connecting route returned from OpenSky;
 * see tests for examples
 *
 * @param hex {string}
 * @param route {string[]}
 * @param airport {string}
 * @param redis
 * @returns {Promise<{origin, destination}>|undefined}
 */
const findCurrentLeg = async function (hex, route, airport, redis) {
  const airportKey = airport.toUpperCase();
  const arrivals =
    (await redis.smembers(ARRIVALS(airportKey.toLowerCase()))) || [];
  if (arrivals.includes(hex) && canDeriveArrivalLeg(route, airport)) {
    const arrivalIdx = route.lastIndexOf(airportKey.toUpperCase());
    if (arrivalIdx > 0) {
      // > 0 to prevent index out of range error on origin
      return {
        origin: route[arrivalIdx - 1],
        destination: route[arrivalIdx],
      };
    }
  } else {
    const departures =
      (await redis.smembers(DEPARTURES(airportKey.toLowerCase()))) || [];
    if (departures.includes(hex) && canDeriveDepartureLeg(route, airport)) {
      const departureIdx = route.indexOf(airportKey.toUpperCase());
      if (departureIdx >= 0) {
        return {
          origin: route[departureIdx],
          destination: route[departureIdx + 1],
        };
      }
    }
  }
};

/**
 * Determine if an arrival leg to a specified airport can be resolved from
 * a multi-leg route
 *
 * @param route {string[]}
 * @param airport {string}
 * @returns {boolean} true if arrival leg can be computed, false otherwise
 */
const canDeriveArrivalLeg = function (route, airport) {
  const timesInRoute = route.filter(a => a === airport).length;
  switch (timesInRoute) {
    case 1:
      // if airport is only in route once and is the first terminal,
      // then no way to know where arriving from
      return route[0] !== airport;
    case 2:
      // first terminal in route must be airport and second must not be airport
      return route[0] === airport && route[1] !== airport;
    default:
      return false;
  }
};

/**
 * Determine if a departure leg from a specified airport can be resolved from
 * a multi-leg route
 *
 * @param route {string[]}
 * @param airport {string}
 * @returns {boolean} true if departure leg can be computed, false otherwise
 */
const canDeriveDepartureLeg = function (route, airport) {
  const timesInRoute = route.filter(a => a === airport).length;
  const lastIndex = route.length - 1;
  switch (timesInRoute) {
    case 1:
      // if airport is only in route once and is the last terminal,
      // then no way to know where departing to
      return route[lastIndex] !== airport;
    case 2:
      // last terminal in route must be airport and second to last must not be airport
      return route[lastIndex] === airport && route[lastIndex - 1] !== airport;
    default:
      return false;
  }
};

/**
 * Determine if there are currently any clients receiving data from the server
 */
const hasBroadcastClients = async function (redis) {
  const numClients = await redis.get(BROADCAST_CLIENT_COUNT);
  return numClients > 0;
};

/**
 * Fetch a route from FlightAware
 *
 * @param flight {string}
 * @param flightAwareRoutes {object} - FlightAware InFlightInfo API
 * @returns {Promise<{origin, destination}>|undefined}
 */
const fetchFlightAwareRoute = async function ({ flight }, flightAwareRoutes) {
  try {
    const {
      body: { InFlightInfoResult: result },
    } = await flightAwareRoutes(`?ident=${flight}`);
    if (result.timeout === 'ok') {
      // FA can return stale data, indicated by timeout = 'timed_out'
      return {
        origin: result.origin,
        destination: result.destination,
      };
    }
  } catch (e) {
    logger.warn(e, `error resolving route data from FlightAware for ${flight}`);
  }
};

/**
 * Return a function that fetches data about an airframe specified by its ICAO
 * hexadecimal code
 *
 * TODO: persist airframes in database
 */
const fetchAirframe = function (redis, { openSkyAirframes }) {
  /**
   * @param {object} aircraft - aircraft hash
   */
  return async aircraft => {
    const hex = aircraft.hex.toLowerCase();
    try {
      // first, see if the airframe is cached
      const cachedAirframe = await redis.hgetAsJson(AIRFRAMES, hex);
      if (cachedAirframe) {
        return cachedAirframe;
      }
      // next, attempt to fetch airframe from OpenSky
      const fetchedAirframe = await fetchOpenSkyAirframe(hex, openSkyAirframes);
      if (fetchedAirframe) {
        // cache airframe for later queries
        redis.hsetJson(AIRFRAMES, hex, fetchedAirframe); // fire and forget
        return fetchedAirframe;
      }
      logger.warn(`failed to resolve airframe for ${aircraft.hex}`);
    } catch (e) {
      logger.warn(e, `error resolving airframe data for ${hex}`);
      return {};
    }
  };
};

/**
 * Fetch an airframe from OpenSky
 *
 * @param hex {string}
 * @param openSkyAirframes {object} - OpenSky aircraft metadata API
 * @returns {Promise<{}>|undefined}
 */
const fetchOpenSkyAirframe = async function (hex, openSkyAirframes) {
  try {
    const { body } = await openSkyAirframes.get(hex);
    const { value: airframe, error } = airframeSchema.validate(body);
    if (error) {
      logger.warn(
        error,
        `error validating airframe data from OpenSky for ${hex}`
      );
      return {};
    }
    if (!airframe.type) {
      // sometimes type is empty, so try to replace it with model
      airframe.type = airframe.model;
    }
    return airframe;
  } catch (e) {
    logger.warn(e, `error resolving airframe data from OpenSky for ${hex}`);
  }
};
