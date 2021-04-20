const Redis = require('ioredis');
const config = require('../config');
const { RedisError } = require('../lib/errors');
const logger = require('../lib/logger')().scope('redis');
const _ = require('lodash');

class RedisService {
  constructor () {
    const {
      redisHost: host,
      redisPort: port,
      redisUser: username,
      redisPass: password
    } = config;
    this.redis = new Redis({
      host,
      port,
      username,
      password,
      retryStrategy: (_) => 5000
    });
    this.redis.on('ready', () => logger.scope('redis-connection').info('redis connection established', { host, port }));
    this.redis.on('error', (err) => logger.fatal('redis client error', { detail: err.message, host, port }));
    this.redis.on('end', () => logger.info('redis connection ended', { host, port }));
  }

  // WRITE OPERATIONS

  /**
   * Set a value;
   * https://redisw.io/commands/set
   *
   * @param {string} key - key of variable
   * @param {string} value - value of variable
   * @returns {Promise|Pipeline}
   */
  async set (key, value) {
    return this.send('set', key, value);
  }

  /**
   * Set a value with an expiry time;
   * https://redis.io/commands/setex
   *
   * @param {string} key - key of variable
   * @param {string|number} ex - number of seconds until key-value pair is deleted
   * @param {string} value - value of variable
   * @returns {Promise|Pipeline}
   */
  async setex (key, ex, value) {
    return this.send('setex', key, ex, value);
  }

  /**
   * Set a JSON object into a field within a hash
   *
   * @param {string} key - key of hash
   * @param {string} field - field in hash
   * @param {object} value - value to set
   * @returns {Promise|Pipeline}
   */
  async hsetJson (key, field, value) {
    const stringVal = JSON.stringify(value);
    return this.send('hset', key, field, stringVal);
  }

  /**
   * Set a JSON object into a field within a hash with an expiration time
   *
   * @param {string} key - key of hash
   * @param {string} field - field in hash
   * @param {object} value - value to set
   * @param {string|number} ex - number of seconds until key-value pair is deleted
   * @returns {Promise|Pipeline}
   */
  async hsetJsonEx (key, field, value, ex) {
    const set = this.hsetJson(key, field, value);
    const expire = this.send('call', 'expiremember', key, field, ex);
    return Promise.all([set, expire]);
  }

  /**
   * Add a value to a set with an expiration time
   *
   * @param {string} set - key of set
   * @param {string|number} ex - number of seconds until value is deleted
   * @param  values - values to add to set
   * @returns Promise
   */
  async saddEx (set, ex, ...values) {
    if (values.length) {
      const add = this.send('sadd', set, ...values);
      const expires = values.map(v => this.send('call', 'expiremember', set, v, ex));
      return Promise.all([add, ...expires]);
    }
  }

  /**
   * Add a value to a sorted set with an expiration time
   *
   * @param {string} set - key of set
   * @param {string|number} ex - number of seconds until value is deleted
   * @param {string} values - values to add to set
   * @returns Promise
   */
  async zaddEx (set, ex, ...values) {
    if (values.length) {
      const pairs = _.chunk(values, 2);
      const zadds = pairs.map(pair => this.send('zadd', set, pair[0], pair[1]));
      const expires = pairs.map(pair => this.send('call', 'expiremember', set, pair[1], ex));
      return Promise.all([...zadds, ...expires]);
    }
  }

  /**
   * Increment the value stored at key;
   * see https://redis.io/commands/incr
   *
   * @param {string} key - key of value
   * @returns {Promise|Pipeline}
   */
  async incr (key) {
    return this.send('incr', key);
  }

  /**
   * Decrement the value stored at key;
   * see https://redis.io/commands/decr
   *
   * @param {string} key - key of value
   * @returns {Promise|Pipeline}
   */
  async decr (key) {
    return this.send('decr', key);
  }

  /**
   * Delete a value;
   * see https://redis.io/commands/del
   *
   * @param {string[]} keys - key(s) of value to delete
   */
  async del (...keys) {
    return this.send('del', ...keys);
  }

  /**
   * Delete all values;
   * see https://redis.io/commands/flushall
   *
   * @returns {Promise|Pipeline}
   */
  async flushall () {
    return this.send('flushall');
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
   * Get a value and parse it into JSON
   *
   * @param {string} key - key of value to get
   * @returns Promise
   */
  async getAsJson (key) {
    const res = await this.get(key);
    try {
      return JSON.parse(res);
    } catch (e) {
      throw new RedisError('unable to parse result into JSON', { key, value: String(res) });
    }
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
    if (res) {
      try {
        return JSON.parse(res);
      } catch (e) {
        throw new RedisError('unable to parse result into JSON', { key, field, value: String(res) });
      }
    } else {
      return null;
    }
  }

  /**
   * Get a hash as a JSON object; ignores any active pipelines
   *
   * @param {string} key - key of hash
   * @returns Promise
   */
  async hgetAllAsJson (key) {
    const hashWithStringValues = await this.redis.hgetall(key);
    if (hashWithStringValues) {
      return Object.entries(hashWithStringValues).reduce((acc, [k, v]) => {
        try {
          acc[k] = JSON.parse(v);
        } catch (e) {
          throw new RedisError('unable to parse result into JSON', { hash: key, key: k, value: v });
        }
        return acc;
      }, {});
    } else {
      return null;
    }
  }

  /**
   * Get array of values of a hash as JSON objects; ignores any active pipelines
   *
   * @param {string} key - key of hash
   * @returns Promise
   */
  async hgetAllAsJsonValues (key) {
    const hashWithStringValues = await this.redis.hgetall(hash);
    if (hashWithStringValues) {
      return Object.values(hashWithStringValues).reduce((acc, value) => {
        try {
          acc.push(JSON.parse(value));
        } catch (e) {
          throw new RedisError('unable to parse result into JSON', { hash: key, value: value });
        }
        return acc;
      }, []);
    } else {
      return null;
    }
  }

  /**
   * Determine if field is an existing field in the given hash
   *
   * @param {string} key - key of hash
   * @param {string} field - field in hash
   * @returns {Promise|Pipeline}
   */
  hexists (key, field) {
    return this.send('hexists', key, field);
  }

  /**
   * Get all members of set;
   * https://redis.io/commands/smembers
   *
   * @param {string} key - key of set
   * @returns {Promise|Pipeline}
   */
  smembers (key) {
    return this.send('smembers', key);
  }

  /**
   * Determine if value is a member of set;
   * https://redis.io/commands/sismember
   *
   * @param {string} key - key of set
   * @param {string} value - value of member to check
   * @returns {Promise|Pipeline}
   */
  sismember (key, value) {
    return this.send('sismember', key, value);
  }

  /**
   * Get all members of a sorted set via ZRANGE;
   * https://redis.io/commands/zrange
   *
   * @param {string} set - key of set
   * @returns {Promise|Pipeline}
   */
  zmembers (key) {
    return this.send('zrange', key, 0, -1);
  }

  /**
   * Get the number of fields in the hash stored at key; ignores any active pipelines;
   * see https://redis.io/commands/hlen
   *
   * @param {string} key - key of hash
   * @returns {Promise|Pipeline}
   */
  hlen (key) {
    return this.redis.hlen(key);
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
   * @param params - params to pass in to redis call
   * @returns {Promise|Pipeline}
   */
  async send (fn, ...params) {
    if (this._pipeline) {
      return this._pipeline[fn](...params, this.errHandler);
    } else {
      return this.redis[fn](...params, this.errHandler);
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
      logger.error('redis op error', { detail: err.message, ...err.command });
    }
  }
}

module.exports = RedisService;
