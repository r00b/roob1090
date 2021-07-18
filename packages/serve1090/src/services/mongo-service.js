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
  async connect (verbose = false) {
    await this.mongo.connect();
    this.db = this.mongo.db(MONGO_DB);
    if (verbose) {
      logger.info('mongo connection established', { host, port });
    }
  }

  /**
   * Ensure mongo is available by connecting, pinging, and then disconnecting;
   * if db already exists, just issue a ping
   *
   * @returns {Promise<void>}
   */
  async ping () {
    const openAndClose = !this.db;
    if (openAndClose) {
      await this.connect();
    }
    await this.db.command({ ping: 1 });
    logger.info('mongo connection established', { host, port });
    if (openAndClose) {
      await this.mongo.close();
    }
  }
}

module.exports = MongoService;
