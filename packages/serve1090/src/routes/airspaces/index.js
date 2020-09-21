const express = require('express');
const _ = require('lodash');
const logger = require('../../lib/logger')().scope('request');
const { getFileNames, close } = require('../../lib/utils');
const { nanoid } = require('nanoid');
const safeCompare = require('safe-compare');
const { AuthError, BroadcastError } = require('../../lib/errors');

const AIRSPACES_PATH = '../lib/airspaces';
const AIRPORTS_PATH = `${AIRSPACES_PATH}/airports`;

const RedisService = require('../../services/redis-service');
const redis = new RedisService();

const AUTH_TIMEOUT = 5000;

module.exports = (broadcastKey, store) => {
  const airports = getFileNames(AIRPORTS_PATH);

  const router = new express.Router()
    .get('/', getAirports(airports));

  // mount all airports
  airports.forEach((airport) => {
    router.ws(`/${airport}`, authenticate(broadcastKey, airport), broadcast(store));
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
 * Set up the ws object and listen for a ticket sent by the client for
 * authentication
 *
 * @param {string} airspace - module name of the airspace to broadcast
 */
function authenticate (broadcastKey, airspace) {
  return (ws, { originalUrl }, next) => {
    ws.locals = {
      originalUrl,
      airspace,
      socketLogger: logger.scope('ws').child({ requestId: nanoid() }),
      start: Date.now()
    };
    const authTimeout = setTimeout(() => {
      // client only has AUTH_TIMEOUT ms to send a ticket
      next(new AuthError('auth request timed out'));
    }, AUTH_TIMEOUT);
    ws.on('message', async (data) => {
      clearTimeout(authTimeout);
      await checkToken(broadcastKey, data, ws, next);
    });
  };
}

/**
 * Check that the ticket initially sent by the client is valid, and
 * call the subsequent middleware if so
 *
 * @param {string} broadcastKey - secret that token must match
 * @param {string} data - data sent via WebSocket containing the ticket
 * @param {WebSocket} ws
 * @param next
 */
async function checkToken (broadcastKey, data, ws, next) {
  try {
    const token = _.get(JSON.parse(data), 'token', null);
    if (token) {
      if (safeCompare(token, broadcastKey)) {
        ws.locals.socketLogger.info('authenticated WebSocket client', {
          airspace: ws.locals.airspace
        });
        return next();
      }
      throw new AuthError('bad token');
    }
    throw new AuthError('missing token');
  } catch (e) {
    next(e);
  }
}

/**
 * Init a interval on a WebSocket that broadcasts the requested board
 * every second, checking to ensure the WebSocket's ticket is valid before
 * each send
 *
 * @param store - aircraft store
 */
function broadcast (store) {
  return (ws, req, next) => {
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
  };
}

/**
 * Send the specified airspace's board over the given WebSocket
 *
 * @param store - aircraft store
 * @param {WebSocket} ws
 * @param next
 */
function sendBoard (store, ws, next) {
  return async () => {
    try {
      if (ws.readyState === 1) {
        const board = await redis.getAsJson(`board:${ws.locals.airspace}`) || {};
        const valid = await store.getAllValidAircraft();
        const result = {
          arriving: board.arriving || [],
          arrived: board.arrived || [],
          departing: board.departing || [],
          departed: board.departed || [],
          stats: {
            now: Date.now(),
            numInRange: valid.count || 0
          }
        };
        ws.send(JSON.stringify(result));
      }
    } catch (e) {
      next(new BroadcastError(e.message));
    }
  };
}

/**
 * Handle errors thrown at any point in the request
 */
function errorHandler (err, req, res, _) {
  try {
    const { status, message, detail } = parseError(err);
    // send over both ws and HTTP
    if (req.ws) {
      req.ws.locals.socketLogger.error(message, { detail });
      req.ws.send(JSON.stringify({
        status,
        message,
        detail
      }));
      close(req.ws);
    } else {
      res.locals.requestLogger.error(message, { detail });
    }
    return res.status(status).json({
      message,
      detail
    });
  } catch (e) {
    res.status(500);
    logger.error('unhandled router error', e);
  }
}

function parseError (err) {
  switch (err.constructor) {
    case AuthError:
      return {
        status: 401,
        message: 'unauthorized',
        detail: err.message
      };
    case BroadcastError:
      return {
        status: 500,
        message: 'broadcast error',
        detail: err.message
      };
    default: {
      return {
        status: 500,
        message: 'internal server error',
        detail: err.message
      };
    }
  }
}