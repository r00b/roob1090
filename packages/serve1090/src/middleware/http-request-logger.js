const logger = require("../lib/logger")().scope("request");
const { nanoid } = require("nanoid");

module.exports = (req, res, next) => {
  const start = Date.now();

  res.locals = {
    requestLogger: logger.child({ requestId: nanoid() }),
  };
  res.locals.requestLogger.info("request started", {
    url: req.originalUrl,
    method: req.method,
  });

  res.once("finish", () => {
    const elapsedTime = Date.now() - start;
    res.locals.requestLogger.info("request finished", { elapsedTime });
  });

  next();
};
