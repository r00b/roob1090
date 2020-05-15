const express = require('express');
const router = express.Router();
const store = require('./../services/flight-store');
const _ = require('lodash');

router
  .get('/raw', function (req, res, next) {
    res.json(store.getRawData());
  })
  .get('/real', function (req, res, next) {
    res.json(store.getRealAircraft());
  })
  .get('/fake', function (req, res, next) {
    res.json(store.getFakeAircraft());
  })
  .get('/taxi', function (req, res, next) {
    res.json(store.getTaxiingAircraft());
  })
  .ws('/pump', function (ws, req) {
    ws.on('message', function (data) {
      try {
        const json = JSON.parse(data);
        const result = store.setNewData(json);
        console.log(`success: ${result}`);
      } catch (e) {
        console.log('fail ' + e);
      }
    });
  });

module.exports = router;
