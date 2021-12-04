const config = require('../../../src/config');
const logger = require('../../lib/logger')().scope('airport-board-worker');
const { exit } = require('../../lib/utils');
const airport = require('worker_threads').workerData.job.airport;

const store = require('../../stores/aircraft-store');
const RedisService = require('../redis-service');
const MongoService = require('../mongo-service');
const airportBoard = require('../../lib/airport-board');

(async () => {
  try {
    const { mongoHost, mongoPort, mongoUser, mongoPass } = config;

    const redis = new RedisService();
    const mongo = await new MongoService({
      host: mongoHost,
      port: mongoPort,
      username: mongoUser,
      password: mongoPass,
    }).connect();

    const computeAirportBoard = airportBoard(store, redis, mongo, logger);
    await computeAirportBoard(airport);

    exit(0);
  } catch (e) {
    logger.error(`unhandled airport-board-worker error: ${e.message}`, e);
    exit(1);
  }
})();
