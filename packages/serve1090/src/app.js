const app = require('express')();
const logger = require('./lib/logger')().scope('app');
const _ = require('lodash');

const fs = require('fs');
const path = require('path');

const aircraftRouter = require('./routes/aircraft/index');
const airspacesRouter = require('./routes/airspaces/index');
const { ServerError } = require('./lib/errors');

async function startServer (config) {
  const normalizedPort = normalizePort(config.port);
  try {
    const server = getServer().listen(normalizedPort);

    require('express-ws')(app, server);

    app.use(require('./middleware/http-request-logger'));

    const store = require('../src/stores/aircraft-store');

    // kick off the jobs
    require('./services/worker-service')();

    // set up routers
    const secret = getSecret(config.secret);
    app.use('/aircraft', aircraftRouter(store, secret));
    app.use('/airports', airspacesRouter(secret));

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

function getServer () {
  try {
    const cert = {
      key: fs.readFileSync(path.resolve(__dirname, '../.ssl/server.key')),
      cert: fs.readFileSync(path.resolve(__dirname, '../.ssl/server.cert'))
    };
    return require('https')
      .createServer(cert, app);
  } catch (e) {
    return app;
  }
}

function getSecret (secret) {
  if (secret && secret.length) {
    return secret;
  }
  throw new ServerError('serve1090 requires a secret');
}

module.exports = startServer;
