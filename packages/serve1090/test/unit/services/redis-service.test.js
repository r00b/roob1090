const RedisService = require('../../../src/services/redis-service');
const { RedisError } = require('../../../src/lib/errors');

jest.mock('../../../src/lib/logger', () => () => require('../../support/mock-logger'));
jest.mock('ioredis', () => require('ioredis-mock/jest'));

describe('redis-service', () => {

  let service, redis, expiremember, call, expires;

  beforeEach(() => {
    service = new RedisService();
    redis = service.redis;

    // these functions are implemented in ioredis/KeyDB but not ioredis-mock
    expires = [];
    expiremember = jest.fn().mockImplementation((key, field, ex) => {
      expires.push(field);
      return 1;
    });
    call = jest.fn().mockImplementation((fn, ...args) => {
      return redis[fn](...args);
    });

    // add expiremember/call to the internal ioredis-mock redis
    Object.assign(redis, { expiremember, call });

    // fetch the internal ioredis-mock pipeline and add expiremember/call
    const pipeline = redis.pipeline();
    Object.assign(pipeline, { expiremember, call });
    redis.pipeline = () => pipeline;
  });

  afterEach(() => {
    call.mockReset();
    expiremember.mockReset();
  });

  const verifyExpirememberCalled = (callIdx, key, member, ex) => {
    expect(call.mock.calls[callIdx][0]).toBe('expiremember');
    expect(expiremember.mock.calls[callIdx].slice(0, 3)).toEqual([key, member, ex]);
  };

  test('it instantiates', () => {
    expect(service).toBeDefined();
    expect(service.redis).toBeDefined();
  });

  test('it creates and execs a pipeline', async () => {
    const pipeline = service.pipeline();

    const callback = jest.fn();

    expect(pipeline).toBeDefined();
    expect(pipeline.set('a', 'foo')).toBe(pipeline);
    expect(pipeline.set('b', 'bar')).toBe(pipeline);
    expect(pipeline.set('c', 'baz')).toBe(pipeline);
    expect(await service.get('a')).toBeNull();
    expect(await service.get('b')).toBeNull();
    expect(await service.get('c')).toBeNull();

    const exec = await pipeline.exec(callback);

    expect(exec).toEqual([[null, 'OK'], [null, 'OK'], [null, 'OK']]);
    expect(callback.mock.calls.length).toBe(1);

    expect(await service.get('a')).toBe('foo');
    expect(await service.get('b')).toBe('bar');
    expect(await service.get('c')).toBe('baz');
  });

  test('set', async () => {
    expect(await service.set('a', 'foobar')).toBe('OK');
    expect(await redis.get('a')).toBe('foobar');

    const pipeline = service.pipeline();
    pipeline.set('a', 'barfoo');
    await pipeline.exec();
    expect(await redis.get('a')).toBe('barfoo');
  });

  test('setex', async () => {
    expect(await service.setex('a', 15, 'foobar')).toBe('OK');
    expect(await redis.get('a')).toBe('foobar');
    expect(await redis.ttl('a')).toBe(15);

    // pipelining
    const pipeline = service.pipeline();
    pipeline.setex('a', 10, 'barfoo');
    await pipeline.exec();
    expect(await redis.get('a')).toBe('barfoo');
    expect(await redis.ttl('a')).toBe(10);
  });

  test('hsetJson', async () => {
    expect(await service.hsetJson('a', 'foo', 'bar')).toBe(1);
    expect(await redis.hget('a', 'foo')).toBe('\"bar\"');

    // pipelining
    const pipeline = service.pipeline();
    pipeline.hsetJson('a', 'bar', 'baz');
    await pipeline.exec();
    expect(await redis.hget('a', 'bar')).toBe('\"baz\"');
  });

  test('hsetJsonEx', async () => {
    expect(await service.hsetJsonEx('a', 'foo', 'bar', 15)).toEqual([1, 1]);
    verifyExpirememberCalled(0, 'a', 'foo', 15);
    expect(await redis.hget('a', 'foo')).toBe('\"bar\"');
    expect(expires).toEqual(['foo']);

    // pipelining
    expires = [];
    const pipeline = service.pipeline();
    pipeline.hsetJsonEx('a', 'bar', 'baz', 20);
    await pipeline.exec();

    verifyExpirememberCalled(1, 'a', 'bar', 20);
    expect(await redis.hget('a', 'bar')).toBe('\"baz\"');
    expect(expires).toEqual(['bar']);
  });

  test('saddEx', async () => {
    const fields = ['foo', 'bar', 'baz'];

    expect(await service.saddEx('a', 15, fields[0])).toEqual([1, 1]);
    verifyExpirememberCalled(0, 'a', 'foo', 15);
    expect(await redis.smembers('a')).toEqual(['foo']);

    expect(await service.saddEx('a', 15, fields[1], fields[2])).toEqual([2, 2]);
    verifyExpirememberCalled(1, 'a', 'bar', 15);
    verifyExpirememberCalled(2, 'a', 'baz', 15);
    expect(await redis.smembers('a')).toEqual(fields);
    expect(expires).toEqual(['foo', 'bar', 'baz']);

    // pipelining
    expires = [];
    const pipeline = service.pipeline();
    pipeline.saddEx('b', 15, ...fields);
    await pipeline.exec();

    verifyExpirememberCalled(3, 'b', 'foo', 15);
    verifyExpirememberCalled(4, 'b', 'bar', 15);
    verifyExpirememberCalled(5, 'b', 'baz', 15);
    expect(await redis.smembers('b')).toEqual(fields);
    expect(expires).toEqual(fields);
  });

  test('incr', async () => {
    await redis.set('a', 20);
    expect(await redis.get('a')).toBe('20');
    expect(await service.incr('a')).toBe(21);
    expect(await redis.get('a')).toBe('21');

    // pipelining
    const pipeline = service.pipeline();
    pipeline.incr('a');
    await pipeline.exec();

    expect(await redis.get('a')).toBe('22');
  });

  test('decr', async () => {
    await redis.set('a', 25);
    expect(await redis.get('a')).toBe('25');
    expect(await service.decr('a')).toBe(24);
    expect(await redis.get('a')).toBe('24');

    // pipelining
    const pipeline = service.pipeline();
    pipeline.decr('a');
    await pipeline.exec();

    expect(await redis.get('a')).toBe('23');
  });

  test('del', async () => {
    await redis.set('a', 15);
    expect(await redis.get('a')).toBe('15');
    expect(await service.del('a')).toBe(1);
    expect(await redis.get('a')).toBeNull();

    // multiple simultaneous deletes
    await redis.set('a', 15);
    await redis.set('b', 20);
    await redis.hset('hash', 'bar', 'baz');
    await redis.sadd('set', 'foo');

    // sanity check
    expect(await redis.get('a')).toBe('15');
    expect(await redis.get('b')).toBe('20');
    expect(await redis.hget('hash', 'bar')).toBe('baz');
    expect(await redis.smembers('set')).toEqual(['foo']);

    expect(await service.del('a', 'b', 'hash', 'set')).toBe(4);

    expect(await redis.get('a')).toBeNull();
    expect(await redis.get('b')).toBeNull();
    expect(await redis.hget('hash', 'bar')).toBeNull();
    expect(await redis.smembers('set')).toEqual([]);

    // pipelining
    await redis.set('a', 'foo');
    expect(await redis.get('a')).toBe('foo'); // sanity check

    const pipeline = service.pipeline();
    pipeline.del('a');
    await pipeline.exec();

    expect(await redis.get('a')).toBeNull();
  });

  test('flushall', async () => {
    await redis.set('a', 15);
    await redis.set('b', 20);
    await redis.hset('hash', 'bar', 'baz');
    await redis.sadd('set', 'foo');

    expect(await redis.get('a')).toBe('15'); // sanity check

    expect(await service.flushall()).toBe('OK');

    expect(await redis.get('a')).toBeNull();
    expect(await redis.get('b')).toBeNull();
    expect(await redis.hget('hash', 'bar')).toBeNull();
    expect(await redis.smembers('set')).toEqual([]);

    // pipelining
    await redis.set('a', 15);
    expect(await redis.get('a')).toBe('15'); // sanity check

    const pipeline = service.pipeline();
    pipeline.flushall();
    await pipeline.exec();

    expect(await redis.get('a')).toBeNull();
  });

  test('get', async () => {
    await redis.set('a', 15);
    await redis.set('bar', 16);
    expect(await redis.get('a')).toBe('15');

    // pipelining
    const pipeline = service.pipeline();
    pipeline.get('a');
    pipeline.get('bar');

    const res = await pipeline.exec();
    expect(res).toEqual([[null, '15'], [null, '16']]);
  });

  test('getAsJson', async () => {
    const value = {
      foo: 'bar',
      bar: 'baz'
    };
    await redis.set('a', JSON.stringify(value));
    expect(await service.getAsJson('a')).toEqual(value);

    expect(await service.getAsJson('unset')).toBeNull();

    await redis.set('a', 'this is not stringified JSON');
    await expect(service.getAsJson('a')).rejects.toThrowError(RedisError);
  });

  test('hget in pipeline', async () => {
    await redis.hset('foo', 'bar', 'baz');

    const pipeline = service.pipeline();
    pipeline.hget('foo', 'bar');
    const res = await pipeline.exec();

    expect(res).toEqual([[null, 'baz']]);
  });

  test('hgetAsJson', async () => {
    const value = {
      foo: 'bar',
      bar: 'baz'
    };
    await redis.hset('a', 'foo', JSON.stringify(value));

    expect(await service.hgetAsJson('a', 'foo')).toEqual(value);
    expect(await service.getAsJson('unset')).toBeNull();

    await redis.hset('a', 'foo', 'this is not stringified JSON');
    await expect(service.hgetAsJson('a', 'foo')).rejects.toThrowError(RedisError);
  });

  test('hgetall in pipeline', async () => {
    await redis.hset('foo', 'bar', 'baz');
    await redis.hset('foo', 'baz', 'bar');

    const pipeline = service.pipeline();
    pipeline.hgetall('foo');
    const res = await pipeline.exec();

    expect(res).toEqual([[null, { bar: 'baz', baz: 'bar' }]]);
  });

  test('hgetAllAsJson', async () => {
    const json = {
      foo: 'bar',
      bar: 'baz'
    };
    await redis.hset('foo', 'json', JSON.stringify(json));
    await redis.hset('foo', 'string', 'value');

    expect(await service.hgetAllAsJson('foo')).toEqual({
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
    await redis.hset('a', 'json', JSON.stringify(json));
    await redis.hset('a', 'string', 'value');

    expect(await service.hgetAllAsJsonValues('a')).toEqual([
      json,
      'value'
    ]);

    expect(await service.hgetAllAsJsonValues('unset')).toEqual([]);
  });

  test('hexists', async () => {
    await redis.hset('a', 'foo', 'bar');
    await redis.hset('a', 'bar', 'baz');

    expect(await service.hexists('a', 'foo')).toBeTruthy();
    expect(await service.hexists('a', 'bar')).toBeTruthy();
    expect(await service.hexists('a', 'unset')).toBeFalsy();

    // pipelining
    const pipeline = service.pipeline();
    pipeline.hexists('a', 'foo');
    pipeline.hexists('a', 'unset');
    const res = await pipeline.exec();

    expect(res).toEqual([[null, 1], [null, 0]]);
  });

  test('hlen', async () => {
    await redis.hset('a', 'foo', 'bar');
    await redis.hset('a', 'bar', 'baz');
    await redis.hset('a', 'baz', 'bop');

    expect(await service.hlen('a')).toBe(3);
    expect(await service.hlen('unset')).toBe(0);

    // pipelining
    const pipeline = service.pipeline();
    pipeline.hlen('a');
    const res = await pipeline.exec();

    expect(res).toEqual([[null, 3]]);
  });

  test('smembers', async () => {
    await redis.sadd('a', 'foo');
    await redis.sadd('a', 'bar');

    expect(await service.smembers('a')).toEqual(['foo', 'bar']);
    expect(await service.smembers('unset')).toEqual([]);

    // pipelining
    const pipeline = service.pipeline();
    pipeline.smembers('a');
    const res = await pipeline.exec();

    expect(res).toEqual([[null, ['foo', 'bar']]]);
  });

  test('sismember', async () => {
    await redis.sadd('a', 'foo');
    await redis.sadd('a', 'bar');

    expect(await service.sismember('a', 'foo')).toBeTruthy();
    expect(await service.sismember('a', 'bar')).toBeTruthy();
    expect(await service.sismember('a', 'baz')).toBeFalsy();

    // pipelining
    const pipeline = service.pipeline();
    pipeline.sismember('a', 'foo');
    pipeline.sismember('a', 'baz');
    const res = await pipeline.exec();

    expect(res).toEqual([[null, 1], [null, 0]]);
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

    await service.set('a', 'foo');

    expect(mockLogger.error.mock.calls.length).toBe(1);
    expect(mockLogger.error.mock.calls[0][1]).toEqual({
      detail: 'message',
      op: 'set'
    });
  });
});
