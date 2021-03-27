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

/**
 * Return a function that intersects all of the given aircraft hashes with a specified
 * route and write them to the corresponding redis set
 */
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

/**
 * Intersect all of the given aircraft hashes with a specified route
 */
function getAircraftInRegion (aircraftHashes, region) {
  const boundary = polygon(region.boundary);
  return aircraftHashes.filter(inRegion(boundary, region.ceiling));
}

/**
 * Determine if an aircraft is contained within a region by geofencing it to
 * the region's lateral boundaries and ceiling
 */
function inRegion (boundary, ceiling) {
  return aircraft => {
    const loc = point([aircraft.lon, aircraft.lat]);
    const inRegion = pointInPolygon(loc, boundary);
    const belowCeiling = aircraft.alt_baro <= ceiling;
    return inRegion && belowCeiling;
  };
}