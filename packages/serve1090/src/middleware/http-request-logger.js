const { v4: uuid } = require('uuid');

/**
 * Create a child logger of root for use within each individual request
 */
module.exports = (req, res, next) => {
  const start = Date.now();
  res.locals.requestLogger = req.app.locals.loggers.request.child({ requestId: uuid() });
  res.locals.requestLogger.info('request started', { url: req.originalUrl, method: req.method });
  res.once('finish', () => {
    const elapsedTime = Date.now() - start;
    res.locals.requestLogger.info('request finished', { elapsedTime });
  });
  next();
};
