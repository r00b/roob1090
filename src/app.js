require('dotenv').config();
const express = require('express');
const app = express();
require('express-ws')(app);
const aircraftRouter = require('./routes/aircraft/index.js');
const dca = require('./airspaces/airports/dca');

// const createError = require('http-errors');
// const path = require('path');
// const cookieParser = require('cookie-parser');
// const logger = require('morgan');

// app.use(logger('dev'));
// app.use(cookieParser());
// app.use(express.static(path.join(__dirname, 'public')));

// // catch 404 and forward to error handler
// app.use(function(req, res, next) {
//   next(createError(404));
// });
//
// // error handler
// app.use(function(err, req, res, next) {
//   // set locals, only providing error in development
//   res.locals.message = err.message;
//   res.locals.error = req.app.get('env') === 'development' ? err : {};
//
//   res.status(err.status || 500);
// });

function normalizePort (val) {
  const port = parseInt(val, 10);
  if (isNaN(port)) {
    // named pipe
    return val;
  }
  if (port >= 0) {
    // port number
    return port;
  }
  return false;
}

async function startServer (store, logger) {
  store.init(dca);
  // routers
  app.use('/aircraft', aircraftRouter(store));

  app.locals = {
    logger
  };

  const port = normalizePort(process.env.PORT) || 5432;

  return app.listen(port, err => {
    if (err) {
      console.error(`Could not start serve1090: ${err}.`);
      process.exit(1);
    }
    console.log(`Started serve1090 on port ${port}.`);
  });
}

module.exports = startServer;
