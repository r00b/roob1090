const RedisService = require('../../../src/services/redis-service');
const { RedisError } = require('../../../src/lib/errors');

jest.mock('../../../src/lib/logger', () => () => require('../../support/mock-logger'));
jest.mock('ioredis', () => require('ioredis-mock/jest'));

describe('redis service', () => {

  let service, redis, expires;
  const key = 'KEY';
  const ttl = 15;

  beforeEach(() => {
    service = new RedisService();
    redis = service.redis;

    expires = [];
    redis.expiremember = (key, field, ex) => {
      expect(key).toBe(key);
      expect(ex).toBe(ttl);
      expires.push(field);
      return 1;
    };
    redis.call = (fn, ...args) => redis[fn](...args);
  });

  test('it instantiates', () => {
    expect(service.redis).toBeDefined();
  });

  test('set', async () => {
    expect(await service.set(key, 'foobar')).toBe('OK');
    expect(await service.get(key)).toBe('foobar');
  });

  test('setex', async () => {
    expect(await service.setex(key, ttl, 'foobar')).toBe('OK');
    expect(await service.get(key)).toBe('foobar');
    expect(await redis.ttl(key)).toBe(ttl);
  });

  test('hsetJson', async () => {
    expect(await service.hsetJson(key, 'foo', 'bar')).toBe(1);
    expect(await redis.hget(key, 'foo')).toBe('\"bar\"');
  });

  test('hsetJsonEx', async () => {
    const fields = ['foo'];
    expect(expires).not.toEqual(fields);

    expect(await service.hsetJsonEx(key, 'foo', 'bar', ttl)).toBe(1);
    expect(await redis.hget(key, 'foo')).toBe('\"bar\"');

    expect(expires).toEqual(fields);
  });

  test('saddEx', async () => {
    const fields = ['foo', 'bar', 'baz'];
    expect(expires).not.toEqual(fields);

    expect(await service.saddEx(key, ttl, fields[0])).toBe(1);
    expect(await redis.smembers(key)).toEqual(['foo']);

    expect(await service.saddEx(key, ttl, fields[1], fields[2])).toBe(2);
    expect(await redis.smembers(key)).toEqual(fields);

    expect(expires).toEqual(fields);
  });

  test('incr', async () => {
    await redis.set(key, 20);
    expect(await redis.get(key)).toBe('20');
    expect(await service.incr(key)).toBe(21);
    expect(await redis.get(key)).toBe('21');
  });

  test('decr', async () => {
    await redis.set(key, 25);
    expect(await redis.get(key)).toBe('25');
    expect(await service.decr(key)).toBe(24);
    expect(await redis.get(key)).toBe('24');
  });

  test('del', async () => {
    await redis.set(key, 15);
    expect(await redis.get(key)).toBe('15');
    expect(await service.del(key)).toBe(1);
    expect(await redis.get(key)).toBeNull();

    // multiple simultaneous deletes
    await redis.set(key, 15);
    await redis.set('another', 20);
    await redis.hset('hash', 'bar', 'baz');
    await redis.sadd('set', 'foo');

    expect(await redis.get(key)).toBe('15');
    expect(await redis.get('another')).toBe('20');
    expect(await redis.hget('hash', 'bar')).toBe('baz');
    expect(await redis.smembers('set')).toEqual(['foo']);

    expect(await service.del(key, 'another', 'hash', 'set')).toBe(4);

    expect(await redis.get(key)).toBeNull();
    expect(await redis.get('another')).toBeNull();
    expect(await redis.hget('hash', 'bar')).toBeNull();
    expect(await redis.smembers('set')).toEqual([]);
  });

  test('flushall', async () => {
    await redis.set(key, 15);
    await redis.set('another', 20);
    await redis.hset('hash', 'bar', 'baz');
    await redis.sadd('set', 'foo');

    expect(await service.flushall()).toBe('OK');

    expect(await redis.get(key)).toBeNull();
    expect(await redis.get('another')).toBeNull();
    expect(await redis.hget('hash', 'bar')).toBeNull();
    expect(await redis.smembers('set')).toEqual([]);
  });

  test('get', async () => {
    await redis.set(key, 15);
    expect(await redis.get(key)).toBe('15');
  });

  test('getAsJson', async () => {
    const value = {
      foo: 'bar',
      bar: 'baz'
    };
    await redis.set(key, JSON.stringify(value));
    expect(await service.getAsJson(key)).toEqual(value);

    expect(await service.getAsJson('unset')).toBeNull();

    await redis.set(key, 'this is not stringified JSON');
    await expect(service.getAsJson(key)).rejects.toThrowError(RedisError);
  });

  test('hgetAsJson', async () => {
    const value = {
      foo: 'bar',
      bar: 'baz'
    };
    await redis.hset(key, 'foo', JSON.stringify(value));

    expect(await service.hgetAsJson(key, 'foo')).toEqual(value);
    expect(await service.getAsJson('unset')).toBeNull();

    await redis.hset(key, 'foo', 'this is not stringified JSON');
    await expect(service.hgetAsJson(key, 'foo')).rejects.toThrowError(RedisError);
  });

  test('hgetAllAsJson', async () => {
    const json = {
      foo: 'bar',
      bar: 'baz'
    };
    await redis.hset(key, 'json', JSON.stringify(json));
    await redis.hset(key, 'string', 'value');

    expect(await service.hgetAllAsJson(key)).toEqual({
      json,
      string: 'value'
    });

    expect(await service.hgetAllAsJson('unset')).toEqual({});
  });

  test('hgetAllAsJsonValues', async () => {
    const json = {
      foo: 'bar',
      bar: 'baz'
    };
    await redis.hset(key, 'json', JSON.stringify(json));
    await redis.hset(key, 'string', 'value');

    expect(await service.hgetAllAsJsonValues(key)).toEqual([
      json,
      'value'
    ]);

    expect(await service.hgetAllAsJsonValues('unset')).toEqual([]);
  });

  test('hexists', async () => {
    await redis.hset(key, 'foo', 'bar');
    await redis.hset(key, 'bar', 'baz');

    expect(await service.hexists(key, 'foo')).toBeTruthy();
    expect(await service.hexists(key, 'bar')).toBeTruthy();
    expect(await service.hexists(key, 'unset')).toBeFalsy();
  });

  test('smembers', async () => {
    await redis.sadd(key, 'foo');
    await redis.sadd(key, 'bar');

    expect(await service.smembers(key)).toEqual(['foo', 'bar']);
    expect(await service.smembers('unset')).toEqual([]);
  });

  test('sismember', async () => {
    await redis.sadd(key, 'foo');
    await redis.sadd(key, 'bar');

    expect(await service.sismember(key, 'foo')).toBeTruthy();
    expect(await service.sismember(key, 'bar')).toBeTruthy();
    expect(await service.sismember(key, 'baz')).toBeFalsy();
  });

  test('hlen', async () => {
    await redis.hset(key, 'foo', 'bar');
    await redis.hset(key, 'bar', 'baz');
    await redis.hset(key, 'baz', 'bop');

    expect(await service.hlen(key)).toBe(3);
    expect(await service.hlen('unset')).toBe(0);
  });

  test('pipeline', async () => {
    const pipeline = service.pipeline();
    pipeline.set('a', 1);
    pipeline.set('b', 2);
    pipeline.set('c', 3);

    expect(await redis.get('a')).toBeNull();
    expect(await redis.get('b')).toBeNull();
    expect(await redis.get('c')).toBeNull();

    await pipeline.exec();

    expect(await redis.get('a')).toBe('1');
    expect(await redis.get('b')).toBe('2');
    expect(await redis.get('c')).toBe('3');
  });

  test('pipeline calls callback', async () => {
    const callback = jest.fn();
    const pipeline = service.pipeline();

    pipeline.set('a', 1);
    await pipeline.exec(callback);

    expect(callback.mock.calls.length).toBe(1);
  });

  test('handles exec on nonexistent pipeline', async () => {
    await expect(service.exec()).rejects.toThrowError(RedisError);
  });

  test('handles op errors', async () => {
    const mockLogger = require('../../../src/lib/logger')();
    mockLogger.error = jest.fn();

    redis.set = jest.fn().mockImplementation((key, value, errHandler) => {
      errHandler({
        message: 'message',
        command: {
          op: 'set'
        }
      });
    });

    await service.set(key, 'foo');

    expect(mockLogger.error.mock.calls.length).toBe(1);
    expect(mockLogger.error.mock.calls[0][1]).toEqual({
      detail: 'message',
      op: 'set'
    });
  });
});
