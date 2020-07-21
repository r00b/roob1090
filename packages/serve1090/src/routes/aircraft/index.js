const express = require('express');
const { request: logger } = require('./../../lib/logger');
const { v4: uuid } = require('uuid');
const {
  InvalidClientError,
  StaleDataError,
  StoreError
} = require('../../lib/errors');

module.exports = (store, secret) => {
  return new express.Router()
    .ws('/pump', pump(store, secret), errorHandler)
    .get('/raw', getRaw(store))
    .get('/valid', getValid(store))
    .get('/excluded', getExcluded(store))
    .use(errorHandler);
};

/**
 * WS handler for parsing web socket message events into data
 * and passing them to the aircraft store
 */
function pump (store, secret) {
  return (ws, req, next) => {
    ws.on('message', data => {
      try {
        // web sockets don't exactly "work" the way that express middleware
        // expects them to, so we request log in the listener itself
        ws.locals = {
          requestLogger: logger.child({ requestId: uuid() }),
          start: Date.now()
        };
        ws.locals.requestLogger.info('ws message started');
        parseAndSetData(store, secret, data);
      } catch (err) {
        ws.locals.requestLogger.error(err.message, { detail: err.detail });
      } finally {
        ws.locals.requestLogger.info('ws message completed', {
          elapsedTime: Date.now() - ws.locals.start
        });
      }
    });
  };
}

/**
 * GET raw parsed data store of aircraft
 */
function getRaw (store) {
  return (req, res, next) => {
    return res.status(200).json(store.getRawAircraft());
  };
}

/**
 * GET valid/filtered aircraft
 */
function getValid (store) {
  return (req, res, next) => {
    return res.status(200).json(store.getValidAircraft());
  };
}

/**
 * GET excluded/rejected aircraft
 */
function getExcluded (store) {
  return (req, res, next) => {
    return res.status(200).json(store.getExcludedAircraft());
  };
}

/**
 * Convert the ws data to JSON, validate it against the secret, and pass
 * it to the store
 *
 * @param store aircraft store
 * @param secret serve1090's configured secret
 * @param data raw ws message
 */
function parseAndSetData (store, secret, data) {
  const json = JSON.parse(data);
  if (!json.secret || secret !== json.secret) {
    throw new InvalidClientError(json.secret);
  }
  store.setNewData(json);
}

/**
 * Handle errors thrown at any point in the request
 */
function errorHandler (err, req, res, next) {
  const { message, detail, status } = parseError(err);
  res.locals.requestLogger.error(message, { detail });
  if (status) {
    res.status(status).json({
      status,
      message,
      detail
    });
  }
}

/**
 * Generate an error hash for each thrown error object
 * @param err thrown error object
 * @returns error hash with a message, detail, and optionally a status if it
 * should be returned as an HTTP response
 */
function parseError (err) {
  switch (err.constructor) {
    case StaleDataError: // TODO do we need this
      return {
        message: 'ws: stale data',
        detail: err.message
      };
    case InvalidClientError:
      return {
        message: 'ws: invalid client',
        detail: err.message
      };
    case StoreError:
      return {
        message: 'aircraft store error',
        detail: err.message,
        status: 503
      };
    default:
      return {
        message: 'internal server error',
        detail: err.message,
        status: 500
      };
  }
}