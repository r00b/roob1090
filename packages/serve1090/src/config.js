const env = process.env;

module.exports = {
  port: env.PORT,
  secret: env.SECRET,
  dbHost: env.KEYDB_HOST,
  dbPort: env.KEYDB_PORT,
  dbPassword: env.KEYDB_PASSWORD
};