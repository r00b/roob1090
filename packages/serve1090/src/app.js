const app = require('express')();
const logger = require('./lib/logger')();
const { nanoid } = require('nanoid');

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
    app.use(require('cors')());
    app.use(
      require('pino-http')({
        logger: logger.child({ name: 'http' }),
        genReqId: req => {
          req.id = nanoid();
          return req.id;
        },
      })
    );
    // app.use(require('./middleware/http-request-logger')); // todo http logger

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

    logger.info({ port: normalizedPort }, 'started serve1090');
    return server;
  } catch (err) {
    logger.error(err, 'failed to start serve1090');
    process.exit(1);
  }
}

module.exports = init;
