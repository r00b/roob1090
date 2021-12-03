const _ = require('lodash');
const got = require('got');
const { point, polygon } = require('@turf/helpers');
const pointInPolygon = require('@turf/boolean-point-in-polygon').default;
const distance = require('@turf/distance').default;
const safeCompare = require('safe-compare');
const { AuthError } = require('./errors');

/**
 * Take an input and resolve it to a port or a fallback if unable
 *
 * @param port {any}
 * @returns {number} - valid port to start server on
 */
function normalizePort(port) {
  const fallback = 3000;
  try {
    const normalizedPort = parseInt(port);
    const floatTest = parseFloat(port);
    if (!Number.isSafeInteger(floatTest) || normalizedPort < 0) {
      return fallback;
    }
    return normalizedPort;
  } catch (_) {
    return fallback;
  }
}

/**
 * @param seconds {number}
 * @returns {number}
 */
function secondsToMillis(seconds) {
  return seconds * 1000;
}

/**
 * @param millis {number}
 * @returns {number}
 */
function millisToSeconds(millis) {
  return millis / 1000;
}

/**
 * Get an aircraft's hex
 *
 * @param {aircraft} aircraft
 * @returns {string} hex
 */
function hex(aircraft) {
  return _.get(aircraft, 'hex', undefined);
}

/**
 * Get a region's key
 *
 * @param {region} region
 * @returns {string} key
 */
function key(region) {
  return _.get(region, 'key', undefined);
}

/**
 * Construct a string representing time in a readable string,
 * i.e. 1293847 -> 14 days, 23 hours, 24 mins, 7 secs
 *
 * @param {number} s - seconds
 * @returns {string} time string
 */
function secondsToTimeString(s) {
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
function compareDistance(a, b, locus) {
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
function computeDistance(a, b) {
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
function get(url, username, password) {
  const options = {
    responseType: 'json',
  };
  if (username) options.username = username;
  if (password) options.password = password;
  return got(url, options);
}

/**
 * Exit and flush and pending logs or messages to stdout
 *
 * @param {number} code - exit code
 */
function exit(code) {
  // flush console
  process.stdout.write('', () => {
    process.exit(code);
  });
}

/**
 * Check a payload for a token; throw AuthError if the token
 * isn't present or doesn't match the specified key
 *
 * @param {string} key - string that the payload's token should match
 * @param {object} payload - parsed payload object to check for valid token
 */
function checkToken(key, payload) {
  const token = _.get(payload, 'token', null);
  if (!token) {
    throw new AuthError('missing token', 401);
  }
  if (!safeCompare(key, token)) {
    throw new AuthError('bad token', 403);
  }
}

/**
 * Close a WebSocket, terminating it after 1000 ms
 *
 * @param {WebSocket} ws
 * @param {number?} code - CloseEvent code (see https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent)
 * @param {string?} reason - CloseEvent reason
 * @param {number?} terminateAfter - how long to wait before forcing the WebSocket closed
 */
function close(ws, code, reason, terminateAfter = 1000) {
  ws.close(code || 1000, reason);
  if (ws.terminate) {
    setTimeout(() => {
      ws.terminate();
    }, terminateAfter);
  }
}

/**
 * Determine if an aircraft is contained within a region by geofencing it to
 * the region's lateral boundaries and ceiling
 *
 * @param boundary {number[][]} - array of lonlat points
 * @param ceiling {number} - maximum allowable altBaro for an aircraft to be
 *                           considered within a region
 */
function withinBoundaryAndCeiling(boundary, ceiling) {
  const boundaryPolygon = polygon([boundary]);
  return aircraft => {
    const loc = point([aircraft.lon, aircraft.lat]);
    const inRegion = pointInPolygon(loc, boundaryPolygon);
    const atOrBelowCeiling = aircraft.altBaro <= ceiling;
    return inRegion && atOrBelowCeiling;
  };
}

const CENTERLINE_OFFSET = 30;

/**
 * @param x {number} i.e. track
 * @param y {number} i.e. runway centerline
 * @returns {boolean} true if x is within CENTERLINE_OFFSET of y inclusive, false otherwise
 */
function aligned(x, y) {
  const angleDiff = ((x - y + 180 + 360) % 360) - 180;
  return angleDiff <= CENTERLINE_OFFSET && angleDiff >= -CENTERLINE_OFFSET;
}

module.exports = {
  normalizePort,
  secondsToMillis,
  millisToSeconds,
  hex,
  key,
  secondsToTimeString,
  compareDistance,
  computeDistance,
  get,
  exit,
  checkToken,
  close,
  withinBoundaryAndCeiling,
  aligned,
};
