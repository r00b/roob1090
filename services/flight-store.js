const _ = require('lodash');
const FLIGHT_TIMEOUT = 20;

module.exports = {
  setNewData,
  getRawData,
  getRealAircraft,
  getFakeAircraft,
  getTaxiingAircraft,
};

// CREATE

/**
 * Accept new data from source; ensure it is not stale
 */
function setNewData (data) {
  const currTimestamp = _.get(this.getRawData(), 'now');
  const newTimestamp = data.now;
  if (newTimestamp > currTimestamp) {
    this.rawData = data;
    const partition = this._filterAndSetAircraft(data);
    this.includedAircraft = partition.included;
    this.excludedAircraft = partition.excluded;
    return true;
  }
  return false;
}

function _filterAndSetAircraft (data) {
  const aircraft = data.aircraft || [];
  let includedAircraft = [];
  let excludedAircraft = [];
  if (aircraft.length) {
    includedAircraft = _.filter(aircraft, _isValidFlight);
    excludedAircraft = _.reject(aircraft, _isValidFlight)
  }
  return {
    included: includedAircraft,
    excluded: excludedAircraft
  }
}

function _isValidFlight (flight) {
  const hasPosition = flight.lat && flight.long;
  const hasIdent = flight.flight;
  const isRecent = flight.seen < FLIGHT_TIMEOUT;
  return hasPosition && hasIdent && isRecent;
}

// RETRIEVE

/**
 * Return the most up-to-date, raw JSON that is currently in the store
 */
function getRawData () {
  return this.rawData || {
    now: -1,
    aircraft: []
  };
}

function getRealAircraft () {
  return this.includedAircraft || [];
}

function getFakeAircraft () {
  return this.excludedAircraft || [];
}

function getTaxiingAircraft () {
  return [];
}