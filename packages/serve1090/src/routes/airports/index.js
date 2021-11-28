const express = require('express');
const logger = require('../../lib/logger')().scope('request');
const errorHandler = require('../../middleware/error-handler');
const { AuthError, BroadcastError } = require('../../lib/errors');
const { checkToken, close } = require('../../lib/utils');
const { nanoid } = require('nanoid');

const {
  BOARD,
  BROADCAST_CLIENT_COUNT
} = require('../../lib/redis-keys');

const AUTH_TIMEOUT = 5000;

module.exports = (airports, broadcastKey, store, redis) => {
  const router = new express.Router()
    .get('/', getAirports(airports));

  airports.forEach((airport) => {
    router
      .get(`/boards/${airport}`, getBoard(airport, store, redis))
      .ws(`/boards/${airport}`, broadcast(airport, broadcastKey, store, redis));
  });

  return router.use(errorHandler);
};

/**
 * GET all supported airport routes
 *
 * @param airports {string[]} - list of airport icaos
 */
function getAirports (airports) {
  return (req, res) =>
    res.status(200).json({ airports });
}

/**
 * GET the board for a specified airport
 *
 * @param {string} airport - name of airport
 * @param store - aircraft store
 * @param redis
 */

function getBoard (airport, store, redis) {
  return (req, res, next) =>
    fetchBoard(airport, store, redis)
      .then(res.status(200).json.bind(res))
      .catch(next);
}

/**
 * Fetch the board from redis for a specified airport
 *
 * @param {string} airport - icao of airport
 * @param store - aircraft store
 * @param redis
 *
 * TODO: forceFallbackFA for manual GETs
 */
async function fetchBoard (airport, store, redis) {
  const board = await redis.getAsJson(BOARD(airport));
  return {
    ...board,
    stats: {
      now: Date.now(),
      totalAircraftCount: await store.getTotalAircraftCount(),
      validAircraftCount: await store.getValidAircraftCount()
    }
  };
}

/**
 * Set up the ws object and create a interval that will broadcast messages
 *
 * @param {string} airport - icao of airport whose store should be broadcast
 * @param {string} broadcastKey - key that token in initial request payload must match
 *                                for broadcast to be started
 * @param store - aircraft store
 * @param redis
 */
function broadcast (airport, broadcastKey, store, redis) {
  return (ws, { originalUrl }, next) => {
    ws.locals = {
      originalUrl,
      airport,
      socketLogger: logger.scope('ws').child({ requestId: nanoid() }),
      socketStart: Date.now()
    };
    const authTimeout = setTimeout(() => {
      // client only has AUTH_TIMEOUT ms to send a payload
      return next(new AuthError('request timed out', 408));
    }, AUTH_TIMEOUT);

    let broadcast, initialized;

    ws.on('message', data => {
      try {
        // ignore multiple requests for broadcast
        if (initialized) return;
        clearTimeout(authTimeout);
        // parse the payload
        const rawPayload = JSON.parse(data);
        // check for a valid token; throws AuthError
        checkToken(broadcastKey, rawPayload);
        // initialize broadcast
        redis.incr(BROADCAST_CLIENT_COUNT); // fire and forget
        ws.locals.socketLogger.info('authenticated broadcast client', {
          airport: ws.locals.airport
        });

        broadcast = setInterval(sendBoard(ws, next, store, redis), 1000);

        ws.locals.broadcastStart = Date.now();
        ws.locals.socketLogger.info('initialized broadcast', {
          broadcastStart: ws.locals.broadcastStart,
          url: originalUrl,
          airport
        });
        initialized = true;
      } catch (e) {
        return next(e);
      }
    });
    ws.on('close', _ => {
      if (broadcast) {
        clearInterval(broadcast);
      }
      close(ws);
      redis.decr(BROADCAST_CLIENT_COUNT); // fire and forget
      ws.locals.socketLogger.info('terminated broadcast', {
        socketTime: Date.now() - ws.locals.start,
        broadcastTime: Date.now() - ws.locals.broadcastStart,
        url: ws.locals.originalUrl,
        airport: ws.locals.airport
      });
    });
  };
}

/**
 * Send the specified airport's board over the specified WebSocket
 *
 * @param {WebSocket} ws
 * @param {function} next
 * @param store - aircraft store
 * @param redis
 */
function sendBoard (ws, next, store, redis) {
  return async () => {
    try {
      if (ws.readyState === 1) {
        const board = await fetchBoard(ws.locals.airport, store, redis);
        ws.send(JSON.stringify(board));
      }
    } catch (e) {
      next(new BroadcastError(e.message));
    }
  };
}
