const _ = require('lodash');
const RUNWAY_TTL = 28800; // 8 hours
const FAIL_MESSAGE = 'unable to compute active runway';

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
  return async (route) => {
    try {
      const hasRegions = !!_.get(route, 'regions.length');
      const hasComputeFn = !!route.getActiveRunway;
      if (!hasRegions || !hasComputeFn) {
        logger.error(FAIL_MESSAGE, {
          reason: 'malformed route',
          airport: route.parentKey,
          route: route.key,
          hasRegions,
          hasComputeFn
        });
      } else {
        return await computeActiveRunway(route, redis, logger);
      }
    } catch (e) {
      logger.error('error computing active runway', e);
    }
  };
}

async function computeActiveRunway (route, redis, logger) {
  const candidates = await findCandidates(route, redis, logger);
  for (const hex of candidates) {
    const sample = await redis.hgetJson('store:valid', hex); // todo use store
    if (sample) {
      // use logic defined in the route module to compute the active runway
      const activeRunway = route.getActiveRunway(sample);
      if (activeRunway) {
        await redis.setex(`${route.key}:activeRunway`, RUNWAY_TTL, activeRunway);
        logger.info('set active runway', {
          airport: route.parentKey,
          route: route.key,
          runway: activeRunway,
          usingHex: hex,
          usingFlight: sample.flight
        });
        return activeRunway;
      }
    }
  }
  logger.warn(FAIL_MESSAGE, {
    reason: 'found candidates but none could be used to compute route',
    airport: route.parentKey,
    route: route.key
  });
}

/**
 * Find candidate aircraft to use for computing the active runway; do this lazily, returning
 * the first candidates found (i.e. if we find candidates in a region, immediately return and
 * don't check other regions)
 */
async function findCandidates (route, redis, logger) {
  const regions = route.regions; // this was previously checked for length > 0
  for (const { key: regionKey } of regions) {
    if (regionKey) {
      const candidates = await redis.smembers(`${regionKey}:aircraft`) || [];
      if (candidates.length) {
        return candidates;
      }
    }
  }
  logger.warn(FAIL_MESSAGE, {
    reason: 'unable to find any candidates to compute active runway',
    airport: route.parentKey,
    route: route.key
  });
}
