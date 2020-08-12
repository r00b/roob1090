const logger = require('../../lib/logger').get('airport-service');
const workerLogger = require('../../lib/logger').get('worker');
const RedisService = require('../../services/redis-service');
const configPath = require('worker_threads').workerData.job.configPath;

const redis = new RedisService();

(async () => {
  try {
    const start = Date.now();
    const airport = require(`../${configPath}`);

    const routes = airport.getRoutes();
    const runs = routes.map(route => computeActiveRunway(route));
    await Promise.all(runs);

    workerLogger.info('runway worker completed', { module: airport.key, duration: Date.now() - start });
    exit(0);
  } catch (e) {
    logger.error(e.message, { ...e.details });
    exit(1);
  }
})();

async function computeActiveRunway (route) {
  const candidates = await findCandidates(route);
  if (!candidates.length) {
    logger.warn('failed to find candidates to detect active runway');
    return false;
  }
  for (let i = 0; i < candidates.length; i++) {
    const hex = candidates[i];
    const sample = await redis.hgetJson('store:valid', hex);
    if (sample) {
      const activeRunway = route.computeActiveRunway(sample);
      if (activeRunway) {
        await redis.setex(`${route.key}:activeRunway`, 28800, activeRunway);
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

async function findCandidates (route) {
  // try to check only one route for a sample if possible
  let candidates = await redis.smembers(`${route.tail.key}:aircraft`);
  if (!candidates.length) {
    candidates = await redis.smembers(`${route.head.key}:aircraft`);
  }
  return candidates.length ? candidates : false;
}

function exit (code) {
  // flush winston and console
  logger.on('finish', function (info) {
    process.stdout.write('', () => {
      process.exit(code);
    });
  });
  logger.end();
}