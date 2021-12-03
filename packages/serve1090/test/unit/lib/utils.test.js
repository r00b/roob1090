const {
  normalizePort,
  secondsToMillis,
  millisToSeconds,
  hex,
  key,
  secondsToTimeString,
  compareDistance,
  computeDistance,
  get,
  checkToken,
  close,
  withinBoundaryAndCeiling,
  aligned,
} = require('../../../src/lib/utils');
const nock = require('nock');
const { AuthError } = require('../../../src/lib/errors');

describe('utils', () => {
  test('normalizePort', () => {
    expect(normalizePort(8080)).toBe(8080);
    expect(normalizePort()).toBe(3000);
    expect(normalizePort(false)).toBe(3000);
    expect(normalizePort('8080')).toBe(8080);
    expect(normalizePort('-8080')).toBe(3000);
    expect(normalizePort('80.80')).toBe(3000);
  });

  test('secondsToMillis', () => {
    expect(secondsToMillis(2)).toBe(2000);
    expect(secondsToMillis(0)).toBe(0);
    expect(secondsToMillis(150)).toBe(150000);
    expect(secondsToMillis(-150)).toBe(-150000);
  });

  test('millisToSeconds', () => {
    expect(millisToSeconds(2000)).toBe(2);
    expect(millisToSeconds(0)).toBe(0);
    expect(millisToSeconds(150)).toBe(0.15);
    expect(millisToSeconds(-150)).toBe(-0.15);
  });

  test('hex', () => {
    expect(hex({ hex: '3ef' })).toBe('3ef');
    expect(hex({})).toBeUndefined();
    expect(hex()).toBeUndefined();
  });

  test('key', () => {
    expect(key({ key: '3ef' })).toBe('3ef');
    expect(key({})).toBeUndefined();
    expect(key()).toBeUndefined();
  });

  test('secondsToTimeString', () => {
    expect(secondsToTimeString(1293847)).toBe(
      '14 days, 23 hours, 24 mins, 7 secs'
    );
    expect(secondsToTimeString(60)).toBe('0 days, 0 hours, 1 mins, 0 secs');
    expect(secondsToTimeString(0)).toBe('0 days, 0 hours, 0 mins, 0 secs');
    expect(() => secondsToTimeString(-1)).toThrowError();
  });

  test('compareDistance', () => {
    const ac1 = {
      lon: 0,
      lat: 0,
    };

    expect(compareDistance(ac1, ac1, [25, 25])).toBe(0);
    expect(compareDistance(ac1, ac1, [1234, 5678])).toBe(0);

    const ac2 = {
      lon: 15,
      lat: 15,
    };

    expect(compareDistance(ac1, ac2, [25, 25])).toBeGreaterThan(0);
    expect(compareDistance(ac2, ac1, [25, 25])).toBeLessThan(0);
  });

  test('computeDistance', () => {
    expect(computeDistance([0, 25], [150, 120])).toBe(4522.643478516139);
    expect(() => computeDistance({}, [1, 1])).toThrowError();
    expect(() => computeDistance(3, [1, 1])).toThrowError();
    expect(() => computeDistance()).toThrowError();
  });

  test('get', async () => {
    const expected = { foo: 'bar' };
    const mockApi = nock(/.*foo.com/);
    mockApi.get('/').reply(200, expected);

    const result = await get('https://foo.com');
    expect(result.statusCode).toBe(200);
    expect(result.body).toEqual(expected);
  });

  test('get with auth', async () => {
    const expected = { foo: 'bar' };
    const mockApi = nock(/.*foo.com/);
    mockApi
      .get('/')
      .basicAuth({ user: 'user1', pass: 'pass1' })
      .reply(200, expected);

    const result = await get('https://foo.com', 'user1', 'pass1');
    expect(result.statusCode).toBe(200);
    expect(result.body).toEqual(expected);
  });

  test('checkPayloadToken', () => {
    const key = 'the key';
    const payload = {
      token: key,
    };

    expect(checkToken(key, payload)).toBeUndefined();

    payload.token = 'not the key';
    expect(() => checkToken(key, payload)).toThrowError(AuthError);

    delete payload.token;
    expect(() => checkToken(key, payload)).toThrowError(AuthError);

    payload.token = null;
    expect(() => checkToken(key, payload)).toThrowError(AuthError);
  });

  test('close', async () => {
    const terminate = jest.fn();
    const ws = {
      close: jest.fn(),
    };

    close(ws, 1011, 'reason');

    expect(ws.close.mock.calls.length).toBe(1);
    expect(ws.close.mock.calls[0][0]).toBe(1011);
    expect(ws.close.mock.calls[0][1]).toBe('reason');

    expect(terminate.mock.calls.length).toBe(0);

    ws.terminate = terminate;
    close(ws, 1011, 'reason', 0);
    // wait for the timeout to resolve even though it's 0
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(ws.close.mock.calls.length).toBe(2);
    expect(terminate.mock.calls.length).toBe(1);
  });

  test('withinBoundaryAndCeiling', () => {
    let boundary = [
      [0, 0],
      [5, 0],
      [5, 5],
      [0, 5],
      [0, 0],
    ];
    let ceiling = 500;
    let aircraft = {
      lon: 2,
      lat: 2,
      altBaro: 499,
    };

    expect(withinBoundaryAndCeiling(boundary, ceiling)(aircraft)).toBeTruthy();

    aircraft.altBaro = 500;
    expect(withinBoundaryAndCeiling(boundary, ceiling)(aircraft)).toBeTruthy();

    aircraft.altBaro = 501;
    expect(withinBoundaryAndCeiling(boundary, ceiling)(aircraft)).toBeFalsy();

    aircraft = {
      lon: 20,
      lat: 20,
      altBaro: 499,
    };
    expect(withinBoundaryAndCeiling(boundary, ceiling)(aircraft)).toBeFalsy();
  });

  test('aligned', () => {
    expect(aligned(0, 30)).toBeTruthy();
    expect(aligned(0, 31)).toBeFalsy();
    expect(aligned(30, 30)).toBeTruthy();
    expect(aligned(359, 1)).toBeTruthy();
    expect(aligned(330, 1)).toBeFalsy();
    expect(aligned(331, 1)).toBeTruthy();
  });
});
