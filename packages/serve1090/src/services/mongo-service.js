const logger = require('../lib/logger')().scope('mongo');
const { MongoClient } = require('mongodb');

const DEFAULT_DBNAME = 'serve1090';
const AIRPORTS_COLLECTION = 'airports';

class MongoService {
  constructor (config) {
    this.config = config;

    const {
      host,
      port,
      username,
      password
    } = this.config;

    const uri = `mongodb://${host}:${port}`;
    const options = {};

    if (username && password) {
      options.auth = {
        username,
        password
      };
    }

    this.mongo = new MongoClient(uri, options);
  }

  /**
   * Connect to the database
   *
   * @returns {MongoService} this
   */
  async connect () {
    const { host, port, dbName, verbose } = this.config;

    await this.mongo.connect();
    this.db = this.mongo.db(dbName || DEFAULT_DBNAME);

    if (verbose) {
      logger.info('mongo connection established', { host, port });
    }
    return this;
  }

  async close () {
    await this.mongo.close();
  }

  async ping () {
    return this.db.command({ ping: 1 });
  }

  /**
   * @returns {Collection<Document>}
   */
  get airports () {
    return this.db.collection(AIRPORTS_COLLECTION);
  }

  /**
   * Get an airport by ident
   *
   * @param {string} ident
   * @returns {Promise<Document>}
   */
  async getAirport (ident) {
    return this.db.collection(AIRPORTS_COLLECTION).findOne({ ident });
  }

  /**
   * Return idents of all active airports
   *
   * @returns {Promise<string[]>}
   */
  async getAllActiveAirportIdents () {
    const docs = await this
      .airports
      .find({ active: true })
      .project({ ident: 1 })
      .toArray();
    return docs.map(({ ident }) => ident);
  }
}

module.exports = MongoService;
