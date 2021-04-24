const env = process.env;

module.exports = {
  nodeEnv: env.NODE_ENV || 'development',
  port: env.PORT,
  pumpKey: env.PUMP_KEY,
  broadcastKey: env.BROADCAST_KEY,
  redisHost: env.KEYDB_HOST,
  redisPort: env.KEYDB_PORT,
  redisUser: env.KEYDB_USER,
  redisPass: env.KEYDB_PASSWORD,
  openSkyApi: env.OPEN_SKY_ROUTES_URL || 'https://opensky-network.org',
  openSkyUsername: env.OPEN_SKY_USERNAME,
  openSkyPassword: env.OPEN_SKY_PASSWORD,
  faApi: 'https://flightxml.flightaware.com/json/FlightXML2',
  faUsername: env.FA_USERNAME,
  faPassword: env.FLIGHTXML_2_KEY
};