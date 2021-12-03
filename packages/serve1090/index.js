require('dotenv').config();
const app = require('./src/app');
const _ = require('lodash');
const config = require('./src/config');
const logger = require('./src/lib/logger')().scope('app');

let connections = [];

logger.info('starting serve1090', config);

app(config).then((server) => {
  // maintain array of current ws connections and purge them when they are closed
  // so that server shutdown can proceed normally
  server.on('connection', (connection) => {
    // logger.info('connection established');
    connections.push(connection);
    connection.on('close', () => {
      // logger.info('connection closed');
      connections = _.without(connections, connection);
    });
  });
  process.on('SIGTERM', shutdown(server));
  process.on('SIGINT', shutdown(server));
});

function shutdown() {
  return () => {
    logger.info('received shutdown signal');
    // kill all connections
    connections.forEach((curr) => {
      curr.end();
      curr.destroy();
    });
    logger.info('shutdown complete');
    process.exit(0);
  };
}
