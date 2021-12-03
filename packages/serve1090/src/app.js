const app = require('express')();
const logger = require('./lib/logger')().scope('app');
const cors = require('cors');

const RedisService = require('./services/redis-service');
const MongoService = require('./services/mongo-service');

const rootRouter = require('./routes/index');
const aircraftRouter = require('./routes/aircraft/index');
const airportsRouter = require('./routes/airports/index');

const { normalizePort } = require('./lib/utils');

async function init(config) {
  const {
    port,
    pumpKey,
    broadcastKey,
    mongoHost,
    mongoPort,
    mongoUser,
    mongoPass,
  } = config;

  const normalizedPort = normalizePort(port);
  try {
    const server = app.listen(normalizedPort);
    require('express-ws')(app, server);
    app.use(cors());
    app.use(require('./middleware/http-request-logger'));

    // ensure no artifacts remain from previous runs
    const redis = new RedisService(true);
    await redis.flushall();
    logger.info('flushed redis');

    const mongo = await new MongoService({
      host: mongoHost,
      port: mongoPort,
      username: mongoUser,
      password: mongoPass,
      verbose: true,
    }).connect();

    const store = require('../src/stores/aircraft-store');

    // kick off the jobs
    await require('./services/worker-service')(mongo);

    // set up routers
    app.use('/', rootRouter(store, redis, mongo));
    app.use('/aircraft', aircraftRouter(pumpKey, store, redis));

    const airports = await mongo.getAllActiveAirportIdents();
    app.use('/airports', airportsRouter(airports, broadcastKey, store, redis));

    logger.info('started serve1090', { port: normalizedPort });
    return server;
  } catch (err) {
    logger.error('failed to start serve1090', {
      port: normalizedPort,
      error: err,
    });
    process.exit(1);
  }
}

module.exports = init;
