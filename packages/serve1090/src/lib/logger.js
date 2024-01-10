const _ = require('lodash');
const env = require('../config');
const pino = require('pino');

const ALLOWED_CONFIG_PROPS = [
  'nodeEnv',
  'port',
  'redisHost',
  'redisPort',
  'redisUser',
  'mongoHost',
  'mongoPort',
  'mongoUser',
  'openSkyApi',
  'faApi',
];

const DEV_EXCLUDED = ['worker-service'];

function pathReducer(acc, secret) {
  acc.push(secret, `*.${secret}`);
  return acc;
}

module.exports = name => {
  const secrets = _.difference(Object.keys(env), ALLOWED_CONFIG_PROPS);
  return pino({
    name,
    enabled: !DEV_EXCLUDED.includes(name),
    redact: secrets.reduce(pathReducer, []),
  });
};
