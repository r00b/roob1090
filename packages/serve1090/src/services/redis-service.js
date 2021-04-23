const Redis = require('ioredis');
const config = require('../config');
const { RedisError } = require('../lib/errors');
const logger = require('../lib/logger')().scope('redis');

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
   * https://redis.io/commands/set
   *
   * @param {string} key - key of variable
   * @param {string} value - value of variable
   * @returns {Promise|Pipeline}
   */
  async set (key, value) {
    return this.send('set', key, value);
  }

  /**
   * Set a value with a TTL;
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
    const resp = await this.hsetJson(key, field, value);
    await this.send('call', 'expiremember', key, field, ex);
    return resp;
  }

  /**
   * Add a value to a set with a TTL
   *
   * @param {string} key - key of set
   * @param {string|number} ex - number of seconds until value is deleted
   * @param  values - values to add to set
   * @returns Promise
   */
  async saddEx (key, ex, ...values) {
    if (values.length) {
      const resp = await this.send('sadd', key, ...values);
      await values.map(v => this.send('call', 'expiremember', key, v, ex));
      return resp;
    }
  }

  /**
   * Increment the value stored at key;
   * https://redis.io/commands/incr
   *
   * @param {string} key - key of value
   * @returns {Promise|Pipeline}
   */
  async incr (key) {
    return this.send('incr', key);
  }

  /**
   * Decrement the value stored at key;
   * https://redis.io/commands/decr
   *
   * @param {string} key - key of value
   * @returns {Promise|Pipeline}
   */
  async decr (key) {
    return this.send('decr', key);
  }

  /**
   * Delete a value;
   * https://redis.io/commands/del
   *
   * @param {string[]} keys - key(s) of value to delete
   */
  async del (...keys) {
    return this.send('del', ...keys);
  }

  /**
   * Delete all values;
   * https://redis.io/commands/flushall
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
   * Get a value and parse it into JSON;
   * ignores pipelines
   *
   * @param {string} key - key of hash to get
   * @returns Promise
   */
  async getAsJson (key) {
    this._emitPipelineWarning('getAsJson');
    const res = await this.redis.get(key);
    if (res) {
      try {
        return JSON.parse(res);
      } catch (e) {
        throw new RedisError('unable to parse result into JSON', { key, value: String(res) });
      }
    } else return null;
  }

  /**
   * Get a value in a hash and parse the result into JSON;
   * ignores pipelines
   *
   * @param {string} key - key of hash
   * @param {string} field - field of value in hash to get
   * @returns Promise
   */
  async hgetAsJson (key, field) {
    this._emitPipelineWarning('hgetAsJson');
    const res = await this.redis.hget(key, field);
    if (res) {
      try {
        return JSON.parse(res);
      } catch (e) {
        throw new RedisError('unable to parse result into JSON', { key, field, value: String(res) });
      }
    } else return null;
  }

  /**
   * Get an entire hash as a JSON object, parsed into JSON when able;
   * ignores pipelines
   *
   * @param {string} key - key of hash
   * @returns Promise
   */
  async hgetAllAsJson (key) {
    this._emitPipelineWarning('hgetAllAsJson');
    const hashWithStringValues = await this.redis.hgetall(key);
    if (hashWithStringValues) {
      return Object.entries(hashWithStringValues).reduce((acc, [k, v]) => {
        try {
          acc[k] = JSON.parse(v);
        } catch (e) {
          acc[k] = v;
        }
        return acc;
      }, {});
    } else return null;
  }

  /**
   * Get an entire hash as an array of values, parsed into JSON when able;
   * ignores pipelines
   *
   * @param {string} key - key of hash
   * @returns Promise
   */
  async hgetAllAsJsonValues (key) {
    this._emitPipelineWarning('hgetAllAsJsonValues');
    const hashWithStringValues = await this.redis.hgetall(key);
    if (hashWithStringValues) {
      return Object.values(hashWithStringValues).reduce((acc, value) => {
        try {
          acc.push(JSON.parse(value));
        } catch (e) {
          acc.push(value);
        }
        return acc;
      }, []);
    } else return null;
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
   * Get the number of fields in the hash stored at key;
   * https://redis.io/commands/hlen
   *
   * @param {string} key - key of hash
   * @returns {Promise|Pipeline}
   */
  hlen (key) {
    return this.send('hlen', key);
  }

  // OTHER OPERATIONS

  /**
   * Create a Redis pipeline; https://redis.io/topics/pipelining
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
      return this._pipeline[fn](...params, this._errHandler);
    } else {
      return this.redis[fn](...params, this._errHandler);
    }
  }

  /**
   * Log errors triggered by Redis operations
   *
   * @param {ReplyError} e - error object from redis
   * @param result - result of redis command
   */
  _errHandler (e, result) {
    if (e) {
      logger.error('redis op error', { detail: e.message, ...e.command });
    }
  }

  _emitPipelineWarning (fn) {
    if (this._pipeline) {
      logger.warn(`${fn} was called while an open pipeline exists; this method is not compatible with pipelines; consider restructuring redis calls to avoid confusion`);
    }
  }
}

module.exports = RedisService;
