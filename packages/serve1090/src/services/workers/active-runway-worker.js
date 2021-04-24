const logger = require('../../lib/logger')().scope('active-runway-worker');
const { exit } = require('../../lib/utils');
const airportKey = require('worker_threads').workerData.job.airport;
const store = require('../../stores/aircraft-store');
const activeRunway = require('../../lib/active-runway');

const RedisService = require('../redis-service');
const redis = new RedisService();

(async () => {
  try {
    const start = Date.now();
    const routes = require(`../../lib/airports/${airportKey}`).routes;
    const {
      computeActiveRunway
    } = activeRunway(redis, store, logger);

    for (const route of routes) {
      await computeActiveRunway(route);
    }

    logger.info('active-runway worker completed', { airport: airportKey, duration: Date.now() - start });
    exit(0);
  } catch (e) {
    logger.error(e.message, e);
    exit(1);
  }
})();
