const express = require('express');
const router = express.Router();
const store = require('./../services/flight-store');
const pumpId = process.env.SERVE1090_SECRET;

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
    const date = new Date(0);
    const loader = ['\\', '|', '/', '-'];
    let loaderIdx = 0;
    let statusString = '';
    ws.on('message', function (data) {
      try {
        const json = JSON.parse(data);
        if (pumpId === json.pumpId) {
          const dataAccepted = store.setNewData(json);
          if (dataAccepted) {
            // const millis = new Date(json.now * 1000);
            date.setUTCSeconds(json.now);
            statusString = `last set: ${date.toString()}; messages: ${json.messages}`;
          }
        }
        process.stdout.write(`\r${loader[loaderIdx++]} ${statusString}`);
        loaderIdx &= 3; // todo finally?
      } catch (e) {
        console.log(`\nERROR: Failed to parse dump JSON (${e})`);
      }
    });
  });

module.exports = router;
