const logger = require('../../lib/logger')().scope('worker runway');

const airspacePath = require('worker_threads').workerData.job.airspacePath;
const RedisService = require('../../services/redis-service');
const { exit } = require('../../lib/utils');
const pMap = require('p-map');

const RUNWAY_TTL = 28800; // 8 hours

const redis = new RedisService();

(async () => {
  try {
    const start = Date.now();
    const airport = require(`../${airspacePath}`);

    const routes = airport.getRoutes();
    await pMap(routes, computeAndWriteActiveRunway);

    logger.scope('worker meta').info('runway worker completed', { module: airport.key, duration: Date.now() - start });
    exit(0);
  } catch (e) {
    logger.error(e.message, e);
    exit(1);
  }
})();

/**
 * Identify candidate aircraft in a route (i.e. in the approach or departure regions) and use
 * candidate data to determine the currently active runway
 *
 * @param route - route object from airport store
 * @returns {string|bool} the active runway or false if one cannot be computed
 */
async function computeAndWriteActiveRunway (route) {
  const candidates = await findCandidates(route);
  if (!candidates.length) {
    logger.warn('failed to find candidates to detect active runway');
    return false;
  }

  for (const hex of candidates) {
    const sample = await redis.hgetJson('store:valid', hex);
    if (sample) {
      // use logic defined in the route module to compute the active runway
      const activeRunway = route.computeActiveRunway(sample);
      if (activeRunway) {
        await redis.setex(`${route.key}:activeRunway`, RUNWAY_TTL, activeRunway);
        logger.info('set active runway', {
          route: route.key,
          runway: activeRunway,
          usingHex: hex,
          usingFlight: sample.flight
        });
        return activeRunway;
      }
    }
  }

  logger.warn('failed to detect runway with available candidates', { candidates });
  return false;
}

/**
 * Check the route's head and tail for candidate aircraft
 *
 * @param route - route object from airport store
 * @returns array of aircraft candidates, or false if none are found
 */
async function findCandidates (route) {
  const { head, tail } = route.regions;
  // try to check only one route for a sample if possible
  let candidates = await redis.smembers(`${tail.key}:aircraft`);
  if (!candidates.length) {
    candidates = await redis.smembers(`${head.key}:aircraft`);
  }
  return candidates.length ? candidates : false;
}
