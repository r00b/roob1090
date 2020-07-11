const express = require('express');
const pumpId = process.env.SERVE1090_SECRET; // TODO this shouldn't be here
const { request: logger } = require('./../../lib/logger');
const {
  secondsToMillis,
  tryCatch
} = require('../../lib/utils');
const {
  InvalidClientError,
  StaleDataError
} = require('../../lib/errors');

module.exports = (store) => {
  return new express.Router()
    .ws('/pump', pump(store))
    .get('/raw', getRaw(store))
    .get('/valid', getValid(store))
    .get('/excluded', getExcluded(store))
    .use(errorHandler);
};

function pump (store) {
  return (ws, req, next) =>
    ws.on('message', data => tryCatch(() => parseAndSetData(store, data), next));
}


// TODO handle errors on these
function getRaw (store) {
  return (req, res, next) => {
    // logger.router({
    //   message: 'get raw aircraft',
    //   verb: 'GET',
    //   status: 200
    // });
    return res.status(200).json(store.getRawAircraft());
  };
}

function getValid (store) {
  return (req, res, next) => {
    // logger.router({
    //   message: 'get valid aircraft',
    //   verb: 'GET',
    //   status: 200
    // });
    return res.status(200).json(store.getValidAircraft());
  };
}

function getExcluded (store) {
  return (req, res, next) => {
    // logger.router({ // TODO requestlogger
    //   message: 'get excluded aircraft',
    //   verb: 'GET',
    //   status: 200
    // });
    return res.status(200).json(store.getExcludedAircraft());
  };
}





function parseAndSetData (store, data) {
  const json = JSON.parse(data);
  if (pumpId !== json.secret) {
    throw new InvalidClientError(pumpId);
  }
  const clientTime = new Date(secondsToMillis(json.now)).toISOString();
  if (store.setNewData(json)) {
    // logger.router({
    //   message: 'accept new data',
    //   clientTime
    // });
  } else {
    throw new StaleDataError(clientTime); // log age in sec
  }
}

/**
 * Handle errors thrown at any point in the request
 */
function errorHandler (err, req, res, next) {
  switch (err.constructor) {
    case StaleDataError:
      logger.error('Stale data', {
        detail: err.message
      });
      break;
    case InvalidClientError:
      logger.error('Invalid client', {
        detail: err.message
      });
      break;
    default:
      logger.error('Unknown error', {
        detail: err.message
      });
  }
}
