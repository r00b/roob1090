module.exports = {
  rightPad
};

function rightPad (str, len) {
  return str.padEnd(len, ' ');
}