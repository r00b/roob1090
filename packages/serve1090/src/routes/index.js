const express = require('express');
const errorHandler = require('../middleware/error-handler');
const {
  secondsToTimeString
} = require('../lib/utils');
const {
  BROADCAST_CLIENT_COUNT,
  DATA_SOURCE_COUNT
} = require('../lib/redis-keys');

module.exports = (store, redis, mongo) => {
  return new express.Router()
    .get('/', getRoot(store, redis, mongo))
    .use(errorHandler);
};

/**
 * GET root of the API
 */
const getRoot = (store, redis, mongo) => (req, res, next) =>
  body(store, redis, mongo, res.locals.requestLogger)
    .then(res.status(200).json.bind(res))
    .catch(next);

async function body (store, redis, mongo, logger) {
  const body = {
    message: 'roob1090 realtime ADS-B API',
    documentation: 'https://github.com/robertsteilberg/roob1090/blob/master/packages/serve1090/README.md',
    routes: {
      aircraft: {
        pump: '/aircraft/pump/.websocket',
        all: '/aircraft/all',
        valid: '/aircraft/valid',
        invalid: '/aircraft/invalid',
        totalCount: '/aircraft/totalCount',
        validCount: '/aircraft/validCount',
        enrichments: '/aircraft/enrichments'
      },
      airspaces: {},
      airports: await getAirports(mongo, logger)
    },
    stats: {
      now: Date.now(),
      uptime: secondsToTimeString(process.uptime()),
      dataSourcesCount: await getCount(DATA_SOURCE_COUNT, redis, logger),
      broadcastClientsCount: await getCount(BROADCAST_CLIENT_COUNT, redis, logger),
      totalAircraftCount: await store.getTotalAircraftCount(),
      validAircraftCount: await store.getValidAircraftCount()
    }
  };

  return body;
}

/**
 * @param {MongoService} mongo
 * @param {logger} logger
 * @returns {Promise<{}>}
 */
async function getAirports (mongo, logger) {
  try {
    const airports = await mongo.getAllActiveAirportIdents() || [];
    return airports.reduce((acc, airport) => {
      acc[airport] = `/airports/boards/${airport}/[.websocket]`;
      return acc;
    }, {});
  } catch (e) {
    logger.warn('failed to get supported airports for root route', e);
    return 'error';
  }
}

/**
 * @param {string} key - key of value holding the count
 * @param {RedisService} redis
 * @param {logger} logger
 * @returns {Promise<number|string>}
 */
async function getCount (key, redis, logger) {
  try {
    const count = parseInt(await redis.get(key));
    return isNaN(count) ? 0 : count;
  } catch (e) {
    logger.warn('failed to get value for root api stats', e);
    return 'error';
  }
}
