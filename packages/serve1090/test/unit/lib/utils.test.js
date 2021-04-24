const {
  secondsToMillis,
  millisToSeconds,
  hex,
  secondsToTimeString,
  compareDistance,
  computeDistance,
  get
} = require('../../../src/lib/utils');
const nock = require('nock');

describe('utils', () => {
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

  test('secondsToTimeString', () => {
    expect(secondsToTimeString(1293847)).toBe('14 days, 23 hours, 24 mins, 7 secs');
    expect(secondsToTimeString(60)).toBe('0 days, 0 hours, 1 mins, 0 secs');
    expect(secondsToTimeString(0)).toBe('0 days, 0 hours, 0 mins, 0 secs');
    expect(() => secondsToTimeString(-1)).toThrowError();
  });

  test('compareDistance', () => {
    const ac1 = {
      lon: 0,
      lat: 0
    };

    expect(compareDistance(ac1, ac1, [25, 25])).toBe(0);
    expect(compareDistance(ac1, ac1, [1234, 5678])).toBe(0);

    const ac2 = {
      lon: 15,
      lat: 15
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
    mockApi
      .get('/')
      .reply(200, expected);

    const res = await get('https://foo.com');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(expected);
  });

  test('get with auth', async () => {
    const expected = { foo: 'bar' };
    const mockApi = nock(/.*foo.com/);
    mockApi
      .get('/')
      .basicAuth({ user: 'user1', pass: 'pass1' })
      .reply(200, expected);

    const res = await get('https://foo.com', 'user1', 'pass1');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(expected);
  });
});
