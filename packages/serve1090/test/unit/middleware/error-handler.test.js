const mockLogger = require('../../support/mock-logger');
const {
  AuthError,
  PayloadError,
  BroadcastError
} = require('../../../src/lib/errors');
const errorHandler = require('../../../src/middleware/error-handler');

describe('error-handler', () => {
  let req, res, next;

  beforeEach(() => {
    req = {};
    res = {
      status: jest.fn().mockReturnValue({
        json: jest.fn().mockImplementation(json => json)
      }),
      locals: {
        requestLogger: mockLogger
      }
    };
    next = jest.fn();
  });

  describe('http', () => {
    test('AuthError', () => {
      const err = new AuthError('bad token', 401);

      const result = errorHandler(err, req, res, next);

      expect(res.status.mock.calls[0][0]).toBe(err.code);
      expect(result).toEqual({
        message: 'auth error',
        detail: 'bad token'
      });
    });

    test('generic error', () => {
      const err = new Error('foo');

      const result = errorHandler(err, req, res, next);

      expect(res.status.mock.calls[0][0]).toBe(500);
      expect(result).toEqual({
        message: 'internal server error',
        detail: 'foo'
      });
    });
  });

  describe('ws', () => {
    beforeEach(() => {
      req.ws = {
        locals: {
          socketLogger: mockLogger
        },
        send: jest.fn(),
        close: jest.fn()
      };
    });

    const verify = (result, code, message, detail) => {
      expect(result).toEqual({
        message,
        detail
      });
      expect(req.ws.send.mock.calls[0][0]).toBe(`{"message":"${message}","detail":"${detail}"}`);
      expect(req.ws.close.mock.calls.length).toBe(1);
      expect(req.ws.close.mock.calls[0][0]).toBe(code);
      expect(req.ws.close.mock.calls[0][1]).toBe(`${message}: ${detail}`);

      req.ws.send.mockReset();
      req.ws.close.mockReset();
    };

    test('AuthError', () => {
      const err = new AuthError('foo', 401);
      const result = errorHandler(err, req, res, next);
      verify(result, new AuthError().wsCode, 'auth error', 'foo');
    });

    test('PayloadError', () => {
      const err = new PayloadError('foo');
      const result = errorHandler(err, req, res, next);
      verify(result, new PayloadError().wsCode, 'malformed payload rejected', 'foo');
    });

    test('BroadcastError', () => {
      const err = new BroadcastError('foo');
      const result = errorHandler(err, req, res, next);
      verify(result, new BroadcastError().wsCode, 'broadcast error', 'foo');
    });

    test('generic error', () => {
      const err = new Error('foo');
      const result = errorHandler(err, req, res, next);
      verify(result, 1011, 'internal server error', 'foo');
    });
  });
});
