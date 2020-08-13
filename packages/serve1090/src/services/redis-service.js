const Redis = require('ioredis');
const { RedisError } = require('../lib/errors');
const logger = require('../lib/logger').get('redis');
const config = require('../config');

class RedisService {
  constructor () {
    const host = config.dbHost;
    const port = config.dbPort;
    this.redis = new Redis({
      host,
      port,
      password: config.dbPassword
    });
    this.redis.on('error', function (err) {
      logger.error('redis client error', { detail: err.message, host, port });
    });
    this.redis.on('close', function () {
      logger.info('redis connection closed', { host, port });
    });
    this.redis.on('end', function () {
      logger.info('redis connection ended', { host, port });
    });
  }

  // WRITE OPERATIONS

  /**
   * Set a value with an expiry time;
   * https://redis.io/commands/setex
   *
   * @param {string} key - key of variable
   * @param {string|integer} ex - number of seconds until key-value pair is deleted
   * @param {string} value - value of variable
   * @returns {Promise|Pipeline}
   */
  async setex (key, ex, ...values) {
    return this.send('setex', key, ex, ...values);
  }

  /**
   * Set a JSON object into a field within a hash with an expiration time
   *
   * @param {string} key - key of hash
   * @param {string} field - field in hash
   * @param {string} value - value to set
   * @param {string|integer} ex - number of seconds until key-value pair is deleted
   * @returns {Promise|Pipeline}
   */
  async hsetJsonEx (key, field, value, ex) {
    const stringVal = JSON.stringify(value);
    const set = this.send('hset', key, field, stringVal);
    const expire = this.send('call', 'expiremember', key, field, ex);
    return Promise.all([set, expire]);
  }

  /**
   * Add a value to a set with an expiration time
   *
   * @param {string} key - key of set
   * @param {integer} ex - number of seconds until value is deleted
   * @param {string} values - values to add to set
   * @returns Promise
   */
  async saddEx (set, ex, ...values) {
    if (values.length) {
      const add = this.send('sadd', set, ...values);
      const expires = values.map(v => this.send('call', 'expiremember', set, v, ex));
      return Promise.all([add, ...expires]);
    }
  }

  async zaddEx (set, ex, score, member) {
    // if (values.length) {
      const zadd = this.send('zadd', set, score, member);
      const expire = this.send('call', 'expiremember', set, member, ex);
      return Promise.all([zadd, expire]);
    // }
  }

  // READ OPERATIONS

  /**
   * Get a value;
   * https://redis.io/commands/set
   *
   * @param {string} key - key of value to get
   * @returns Promise
   */
  get (key) {
    return this.send('get', key);
  }

  /**
   * Get a value in a hash and parse the result into JSON; ignores any active pipelines
   *
   * @param {string} key - key of hash
   * @param {string} field - field of value in hash to get
   * @returns Promise
   */
  async hgetJson (key, field) {
    const res = await this.redis.hget(key, field);
    try {
      return JSON.parse(res);
    } catch (e) {
      throw new RedisError('unable to parse result into JSON', { key, field, value: String(res) });
    }
  }

  /**
   * Get array of values of a hash as JSON objects; ignores any active pipelines
   *
   * @param {string} hash - key of hash
   * @returns Promise
   */
  async hgetAllAsJsonValues (hash) {
    const hashWithStringValues = await this.redis.hgetall(hash);
    return Object.values(hashWithStringValues).reduce((acc, value) => {
      try {
        acc.push(JSON.parse(value));
      } catch (e) {
        throw new RedisError('unable to parse result into JSON', { hash, value: value });
      }
      return acc;
    }, []);
  }

  /**
   * Get all members of set;
   * https://redis.io/commands/smembers
   *
   * @param {string} set - key of set
   * @returns Promise
   */
  smembers (set) {
    return this.send('smembers', set);
  }

  zmembers (set) {
    return this.send('zrange', set, 0, -1);
  }

  // OTHER OPERATIONS

  /**
   * Create a Redis pipeline; see https://redis.io/topics/pipelining
   * and https://github.com/luin/ioredis#Pipelining
   */
  pipeline () {
    this._pipeline = this.redis.pipeline();
    return this;
  }

  /**
   * Execute a Redis pipeline
   *
   * @returns Promise
   */
  async exec (callback) {
    if (this._pipeline) {
      const res = await this._pipeline.exec(callback);
      delete this._pipeline;
      return res;
    } else {
      throw new RedisError('called exec on nonexistent pipeline');
    }
  }

  /**
   * Execute a Redis command, either on a pipeline or the Redis client itself
   *
   * @param {string} fn - name of the redis fn
   * @param {string[]} args - array of args
   * @returns {Promise|Pipeline}
   */
  async send (fn, ...args) {
    if (this._pipeline) {
      return this._pipeline[fn](...args, this.errHandler);
    } else {
      return this.redis[fn](...args, this.errHandler);
    }
  }

  /**
   * Log errors triggered by Redis operations
   *
   * @param {ReplyError} err - error object from redis
   * @param result - result of redis command
   */
  errHandler (err, result) {
    if (err) {
      logger.error('redis command error', { detail: err.message, ...err.command });
    }
  }
}

module.exports = RedisService;