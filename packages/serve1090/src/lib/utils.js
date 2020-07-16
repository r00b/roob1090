module.exports = {
  rightPad,
  secondsToMillis,
  millisToSeconds
};

function rightPad (str, len) {
  return str.padEnd(len, ' ');
}

function secondsToMillis (seconds) {
  return seconds * 1000;
}

function millisToSeconds (millis) {
  return millis / 1000;
}
