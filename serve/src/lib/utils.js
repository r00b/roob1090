module.exports = {
  rightPad,
  secondsToMillis,
  millisToSeconds,
  tryCatch
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

function tryCatch (tryFunc, catchFunc, finallyFunc = () => {
}) {
  try {
    return tryFunc();
  } catch (err) {
    catchFunc(err);
  } finally {
    finallyFunc();
  }
}