// TODO clean up
const winston = require('winston');
require('winston-daily-rotate-file');
const { combine, timestamp, json, colorize, simple } = winston.format;

function createTransport (dir, level) {
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
      colorize(),
      simple()
    ),
  });
}

function initializeLogger (level = 'verbose') {
  const config = {
    levels: {
      error: 0,
      warn: 1,
      store: 2
    },
    colors: {
      store: 'blue',
      error: 'red',
      warn: 'yellow'
    }
  };
  winston.addColors(config.colors);
  return winston.createLogger({
    levels: config.levels,
    format: combine(timestamp(), json()),
    defaultMeta: { service: 'serve1090' },
    transports: [
      new winston.transports.Console({
        format: combine(
          colorize(),
          simple()
        ),
        level: 'store'
      }),
      createTransport('aircraft-store', 'store')
    ]
  });
}

const logger = initializeLogger();

module.exports = logger;