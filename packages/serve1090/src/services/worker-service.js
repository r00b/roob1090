const logger = require('../lib/logger')().scope('worker service');
const config = require('../config');
const path = require('path');
const fs = require('fs');
const Bree = require('bree');

const AIRSPACES_PATH = '../lib/airspaces';
const AIRPORTS_PATH = `${AIRSPACES_PATH}/airports`;

function init () {
  const airspaceWorkers = generateAirspaceWorkers(AIRSPACES_PATH);
  const airportWorkers = generateAirportWorkers(AIRPORTS_PATH);

  const config = getWorkerConfig(...airportWorkers, ...airspaceWorkers);
  const jobs = new Bree(config);
  jobs.start();

  const workerNames = [...new Set(config.jobs.map(j => j.name))];
  logger.info('start jobs', { numJobs: config.jobs.length, jobs: workerNames });
}

function generateAirportWorkers (airportDir) {
  const modules = fs.readdirSync(path.resolve(__dirname, airportDir));
  return modules
    .reduce((acc, file) => {
      const airportConfig = file.replace(/\.js/, '');
      const airspacePath = `${airportDir}/${airportConfig}`;
      // each airport module needs three jobs/workers:
      acc.push(
        // the first (airport) reduces the valid aircraft store to those aircraft contained
        // within the regions defined in the config
        {
          name: 'airport',
          interval: '1s',
          airspacePath
        },
        // the second (runway) picks sample aircraft from the results of the airport job
        // to determine which runway is active
        {
          name: 'runway',
          timeout: '5s',
          interval: '1m',
          airspacePath
        }
      );
      // check for OpenSky/FlightXML2 keys and add enrich worker if they exist
      const {
        openSkyUsername,
        openSkyPassword,
        faUsername,
        faPassword
      } = config;
      // TODO: only require one pair of creds at minimum
      if (openSkyUsername && openSkyPassword && faUsername && faPassword) {
        acc.push({
          name: 'enrich',
          interval: '5s',
          airspacePath,
          credentials: {
            openSkyUsername,
            openSkyPassword,
            faUsername,
            faPassword
          }
        });
      }
      return acc;
    }, []);
}

function generateAirspaceWorkers (airspaceDir) {
  const modules = fs.readdirSync(path.resolve(__dirname, airspaceDir));
  return modules
    .filter(file => file.match(/.*\.js$/)) // don't generate workers for directories
    .map(file => {
      const airspaceConfig = file.replace(/\.js/, '');
      return {
        name: 'airspace', // TODO write the worker
        interval: '1s',
        modulePath: `${airspaceDir}/${airspaceConfig}`
      };
    });
}

function getWorkerConfig (...jobs) {
  return {
    logger: logger.scope('worker meta'),
    root: path.join(__dirname, 'workers'),
    jobs
  };
}

module.exports = init;