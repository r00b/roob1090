const requestLogger = require('../../../src/middleware/http-request-logger');

jest.mock(
  '../../../src/lib/logger',
  () => () => require('../../support/mock-logger')
);

describe('http-request-logger', () => {
  let req, res, next;

  beforeEach(() => {
    req = {};
    res = {
      once: jest.fn(),
    };
    next = jest.fn();
  });

  test('foo', () => {
    requestLogger(req, res, next);
    expect(res.locals.requestLogger).toBeTruthy();
    expect(res.locals.requestLogger.child.mock.calls.length).toBe(1);
    expect(res.locals.requestLogger.info.mock.calls.length).toBe(1);
    expect(res.once.mock.calls.length).toBe(1);
  });
});
