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
    const partition = _filterAircraft(data.aircraft);
    this.includedAircraft = partition.included;
    this.excludedAircraft = partition.excluded;
    return true;
  }
  return false;
}

function _filterAircraft (aircraft = []) {
  let includedAircraft = [];
  let excludedAircraft = [];
  if (aircraft.length) {
    includedAircraft = _.filter(aircraft, _isValidFlight);
    // use anti intersection
    excludedAircraft = _.difference(aircraft, includedAircraft);
  }
  return {
    included: includedAircraft,
    excluded: excludedAircraft
  }
}

function _isValidFlight (flight) {
  const requiredProps = ['lat', 'lon', 'seen', 'flight'];
  const hasRequiredProps = _.every(requiredProps, Object.hasOwnProperty.bind(flight));
  const isRecent = flight.seen < FLIGHT_TIMEOUT;
  if (!(hasRequiredProps && isRecent)) {
    if (!isRecent) {
      console.log('not recent')
    } else {
      console.log('missing props')
    }
  }
  return hasRequiredProps && isRecent;
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