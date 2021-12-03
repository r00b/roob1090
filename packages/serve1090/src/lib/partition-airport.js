const _ = require('lodash');
const pMap = require('p-map');
const { hex, withinBoundaryAndCeiling, aligned } = require('./utils');

const { REGION_AIRCRAFT, ACTIVE_RUNWAY } = require('../lib/redis-keys');

const REGION_TTL = 2;
const RUNWAY_TTL = 28800; // 8 hours
const RUNWAY_RECHECK = 900; // 15 minutes

module.exports = (store, redis, mongo, logger) =>
  partitionAirport(store, redis, mongo, logger.scope('partition-aircraft'));

/**
 * Return a function that will fetch all aircraft currently in the store along with a specified
 * airport and then partition the aircraft into the airport's runways and airspace regions
 *
 * @param store
 * @param redis
 * @param mongo
 * @param logger
 * @returns {(ident: string) => Promise<partition>}
 */
function partitionAirport(store, redis, mongo, logger) {
  return async (ident) => {
    try {
      const airport = await mongo.getAirport(ident);
      if (!airport) {
        logger.error('failed to fetch airport json', { airport: ident });
        return;
      }

      const { aircraft: allAircraft } = await store.getValidAircraft();

      const aircraftAloft = airport.airspace.reduce((acc, region) => {
        const aircraft = aircraftInRegion(allAircraft, region);
        if (aircraft.length) {
          acc[region.key] = aircraft;
        }
        return acc;
      }, {});

      const acc = {
        aircraft: {
          ...aircraftAloft,
        },
        activeRunways: [],
      };

      const partition = airport.runways.reduce(
        runwayReducer(allAircraft, _.flatten(_.values(aircraftAloft))),
        acc
      );
      await writePartition(partition, redis, logger);

      return partition;
    } catch (e) {
      logger.error('failed to partition airport', { error: e });
    }
  };
}

/**
 * Filter out aircraft currently located in a given airspace region
 *
 * @param aircraft {aircraft[]}
 * @param region {object} - contains both a boundary and ceiling prop
 * @returns {aircraft[]}
 */
function aircraftInRegion(aircraft, region) {
  if (!aircraft.length) {
    return [];
  }
  const { boundary, ceiling } = region;
  return aircraft.filter(withinBoundaryAndCeiling(boundary, ceiling));
}

/**
 * Returns a reducer for adding aircraft currently on a runway and the current
 * active runway surfaces to an aircraft partition
 *
 * @param aircraft {aircraft[]} - all valid aircraft from the aircraft store
 * @param aircraftAloft {aircraft[]} - aircraft currently in the an airspace region but not on a runway
 * @returns (acc, runway) => partition
 */
function runwayReducer(aircraft, aircraftAloft) {
  /**
   * @param acc {partition} - { aircraft: {}, activeRunways: [] }
   * @param runway {region} - runway region
   */
  return (acc, runway) => {
    const computeActiveRunway = (samples) => {
      for (const sample of samples) {
        const activeSurface = runway.surfaces.reduce(
          pickBestSurface(sample),
          null
        );
        if (activeSurface) {
          acc.activeRunways.push({
            runway: runway.key,
            surface: activeSurface.name,
            sample,
          });
          // no need to check the rest of the samples
          return;
        }
      }
    };

    const aircraftOnRunway = aircraftInRegion(aircraft, runway);
    if (aircraftOnRunway.length) {
      // store the aircraft on the runway and use it to determine the currently
      // active surface
      acc.aircraft[runway.key] = aircraftOnRunway;
      computeActiveRunway(aircraftOnRunway);
    } else {
      // attempt to use aircraft aloft to determine the active surface
      computeActiveRunway(aircraft);
    }

    return acc;
  };
}

/**
 * Returns a reducer that:
 *  1. Compares a given runway surface to the current best guess for the current
 *     active surface
 *  2. Returns the given runway if its centerline is aligned with the given
 *     sample track
 *  3. Returns the current best surface if not
 *  4. Returns the runway with the closer-aligned centerline if both runways
 *     are aligned with the sample track
 *
 * If no given surface is ever aligned with the sample, null will be returned.
 *
 * @param sample {aircraft} - sample aircraft, with true track over ground
 */
function pickBestSurface(sample) {
  const { track } = sample;

  /**
   * @param best {surface} - the current best surface
   * @param given {surface} - the next surface to check
   */
  return (best, given) => {
    const centerline = given.trueHeading;
    if (aligned(track, centerline)) {
      // if there is already another runway with an aligned centerline,
      // pick the one closest to the sample track
      if (best) {
        const bestDiff = Math.abs(best.trueHeading - track);
        const givenDiff = Math.abs(centerline - track);
        return givenDiff < bestDiff ? given : best;
      }
      return given;
    }
    // given runway is not better than the current best guess,
    // so just return the current best guess
    return best;
  };
}

/**
 * @param partition {object} - computed by partitionAirport
 * @param redis
 * @param logger
 */
async function writePartition(partition, redis, logger) {
  try {
    const pipeline = redis.pipeline();

    // first, write each region's aircraft
    Object.entries(partition.aircraft).forEach(([regionKey, aircraft]) => {
      pipeline.saddEx(
        REGION_AIRCRAFT(regionKey),
        REGION_TTL,
        ...aircraft.map(hex)
      );
    });

    // then, write the active runways
    await pMap(partition.activeRunways, async ({ runway, surface, sample }) => {
      const ttl = await redis.ttl(ACTIVE_RUNWAY(runway));
      // only rewrite the runway every RUNWAY_RECHECK seconds to save
      if (RUNWAY_TTL - ttl > RUNWAY_RECHECK) {
        pipeline.setex(ACTIVE_RUNWAY(runway), RUNWAY_TTL, surface);
        logger.info('set active runway', {
          runway: runway,
          activeSurface: surface,
          sample: `${_.trim(sample.flight)} / ${sample.hex}`,
        });
      }
    });

    await pipeline.exec();
  } catch (e) {
    logger.error('failed to write airport partition to redis', { error: e });
  }
}
