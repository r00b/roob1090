const logger = require('../lib/logger')('worker-service');
const Bree = require('bree');
const path = require('path');

/**
 * Build jobs for each airport and airspace; kick off the scheduler
 *
 * @param mongo
 */
async function init(mongo) {
  const airportJobs = await generateAirportJobs(mongo);
  const airspaceJobs = await generateAirspaceJobs(mongo);
  const jobs = [...airportJobs, ...airspaceJobs];

  const scheduler = new Bree({
    logger,
    root: path.join(__dirname, 'workers'),
    jobs,
  });

  scheduler.start();

  const workerNames = [...new Set(jobs.map(j => j.name))];
  logger.info({ count: jobs.length, jobs: workerNames }, 'started jobs');
}

async function generateAirportJobs(mongo) {
  const icaos = await mongo.getAllActiveAirportIdents();
  return icaos.flatMap(airport => [
    {
      name: 'partition-airport-worker',
      interval: '3s',
      airport,
    },
    {
      name: 'airport-board-worker',
      interval: '3s',
      airport,
    },
    {
      name: 'enrichments-worker',
      timeout: '5s', // wait for partitions to be created
      interval: '5s',
      airport,
    },
  ]);
}

function generateAirspaceJobs(mongo) {
  return [];
}

module.exports = init;
