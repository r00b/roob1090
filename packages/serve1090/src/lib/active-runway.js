const _ = require('lodash');
const RUNWAY_TTL = 28800; // 8 hours

module.exports = (redis, logger) => {
  const scopedLogger = logger.scope('active-runway');
  return activeRunway(redis, scopedLogger);
};

/**
 * Return a function that computes the active runway of an airport's specified route;
 * picks candidates in the non-runway sections of the route and uses the logic defined
 * in each route object to compute the active runway
 */
function activeRunway (redis, logger) {
  /**
   * @param {Object} airportRoute - child route object from an airport module
   */
  return async (airportRoute) => {
    try {
      return await computeActiveRunway(airportRoute, redis, logger);
    } catch (e) {
      logger.error('error computing active runway', e);
    }
  };
}

async function computeActiveRunway (airportRoute, redis, logger) {
  const candidates = await findCandidates(airportRoute, redis);
  if (_.get(candidates, 'length')) {
    for (const hex of candidates) {
      const sample = await redis.hgetJson('store:valid', hex);
      if (sample) {
        // use logic defined in the route module to compute the active runway
        const activeRunway = airportRoute.computeActiveRunway(sample);
        if (activeRunway) {
          await redis.setex(`${airportRoute.key}:activeRunway`, RUNWAY_TTL, activeRunway);
          logger.info('set active runway', {
            airportRoute: airportRoute.key,
            runway: activeRunway,
            usingHex: hex,
            usingFlight: sample.flight
          });
          return activeRunway;
        }
      }
    }
  } else {
    logger.warn('unable to find any candidates to compute active runway');
  }
  logger.warn('unable to compute active runway with currently available candidates');
}

/**
 * Find candidate aircraft to use for computing the active runway; do this lazily, returning
 * the first candidates found
 */
async function findCandidates (airportRoute, redis) {
  const regions = airportRoute.regions;
  if (_.get(regions, 'length')) {
    for (const { key } of regions) {
      if (key) {
        const candidates = await redis.smembers(`${key}:aircraft`);
        if (candidates.length) {
          return candidates;
        }
      }
    }
  }
}
