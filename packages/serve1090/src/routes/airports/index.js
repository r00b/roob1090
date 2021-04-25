const express = require('express');
const logger = require('../../lib/logger')().scope('request');
const { getFileNames } = require('../../lib/utils');
const { AuthError, BroadcastError } = require('../../lib/errors');
const { checkToken, errorHandler, close } = require('../../middleware/route');
const { nanoid } = require('nanoid');

const AIRPORTS_PATH = '../lib/airports';

const RedisService = require('../../services/redis-service');
const redis = new RedisService();
const {
  BOARD,
  BROADCAST_CLIENT_COUNT
} = require('../../lib/redis-keys');

const AUTH_TIMEOUT = 5000;

module.exports = (broadcastKey, store) => {
  const airports = getFileNames(AIRPORTS_PATH);

  const router = new express.Router()
    .get('/airports', getAirports(airports));

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
 * GET the board for a specified airport
 *
 * @param store - aircraft store
 * @param {string} airport - name of airport
 */
function getBoard (store, airport) {
  return (req, res, next) => {
    return fetchBoard(store, airport).then(result => res.status(200).json(result)).catch(next);
  };
}

/**
 * Set up the ws object and create a interval that will broadcast messages
 *
 * @param {string} broadcastKey - key that token in initial request payload must match
 *                                for broadcast to be started
 * @param store - aircraft store
 * @param {string} airport - airport whose store should be broadcast
 */
function broadcast (pumpKey, store, airport) {
  return (ws, { originalUrl }, next) => {
    ws.locals = {
      originalUrl,
      airport,
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
        redis.incr(BROADCAST_CLIENT_COUNT); // fire and forget
        ws.locals.socketLogger.info('authenticate broadcast client', {
          airport: ws.locals.airport
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
  const broadcast = setInterval(sendBoard(store, ws, next), 1000);
  ws.on('close', async _ => {
    clearInterval(broadcast);
    close(ws);
    redis.decr(BROADCAST_CLIENT_COUNT); // fire and forget
    ws.locals.socketLogger.info('terminate broadcast', {
      elapsedTime: Date.now() - ws.locals.start,
      url: ws.locals.originalUrl,
      airport: ws.locals.airport
    });
  });
  ws.locals.socketLogger.info('init broadcast', {
    start: ws.locals.start,
    url: ws.locals.originalUrl,
    airport: ws.locals.airport
  });
}

/**
 * Send the specified airport's board over the specified WebSocket
 *
 * @param store - aircraft store whose board should be sent
 * @param {WebSocket} ws
 * @param next
 */
function sendBoard (store, ws, next) {
  return async () => {
    try {
      if (ws.readyState === 1) {
        const board = await fetchBoard(store, ws.locals.airport);
        ws.send(JSON.stringify(board));
      }
    } catch (e) {
      next(new BroadcastError(e.message));
    }
  };
}

/**
 * Fetch the board from redis for a specified airport
 *
 * @param store - aircraft store
 * @param {string} airport - name of airport
 *
 * TODO: forceFallbackFA for manual GETs
 */
async function fetchBoard (store, airport) {
  const board = await redis.getAsJson(BOARD(airport));
  const totalAircraftCount = await store.getTotalAircraftCount();
  const validAircraftCount = await store.getValidAircraftCount();
  return {
    ...board,
    stats: {
      now: Date.now(),
      totalAircraftCount,
      validAircraftCount
    }
  };
}
