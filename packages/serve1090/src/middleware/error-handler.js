const { AuthError, PayloadError, BroadcastError } = require("../lib/errors");
const { close } = require("../lib/utils");

module.exports = (err, req, res, next) => {
  try {
    const { status, wsStatus, message, detail } = parseError(err);
    // send over both ws and HTTP
    if (req.ws) {
      req.ws.locals.socketLogger.error(message, { detail });
      // send regardless of readyState
      req.ws.send(
        JSON.stringify({
          message,
          detail,
        })
      );
      close(req.ws, wsStatus || 1011, `${message}: ${detail}`);
    } else {
      res.locals.requestLogger.error(message, { detail });
    }
    return res.status(status).json({
      message,
      detail,
    });
  } catch (e) {
    const logger = req.ws
      ? req.ws.local.socketLogger
      : res.locals.requestLogger;
    logger.error("unhandled router error", e);
  }
};

function parseError(err) {
  switch (err.constructor) {
    case AuthError:
      return {
        status: err.code,
        wsStatus: err.wsCode,
        message: "auth error",
        detail: err.message,
      };
    case PayloadError:
      return {
        status: err.code,
        wsStatus: err.wsCode,
        message: "malformed payload rejected",
        detail: err.message,
      };
    case BroadcastError:
      return {
        status: err.code,
        wsStatus: err.wsCode,
        message: "broadcast error",
        detail: err.message,
      };
    default:
      return {
        status: 500,
        wsStatus: 1011,
        message: "internal server error",
        detail: err.message,
      };
  }
}
