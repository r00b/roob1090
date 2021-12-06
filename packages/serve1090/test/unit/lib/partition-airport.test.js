const { mockAirport, mockAircraft } = require('../../support/mock-data');
const { ACTIVE_RUNWAY } = require('../../../src/lib/redis-keys');
const lib = require('../../../src/lib/partition-airport');

jest.mock(
  '../../../src/lib/logger',
  () => () => require('../../support/mock-logger')
);

describe('partition-airport', () => {
  let airport, aircraft, partitionAirport;

  const mockStore = {
    getValidAircraft: jest.fn(),
  };
  const mockRedis = {
    pipeline: jest.fn(),
    saddEx: jest.fn(),
    exec: jest.fn(),
    ttl: jest.fn(),
    setex: jest.fn(),
  };
  const mockMongo = {
    getAirport: jest.fn(),
  };

  beforeEach(() => {
    partitionAirport = lib(mockStore, mockRedis, mockMongo);

    // see mock-data for visual description of airport and aircraft locations
    airport = mockAirport();
    aircraft = mockAircraft();

    mockStore.getValidAircraft.mockReturnValue({
      aircraft: Object.values(aircraft),
    });
    mockRedis.pipeline.mockReturnValue(mockRedis);
    mockMongo.getAirport.mockReturnValue(airport);
  });

  afterEach(() => {
    Object.values(mockStore).forEach(m => m.mockReset());
    Object.values(mockRedis).forEach(m => m.mockReset());
    Object.values(mockMongo).forEach(m => m.mockReset());
  });

  test('computes and writes airport partition without active runways', async () => {
    const { ac1, ac2, ac3, ac4, ac5, ac6, ac7 } = aircraft;
    const result = await partitionAirport(airport.ident);

    expect(result).toEqual({
      aircraft: {
        airspace1: [ac1, ac2, ac3],
        airspace2: [ac6, ac7],
        runway1: [ac4, ac5],
      },
      activeRunways: [],
    });
    expect(mockRedis.pipeline.mock.calls.length).toBe(1);
    expect(mockRedis.saddEx.mock.calls.length).toBe(3);
    expect(mockRedis.exec.mock.calls.length).toBe(1);
    expect(mockRedis.setex.mock.calls.length).toBe(0);
  });

  test('computes single active runway with sample on runway', async () => {
    const { ac4 } = aircraft;
    ac4.track = 233;
    mockRedis.ttl.mockReturnValueOnce(-2);

    const result = await partitionAirport(airport.ident);

    expect(result.activeRunways).toEqual([
      {
        runway: 'runway1',
        sample: ac4,
        surface: '24',
      },
    ]);
    expect(mockRedis.ttl.mock.calls.length).toBe(1);
    expect(mockRedis.setex.mock.calls.length).toBe(1);
    expect(mockRedis.setex.mock.calls[0][0]).toBe(ACTIVE_RUNWAY('runway1'));
    expect(mockRedis.setex.mock.calls[0][2]).toBe('24');
  });

  test('computes single active runway with first sample in airspace', async () => {
    const { ac1, ac2, ac6 } = aircraft;
    ac1.track = 0;
    ac2.track = 55;
    ac6.track = 55;
    mockStore.getValidAircraft.mockReturnValueOnce({
      aircraft: [ac1, ac2, ac6],
    });
    mockRedis.ttl.mockReturnValueOnce(-2);

    const result = await partitionAirport(airport.ident);

    expect(result.activeRunways).toEqual([
      {
        runway: 'runway1',
        sample: ac2,
        surface: '06',
      },
    ]);
    expect(mockRedis.ttl.mock.calls.length).toBe(1);
    expect(mockRedis.setex.mock.calls.length).toBe(1);
    expect(mockRedis.setex.mock.calls[0][0]).toBe(ACTIVE_RUNWAY('runway1'));
    expect(mockRedis.setex.mock.calls[0][2]).toBe('06');
  });

  test('picks surface with closest centerline to sample', async () => {
    const { ac4 } = aircraft;
    // one surface with true heading of 240, the other with 250
    airport.runways[0].surfaces[0].trueHeading = 180;
    airport.runways[0].surfaces[1].trueHeading = 190;
    ac4.track = 184;

    let result = await partitionAirport(airport.ident);
    expect(result.activeRunways).toEqual([
      {
        runway: 'runway1',
        sample: ac4,
        surface: '24',
      },
    ]);

    ac4.track = 185;
    result = await partitionAirport(airport.ident);
    expect(result.activeRunways).toEqual([
      {
        runway: 'runway1',
        sample: ac4,
        surface: '24',
      },
    ]);

    ac4.track = 186;
    result = await partitionAirport(airport.ident);
    expect(result.activeRunways).toEqual([
      {
        runway: 'runway1',
        sample: ac4,
        surface: '06',
      },
    ]);
  });

  test('does not write active runway to redis before RUNWAY_RECHECK', async () => {
    aircraft.ac4.track = 233;
    mockRedis.ttl
      // want RUNWAY_TTL - ttl to be less than RUNWAY_RECHECK
      // 28800 - 899 = 27901; 28800 - 27901 = 899 which is less than RUNWAY_RECHECK
      .mockReturnValueOnce(28800 - 899);

    await partitionAirport(airport.ident);

    expect(mockRedis.ttl.mock.calls.length).toBe(1);
    expect(mockRedis.setex.mock.calls.length).toBe(0);
  });

  test('computes multiple active runways', async () => {
    const { ac4, ac10 } = aircraft;
    ac4.track = 233;
    ac10.track = 185;

    mockRedis.ttl.mockReturnValue(-2);

    airport = mockAirport(true);
    mockMongo.getAirport.mockReturnValue(airport);

    const result = await partitionAirport(airport.ident);

    expect(result.aircraft.runway2).toEqual([ac10]);
    expect(result.activeRunways).toEqual([
      {
        runway: 'runway1',
        sample: ac4,
        surface: '24',
      },
      {
        runway: 'runway2',
        sample: ac10,
        surface: '19',
      },
    ]);
    expect(mockRedis.ttl.mock.calls.length).toBe(2);
    expect(mockRedis.setex.mock.calls.length).toBe(2);
    expect(mockRedis.setex.mock.calls[0][0]).toBe(ACTIVE_RUNWAY('runway1'));
    expect(mockRedis.setex.mock.calls[0][2]).toBe('24');
    expect(mockRedis.setex.mock.calls[1][0]).toBe(ACTIVE_RUNWAY('runway2'));
    expect(mockRedis.setex.mock.calls[1][2]).toBe('19');
  });

  test('handles no aircraft', async () => {
    mockStore.getValidAircraft.mockReturnValueOnce({ aircraft: [] });

    const result = await partitionAirport(airport.ident);

    expect(result).toEqual({
      aircraft: {},
      activeRunways: [],
    });
    expect(mockRedis.pipeline.mock.calls.length).toBe(1);
    expect(mockRedis.saddEx.mock.calls.length).toBe(0);
    expect(mockRedis.exec.mock.calls.length).toBe(1);
  });

  test('handles store error', async () => {
    mockStore.getValidAircraft.mockImplementationOnce(() => {
      throw new Error('this should have been caught');
    });

    const result = await partitionAirport(airport.ident);

    expect(result).toBeFalsy();
  });

  test('handles missing airport', async () => {
    mockMongo.getAirport.mockReturnValueOnce(null);

    const result = await partitionAirport(airport.ident);
    expect(result).toBeFalsy();
  });

  test('handles mongo error', async () => {
    mockMongo.getAirport.mockImplementationOnce(() => {
      throw new Error('this should have been caught');
    });

    const result = await partitionAirport(airport.ident);
    expect(result).toBeFalsy();
  });

  test('handles redis write error', async () => {
    mockRedis.saddEx.mockImplementationOnce(() => {
      throw new Error('this should have been caught');
    });

    const result = await partitionAirport(airport.ident);
    expect(result).toBeTruthy();
  });
});
