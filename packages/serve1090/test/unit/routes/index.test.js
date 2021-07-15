const express = require('express');
const request = require('supertest');
const httpRequestLogger = require('../../../src/middleware/http-request-logger');
const rootRouter = require('../../../src/routes/index');

jest.mock('../../../src/lib/logger', () => () => require('../../support/mock-logger'));

describe('root router', () => {
  let app, store, redis;

  beforeEach(() => {
    app = express();
    app.use(httpRequestLogger);

    store = {
      getTotalAircraftCount: jest.fn(),
      getValidAircraftCount: jest.fn()
    };
    redis = {
      get: jest.fn()
    };

    app.use(rootRouter(store, redis));
  });

  test('returns the root of the api', async () => {
    store.getTotalAircraftCount
      .mockResolvedValue(5);
    store.getValidAircraftCount
      .mockResolvedValue(10);
    redis.get
      .mockReturnValueOnce(1)
      .mockReturnValueOnce(2);

    const res = await request(app)
      .get('/')
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200);
    const body = res.body;

    expect(Object.values(body.routes.aircraft).length).toBeGreaterThan(0);
    expect(body.routes.airports).toBeTruthy();
    expect(body.routes.airspaces).toBeTruthy();

    expect(body.stats.dataSourcesCount).toBe(1);
    expect(body.stats.broadcastClientsCount).toBe(2);
    expect(body.stats.totalAircraftCount).toBe(5);
    expect(body.stats.validAircraftCount).toBe(10);

    expect(body.stats.now).toBeGreaterThan(0);
    expect(body.stats.uptime.length).toBeGreaterThan(0);
  });

  test('handles store errors', async () => {
    store.getTotalAircraftCount
      .mockImplementation(() => {
        throw new Error('oh noes');
      });

    const res = await request(app)
      .get('/')
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(500);

    expect(res.body).toEqual({
      detail: 'oh noes',
      message: 'internal server error'
    });
  });

  test('handles redis errors', async () => {
    redis.get
      .mockImplementation(() => {
        throw new Error('oh noes');
      });

    const res = await request(app)
      .get('/')
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200);

    expect(res.body.stats.dataSourcesCount).toEqual('error');
  });
});
