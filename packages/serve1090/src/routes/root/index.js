const express = require('express');
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
        dataSourcesCount: await redis.get('dataSourceCount') || 0,
        broadcastClientsCount: await redis.get('broadcastClientCount') || 0,
        totalAircraftCount: await store.getTotalAircraftCount(),
        validAircraftCount: await store.getValidAircraftCount()
      }
    };
    const airspaces = getFileNames(AIRSPACES_PATH);
    airspaces.forEach(airport => {
      body.routes.airspaces[airport] = `/airspaces/boards/${airport}`;
    });
    const airports = getFileNames(AIRPORTS_PATH);
    airports.forEach(airport => {
      body.routes.airports[airport] = `/airports/boards/${airport}`;
    });
    return res.status(200).json(body);
  };
}
