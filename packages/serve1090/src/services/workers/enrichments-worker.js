const _ = require('lodash');
const logger = require('../../lib/logger')().scope('enrichments-worker');
const config = require('../../config');
const { exit } = require('../../lib/utils');
const airportKey = require('worker_threads').workerData.job.airport;
const enrichments = require('../../lib/enrichments');

const RedisService = require('../redis-service');
const redis = new RedisService();

const {
  fetchRoute,
  fetchAirframe
} = enrichments(config, redis, logger);

(async () => {
  try {
    const start = Date.now();
    const board = await redis.getAsJson(`${airportKey}:board`);

    if (board) {
      await computeAndStoreEnrichments(board);
    } else {
      logger.warn('unable to find board with which to compute enrichments', { airport: airportKey });
    }

    logger.info('enrichments worker completed', { airport: airportKey, duration: Date.now() - start });
    exit(0);
  } catch (e) {
    logger.error(e.message, e);
    exit(1);
  }
})();

/**
 * Compute enrichments for each aircraft in an airport's board if not already
 * computed and cached in redis
 *
 * @param {object} board - airport board generated by airport-board
 * @returns {Promise<void>}
 */
async function computeAndStoreEnrichments (board) {
  const aircraftHashes = getAircraftHashes(board);
  for (const aircraft of aircraftHashes) {
    const hasEnrichment = await redis.hgetAsJson('enrichments', aircraft.hex);
    if (!hasEnrichment) {
      const enrichPromises = await Promise.allSettled([
        fetchAirframe(aircraft),
        fetchRoute(aircraft, airportKey)
      ]);
      const enrichments = resolveAndMerge(enrichPromises);
      // TODO: store airframe separately from route in persistent storage
      if (!_.isEmpty(enrichments)) {
        await redis.hsetJsonEx(
          'enrichments',
          aircraft.hex,
          enrichments,
          900 // 15 min
        );
      }
    }
  }
}

/**
 * Get a unique array of aircraft in an airport board; ignore board.arrived and
 * board.departing since they are included in board.onRunway
 *
 * @param {object} board - airport board
 * @returns {aircraft[]}
 */
function getAircraftHashes (board) {
  return [...board.arriving, ...board.onRunway, ...board.departed];
}

/**
 * Resolve an array of pending enrichment promises and return a merged
 * hash of their values; ignore failed promises
 *
 * @param {Promise[]} promises - generated by Promise.all
 * @returns {object} - merged enrichments
 */
function resolveAndMerge (promises) {
  const fulfilled = promises.filter(p => p.status = 'fulfilled');
  return _.merge(...fulfilled.map(p => p.value));
}
