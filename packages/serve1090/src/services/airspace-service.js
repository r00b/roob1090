const { services: logger } = require('../lib/logger');
const store = require('../stores/aircraft-store');
const turf = require('@turf/turf');
const _ = require('lodash');

module.exports = {
  init
};

function init (...airspaces) {

  if (!this.initialized) {
    const dca = airspaces[0];
    const approach = dca.approach();
    const departure = dca.departure();
    this.airspaceMap = {
      approach: new Set(),
      depart: new Set(),
      runway: new Set()
    };
    setInterval(() => _searchAirspace.bind(this)(dca), 1000);
  } else {
    // shutdown();
    init();
    logger.info('airspace service re-initialized');
  }
  this.initialized = true;
  logger.info('initialize airspace service');
}

function _searchAirspace (airspace) {
  const validStore = store.getValidAircraft();
  const aircraft = _.get(validStore, 'aircraft', []);

  const arrivals = _reduceAircraft(aircraft, airspace.approach());
  const departures = _reduceAircraft(aircraft, airspace.departure());

  aircraft.filter(aircraft => {
    const aircraftCoordinates = [aircraft.lon, aircraft.lat]; // make sure these probs exist!
    const inRunway = turf.booleanPointInPolygon(turf.point(aircraftCoordinates), turf.polygon(airspace.runway().coordinates));
    if (!inRunway) return false;
    if (this.airspaceMap.approach.has(aircraft.flight)) {
      console.log('got from approach')
      arrivals.push(aircraft.flight);
    } else if (this.airspaceMap.depart.has(aircraft.flight)) {
      // nothing
    } else {
      departures.push(aircraft.flight);
    }
  });

  // todo altitude

  logger.info('landing dca', { arrivals });
  logger.info('departing dca', { departures });
}

function _reduceAircraft (aircraft, airspace) {
  return aircraft.reduce((acc, aircraft) => {
    const loc = turf.point([aircraft.lon, aircraft.lat]);
    const polygon = turf.polygon(airspace.coordinates);
    const inAirspace = turf.booleanPointInPolygon(loc, polygon);
    const validAltitude = aircraft.alt_baro < airspace.maxAltitude;
    if (inAirspace && validAltitude) {
      acc.push(aircraft);
    }
    return acc;
  }, []).map(a => a.flight);
}
















function _compute (aircraft, airspace, excludedAircraft) {

  aircraft.forEach(a => {
    if (a.flight.trim() === 'AAL1310') _logAircraft(a);
  });

  const aircraftInAirspace = _computeAircraftInAirspace(aircraft, airspace);
  const validAircraft = aircraftInAirspace.filter(aircraft => {

    // const heading = aircraft.track ? aircraft.track : aircraft.true_heading;
    // const goodHeading = heading >= airspace.minHeading && heading <= airspace.maxHeading; // TODO heading violates as soon as leaves runway
    const altitude = aircraft.alt_baro;
    const goodAltitude = altitude <= airspace.maxAltitude;

    // const excludeAircraft = turf.booleanPointInPolygon(turf.point([aircraft.lon, aircraft.lat]), turf.polygon(excludedAircraft.coordinates));

    return goodAltitude;
  });
  console.log('\n--------------------');
  console.log(airspace.name);
  validAircraft.map(a => console.log(a.flight));
  return validAircraft.map(a => a.flight);
}

function _computeAircraftInAirspace (aircraft, airspace) {
  return aircraft.filter(aircraft => {
    const aircraftCoordinates = [aircraft.lon, aircraft.lat];
    return turf.booleanPointInPolygon(turf.point(aircraftCoordinates), turf.polygon(airspace.coordinates));
  });
}

function getCompute () {
  const landing = _compute(Object.values(this.currentValidAircraft), dca.approach());
  const takeoff = _compute(Object.values(this.currentValidAircraft), dca.departure());
  return {
    landing,
    takeoff
  };
}


// const arrivals = aircraft.filter(aircraft => {
//   const aircraftCoordinates = [aircraft.lon, aircraft.lat]; // make sure these probs exist!
//   const match = turf.booleanPointInPolygon(turf.point(aircraftCoordinates), turf.polygon(airspace.approach().coordinates));
//   if (match) {
//     this.airspaceMap.approach.add(aircraft.flight);
//   }
//   return match;
// }).map(a => a.flight);
// const departures = aircraft.filter(aircraft => {
//   const aircraftCoordinates = [aircraft.lon, aircraft.lat]; // make sure these probs exist!
//   const match = turf.booleanPointInPolygon(turf.point(aircraftCoordinates), turf.polygon(airspace.departure().coordinates));
//   if (match) {
//     this.airspaceMap.depart.add(aircraft.flight);
//   }
//   return match;
// }).map(a => a.flight);