const express = require('express');
const pumpId = process.env.SERVE1090_SECRET; // TODO this shouldn't be here
const {
  router: logger
} = require('./../../lib/logger');

module.exports = (store) => {
  return new express.Router()
    .ws('/pump', function (ws, req, next) {
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
    })
    .get('/raw', getRaw(store))
    .get('/valid', getValid(store))
    .get('/excluded', getExcluded(store))
    .use(errorHandler);
};

function getRaw (store) {
  return (req, res, next) => {
    logger.router({
      message: 'get raw aircraft',
      verb: 'GET',
      status: 200
    });
    return res.status(200).json(store.getRawAircraft());
  }
}

function getValid (store) {
  return (req, res, next) => {
    logger.router({
      message: 'get valid aircraft',
      verb: 'GET',
      status: 200
    });
    return res.status(200).json(store.getValidAircraft());
  }
}

function getExcluded (store) {
  return (req, res, next) => {
    logger.router({
      message: 'get excluded aircraft',
      verb: 'GET',
      status: 200
    });
    return res.status(200).json(store.getExcludedAircraft());
  }
}

// /**
//  * Handle errors thrown at any point in the request
//  */
// function errorHandler (err, req, res, next) {
//   switch (err.constructor) {
//     case ValidationError:
//       return res.status(422).json({
//         error: {
//           title: 'Bad request',
//           detail: `Attribute violation: ${err.message.replace(/"/g, '\'')}`
//         },
//         status: 422
//       });
//     case SyntaxError:
//       return res.status(400).json({
//         error: {
//           title: 'Bad request',
//           detail: 'The JSON payload was malformed'
//         },
//         status: 400
//       });
//     case RecordNotFoundError:
//       return res.status(404).json({
//         error: {
//           title: 'Domain record not found',
//           detail: err.message
//         },
//         status: 404
//       });
//     case RecordAlreadyExistsError:
//       return res.status(500).json({
//         error: {
//           title: 'Domain record already exists',
//           detail: err.message
//         },
//         status: 500
//       });
//     default:
//       return res.status(500).json({
//         error: {
//           title: 'Internal server error',
//           detail: err.message
//         },
//         status: 500
//       });
//   }
// }
