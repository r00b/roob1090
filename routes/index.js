const express = require('express');
const router = express.Router();
const flightData = require('./../services/flight-data');
const _ = require('lodash');

router.get('/', function (req, res, next) {
  console.log('GET');
  res.json(flightData.getRawData());
});

router.ws('/pump', function (ws, req) {
  ws.on('message', function (data) {
    try {
      const json = JSON.parse(data);
      const result = flightData.setNewData(json);
      console.log(`success: ${result}`);
    } catch (e) {
      console.log('fail');
    }
  });
});

module.exports = router;
