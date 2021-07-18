const app = require('express')();
const logger = require('./lib/logger')().scope('app');
const cors = require('cors');

const RedisService = require('./services/redis-service');
const MongoService = require('./services/mongo-service');

const rootRouter = require('./routes/index');
const aircraftRouter = require('./routes/aircraft/index');
const airportsRouter = require('./routes/airports/index');

const { normalizePort, getFileNames } = require('./lib/utils');

async function init (config) {
  const normalizedPort = normalizePort(config.port);
  try {
    const server = app.listen(normalizedPort);
    require('express-ws')(app, server);
    app.use(cors());

    // ensure no artifacts remain from previous runs
    if (config.nodeEnv === 'production') {
      await redis.flushall();
      logger.info('flushed redis');
    }

    app.use(require('./middleware/http-request-logger'));

    const store = require('../src/stores/aircraft-store');
    const redis = new RedisService(true);
    await new MongoService().ping(); // don't need mongo now, but ensure it is available

    // kick off the jobs
    require('./services/worker-service')();

    // set up routers
    app.use('/', rootRouter(store, redis));
    app.use('/aircraft', aircraftRouter(config.pumpKey, store, redis));
    app.use('/airports', airportsRouter(getFileNames('./airports'), config.broadcastKey, store, redis));

    logger.info('started serve1090', { port: normalizedPort });
    return server;
  } catch (err) {
    logger.error('failed to start serve1090', { port: normalizedPort, error: err });
    process.exit(1);
  }
}

module.exports = init;
