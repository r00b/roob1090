const logger = require('../lib/logger').get('worker');
const _ = require('lodash');
const path = require('path');
const fs = require('fs');
const Bree = require('bree');

const AIRSPACES_PATH = '../lib/airspaces';
const AIRPORTS_PATH = `${AIRSPACES_PATH}/airports`;

function init () {
  const airspaceWorkers = getWorkers(AIRSPACES_PATH, 'airspace');
  const airportWorkers = getWorkers(AIRPORTS_PATH, 'airport');
  const config = getWorkerConfig(...airspaceWorkers, ...airportWorkers);
  const jobs = new Bree(config);
  jobs.start();
}

function getWorkers (configDir, workerName, interval = '1s') {
  const modules = fs.readdirSync(path.resolve(__dirname, configDir));
  return modules
    .filter(file => file.match(/.*\.js$/))
    .map(file => {
      const module = file.replace(/\.js/, '');
      return {
        name: workerName,
        interval,
        modulePath: `${configDir}/${module}`
      };
    });
}

function getWorkerConfig (...jobs) {
  return {
    logger: _.assign(_.create(logger), {
      error (message, err) {
        const detail = err ? { detail: err.err.message } : undefined;
        logger.error(message, detail);
      }
    }),
    root: path.join(__dirname, 'workers'),
    jobs
  };
}

module.exports = init;