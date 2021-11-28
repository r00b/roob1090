const _ = require('lodash');
const { wait } = require('../../../support/helpers');
const express = require('express');
const ws = require('express-ws');
const request = require('supertest');
const requestWs = require('superwstest').default;
const httpRequestLogger = require('../../../../src/middleware/http-request-logger');
const airportRouter = require('../../../../src/routes/airports/index');
const { BOARD } = require('../../../../src/lib/redis-keys');

jest.mock('../../../../src/lib/logger', () => () => require('../../../support/mock-logger'));

const WS_WAIT = 100;

describe('airports router', () => {
  let app, wss, store, redis;
  const broadcastKey = 'broadcastKey';
  const airports = ['kdca', 'kaus'];

  beforeEach(() => {
    app = express();
    wss = ws(app).getWss();
    app.use(httpRequestLogger);

    store = {
      getTotalAircraftCount: jest.fn(),
      getValidAircraftCount: jest.fn()
    };
    redis = {
      getAsJson: jest.fn(),
      incr: jest.fn(),
      decr: jest.fn()
    };

    app.use(airportRouter(airports, broadcastKey, store, redis));
  });

  describe('/', () => {
    test('gets a list of supported airports', async () => {
      const res = await request(app)
        .get('/')
        .set('Accept', 'application/json')
        .expect('Content-Type', /json/)
        .expect(200);
      expect(res.body).toEqual({ airports });
    });
  });

  describe('/boards', () => {
    describe('http', () => {
      test('gets an airport board', async () => {
        const board = {
          foo: 'bar'
        };

        redis.getAsJson
          .mockResolvedValue(board);
        store.getTotalAircraftCount
          .mockResolvedValue(2);
        store.getValidAircraftCount
          .mockResolvedValue(3);

        const res = await request(app)
          .get('/boards/kdca')
          .set('Accept', 'application/json')
          .expect('Content-Type', /json/)
          .expect(200);

        expect(_.isMatch(res.body, board)).toBeTruthy();
        expect(_.isMatch(res.body.stats, {
          totalAircraftCount: 2,
          validAircraftCount: 3
        })).toBeTruthy();
        expect(redis.getAsJson.mock.calls[0][0]).toBe(BOARD('kdca'));
      });

      test('handles http errors', async () => {
        redis.getAsJson
          .mockImplementation(() => {
            throw new Error('oh noes');
          });

        const res = await request(app)
          .get('/boards/kdca')
          .set('Accept', 'application/json')
          .expect('Content-Type', /json/)
          .expect(500);

        expect(res.body).toEqual({
          detail: 'oh noes',
          message: 'internal server error'
        });
      });
    });

    describe('ws', () => {
      let server, payload;

      beforeEach(() => {
        payload = {
          token: broadcastKey
        };
        server = app.listen();
      });

      afterEach(async () => {
        await server.close();
        await wait();
      });

      test('repeatedly broadcasts airport board', async () => {
        const board = {
          foo: 'bar'
        };
        redis.getAsJson
          .mockResolvedValue(board);

        const broadcastRegExp = new RegExp(/{"foo":"bar","stats":{"now":\d+}}/);

        await requestWs(wss)
          .ws('/boards/kdca')
          .sendText(JSON.stringify(payload))
          .expectText(broadcastRegExp)
          .expectText(broadcastRegExp)
          .expectText(broadcastRegExp)
          .wait(WS_WAIT)
          .close(1000)
          .wait(WS_WAIT)
          .expectClosed(1000);

        expect(redis.incr.mock.calls.length).toBe(1);
        expect(redis.decr.mock.calls.length).toBe(1);
      });

      test('rejects broadcast request with bad token', async () => {
        payload.token = 'ruh roh';

        await requestWs(wss)
          .ws('/boards/kdca')
          .sendText(JSON.stringify(payload))
          .expectText('{"message":"auth error","detail":"bad token"}')
          .wait(WS_WAIT)
          .expectClosed(1008);
      });

      test('rejects broadcast request with missing token', async () => {
        delete payload.token;

        await requestWs(wss)
          .ws('/boards/kdca')
          .sendText(JSON.stringify(payload))
          .expectText('{"message":"auth error","detail":"missing token"}')
          .wait(WS_WAIT)
          .expectClosed(1008);
      });

      test('handles internal errors', async () => {
        redis.getAsJson
          .mockImplementation(() => {
            throw new Error('oh noes');
          });

        await requestWs(wss)
          .ws('/boards/kdca')
          .sendText(JSON.stringify(payload))
          .expectText('{"message":"broadcast error","detail":"oh noes"}')
          .wait(WS_WAIT)
          .expectClosed(1011);
      });

      test('ignores multiple broadcast requests on same ws', async () => {
        await requestWs(wss)
          .ws('/boards/kdca')
          .sendText(JSON.stringify(payload))
          .sendText(JSON.stringify(payload))
          .wait(WS_WAIT)
          .close(1000)
          .wait(WS_WAIT)
          .expectClosed(1000);

        // these would equal 2 if multiple broadcasts were initialized
        expect(redis.incr.mock.calls.length).toBe(1);
        expect(redis.decr.mock.calls.length).toBe(1);

        await requestWs(wss)
          .ws('/boards/kdca')
          .sendText(JSON.stringify(payload))
          .wait(WS_WAIT)
          .close(1000)
          .wait(WS_WAIT)
          .expectClosed(1000);

        // a subsequent, separate ws request is fulfilled
        expect(redis.incr.mock.calls.length).toBe(2);
        expect(redis.decr.mock.calls.length).toBe(2);
      });
    });
  });
});
