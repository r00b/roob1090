const logger = require('../../lib/logger').get('airport-service');
const workerLogger = require('../../lib/logger').get('worker');
const RedisService = require('../../services/redis-service');
const airspacePath = require('worker_threads').workerData.job.airspacePath;
const RUNWAY_LIFETIME_SECS = 28800; // 8 hours

const redis = new RedisService();

(async () => {
  try {
    const start = Date.now();
    const airport = require(`../${airspacePath}`);

    const routes = airport.getRoutes();
    const runs = routes.map(route => computeAndWriteActiveRunway(route));
    await Promise.all(runs);

    workerLogger.info('runway worker completed', { module: airport.key, duration: Date.now() - start });
    exit(0);
  } catch (e) {
    logger.error(e.message, { ...e.details });
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
  for (let i = 0; i < candidates.length; i++) {
    const hex = candidates[i];
    const sample = await redis.hgetJson('store:valid', hex);
    if (sample) {
      // use logic defined in the route module to compute the active runway
      const activeRunway = route.computeActiveRunway(sample);
      if (activeRunway) {
        await redis.setex(`${route.key}:activeRunway`, RUNWAY_LIFETIME_SECS, activeRunway);
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
  // try to check only one route for a sample if possible
  let candidates = await redis.smembers(`${route.tail.key}:aircraft`);
  if (!candidates.length) {
    candidates = await redis.smembers(`${route.head.key}:aircraft`);
  }
  return candidates.length ? candidates : false;
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