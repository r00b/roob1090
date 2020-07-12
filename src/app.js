const express = require('express');
const app = express();
const { app: logger } = require('./lib/logger');
require('express-ws')(app);
const aircraftRouter = require('./routes/aircraft/index.js');

async function startServer (port, store, loggers) {
  const normalizedPort = normalizePort(port);
  logger.info('starting serve1090', { port: normalizedPort });

  app.locals = {
    loggers: {
      ...loggers
    }
  };

  store.init();

  // setup request logger
  app.use(require('./middleware/http-request-logger'));

  // init routers
  const secret = getSecret(process.env.SERVE1090_SECRET);
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
  return secret.length ? secret : false;
}

module.exports = startServer;
