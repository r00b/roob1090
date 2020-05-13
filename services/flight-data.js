const _ = require('lodash');

module.exports = {
  setNewData,
  getRawData
};

function setNewData (data) {
  const currTimestamp = _.get(this.getRawData(), 'now');
  const newTimestamp = data.now;
  if (newTimestamp > currTimestamp) {
    this.rawData = data;
    return true;
  }
  return false;
}

function getRawData () {
  return this.rawData || {
    now: -1,
    aircraft: []
  };
}