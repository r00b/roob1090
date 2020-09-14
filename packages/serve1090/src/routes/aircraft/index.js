const express = require('express');
const logger = require('../../lib/logger').get('request');
const { v4: uuid } = require('uuid');
const {
  InvalidClientError,
  StaleDataError,
  StoreError
} = require('../../lib/errors');

// TODO - GET a secret for WS pump
module.exports = (store, secret) => {
  return new express.Router()
    .ws('/pump', pump(store, secret), errorHandler)
    .get('/all', getAll(store))
    .get('/valid', getValid(store))
    .get('/invalid', getInvalid(store))
    .use(errorHandler);
};

/**
 * WS handler for parsing web socket message events into data
 * and passing them to the aircraft store
 */
function pump (store, secret) {
  return (ws, req, next) => {
    ws.on('message', async data => {
      try {
        // web sockets don't exactly "work" the way that express middleware
        // expects them to, so we request log in the listener itself
        ws.locals = {
          requestLogger: logger.child({ requestId: uuid() }),
          start: Date.now()
        };
        ws.locals.requestLogger.info('ws message started');
        await parseAndSetData(store, secret, data);
      } catch (err) {
        ws.send(JSON.stringify({
          stack: err.stack,
          message: err.message
        }));
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
function getAll (store) {
  return (req, res, next) => {
    return store.getAllAircraft().then(result => res.status(200).json(result)).catch(next);
  };
}

/**
 * GET valid/filtered aircraft
 */
function getValid (store) {
  return (req, res, next) => {
    return store.getAllValidAircraft().then(result => res.status(200).json(result)).catch(next);
  };
}

/**
 * GET excluded/rejected aircraft
 */
function getInvalid (store) {
  return (req, res, next) => {
    return store.getInvalidAircraft().then(result => res.status(200).json(result)).catch(next);
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
async function parseAndSetData (store, secret, data) {
  const json = JSON.parse(data);
  if (!json.secret || secret !== json.secret) {
    throw new InvalidClientError(json.secret);
  }
  await store.addAircraft(json);
}

/**
 * Handle errors thrown at any point in the request
 */
function errorHandler (err, req, res, next) {
  const { status, message, detail } = parseError(err);
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
        status: 503,
        message: 'aircraft store error',
        detail: err.message
      };
    default:
      return {
        status: 500,
        message: 'internal server error',
        detail: err.message
      };
  }
}