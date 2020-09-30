const app = require('express')();
const logger = require('./lib/logger')().scope('app');
const cors = require('cors');

const rootRouter = require('./routes/root/index');
const aircraftRouter = require('./routes/aircraft/index');
const airportsRouter = require('./routes/airports/index');

async function startServer (config) {
  const normalizedPort = normalizePort(config.port);
  try {
    const server = app.listen(normalizedPort);
    require('express-ws')(app, server);
    app.use(cors());

    // ensure no artifacts remain from previous runs
    if (config.nodeEnv === 'production') {
      const RedisService = require('./services/redis-service');
      const redis = new RedisService();
      await redis.flushall();
    }

    app.use(require('./middleware/http-request-logger'));

    const store = require('../src/stores/aircraft-store');

    // kick off the jobs(req, res, next)
    require('./services/worker-service')();

    // set up routers
    // app.use('/', rootRouter(store));
    app.use('/aircraft', aircraftRouter(config.pumpKey, store));
    app.use('/airports', airportsRouter(config.broadcastKey, store));

    logger.info('started serve1090', { port: normalizedPort });
    return server;
  } catch (err) {
    logger.error('failed to start serve1090', { port: normalizedPort, error: err });
    process.exit(1);
  }
}

function normalizePort (port) {
  const fallback = 5432;
  try {
    const normalizedPort = parseInt(port);
    if (isNaN(normalizedPort)) {
      return fallback;
    }
    return normalizedPort;
  } catch (_) {
    return fallback;
  }
}

module.exports = startServer;
