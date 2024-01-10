const config = require('../../../src/config');
const logger = require('../../lib/logger')('partition-airport-worker');
const { exit } = require('../../lib/utils');
const airport = require('worker_threads').workerData.job.airport;

const store = require('../../stores/aircraft-store');
const RedisService = require('../redis-service');
const MongoService = require('../mongo-service');
const partitionAircraft = require('../../lib/partition-airport');

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

    const partitionAirport = partitionAircraft(store, redis, mongo);
    await partitionAirport(airport);

    exit(0);
  } catch (e) {
    logger.error(e, 'unhandled partition-aircraft-worker error');
    exit(1);
  }
})();
