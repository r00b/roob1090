const Redis = require('ioredis');

class RedisService {
  // TODO implement password
  constructor () {
    this.redis = new Redis({
      port: 6379,
      host: '127.0.0.1'
    });
    // this.valid.flushall(); // TODO decide if this is necessary
  }

  pipeline () {
    this._pipeline = this.redis.pipeline();
  }

  set (key, value) {
    return this.redis.set(key, value);
  }

  setex (key, value, ex) {
    return this.redis.setex(key, ex, value);
  }

  get (key) {
    return this.redis.get(key);
  }

  hset (set, value) {
    return this.redis.hset(set, value);
  }

  sadd (set, value) {
    return this.redis.sadd(set, value);
  }

  expiremember (key, value, ex) {
    return this.call('EXPIREMEMBER', key, value,ex);
  }

  async saddEx (set, value, ex) {
    await this.sadd(set, value);
    return this.expiremember(set, value, ex);
  }

  sismember (set, value) {
    return this.redis.sismember(set, value);
  }

  smembers (set) {
    return this.redis.smembers(set);
  }

  hsetJson (key, field, value) {
    return this.redis.hset(key, field, JSON.stringify(value));
  }

  async hsetJsonEx (key, field, value, ex) {
    await this.hsetJson(key, field, value);
    return this.call('EXPIREMEMBER', key, field, ex);
  }

  async hgetJson (key, field) {
    const res = await this.redis.hget(key, field);
    if (res) {
      try {
        return JSON.parse(res);
      } catch (e) {
        return undefined;
      }
    }
  }

  // TODO try catch
  async hgetAllJson (key) {
    const rawHash = await this.redis.hgetall(key);
    return Object.entries(rawHash).reduce((acc, [key, value]) => {
      acc[key] = JSON.parse(value);
      return acc;
    }, {})
  }

  async hgetAllJsonValues (key) {
    const rawHash = await this.redis.hgetall(key);
    return Object.values(rawHash).reduce((acc, value) => {
      acc.push(JSON.parse(value));
      return acc;
    }, [])
  }

  call (...args) {
    return this.redis.call(...args)
  }

  async exec () {
    if (this._pipeline) {
      await this._pipeline.exec();
      this._pipeline = undefined;
    } else throw new Error('replace with client error!');
  }

  get client () { // todo get rid of
    return this.redis;
  }
}

module.exports = RedisService;