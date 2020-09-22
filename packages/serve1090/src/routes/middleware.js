const logger = require('../lib/logger')().scope('request');
const {
  AuthError,
  StaleDataError,
  PumpError,
  BroadcastError
} = require('../lib/errors');
const _ = require('lodash');
const safeCompare = require('safe-compare');

/**
 * Check a payload for a token; throw AuthError if the token
 * isn't present or doesn't match the specified key
 *
 * @param {string} key - string that the payload's token should match
 * @param payload - parsed payload object to check for valid token
 */
function checkToken (key, payload) {
  const token = _.get(payload, 'token', null);
  if (!token) {
    throw new AuthError('missing token', 401);
  }
  if (!safeCompare(key, token)) {
    throw new AuthError('bad token', 403);
  }
}

/**
 * Handle errors thrown at any point in a request
 */
function errorHandler (err, req, res, next) {
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
    logger.error('unhandled router error', e);
  }
}

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

/**
 * Close a WebSocket
 *
 * @param {WebSocket} ws
 */
function close (ws) {
  ws.close();
  setTimeout(() => {
    ws.terminate();
  }, 1000);
}

module.exports = {
  checkToken,
  errorHandler,
  close
};