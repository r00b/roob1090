const express = require('express');
const _ = require('lodash');
const logger = require('../../lib/logger')().scope('request');
const { v4: uuid } = require('uuid');
const WebSocket = require('ws');
const RedisService = require('../../services/redis-service');
const AIRSPACES_PATH = '../lib/airspaces';
const AIRPORTS_PATH = `${AIRSPACES_PATH}/airports`;
const { getFileNames, close } = require('../../lib/utils');
const { InvalidSocketError, BroadcastError } = require('../../lib/errors');
const store = require('../../stores/aircraft-store');

const redis = new RedisService();

module.exports = (secret) => {
  const airports = getFileNames(AIRPORTS_PATH);

  const router = new express.Router()
    .get('/', getAirports(airports));

  airports.forEach((airport) => {
    router.ws(`/${airport}`, authenticate(secret), broadcast(airport));
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
 * Authenticate a WebSocket connection request against the server secret
 *
 * @param {string} secret - server secret
 */
function authenticate (secret) {
  return (ws, { query: { secret: clientSecret } }, next) => {
    if (!clientSecret || clientSecret !== secret) {
      next(new InvalidSocketError(clientSecret));
    } else {
      next();
    }
  };
}

/**
 * Init a interval on a WebSocket that broadcasts the requested board
 * every second
 *
 * @param {string} airspace - module name of the airspace to broadcast
 */
function broadcast (airspace) {
  return (ws, { originalUrl }, next) => {
    ws.locals = {
      socketLogger: logger.scope('ws').child({ requestId: uuid() }),
      start: Date.now()
    };
    ws.locals.socketLogger.info('init board pipe', {
      start: ws.locals.start,
      url: originalUrl,
      airspace
    });
    const broadcast = setInterval(sendBoard(airspace, ws, next), 1000);
    ws.on('close', async _ => {
      clearInterval(broadcast);
      ws.terminate();
      ws.locals.socketLogger.info('close board pipe', {
        elapsedTime: Date.now() - ws.locals.start,
        url: originalUrl,
        airspace
      });
    });
  };
}

/**
 * Broadcast the specified airspace's board over the given WebSocket
 *
 * @param {string} airspace - module name of airspace
 * @param {WebSocket} ws
 * @param next
 */
function sendBoard (airspace, ws, next) {
  return async () => {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        const board = await redis.getAsJson(`board:${airspace}`);
        const valid = await store.getAllValidAircraft();

        const result = {
          arriving: board.arriving,
          arrived: board.arrived,
          departing: board.departing,
          departed: board.departed,
          stats: {
            now: Date.now(),
            numInRange: valid.count
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
function errorHandler (err, req, res, next) {
  const { status, message, detail } = parseError(err);
  // send over both ws and HTTP
  if (req.ws) {
    req.ws.socketLogger.error(message, { detail });
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
}

function parseError (err) {
  switch (err.constructor) {
    case InvalidSocketError:
      return {
        status: 401,
        message: 'bad request',
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