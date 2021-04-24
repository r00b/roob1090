const logger = require('../../lib/logger')().scope('airport-board-worker');
const { exit } = require('../../lib/utils');
const store = require('../../stores/aircraft-store');
const airportKey = require('worker_threads').workerData.job.airport;
const airportBoard = require('../../lib/airport-board');

const RedisService = require('../redis-service');
const redis = new RedisService();

(async () => {
  try {
    const start = Date.now();
    const airport = require(`../../lib/airports/${airportKey}`);
    const { computeAirportBoard } = airportBoard(store, redis, logger);

    await computeAirportBoard(airport);

    logger.info('airport-board worker completed', { airport: airportKey, duration: Date.now() - start });
    exit(0);
  } catch (e) {
    logger.error(e.message, e);
    exit(1);
  }
})();
