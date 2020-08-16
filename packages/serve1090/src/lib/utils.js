const { point } = require('@turf/helpers');
const distance = require('@turf/distance').default;

function rightPad (str, len) {
  return str.padEnd(len, ' ');
}

function secondsToMillis (seconds) {
  return seconds * 1000;
}

function millisToSeconds (millis) {
  return millis / 1000;
}

/**
 * Find the distance from aircraft a to extremity and aircraft b to extremity;
 * compare the distances to sort to ascending distance to extremity
 *
 * @param {aircraft} a
 * @param {aircraft} b
 * @param {number[]} extremity - extremity to compare a and b to
 * @returns {number} < 0 if a is closer than b, 0 if a is same distance as b, > 0 if a is farther than b
 */
function compareDistancesToExtremity (a, b, extremity) {
  const aDistance = computeDistance([a.lon, a.lat], extremity);
  const bDistance = computeDistance([b.lon, b.lat], extremity);
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
  return distance(point(a), point(b));
}

module.exports = {
  rightPad,
  secondsToMillis,
  millisToSeconds,
  compareDistancesToExtremity,
  computeDistance
};