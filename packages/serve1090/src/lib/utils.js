const _ = require('lodash');
const { point } = require('@turf/helpers');
const fs = require('fs');
const path = require('path');
const got = require('got');
const distance = require('@turf/distance').default;

function secondsToMillis (seconds) {
  return seconds * 1000;
}

function millisToSeconds (millis) {
  return millis / 1000;
}

/**
 * Retrieve an aircraft's hex
 *
 * @param {aircraft} aircraft
 * @returns {string} hex
 */
function hex (aircraft) {
  return _.get(aircraft, 'hex', undefined);
}

/**
 * Construct a string representing time in a readable string,
 * i.e. 1293847 -> 14 days, 23 hours, 24 mins, 7 secs
 *
 * @param {number} s - seconds
 * @returns {string} time string
 */
function secondsToTimeString (s) {
  if (s < 0) {
    throw new Error('cannot convert negative seconds to time string');
  }
  let seconds = parseInt(s, 10);
  const days = Math.floor(seconds / (3600 * 24));
  seconds -= days * 3600 * 24;
  const hours = Math.floor(seconds / 3600);
  seconds -= hours * 3600;
  const minutes = Math.floor(seconds / 60);
  seconds -= minutes * 60;
  return `${days} days, ${hours} hours, ${minutes} mins, ${seconds} secs`;
}

/**
 * Find the distance from aircraft a to extremity and aircraft b to extremity;
 * compare the distances to sort in ascending distance to extremity
 *
 * @param {aircraft} a
 * @param {aircraft} b
 * @param {number[]} locus - locus to compare a and b to
 * @returns {number} < 0 if a is closer than b, 0 if a is same distance as b, > 0 if a is farther than b
 */
function compareDistance (a, b, locus) {
  const aDistance = computeDistance([a.lon, a.lat], locus);
  const bDistance = computeDistance([b.lon, b.lat], locus);
  return aDistance - bDistance; // sort to ascending distance
}

/**
 * Compute distance in km between two lon/lat pairs
 *
 * @param {number[]} a - first lon/lat pair
 * @param {number[]} b - second lon/lat pair
 * @returns {number} distance between a and b in kilometers
 */
function computeDistance (a, b) {
  const res = distance(point(a), point(b));
  if (_.isNaN(res)) {
    return undefined;
  }
  return res;
}

/**
 * Make an HTTP GET request on url using basic auth if username and password
 * are specified
 *
 * @param {string} url - request URL
 * @param {string?} username
 * @param {string?} password
 * @returns {Promise}
 */
function get (url, username, password) {
  const options = {
    responseType: 'json'
  };
  if (username) options.username = username;
  if (password) options.password = password;
  return got(url, options);
}

/**
 * Strip the extension from a filename string
 *
 * @param {string} filename
 * @returns {string}
 */
function stripFileExtension (filename) {
  return filename.replace(/\.[^.]+$/, '');
}

/**
 * Get a list of filenames in a directory
 *
 * @param {string} relativePathToDir - relative path to directory
 * @returns {string[]} filenames
 */
function getFileNames (relativePathToDir) {
  return fs.readdirSync(path.resolve(__dirname, relativePathToDir)).map(stripFileExtension);
}

/**
 * Exit and flush stdout for logging
 *
 * @param {integer} code - exit code
 */
function exit (code) {
  // flush console
  process.stdout.write('', () => {
    process.exit(code);
  });
}

module.exports = {
  secondsToMillis,
  millisToSeconds,
  hex,
  secondsToTimeString,
  compareDistance,
  computeDistance,
  get,
  getFileNames,
  exit
};