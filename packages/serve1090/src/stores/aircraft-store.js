const _ = require('lodash');
const logger = require('../lib/logger').get('store');
const { AIRCRAFT_SCHEMA } = require('./schemas');
const {
  secondsToMillis,
  millisToSeconds
} = require('../lib/utils');
const {
  StaleDataError
} = require('../lib/errors');
const RedisService = require('../services/redis-service');
const redis = new RedisService();

// maximum age of new data that will be accepted into the store
const MAX_DATA_AGE = 10000;

module.exports = {
  addAircraft,
  getAllAircraft,
  getAllValidAircraft,
  getInvalidAircraft,
  getValidatedAircraft
};

// CREATE

/**
 * Accept new dump1090 aircraft data to merge into the store
 *
 * @param data raw JSON object generated by dump109 with data.now in seconds since epoch
 * @returns {boolean} true if the data was accepted, false if it was rejected
 */
async function addAircraft (data) {
  const clientNowMillis = secondsToMillis(data.now);
  const now = Date.now();
  const age = now - clientNowMillis;
  if (age > MAX_DATA_AGE) {
    logger.info({
      message: 'reject new data',
      clientTimestamp: new Date(clientNowMillis).toISOString(),
      age: millisToSeconds(age).toFixed(2)
    });
    throw new StaleDataError(millisToSeconds(age));
  }
  // logger.info({
  //   message: 'accept dump1090 data',
  //   messages: data.messages,
  //   clientTimestamp: new Date(clientNowMillis).toISOString()
  // });
  // first, update and filter the data
  const newAircraftMap = mapifyAircraftArray(data.aircraft.map(setUpdated));
  await validateAndWrite(newAircraftMap);
}

/**
 *
 * @param aircraftArray array of aircraft from dump1090
 * @returns { hex: aircraft } hex mapped to aircraft object
 */
function mapifyAircraftArray (aircraftArray = []) {
  return aircraftArray.reduce((acc, aircraft) => {
    acc[aircraft.hex] = aircraft;
    return acc;
  }, {});
}

/**
 * Filter an aircraft serve1090 data store; validate against AIRCRAFT_SCHEMA
 * and return the validated map
 *
 * @param map serve1090 aircraft map to validate and filter
 * @returns validated and filtered serve1090 aircraft map
 * @private
 */
async function validateAndWrite (store) {
  const pipeline = redis.pipeline();
  Object.entries(store).forEach(([hex, aircraft]) => {
    const { value: validatedBody, error } = AIRCRAFT_SCHEMA.validate(aircraft);
    if (!error) {
      validatedBody.error = false;
      pipeline.hsetJsonEx('store:valid', hex, validatedBody, 10);
    } else {
      aircraft.error = error.message.replace(/"/g, '\'');
      pipeline.hsetJsonEx('store:invalid', hex, aircraft, 60);
    }
    redis.hsetJsonEx('store:all', hex, aircraft, 60);
  });
  await pipeline.exec();
}

// RETRIEVE

function getAllAircraft () {
  return getStore('store:all');
}

function getAllValidAircraft () {
  return getStore('store:valid');
}

// todo use hlen to get length of aircraft

function getInvalidAircraft () {
  return getStore('store:invalid');
}

function getAircraft (hex) {
  return redis.hgetJson('store:all', hex);
}

function getValidatedAircraft (hex) {
  return redis.hgetJson('store:valid', hex);
}

async function getStore (store) {
  const aircraft = await redis.hgetAllAsJsonValues(store);
  return {
    now: Date.now(),
    count: aircraft.length,
    aircraft
  };
}

function setUpdated (aircraft) {
  aircraft.updated = Date.now();
  return aircraft;
}
