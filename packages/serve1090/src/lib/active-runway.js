const _ = require('lodash');
const {
  REGION_AIRCRAFT,
  ACTIVE_RUNWAY
} = require('../lib/redis-keys');
const RUNWAY_TTL = 28800; // 8 hours
const FAIL_MESSAGE = 'unable to compute active runway';

module.exports = (redis, store, logger) => {
  const exports = {
    getActiveRunway: getActiveRunway(redis)
  };
  if (store && logger) {
    const scopedLogger = logger.scope('active-runway');
    exports.computeActiveRunway = computeActiveRunway(redis, store, scopedLogger);
  }
  return exports;
};

/**
 * Return a function that computes the active runway of an airport's specified route;
 * picks candidates in the non-runway sections of the route and uses the logic defined
 * in each route object to compute the active runway
 */
function computeActiveRunway (redis, store, logger) {
  /**
   * @param {Object} route - child route object from an airport module
   * @return {string} the active runway
   */
  return async (route) => {
    try {
      const hasRegions = !!_.get(route, 'regions.length');
      const hasComputeFn = !!route.getActiveRunway;
      if (!hasRegions || !hasComputeFn) {
        logger.error(FAIL_MESSAGE, {
          reason: 'malformed route',
          route: route.key,
          hasRegions,
          hasComputeFn
        });
      } else {
        const candidates = await findCandidates(route, redis);

        if (candidates.length) {

          for (const hex of candidates) {
            const sample = await store.getAircraftWithHex(hex);
            if (sample) {
              // use logic defined in the route module to compute the active runway
              const activeRunway = route.getActiveRunway(sample);
              if (activeRunway) {
                await redis.setex(ACTIVE_RUNWAY(route.key), RUNWAY_TTL, activeRunway);
                logger.info('set active runway', {
                  route: route.key,
                  runway: activeRunway,
                  usingHex: hex,
                  usingFlight: (sample.flight || '').trim()
                });
                return activeRunway;
              }
            }
          }

          logger.warn(FAIL_MESSAGE, {
            reason: 'found candidates but none could be used to compute route',
            route: route.key
          });
        } else {
          logger.warn(FAIL_MESSAGE, {
            reason: 'unable to find any candidates to compute active runway',
            route: route.key
          });
        }
      }
    } catch (e) {
      logger.error('error computing active runway', e);
    }
  };
}

/**
 * Find candidate aircraft to use for computing the active runway; do this lazily, returning
 * the first candidates found (i.e. if we find candidates in a region, immediately return and
 * don't check other regions)
 *
 * @param route {object} - route object
 * @param redis
 * @returns {Promise<aircraft[]>}
 */
async function findCandidates (route, redis) {
  const regions = route.regions; // this was previously checked for length > 0
  for (const region of regions) {
    if (_.has(region, 'key')) {
      const candidates = await redis.smembers(REGION_AIRCRAFT(region.key)) || [];
      if (candidates.length) {
        return candidates;
      }
    }
  }
  return [];
}

/**
 * Return a function that fetches a route's already computed active
 * runway from redis
 *
 * @param redis
 */
function getActiveRunway (redis) {
  /**
   * @param {object} - route object
   * @returns {string} active runway
   */
  return async ({ key: routeKey }) => {
    return redis.get(ACTIVE_RUNWAY(routeKey));
  };
}
