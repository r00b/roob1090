const {
  millisToSeconds
} = require('../../../src/lib/utils');
const camelcaseKeys = require('camelcase-keys');
const {
  ALL_AIRCRAFT_STORE,
  VALID_AIRCRAFT_STORE,
  INVALID_AIRCRAFT_STORE
} = require('../../../src/lib/redis-keys');

const mockRedisService = require('../../support/mock-redis-service');
const mocks = {
  hsetJsonEx: jest.fn(),
  hgetAsJson: jest.fn(),
  hgetAllAsJsonValues: jest.fn(),
  hlen: jest.fn(),
  exec: jest.fn()
};
jest.mock('../../../src/services/redis-service', () => mockRedisService(mocks));
jest.mock('../../../src/lib/logger', () => () => require('../../support/mock-logger'));

const store = require('../../../src/stores/aircraft-store');

describe('aircraft-store', () => {

  const aircraft = [
    {
      hex: '3ef',
      flight: 'AAL1',
      lat: 0.0,
      lon: 5.0,
      alt_baro: 1000,
      track: 180,
      seen: 1
    },
    {
      hex: '4ef',
      flight: 'UAL23',
      lat: 2.0,
      lon: 4.0,
      alt_baro: 1500,
      track: 270,
      seen: 1
    },
    {
      hex: '5ef',
      alt_baro: 5000
    }
  ];

  beforeEach(() => {
    mocks.hgetAsJson.mockImplementation(() => aircraft[0]);
    mocks.hgetAllAsJsonValues.mockImplementation(() => aircraft);
    mocks.hlen.mockImplementation(() => 15);
  });

  afterEach(() => {
    Object.values(mocks).forEach(m => m.mockReset());
  });

  const verifyHsetJsonEx = (call, key, aircraft) => {
    expect(mocks.hsetJsonEx.mock.calls[call][0]).toEqual(key);
    expect(mocks.hsetJsonEx.mock.calls[call][1]).toEqual(aircraft.hex);
    expect(mocks.hsetJsonEx.mock.calls[call][2]).toBeTruthy();
    expect(mocks.hsetJsonEx.mock.calls[call][3]).toBeGreaterThan(0);
  };

  test('it adds valid aircraft to the valid and all aircraft stores', async () => {
    const data = {
      now: Date.now(),
      aircraft
    };

    await store.addAircraft(data);

    expect(mocks.hsetJsonEx.mock.calls.length).toBe(6);
    verifyHsetJsonEx(0, VALID_AIRCRAFT_STORE, aircraft[0]);
    verifyHsetJsonEx(1, ALL_AIRCRAFT_STORE, aircraft[0]);
    verifyHsetJsonEx(2, VALID_AIRCRAFT_STORE, aircraft[1]);
    verifyHsetJsonEx(3, ALL_AIRCRAFT_STORE, aircraft[1]);

    expect(mocks.exec.mock.calls.length).toBe(1);
  });

  test('it adds invalid aircraft to the invalid and all aircraft stores', async () => {
    const data = {
      now: Date.now(),
      aircraft
    };

    await store.addAircraft(data);

    expect(mocks.hsetJsonEx.mock.calls.length).toBe(6);
    verifyHsetJsonEx(4, INVALID_AIRCRAFT_STORE, aircraft[2]);
    verifyHsetJsonEx(5, ALL_AIRCRAFT_STORE, aircraft[2]);

    expect(mocks.exec.mock.calls.length).toBe(1);
  });

  test('it camelCases keys on all aircraft', async () => {
    const data = {
      now: Date.now(),
      aircraft
    };

    await store.addAircraft(data);

    // valid store set
    expect(mocks.hsetJsonEx.mock.calls[0][2].altBaro).toBe(1000);
    expect(mocks.hsetJsonEx.mock.calls[0][2].alt_baro).toBeUndefined();
    // all store set
    expect(mocks.hsetJsonEx.mock.calls[1][2].altBaro).toBe(1000);
    expect(mocks.hsetJsonEx.mock.calls[1][2].alt_baro).toBeUndefined();
    // invalid store set
    expect(mocks.hsetJsonEx.mock.calls[4][2].altBaro).toBe(5000);
    expect(mocks.hsetJsonEx.mock.calls[4][2].alt_baro).toBeUndefined();
  });

  test('it rejects stale data', async () => {
    const staleData = {
      now: millisToSeconds(Date.now() - store.MAX_DATA_AGE_MILLIS - 1),
      aircraft
    };

    await store.addAircraft(staleData);

    expect(mocks.hsetJsonEx.mock.calls.length).toBe(0);
    expect(mocks.exec.mock.calls.length).toBe(0);
  });

  test('it gets all aircraft store', async () => {
    const res = await store.getAllAircraft();
    expect(res.aircraft).toEqual(aircraft);
    expect(res.count).toEqual(aircraft.length);
    expect(res.now).toBeTruthy();

    expect(mocks.hgetAllAsJsonValues.mock.calls.length).toBe(1);
    expect(mocks.hgetAllAsJsonValues.mock.calls[0][0]).toBe(ALL_AIRCRAFT_STORE);
  });

  test('it gets valid aircraft store', async () => {
    const res = await store.getValidAircraft();
    expect(res.aircraft).toEqual(aircraft);
    expect(res.count).toEqual(aircraft.length);
    expect(res.now).toBeTruthy();

    expect(mocks.hgetAllAsJsonValues.mock.calls.length).toBe(1);
    expect(mocks.hgetAllAsJsonValues.mock.calls[0][0]).toBe(VALID_AIRCRAFT_STORE);
  });

  test('it gets invalid aircraft store', async () => {
    const res = await store.getInvalidAircraft();
    expect(res.aircraft).toEqual(aircraft);
    expect(res.count).toEqual(aircraft.length);
    expect(res.now).toBeTruthy();

    expect(mocks.hgetAllAsJsonValues.mock.calls.length).toBe(1);
    expect(mocks.hgetAllAsJsonValues.mock.calls[0][0]).toBe(INVALID_AIRCRAFT_STORE);
  });

  test('it gets aircraft by hex', async () => {
    const res = await store.getAircraftWithHex('foo');

    expect(res).toEqual(aircraft[0]);
    expect(mocks.hgetAsJson.mock.calls.length).toBe(1);
    expect(mocks.hgetAsJson.mock.calls[0][0]).toBe(ALL_AIRCRAFT_STORE);
    expect(mocks.hgetAsJson.mock.calls[0][1]).toBe('foo');
  });

  test('it gets valid aircraft by hex', async () => {
    const res = await store.getValidAircraftWithHex('foo');

    expect(res).toEqual(aircraft[0]);
    expect(mocks.hgetAsJson.mock.calls.length).toBe(1);
    expect(mocks.hgetAsJson.mock.calls[0][0]).toBe(VALID_AIRCRAFT_STORE);
    expect(mocks.hgetAsJson.mock.calls[0][1]).toBe('foo');
  });

  test('it gets total aircraft count', async () => {
    const res = await store.getTotalAircraftCount();

    expect(res).toBe(15);
    expect(mocks.hlen.mock.calls.length).toBe(1);
    expect(mocks.hlen.mock.calls[0][0]).toBe(ALL_AIRCRAFT_STORE);
  });

  test('it gets valid valid aircraft count', async () => {
    const res = await store.getValidAircraftCount();

    expect(res).toBe(15);
    expect(mocks.hlen.mock.calls.length).toBe(1);
    expect(mocks.hlen.mock.calls[0][0]).toBe(VALID_AIRCRAFT_STORE);
  });
});
