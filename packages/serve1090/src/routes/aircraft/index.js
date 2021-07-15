const express = require('express');
const logger = require('../../lib/logger')().scope('request');
const { nanoid } = require('nanoid');
const errorHandler = require('../../middleware/error-handler');
const { pumpBody } = require('../../lib/schemas');
const { checkToken, close } = require('../../lib/utils');
const { PayloadError } = require('../../lib/errors');
const {
  ENRICHMENTS,
  DATA_SOURCE_COUNT
} = require('../../lib/redis-keys');

module.exports = (pumpKey, store, redis) => {
  return new express.Router()
    .ws('/pump', pump(pumpKey, store, redis))
    .get('/all', getAllAircraft(store))
    .get('/valid', getValidAircraft(store))
    .get('/invalid', getInvalidAircraft(store))
    .get('/enrichments', getEnrichments(redis))
    .get('/totalCount', getTotalAircraftCount(store))
    .get('/validCount', getValidAircraftCount(store))
    .use(errorHandler);
};

/**
 * Set up the ws object and create a listener that will handle messages
 *
 * @param {string} pumpKey - key that token in each payload must match to be accepted
 * @param store - aircraft store
 * @param redis
 */
function pump (pumpKey, store, redis) {
  return (ws, { originalUrl }, next) => {
    redis.incr(DATA_SOURCE_COUNT); // fire and forget
    ws.locals = {
      originalUrl,
      socketLogger: logger.scope('ws').child({ requestId: nanoid() }),
      start: Date.now()
    };
    ws.on('message', data => {
      try {
        // parse the payload
        const rawPayload = JSON.parse(data);
        // check for a valid token; throws AuthError
        checkToken(pumpKey, rawPayload);
        // validate payload to ensure it has required props
        const { value: payload, error } = pumpBody.validate(rawPayload);
        if (error) {
          return next(new PayloadError(error.message.replace(/"/g, '\'')));
        }
        store.addAircraft(payload).catch(next);
      } catch (e) {
        return next(e);
      }
    });
    ws.on('close', _ => {
      close(ws);
      redis.decr(DATA_SOURCE_COUNT); // fire and forget
      ws.locals.socketLogger.info('terminated pump', {
        elapsedTime: Date.now() - ws.locals.start,
        url: ws.locals.originalUrl
      });
    });
    ws.locals.socketLogger.info('init pump', { start: ws.locals.start, url: originalUrl });
  };
}

/**
 * GET entire raw store of aircraft
 */
function getAllAircraft (store) {
  return (req, res, next) =>
    store.getAllAircraft()
      .then(res.status(200).json.bind(res))
      .catch(next);
}

/**
 * GET valid aircraft
 */
function getValidAircraft (store) {
  return (req, res, next) =>
    store.getValidAircraft()
      .then(res.status(200).json.bind(res))
      .catch(next);
}

/**
 * GET aircraft that failed validation
 */
function getInvalidAircraft (store) {
  return (req, res, next) =>
    store.getInvalidAircraft()
      .then(res.status(200).json.bind(res))
      .catch(next);
}

/**
 * GET enrichments store
 */
function getEnrichments (redis) {
  return (req, res, next) =>
    redis.hgetAllAsJson(ENRICHMENTS)
      .then(res.status(200).json.bind(res))
      .catch(next);
}

/**
 * GET count of all aircraft in the store
 */
function getTotalAircraftCount (store) {
  return (req, res, next) =>
    store.getTotalAircraftCount()
      .then(res.status(200).json.bind(res))
      .catch(next);
}

/**
 * GET count of validated aircraft in the store
 */
function getValidAircraftCount (store) {
  return (req, res, next) =>
    store.getValidAircraftCount()
      .then(res.status(200).json.bind(res))
      .catch(next);
}
