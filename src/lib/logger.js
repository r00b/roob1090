const winston = require('winston');
require('winston-daily-rotate-file');
const { combine, timestamp, json, colorize, simple } = winston.format;

function consoleTransport (level) {
  return new winston.transports.Console({
    format: combine(
      colorize(),
      simple()
    ),
    level
  });
}

function rotateFileTransport (dir, level) {
  return new winston.transports.DailyRotateFile({
    auditFile: `logs/${dir}/config.json`,
    dirname: `logs/${dir}`,
    filename: 'v%DATE%.log',
    datePattern: 'MM-DD-YYYY:HH',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '3d',
    createSymlink: true,
    level,
    format: combine(
      simple()
    )
  });
}

function initializeLogger (opts) {
  // get args
  const {
    service = 'serve1090',
    console = true,
    rotateFile = false,
    dir,
    level = 'info',
    color = 'reset'
  } = opts;
  // configure levels and colors
  const config = {
    levels: {
      error: 0,
      warn: 1,
      [level]: 2
    },
    colors: {
      error: 'red',
      warn: 'yellow',
      [level]: color
    }
  };
  winston.addColors(config.colors);
  // build transports
  const transports = [];
  if (console) {
    transports.push(consoleTransport(level));
  }
  if (rotateFile) {
    transports.push(rotateFileTransport(dir, level));
  }
  return winston.createLogger({
    levels: config.levels,
    format: combine(timestamp(), json()),
    defaultMeta: { service },
    transports
  });
}

module.exports = {
  store: initializeLogger({
    console: false,
    rotateFile: true,
    dir: 'aircraft-store',
    level: 'store',
    color: 'blue'
  }),
  router: initializeLogger({
    console: true,
    rotateFile: true,
    dir: 'aircraft-router',
    level: 'router',
    color: 'green'
  })
};