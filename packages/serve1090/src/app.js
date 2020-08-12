const express = require('express');
const app = express();
const loggers = require('./lib/logger');
const logger = loggers.get('app');
const _ = require('lodash');
require('express-ws')(app);
const aircraftRouter = require('./routes/aircraft/index');

async function startServer (port) {
  const normalizedPort = normalizePort(port);

  // configure request logger
  app.locals = {
    logger: loggers.get('request')
  };
  app.use(require('./middleware/http-request-logger'));

  const store = require('../src/stores/aircraft-store');

  // kick off the jobs
  require('./services/worker-service')();

  // set up routers
  const secret = getSecret(process.env.SECRET);
  app.use('/aircraft', aircraftRouter(store, secret));

  try {
    const server = await app.listen(normalizedPort);
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

function getSecret (secret) {
  return _.get(secret, 'length') ? secret : false;
}

module.exports = startServer;
