const express = require('express');
const _ = require('lodash');
const logger = require('../../lib/logger')().scope('request');
const { getFileNames, close } = require('../../lib/utils');
const { AuthError, BroadcastError } = require('../../lib/errors');
const { checkToken, errorHandler } = require('../middleware');
const { nanoid } = require('nanoid');

const AIRSPACES_PATH = '../lib/airspaces';
const AIRPORTS_PATH = `${AIRSPACES_PATH}/airports`;

const RedisService = require('../../services/redis-service');
const redis = new RedisService();

const AUTH_TIMEOUT = 5000;

module.exports = (broadcastKey, store) => {
  const airports = getFileNames(AIRPORTS_PATH);
  // const airspaces = getFileNames(AIRSPACES_PATH);

  const router = new express.Router()
    .get('/airports', getAirports(airports));
  // .get('airspaces', getAirspaces(airports));

  // mount all airports
  airports.forEach((airport) => {
    router
      .get(`/boards/${airport}`, getBoard(store, airport))
      .ws(`/boards/${airport}`, broadcast(broadcastKey, store, airport));
  });

  router.use(errorHandler);
  return router;
};

/**
 * GET all supported airport routes
 */
function getAirports (airports) {
  return (req, res) => {
    return res.status(200).json({ airports });
  };
}

/**
 * GET the board for a specified airspace
 *
 * @param store - aircraft store
 * @param {string} airspace - name of airspace
 */
function getBoard (store, airspace) {
  return (req, res, next) => {
    return fetchBoard(store, airspace).then(result => res.status(200).json(result)).catch(next);
  };
}

/**
 * Set up the ws object and create a interval that will broadcast messages
 *
 * @param {string} broadcastKey - key that token in initial request payload must match
 *                                for broadcast to be started
 * @param store - aircraft store
 * @param {string} airspace - airspace whose store should be broadcast
 */
function broadcast (pumpKey, store, airspace) {
  return (ws, { originalUrl }, next) => {
    ws.locals = {
      originalUrl,
      airspace,
      socketLogger: logger.scope('ws').child({ requestId: nanoid() }),
      start: Date.now()
    };
    const authTimeout = setTimeout(() => {
      // client only has AUTH_TIMEOUT ms to send a ticket
      next(new AuthError('request timed out', 408));
    }, AUTH_TIMEOUT);
    ws.on('message', data => {
      try {
        clearTimeout(authTimeout);
        // parse the payload
        const rawPayload = JSON.parse(data);
        // check for a valid token; throws AuthError
        checkToken(pumpKey, rawPayload);
        ws.locals.socketLogger.info('authenticated broadcast client', {
          airspace: ws.locals.airspace
        });
        initBroadcast(store, ws, next);
      } catch (e) {
        next(e);
      }
    });
  };
}

/**
 * Init a interval on a WebSocket that broadcasts the requested board
 * every second, checking to ensure the WebSocket's ticket is valid before
 * each send
 *
 * @param store - aircraft store
 * @param {WebSocket} ws
 * @param next
 */
function initBroadcast (store, ws, next) {
  ws.locals.socketLogger.info('init board pipe', {
    start: ws.locals.start,
    url: ws.locals.originalUrl,
    airspace: ws.locals.airspace
  });
  const broadcast = setInterval(sendBoard(store, ws, next), 1000);
  ws.on('close', async _ => {
    clearInterval(broadcast);
    close(ws);
    ws.locals.socketLogger.info('close board pipe', {
      elapsedTime: Date.now() - ws.locals.start,
      url: ws.locals.originalUrl,
      airspace: ws.locals.airspace
    });
  });
}

/**
 * Send the specified airspace's board over the specified WebSocket
 *
 * @param store - aircraft store whose board should be sent
 * @param {WebSocket} ws
 * @param next
 */
function sendBoard (store, ws, next) {
  return async () => {
    try {
      if (ws.readyState === 1) {
        const board = await fetchBoard(store, ws.locals.airspace);
        ws.send(JSON.stringify(board));
      }
    } catch (e) {
      next(new BroadcastError(e.message));
    }
  };
}

/**
 * Fetch the board from redis for a specified airspace
 *
 * @param store - aircraft store
 * @param {string} airspace - name of airspace
 */
async function fetchBoard (store, airspace) {
  const result = {
    arriving: [],
    arrived: [],
    departing: [],
    departed: [],
    onRunway: [],
    runways: [],
    stats: {
      now: Date.now(),
      numInRange: await store.getNumValidAircraft() || 0
    }
  };
  const board = await redis.getAsJson(`board:${airspace}`) || {};
  _.merge(result, board);
  return result;
}