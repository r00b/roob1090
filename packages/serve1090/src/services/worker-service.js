const logger = require('../lib/logger')().scope('worker-service');
const Bree = require('bree');
const path = require('path');

/**
 * Build jobs for each airport and schedule them
 * TODO: build jobs array from persistent storage or args
 */
function init () {
  const jobs = [
    {
      name: 'airport-board-worker',
      interval: '2s',
      airport: 'kdca'
    },
    {
      name: 'active-runway-worker',
      timeout: '5s', // give airport board a chance to create partitions
      interval: '1m',
      airport: 'kdca'
    },
    {
      name: 'enrichments-worker',
      timeout: '5s', // give airport board a chance to create partitions
      interval: '5s',
      airport: 'kdca'
    }
  ];

  const scheduler = new Bree({
    logger,
    root: path.join(__dirname, 'workers'),
    jobs
  });

  scheduler.start();

  const workerNames = [...new Set(jobs.map(j => j.name))];
  logger.info('started jobs', { count: jobs.length, jobs: workerNames });
}

module.exports = init;
