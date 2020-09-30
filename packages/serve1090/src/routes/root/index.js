const express = require('express');
const logger = require('../../lib/logger')().scope('request');
const { getFileNames } = require('../../lib/utils');
const { errorHandler } = require('../../middleware/route');

const AIRSPACES_PATH = '../lib/airspaces';
const AIRPORTS_PATH = '../lib/airports';

const RedisService = require('../../services/redis-service');
const redis = new RedisService();

module.exports = (store) => {

  const router = new express.Router()
    .get('/', getRoot(store));
  router.use(errorHandler);
  return router;
};

/**
 * GET root of the API
 */
function getRoot (store) {
  return async (req, res) => {
    const body = {
      message: 'Welcome to the roob1090 realtime ADS-B API',
      documentation: 'https://github.com/robertsteilberg/roob1090/blob/master/packages/serve1090/README.md',
      routes: {
        aircraft: {
          pump: '/aircraft/pump/.websocket',
          all: '/aircraft/all',
          valid: '/aircraft/valid',
          invalid: '/aircraft/invalid',
          totalCount: '/aircraft/totalCount',
          validCount: '/aircraft/validCount'
        },
        airspaces: {},
        airports: {}
      },
      stats: {
        dataSourcesCount: getCount('dataSourceCount'),
        broadcastClientsCount: getCount('broadcastClientCount'),
        totalAircraftCount: await store.getTotalAircraftCount(),
        validAircraftCount: await store.getValidAircraftCount()
      }
    };
    const airspaces = getFileNames(AIRSPACES_PATH);
    airspaces.forEach(airport => {
      body.routes.airspaces[airport] = `/airspaces/boards/${airport}[/.websocket]`;
    });
    const airports = getFileNames(AIRPORTS_PATH);
    airports.forEach(airport => {
      body.routes.airports[airport] = `/airports/boards/${airport}[/.websocket]`;
    });
    return res.status(200).json(body);
  };
}

/**
 * Get integer value form redis, return null if something goes wrong
 *
 * @param {string} key - key of value holding the count
 * @returns {Promise|null}
 */
async function getCount (key) {
  try {
    const count = await redis.get(key);
    return parseInt(count);
  } catch (e) {
    logger.warn('failed to parse count', e);
    return null;
  }
}