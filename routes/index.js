const express = require('express');
const router = express.Router();
const flightData = require('./../services/flight-data');

router.get('/', function(req, res, next) {
  console.log('GET');
    res.json(flightData.rawData || "no data");
});

router.post('/', function (req, res, next) {
  const crap = req.body;
  res.json({
    status: 'success'
  });
  res.sendStatus(200);
});

router.ws('/test', function(ws, req) {
  ws.on('message', function(msg) {
    console.log('received data');
    console.log(msg);
    //flightData.rawData = JSON.parse(msg);
    ws.send(msg);
  });
});

module.exports = router;
