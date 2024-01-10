const Redis = require('ioredis');
const {
  redisHost: host,
  redisPort: port,
  redisUser: username,
  redisPass: password,
} = require('../config');
const { RedisError } = require('../lib/errors');
const logger = require('../lib/logger')('redis');
const pMap = require('p-map');

class RedisService {
  constructor(verbose = false) {
    this.redis = new Redis({
      host,
      port,
      username,
      password,
      retryStrategy: _ => 5000,
    });
    this.redis.on('ready', () => {
      if (verbose) {
        logger.info({ host, port }, 'redis connection established');
      }
    });
    this.redis.on('error', err => logger.fatal(err, 'redis client error'));
    this.redis.on('end', () => {
      if (verbose) {
        logger.info({ host, port }, 'redis connection ended');
      }
    });
  }

  // WRITE OPERATIONS

  /**
   * Set a value;
   * https://redis.io/commands/set
   *
   * @param {string} key - key of variable
   * @param {string} value - value of variable
   * @returns {Promise}
   */
  async set(key, value) {
    return this.redis.set(key, value, this._errHandler);
  }

  /**
   * Set a value with a TTL;
   * https://redis.io/commands/setex
   *
   * @param {string} key - key of variable
   * @param {string|number} ex - number of seconds until key-value pair is deleted
   * @param {string} value - value of variable
   * @returns {Promise}
   */
  async setex(key, ex, value) {
    return this.redis.setex(key, ex, value, this._errHandler);
  }

  /**
   * Set a JSON object into a field within a hash
   *
   * @param {string} key - key of hash
   * @param {string} field - field in hash
   * @param {object} value - value to set
   * @returns {Promise}
   */
  async hsetJson(key, field, value) {
    return this.redis.hset(key, field, JSON.stringify(value), this._errHandler);
  }

  /**
   * Set a JSON object into a field within a hash with an expiration time
   *
   * @param {string} key - key of hash
   * @param {string} field - field in hash
   * @param {object} value - value to set
   * @param {string|number} ex - number of seconds until key-value pair is deleted
   * @returns {[Promise, Promise]}
   */
  async hsetJsonEx(key, field, value, ex) {
    const set = await this.hsetJson(key, field, value);
    const expire = await this.redis.call(
      'expiremember',
      key,
      field,
      ex,
      this._errHandler
    );
    return [set, expire];
  }

  /**
   * Add a value to a set with a TTL
   *
   * @param {string} key - key of set
   * @param {string|number} ex - number of seconds until value is deleted
   * @param  values - values to add to set
   * @returns {[Promise, Promise]}
   */
  async saddEx(key, ex, ...values) {
    const adds = await this.redis.sadd(key, ...values, this._errHandler);
    const expires = await pMap(values, value =>
      this.redis.call('expiremember', key, value, ex, this._errHandler)
    );
    return [adds, expires.length];
  }

  /**
   * Increment the value stored at key;
   * https://redis.io/commands/incr
   *
   * @param {string} key - key of value
   * @returns {Promise}
   */
  async incr(key) {
    return this.redis.incr(key, this._errHandler);
  }

  /**
   * Decrement the value stored at key;
   * https://redis.io/commands/decr
   *
   * @param {string} key - key of value
   * @returns {Promise}
   */
  async decr(key) {
    return this.redis.decr(key, this._errHandler);
  }

  /**
   * Delete a value;
   * https://redis.io/commands/del
   *
   * @param {string[]} keys - key(s) of value to delete
   * @returns {Promise}
   */
  async del(...keys) {
    return this.redis.del(...keys, this._errHandler);
  }

  /**
   * Delete all values;
   * https://redis.io/commands/flushall
   *
   * @returns {Promise}
   */
  async flushall() {
    return this.redis.flushall(this._errHandler);
  }

  // READ OPERATIONS

  /**
   * Get a value;
   * https://redis.io/commands/set
   *
   * @param {string} key - key of value to get
   * @returns {Promise}
   */
  get(key) {
    return this.redis.get(key, this._errHandler);
  }

  /**
   * Get a value and parse it into JSON
   *
   * @param {string} key - key of hash to get
   * @returns {Promise}
   */
  async getAsJson(key) {
    const res = await this.redis.get(key, this._errHandler);
    if (res) {
      try {
        return JSON.parse(res);
      } catch (e) {
        throw new RedisError('unable to parse result into JSON', {
          key,
          value: String(res),
        });
      }
    } else return res;
  }

  /**
   * Get a value in a hash and parse the result into JSON
   *
   * @param {string} key - key of hash
   * @param {string} field - field of value in hash to get
   * @returns {Promise}
   */
  async hgetAsJson(key, field) {
    const res = await this.redis.hget(key, field, this._errHandler);
    if (res) {
      try {
        return JSON.parse(res);
      } catch (e) {
        throw new RedisError('unable to parse result into JSON', {
          key,
          field,
          value: String(res),
        });
      }
    } else return res;
  }

  /**
   * Get an entire hash as a JSON object with values parsed into JSON when able
   *
   * @param {string} key - key of hash
   * @returns {Promise}
   */
  async hgetAllAsJson(key) {
    const hashWithStringValues = await this.redis.hgetall(
      key,
      this._errHandler
    );
    if (hashWithStringValues) {
      return Object.entries(hashWithStringValues).reduce((acc, [k, v]) => {
        try {
          acc[k] = JSON.parse(v);
        } catch (e) {
          acc[k] = v;
        }
        return acc;
      }, {});
    } else return hashWithStringValues;
  }

  /**
   * Get an entire hash as an array of values parsed into JSON when able
   *
   * @param {string} key - key of hash
   * @returns {Promise}
   */
  async hgetAllAsJsonValues(key) {
    const hashWithStringValues = await this.redis.hgetall(
      key,
      this._errHandler
    );
    if (hashWithStringValues) {
      return Object.values(hashWithStringValues).reduce((acc, value) => {
        try {
          acc.push(JSON.parse(value));
        } catch (e) {
          acc.push(value);
        }
        return acc;
      }, []);
    } else return hashWithStringValues;
  }

  /**
   * Determine if a given field is an existing set field in the
   * hash stored at a given key
   *
   * @param {string} key - key of hash
   * @param {string} field - field in hash
   * @returns {Promise}
   */
  hexists(key, field) {
    return this.redis.hexists(key, field, this._errHandler);
  }

  /**
   * Get the number of fields in the hash stored at key;
   * https://redis.io/commands/hlen
   *
   * @param {string} key - key of hash
   * @returns {Promise}
   */
  hlen(key) {
    return this.redis.hlen(key, this._errHandler);
  }

  /**
   * Get the TTL of a key;
   * https://redis.io/commands/TTL
   *
   * @param  {string} key - key of value
   * @returns {Promise}
   */
  ttl(key) {
    // todo test
    return this.redis.ttl(key, this._errHandler);
  }

  /**
   * Get all members of a set;
   * https://redis.io/commands/smembers
   *
   * @param {string} key - key of set
   * @returns {Promise}
   */
  smembers(key) {
    return this.redis.smembers(key, this._errHandler);
  }

  /**
   * Determine if value is a member of set;
   * https://redis.io/commands/sismember
   *
   * @param {string} key - key of set
   * @param {string} value - value of member to check
   * @returns {Promise}
   */
  sismember(key, value) {
    return this.redis.sismember(key, value, this._errHandler);
  }

  // OTHER OPERATIONS

  /**
   * Create a Redis pipeline; https://redis.io/topics/pipelining
   * and https://github.com/luin/ioredis#Pipelining
   */
  pipeline() {
    return new Pipeline(this.redis.pipeline());
  }

  /**
   * Log errors triggered by Redis operations
   *
   * @param {ReplyError} e - error object from redis
   * @param result - result of redis command
   */
  _errHandler(e, result) {
    if (e) {
      logger.error(e, 'redis op error');
    }
  }
}

/**
 * This class defines a pipeline object that re-defines each of the RedisService functions as synchronous
 * requests to a redis pipeline. For documentation on each function, see their respective asynchronous
 * counterparts in RedisService. Each function returns this class.  See https://redis.io/topics/pipelining
 * and https://github.com/luin/ioredis#Pipelining
 */
class Pipeline {
  constructor(pipeline) {
    this._pipeline = pipeline;
  }

  set(key, value) {
    this._pipeline.set(key, value);
    return this;
  }

  setex(key, ex, value) {
    this._pipeline.setex(key, ex, value);
    return this;
  }

  hsetJson(key, field, value) {
    this._pipeline.hset(key, field, JSON.stringify(value));
    return this;
  }

  hsetJsonEx(key, field, value, ex) {
    this.hsetJson(key, field, value);
    this._pipeline.call('expiremember', key, field, ex);
    return this;
  }

  saddEx(key, ex, ...values) {
    this._pipeline.sadd(key, ...values);
    values.forEach(value =>
      this._pipeline.call('expiremember', key, value, ex)
    );
    return this;
  }

  incr(key) {
    this._pipeline.incr(key);
    return this;
  }

  decr(key) {
    this._pipeline.decr(key);
    return this;
  }

  del(...keys) {
    this._pipeline.del(...keys);
    return this;
  }

  flushall() {
    this._pipeline.flushall();
    return this;
  }

  get(key) {
    this._pipeline.get(key);
    return this;
  }

  hget(key, field) {
    this._pipeline.hget(key, field);
    return this;
  }

  hgetall(key) {
    this._pipeline.hgetall(key);
    return this;
  }

  hexists(key, field) {
    this._pipeline.hexists(key, field);
    return this;
  }

  hlen(key) {
    this._pipeline.hlen(key);
    return this;
  }

  ttl(key) {
    this._pipeline.ttl(key);
    return this;
  }

  smembers(key) {
    this._pipeline.smembers(key);
    return this;
  }

  sismember(key, value) {
    this._pipeline.sismember(key, value);
    return this;
  }

  /**
   * Execute the pipeline of accumulated commands
   *
   * @param callback {function?} - with erasure (err, results) => {}
   * @returns {array} results of each executed command
   */
  exec(callback) {
    return this._pipeline.exec(callback);
  }
}

module.exports = RedisService;
