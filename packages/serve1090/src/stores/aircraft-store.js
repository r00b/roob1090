const _ = require('lodash');
const { store: logger } = require('./../lib/logger');
const AIRCRAFT_SCHEMA = require('./../schemas/aircraft');
const {
  secondsToMillis,
  millisToSeconds
} = require('../lib/utils');
const {
  StoreError,
  StaleDataError
} = require('../lib/errors');

// maximum age of new data that will be accepted into the store
const MAX_DATA_AGE = 10000;

module.exports = {
  init,
  setNewData,
  getRawAircraft,
  getValidAircraft,
  getExcludedAircraft,
  shutdown
};

// INIT

function init () {
  if (!this.initialized) {
    // set up data maps
    this.currentRawAircraft = _createStore('raw');
    this.currentValidAircraft = _createStore('valid');
    // init jobs
    this.jobs = [
      setInterval(() => this.currentValidAircraft = _purgeAircraft(this.currentValidAircraft, 10000), 1000),
      setInterval(() => this.currentRawAircraft = _purgeAircraft(this.currentRawAircraft, 60000), 10000),
      setInterval(() => _emptyPurgeList(this.currentRawAircraft, this.currentValidAircraft), 1800000)
    ];
  } else {
    shutdown();
    init();
    logger.info('store re-initialized');
  }
  this.initialized = true;
  logger.info('initialize store');
}

// JOBS

/**
 * Purge aircraft out of the store that are stale
 *
 * @param store the serve1090 aircraft store to purge
 * @param maxAge maximum allowed age of the aircraft (where age begins when serve1090
 *        receives the aircraft or an update to it)
 * @returns new serve1090 aircraft store without stale aircraft
 * @private
 */
function _purgeAircraft (store, maxAge) {
  const result = _.cloneDeep(store);
  let newSize = Object.keys(store.aircraft).length;
  result.aircraft = _.pickBy(store.aircraft, function (aircraft) {
    const age = Date.now() - aircraft.updated;
    const tooOld = age > maxAge;
    if (tooOld) {
      result.purged.add(aircraft.hex);
      newSize--;
      logger.info({
        message: 'purge aircraft',
        store: store.name,
        hex: aircraft.hex,
        age,
        max: maxAge,
        numPurged: result.purged.size,
        newSize
      });
    }
    return !tooOld;
  });
  return result;
}

/**
 * Empty the purge list, since the same aircraft will be seen over time
 * @param store the store containing the purge list to clear
 * @private
 */
function _emptyPurgeList (...store) {
  store.forEach(s => {
    if (s.purged.size) {
      s.purged.clear();
      logger.info({
        message: 'empty purge list',
        store: s.name
      });
    }
  });
}

// SHUTDOWN

function shutdown () {
  this.jobs.map(clearInterval);
  this.initialized = false;
  logger.info('shutdown store');
}

// CREATE

/**
 * Accept new dump1090 aircraft data to merge into the store
 *
 * @param data raw JSON object generated by dump109 with data.now in seconds since epoch
 * @returns {boolean} true if the data was accepted, false if it was rejected
 */
function setNewData (data) {
  _checkIfInitialized(this.initialized);
  const clientNowMillis = secondsToMillis(data.now);
  const now = Date.now();
  const age = now - clientNowMillis;
  if (age > MAX_DATA_AGE) {
    logger.info({
      message: 'reject new data',
      clientTimestamp: new Date(clientNowMillis).toISOString(),
      age: millisToSeconds(age).toFixed(2)
    });
    throw new StaleDataError(millisToSeconds(age))
  }
  logger.info({
    message: 'accept dump1090 data',
    messages: data.messages,
    clientTimestamp: new Date(clientNowMillis).toISOString()
  });
  // first, update and filter the data
  const newAircraftMap = _mapifyAircraftArray(data.aircraft.map(_setUpdated));
  const { validatedMap, errors } = _validateAircraftMap(newAircraftMap);
  // set errors onto newAircraftMap so they can be returned with raw/excluded
  Object.entries(errors).forEach(([hex, error]) => {
    newAircraftMap[hex].error = error;
  });
  // then merge it with existing data stores
  this.currentRawAircraft = _mergeIntoStore(this.currentRawAircraft, newAircraftMap);
  this.currentValidAircraft = _mergeIntoStore(this.currentValidAircraft, validatedMap);
  return true;
}

/**
 * Merge a mapified dump1090 JSON object into an existing serve1090 aircraft
 * data store
 *
 * @param store existing serve1090 store of aircraft
 * @param newMap unmerged serve1090 map of aircraft | { hex: aircraft }
 * @returns newly merged aircraft data store | { hex: aircraft }
 * @private
 */
function _mergeIntoStore (store, newMap) {
  const updated = [];
  const added = [];
  const mergedStore = Object.entries(newMap).reduce((acc, [hex, aircraft]) => {
    let logArray;
    if (store.aircraft[hex]) {
      logArray = updated;
    } else {
      logArray = added;
      if (store.purged.has(hex)) {
        store.purged.delete(hex);
        logger.info({
          message: 'add purged aircraft',
          hex,
          seen: aircraft.seen
        });
      }
    }
    logArray.push(hex);
    acc.aircraft[hex] = aircraft;
    return acc;
  }, _.cloneDeep(store));
  const size = Object.keys(mergedStore.aircraft).length;
  logger.info({
    message: 'add new aircraft',
    store: store.name,
    numAdded: added.length,
    newSize: size
  });
  logger.info({
    message: 'update existing aircraft',
    store: store.name,
    numUpdated: updated.length,
    size
  });
  return mergedStore;
}

/**
 * Filter an aircraft serve1090 data store; validate against AIRCRAFT_SCHEMA
 * and return the validated map
 *
 * @param map serve1090 aircraft map to validate and filter
 * @returns validated and filtered serve1090 aircraft map
 * @private
 */
function _validateAircraftMap (map) {
  const errors = {};
  const validatedMap = Object.entries(map).reduce((acc, [hex, aircraft]) => {
    const { value: validatedBody, error } = AIRCRAFT_SCHEMA.validate(aircraft);
    if (!error) {
      validatedBody.error = false;
      acc[hex] = validatedBody;
    } else {
      errors[hex] = error.message.replace(/"/g, '\'');
    }
    return acc;
  }, {});
  return {
    validatedMap,
    errors
  };
}

// RETRIEVE

function getRawAircraft () {
  _checkIfInitialized(this.initialized);
  return _exportStore(this.currentRawAircraft);
}

function getValidAircraft () {
  _checkIfInitialized(this.initialized);
  return _exportStore(this.currentValidAircraft);
}

function getExcludedAircraft () {
  _checkIfInitialized(this.initialized);
  const currentAircraft = this.currentValidAircraft;
  const excluded = _.pickBy(this.currentRawAircraft, a => !currentAircraft[a.hex]);
  return _exportStore(excluded);
}

function _exportStore (store) {
  try {
    const aircraft = Object.values(store.aircraft) || [];
    return {
      now: Date.now(),
      numAircraft: aircraft.length,
      aircraft
    };
  } catch (e) {
    return {
      now: Date.now(),
      error: e.message
    };
  }
}

// UTILS

function _checkIfInitialized (initialized) {
  if (!initialized) throw new StoreError('store not initialized');
}

/**
 * Init a new aircraft store
 */
function _createStore (name) {
  return {
    name,
    aircraft: {},
    purged: new Set()
  };
}

function _setUpdated (aircraft) {
  aircraft.updated = Date.now();
  return aircraft;
}

/**
 *
 * @param aircraftArray array of aircraft from dump1090
 * @returns { hex: aircraft } hex mapped to aircraft object
 */
function _mapifyAircraftArray (aircraftArray = []) {
  return aircraftArray.reduce((acc, aircraft) => {
    acc[aircraft.hex] = aircraft;
    return acc;
  }, {});
}