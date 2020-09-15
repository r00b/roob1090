const DEV_EXCLUDED = [
  // 'app',
  // 'request',
  'aircraft store',
  // 'worker service',
  'worker meta'
  // 'worker airport',
  // 'worker runway',
  // 'worker enrich',
  // 'ws'
];

function pino (secrets) {
  const pino = require('pino')({
    redact: Object.keys(secrets).map(k => [k, `*.${k}`]).flat(),
    hooks: {
      // so that log fns work the same as signale
      logMethod (inputArgs, method) {
        return method.call(this, {
          msg: inputArgs[0],
          meta: inputArgs[1]
        });
      }
    }
  });
  pino.scope = () => pino;
  return pino;
}

function signale (secrets) {
  const Signal = require('./signal');
  const options = {
    disabled: false,
    interactive: false,
    logLevel: 'info',
    scope: 'global',
    secrets: Object.values(secrets),
    types: {},
    excluded: DEV_EXCLUDED
  };
  return new Signal(options);
}

module.exports = () => {
  const config = require('../config');
  const { port, dbHost, dbPort, nodeEnv, ...secrets } = config;
  if (nodeEnv === 'production') {
    return pino(secrets);
  } else {
    return signale(secrets);
  }
};