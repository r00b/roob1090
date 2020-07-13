
// function _compute (aircraft, airspace, excludedAircraft) {
//
//   aircraft.forEach(a => {
//     if (a.flight.trim() === 'AAL1310') _logAircraft(a);
//   });
//
//   const aircraftInAirspace = _computeAircraftInAirspace(aircraft, airspace);
//   const validAircraft = aircraftInAirspace.filter(aircraft => {
//
//     // const heading = aircraft.track ? aircraft.track : aircraft.true_heading;
//     // const goodHeading = heading >= airspace.minHeading && heading <= airspace.maxHeading; // TODO heading violates as soon as leaves runway
//     const altitude = aircraft.alt_baro;
//     const goodAltitude = altitude <= airspace.maxAltitude;
//
//     // const excludeAircraft = turf.booleanPointInPolygon(turf.point([aircraft.lon, aircraft.lat]), turf.polygon(excludedAircraft.coordinates));
//
//     return goodAltitude;
//   });
//   console.log('\n--------------------');
//   console.log(airspace.name);
//   validAircraft.map(a => console.log(a.flight));
//   return validAircraft.map(a => a.flight);
// }
//
// function _computeAircraftInAirspace (aircraft, airspace) {
//   return aircraft.filter(aircraft => {
//     const aircraftCoordinates = [aircraft.lon, aircraft.lat];
//     return turf.booleanPointInPolygon(turf.point(aircraftCoordinates), turf.polygon(airspace.coordinates));
//   });
// }
//
// function getCompute () {
//   const landing = _compute(Object.values(this.currentValidAircraft), dca.approach());
//   const takeoff = _compute(Object.values(this.currentValidAircraft), dca.departure());
//   return {
//     landing,
//     takeoff
//   }
// }
