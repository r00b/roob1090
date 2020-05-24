const app = require('./src/app');
const { createTerminus } = require('@godaddy/terminus');
const _ = require('lodash');

let connections = [];

app().then(server => {
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
  // kill all connections
  connections.forEach(curr => curr.end());
  setTimeout(() => connections.forEach(curr => curr.destroy()), 2000);
}