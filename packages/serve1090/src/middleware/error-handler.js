const {
  AuthError,
  StaleDataError,
  PumpError,
  BroadcastError
} = require('../lib/errors');

/**
 * Handle errors thrown at any point in a request
 */
module.exports = (err, req, res, next) => {
  try {
    const { status, message, detail } = parseError(err);
    // send over both ws and HTTP
    if (req.ws) {
      req.ws.locals.socketLogger.error(message, { detail });
      // test to make sure it's open
      req.ws.send(JSON.stringify({
        status,
        message,
        detail
      }));
      close(req.ws);
    } else {
      res.locals.requestLogger.error(message, { detail });
    }
    return res.status(status).json({
      message,
      detail
    });
  } catch (e) {
    const logger = req.ws ? req.ws.local.socketLogger : res.locals.requestLogger;
    logger.error('unhandled router error', e);
  }
};

function parseError (err) {
  switch (err.constructor) {
    case AuthError:
      return {
        status: err.code,
        message: 'auth error',
        detail: err.message
      };
    case StaleDataError:
      return {
        status: 400,
        message: 'rejected: stale payload',
        detail: err.message
      };
    case PumpError:
      return {
        status: 400,
        message: 'rejected: malformed payload',
        detail: err.message
      };
    case BroadcastError:
      return {
        status: 500,
        message: 'broadcast error',
        detail: err.message
      };
    default:
      return {
        status: 500,
        message: 'internal server error',
        detail: err.message
      };
  }
}
