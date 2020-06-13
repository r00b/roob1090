const app = require('./src/app');
const { createTerminus } = require('@godaddy/terminus');
const _ = require('lodash');
const logger = require('./lib/logger');

let connections = [];

const store = require('./src/stores/aircraft-store');

app(store, logger).then(server => {
  server.on('connection', connection => {
    connections.push(connection);
    connection.on('close', () => connections = _.without(connections, connection));
  });
  createTerminus(server, {
    signals: ['SIGTERM', 'SIGINT'],
    onSignal,
    onShutdown: () => console.log('Exited serve1090.'),
    timeout: 2500
  });
});

function onSignal () {
  console.log('\nReceived kill signal, shutting down gracefully...');
  // kill store jobs
  store.shutdown();
  // kill all connections
  connections.forEach(curr => curr.end());
  setTimeout(() => connections.forEach(curr => curr.destroy()), 2000);
}