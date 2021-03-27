const { point, polygon } = require('@turf/helpers');
const pointInPolygon = require('@turf/boolean-point-in-polygon').default;
const REGION_TTL = 5; // seconds

module.exports = (redis, logger) => {
  const scopedLogger = logger.scope('partition-aircraft');
  return {
    getAndWriteAircraftInRegion: getAndWriteAircraftInRegion(redis, scopedLogger),
    getAircraftInRegion
  };
};

function getAndWriteAircraftInRegion (redis, logger) {
  return async (aircraftHashes, region) => {
    try {
      const aircraftInRegion = getAircraftInRegion(aircraftHashes, region);
      await redis.saddEx(`${region.key}:aircraft`, REGION_TTL, ...aircraftInRegion.map(ac => ac.hex)); // todo lodash alternative?
      return aircraftInRegion;
    } catch (e) {
      logger.error(`error computing and writing aircraft in region ${region.key}`, e);
    }
  };
}

function getAircraftInRegion (aircraftHashes, region) {
  const boundary = polygon(region.boundary);
  return aircraftHashes.filter(geofence(boundary, region.ceiling));
}

function geofence (boundary, ceiling) {
  return aircraft => {
    const loc = point([aircraft.lon, aircraft.lat]);
    const inRegion = pointInPolygon(loc, boundary);
    const belowCeiling = aircraft.alt_baro <= ceiling;
    return inRegion && belowCeiling;
  };
}