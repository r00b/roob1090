const winston = require('winston');
const { LoggerError } = require('../lib/errors');
require('winston-daily-rotate-file');
const { combine, timestamp, json, printf, colorize } = winston.format;
const { rightPad } = require('../lib/utils');

/**
 * Build a console transport with colorized formatting
 *
 * @param colors object defining colors for each level
 * @returns console transport
 */
function consoleTransport (colors) {
  return new winston.transports.Console({
    format: printf(log => {
      winston.addColors(colors);
      const { level, message, service, ...props } = log;
      const msg = `${colorize().colorize(level, `${service} (${level})`)}: ${message} ↴\n`;
      return `${msg}${JSON.stringify(props)}`;
    })
  });
}

/**
 * Build two DailyRotateFile loggers - one for all logs, and another in a subdirectory
 * for errors only
 *
 * @param dir the subdirectory where the logs are to be stored
 * @param pad length of message to right-pad to (for readability)
 * @returns array of file transports
 */
function rotateFileTransport (dir, pad = 35) {
  const opts = {
    auditFile: `logs/${dir}/config.json`,
    dirname: `logs/${dir}`,
    filename: 'v%DATE%.log',
    datePattern: 'MM-DD-YYYY:HH',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '3d',
    createSymlink: true,
    format: printf(log => {
      const { level, message, ...props } = log;
      const prefix = rightPad(`${level}: ${message}`, pad);
      return `${prefix}${JSON.stringify(props)}`;
    })
  };

  const logs = new winston.transports.DailyRotateFile(opts);
  const errors = new winston.transports.DailyRotateFile(Object.assign(opts, {
    auditFile: `logs/${dir}/errors/config.json`,
    dirname: `logs/${dir}/errors`,
    level: 'error'
  }));

  return [logs, errors];
}

/**
 * Build a logger object for a given service, which must be defined in opts
 */
function initializeLogger (opts) {
  // get args
  const {
    service,
    console = true,
    file = false,
    color = 'reset',
    pad
  } = opts;
  if (!service) throw new LoggerError('no service defined for logger');
  // configure levels and colors
  const config = {
    levels: {
      error: 0,
      warn: 1,
      info: 2,
      debug: 2
    },
    colors: {
      error: 'red',
      warn: 'yellow',
      info: color,
      debug: 'cyan'
    }
  };
  // build transports
  const transports = [];
  if (console) {
    transports.push(consoleTransport(config.colors));
  }
  if (file) {
    transports.push(...rotateFileTransport(service, pad));
  }
  return winston.createLogger({
    levels: config.levels,
    format: combine(timestamp(), json()),
    defaultMeta: { service },
    transports
  });
}

module.exports = {
  app: initializeLogger({
    service: 'app',
    console: true,
    file: true,
    color: 'magenta'
  }),
  request: initializeLogger({
    service: 'request',
    console: true,
    file: true,
    color: 'green',
    pad: 30
  }),
  store: initializeLogger({
    service: 'store',
    console: true,
    file: true,
    color: 'blue'
  })
};