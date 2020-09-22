const env = process.env;

module.exports = {
  nodeEnv: env.NODE_ENV || 'development',
  port: env.PORT,
  pumpKey: env.PUMP_KEY,
  broadcastKey: env.BROADCAST_KEY,
  dbHost: env.KEYDB_HOST,
  dbPort: env.KEYDB_PORT,
  dbPassword: env.KEYDB_PASSWORD,
  openSkyUsername: env.OPEN_SKY_USERNAME,
  openSkyPassword: env.OPEN_SKY_PASSWORD,
  faUsername: env.FA_USERNAME,
  faPassword: env.FLIGHTXML_2_KEY
};