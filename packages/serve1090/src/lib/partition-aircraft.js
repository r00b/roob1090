const { point, polygon } = require('@turf/helpers');
const pointInPolygon = require('@turf/boolean-point-in-polygon').default;

module.exports = (redis, logger) => {
  const scopedLogger = logger.scope('partition-aircraft');
  return {
    partitionAircraftInRegion: partitionAircraftInRegion(scopedLogger),
    partitionAircraftInRunway: partitionAircraftInRunway(redis, scopedLogger),
    getAircraftInRegion
  };
};

/**
 * Return a function that intersects all of the given aircraft hashes with a specified
 * route and write them to the corresponding redis set
 */
function partitionAircraftInRegion (logger) {
  return (aircraftHashes, region) => {
    try {
      if (!aircraftHashes.length) {
        return [];
      }
      const boundary = polygon(region.boundary);
      return aircraftHashes.filter(inRegion(boundary, region.ceiling));
    } catch (e) {
      logger.error(`error partitioning aircraft in region ${region.key}`, e);
      throw e;
    }
  };
}

/**
 * Partition an array of aircraft known to be currently located in the runway region
 * into arrivals and departures
 */
function partitionAircraftInRunway (redis, logger) {
  return async (onRunway, parentKey) => {
    const res = {
      arrived: [],
      departing: []
    };
    if (!onRunway.length) {
      return res;
    }
    if (!parentKey) {
      throw new Error('no parentKey specified');
    }
    try {
      // get all aircraft that we know are arriving on the route
      const arrivalHexes = await redis.zmembers(`${parentKey}:arrivals`) || [];
      // for an aircraft to be on the runway and arriving, it must have previously
      // been in the approach route; if it is on the runway and departing, it will
      // not be in any route
      return onRunway.reduce((acc, aircraft) => {
        const hex = aircraft.hex;
        if (arrivalHexes.includes(hex)) {
          // aircraft was previously arriving or already arrived, so it must be inbound
          acc.arrived.push(aircraft);
        } else {
          // aircraft was previously in no region, so it must be outbound
          acc.departing.push(aircraft);
        }
        return acc;
      }, res);
    } catch (e) {
      logger.error(`error partitioning aircraft in runway for ${parentKey}`, e);
      throw e;
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