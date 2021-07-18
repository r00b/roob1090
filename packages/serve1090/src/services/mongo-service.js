const {
  mongoHost: host,
  mongoPort: port,
  mongoUser: username,
  mongoPass: password
} = require('../config');
const logger = require('../lib/logger')().scope('mongo');
const { MongoClient } = require('mongodb');
const { MongoError } = require('../lib/errors');

const MONGO_DB = 'serve1090';

class MongoService {
  constructor () {
    this.mongo = new MongoClient(`mongodb://${host}:${port}`, {
      auth: {
        username,
        password
      }
    });
  }

  /**
   * Connect to the database
   * @returns {Promise<void>}
   */
  async connect () {
    await this.mongo.connect();
    this.db = this.mongo.db(MONGO_DB);
  }

  /**
   * Ensure mongo is available by connecting, pinging, and then disconnecting
   * @returns {Promise<void>}
   */
  async ping () {
    await this.connect();
    await this.db.command({ ping: 1 });
    logger.info('mongo connection established', { host, port });
    await this.mongo.close();
  }
}

module.exports = MongoService;
