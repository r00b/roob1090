const _ = require('lodash');
const RUNWAY_TTL = 28800; // 8 hours

module.exports = (redis, logger) => {
  const scopedLogger = logger.scope('active-runway');
  return activeRunway(redis, scopedLogger);
};

function activeRunway (redis, logger) {
  return async (route) => {
    const candidates = await findCandidates(route, redis);
    if (_.get(candidates, 'length')) {
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
    } else {
      logger.warn('unable to find any candidates to compute active runway');
    }
    logger.warn('unable to compute active runway with currently available candidates');
  };
}

async function findCandidates (route, redis) {
  const regions = route.regions;
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
