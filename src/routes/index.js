const express = require('express');
const pumpId = process.env.SERVE1090_SECRET; // TODO this shouldn't be here
const logger = require('./../../lib/logger');

// TODO mount this at aircraft/

module.exports = store => {
  return new express.Router()
    .get('/raw', function (req, res, next) {
      res.json(store.getRawAircraft());
    })
    .get('/current', function (req, res, next) {
      res.json(store.getCurrentAircraft());
    })
    .get('/excluded', function (req, res, next) {
      res.json(store.getExcludedAircraft());
    })
    // .get('/compute', function (req, res, next) {
    //   res.json(store.getCompute());
    // })
    .ws('/pump', function (ws, req) { // TODO middleware
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
          // process.stdout.write(`\r${loader[loaderIdx++]} ${statusString}`);
          loaderIdx &= 3; // todo finally?
        } catch (e) {
          debugger;
          console.log(`\nERROR: Failed to parse dump JSON (${e})`);
        }
      });
    });
};
