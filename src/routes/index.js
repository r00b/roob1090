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
    const loader = ['\\', '|', '/', '-'];
    let loaderIdx = 0;
    let statusString = '';
    ws.on('message', function (data) {
      try {
        const json = JSON.parse(data);
        if (pumpId === json.secret) {
          const dataAccepted = store.setNewData(json);
        		if (dataAccepted) {
												const date = new Date(json.now * 1000);
						      statusString = `last set: ${date.toString()} (${json.now}); messages: ${json.messages}`;
          }
        } else {
	    console.log(`bad secret!: |${json.secret}|ours:|${pumpId}|`); // TODO better handling of this
	}
        process.stdout.write(`\r${loader[loaderIdx++]} ${statusString}`);
        loaderIdx &= 3; // todo finally?
      } catch (e) {
        console.log(`\nERROR: Failed to parse dump JSON (${e})`);
      }
    });
  });

module.exports = router;
