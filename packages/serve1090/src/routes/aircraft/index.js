const express = require('express');
const logger = require('../../lib/logger')().scope('request');
const { PUMP_SCHEMA } = require('./schemas');
const { PumpError } = require('../../lib/errors');
const { checkToken, errorHandler, close } = require('../../middleware/route');
const { nanoid } = require('nanoid');

const RedisService = require('../../services/redis-service');
const redis = new RedisService();

module.exports = (pumpKey, store) => {
  return new express.Router()
    .ws('/pump', pump(pumpKey, store))
    .get('/all', getAll(store))
    .get('/valid', getValid(store))
    .get('/invalid', getInvalid(store))
    .get('/totalCount', getTotalAircraftCount(store))
    .get('/validCount', getValidAircraftCount(store))
    .use(errorHandler);
};

/**
 * Set up the ws object and create a listener that will handle messages
 *
 * @param {string} pumpKey - key that token in each payload must match to be accepted
 * @param store - aircraft store
 */
function pump (pumpKey, store) {
  return (ws, { originalUrl }, next) => {
    redis.incr('dataSourceCount'); // fire and forget
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
        const { value: payload, error } = PUMP_SCHEMA.validate(rawPayload);
        if (error) {
          throw new PumpError(error.message.replace(/"/g, '\''));
        }
        store.addAircraft(payload).catch(next);
      } catch (e) {
        next(e);
      }
    });
    ws.on('close', _ => {
      close(ws);
      redis.decr('dataSourceCount'); // fire and forget
      ws.locals.socketLogger.info('terminate pump', {
        elapsedTime: Date.now() - ws.locals.start,
        url: ws.locals.originalUrl,
        airspace: ws.locals.airspace
      });
    });
    ws.locals.socketLogger.info('init pump', { start: ws.locals.start, url: originalUrl });
  };
}

/**
 * GET entire raw store of aircraft
 */
function getAll (store) {
  return (req, res, next) => {
    return store.getAllAircraft().then(result => res.status(200).json(result)).catch(next);
  };
}

/**
 * GET valid aircraft
 */
function getValid (store) {
  return (req, res, next) => {
    return store.getValidAircraft().then(result => res.status(200).json(result)).catch(next);
  };
}

/**
 * GET aircraft that failed validation
 */
function getInvalid (store) {
  return (req, res, next) => {
    return store.getInvalidAircraft().then(result => res.status(200).json(result)).catch(next);
  };
}

/**
 * GET count of all aircraft in the store
 */
function getTotalAircraftCount (store) {
  return (req, res, next) => {
    return store.getTotalAircraftCount().then(result => res.status(200).json({ count: result })).catch(next);
  };
}

/**
 * GET count of validated aircraft in the store
 */
function getValidAircraftCount (store) {
  return (req, res, next) => {
    return store.getValidAircraftCount().then(result => res.status(200).json({ count: result })).catch(next);
  };
}
