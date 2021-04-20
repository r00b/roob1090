const mockLogger = require('../../support/mock-logger');
const airportBoard = require('../../../src/lib/airport-board');

describe('airport-board', () => {
  const mockStore = {
    getValidAircraft: jest.fn()
  };

  const mockRedis = {
    get: jest.fn(),
    smembers: jest.fn(),
    pipeline: jest.fn(),
    exec: jest.fn(),
    saddEx: jest.fn(),
    setex: jest.fn(),
    hgetJson: jest.fn()
  };

  const { computeAirportBoard } = airportBoard(mockStore, mockRedis, mockLogger);

  let route, airport;

  // route:
  //
  // (0,50)     (50,50)      (100,50)    (150,50)
  //  _______________________________________
  // |             |            |            |
  // |   region1   |   runway   |  region2   |
  // |             |            |            |
  //  ---------------------------------------
  // (0,0)       (50,0)       (100,0)     (150,0)
  //      ac1           ac4 (arr)     ac6              ac9 - outside route
  //      ac2           ac5 (dep)     ac7
  //      ac3                         ac8 (too high)

  const aircraft = {
    ac1: {
      hex: 'ac1',
      alt_baro: 500,
      lon: 0,
      lat: 0
    },
    ac2: {
      hex: 'ac2',
      alt_baro: 500,
      lon: 25,
      lat: 25
    },
    ac3: {
      hex: 'ac3',
      alt_baro: 250,
      lon: 45,
      lat: 45
    },
    ac4: {
      hex: 'ac4',
      alt_baro: 250,
      lon: 75,
      lat: 25
    },
    ac5: {
      hex: 'ac5',
      alt_baro: 250,
      lon: 75,
      lat: 25
    },
    ac6: {
      hex: 'ac6',
      alt_baro: 500,
      lon: 125,
      lat: 25
    },
    ac7: {
      hex: 'ac7',
      alt_baro: 500,
      lon: 145,
      lat: 20
    },
    ac8: {
      hex: 'ac8',
      alt_baro: 50000,
      lon: 125,
      lat: 25
    },
    ac9: {
      hex: 'ac9',
      alt_baro: 500,
      lon: 200,
      lat: 25
    }
  };

  const region1 = {
    key: 'region1Key',
    ceiling: 10000,
    boundary: [[
      [0, 0],
      [50, 0],
      [50, 50],
      [0, 50],
      [0, 0]
    ]]
  };

  const runway = {
    key: 'runwayKey',
    ceiling: 500,
    boundary: [[
      [50, 0],
      [100, 0],
      [100, 50],
      [50, 50],
      [50, 0]
    ]]
  };

  const region2 = {
    key: 'region2Key',
    ceiling: 10000,
    boundary: [[
      [100, 0],
      [150, 0],
      [150, 50],
      [100, 50],
      [100, 0]
    ]]
  };

  function store (aircraftHashes) {
    return {
      now: Date.now(),
      count: aircraftHashes.length,
      aircraft: aircraftHashes
    };
  }

  beforeEach(() => {
    route = {
      key: 'routeKey',
      parentKey: 'airportKey',
      regions: [region1, region2],
      runway,
      getApproachRouteKey: (runway) => region1.key,
      getDepartureRouteKey: (runway) => region2.key
    };

    airport = {
      key: 'airportKey',
      locus: [75, 25],
      routes: [route]
    };

    // called by partition-aircraft
    mockRedis
      .smembers
      .mockReturnValue([aircraft.ac4.hex]);
    mockRedis
      .pipeline
      .mockReturnValue(mockRedis);
  });

  afterEach(() => {
    mockStore.getValidAircraft.mockReset();
    mockRedis.get.mockReset();
    mockRedis.smembers.mockReset();
    mockRedis.pipeline.mockReset();
    mockRedis.exec.mockReset();
    mockRedis.saddEx.mockReset();
    mockRedis.setex.mockReset();
    mockRedis.hgetJson.mockReset();
  });

  test('computes aircraft board', async () => {
    const { ac1, ac4, ac5, ac6, ac8, ac9 } = aircraft;
    mockStore
      .getValidAircraft
      .mockReturnValueOnce(store([ac1, ac4, ac5, ac6, ac8, ac9]));
    mockRedis
      .get
      .mockReturnValueOnce('24');

    const expectedBoard = {
      arriving: [ac1],
      arrived: [ac4],
      departing: [ac5],
      departed: [ac6],
      onRunway: [ac4, ac5],
      activeRunways: ['24']
    };

    const result = await computeAirportBoard(airport);
    expect(result).toEqual(expectedBoard);
  });

  test('computes and sorts aircraft board for multiple aircraft', async () => {
    const { ac1, ac2, ac3, ac4, ac5, ac6, ac7, ac8, ac9 } = aircraft;
    mockStore
      .getValidAircraft
      .mockReturnValueOnce(store([ac1, ac2, ac3, ac4, ac5, ac6, ac7, ac8, ac9]));
    mockRedis
      .get
      .mockReturnValueOnce('24');

    const expectedBoard = {
      arriving: [ac3, ac2, ac1], // note sort
      arrived: [ac4],
      departing: [ac5],
      departed: [ac6, ac7],
      onRunway: [ac4, ac5],
      activeRunways: ['24']
    };

    const result = await computeAirportBoard(airport);
    expect(result).toEqual(expectedBoard);
  });

  test('enriches aircraft board', async () => {
    const { ac1, ac4, ac5, ac6, ac8, ac9 } = aircraft;
    mockStore
      .getValidAircraft
      .mockReturnValueOnce(store([ac1, ac4, ac5, ac6, ac8, ac9]));
    mockRedis
      .get
      .mockReturnValueOnce('24');
    mockRedis
      .hgetJson
      .mockImplementation((key, hex) => {
        expect(key).toBe('enrichments');
        switch (hex) {
          case 'ac1':
            return {
              foo: 'bar'
            };
          case 'ac5':
            return {
              bar: 'baz'
            };
          default:
            return null;
        }
      });

    const expectedBoard = {
      arriving: [{ ...ac1, foo: 'bar' }],
      arrived: [ac4],
      departing: [ac5],
      departed: [ac6],
      onRunway: [ac4, { ...ac5, bar: 'baz' }],
      activeRunways: ['24']
    };

    const result = await computeAirportBoard(airport);
    expect(result).toEqual(expectedBoard);
  });

  test('makes expected calls to redis and store when computing aircraft board', async () => {
    const { ac1, ac2, ac3, ac4, ac5, ac6, ac7, ac8, ac9 } = aircraft;
    mockStore
      .getValidAircraft
      .mockReturnValueOnce(store([ac1, ac2, ac3, ac4, ac5, ac6, ac7, ac8, ac9]));
    mockRedis
      .get
      .mockReturnValueOnce('24');

    const result = await computeAirportBoard(airport);
    expect(result).toBeTruthy();

    // gets valid aircraft from store
    expect(mockStore.getValidAircraft.mock.calls.length).toBe(1);
    // gets active runway
    expect(mockRedis.get.mock.calls.length).toBe(1);
    expect(mockRedis.get.mock.calls[0][0]).toBe('routeKey:activeRunway');

    // one pipeline for writing partitions (consumed by active-runway),
    // one pipeline for writing the route (consumed by partition-aircraft for runway),
    // one pipeline for writing the airport board
    expect(mockRedis.pipeline.mock.calls.length).toBe(3);
    expect(mockRedis.exec.mock.calls.length).toBe(3);

    // expect 1 setex call from board write
    expect(mockRedis.setex.mock.calls.length).toBe(1);
    const boardSetex = mockRedis.setex.mock.calls[0];
    expect(boardSetex[0]).toBe('airportKey:board');
    const expectedBoard = {
      arriving: [ac3, ac2, ac1],
      arrived: [ac4],
      departing: [ac5],
      departed: [ac6, ac7],
      onRunway: [ac4, ac5],
      activeRunways: ['24']
    };
    expect(boardSetex[2]).toBe(JSON.stringify(expectedBoard));

    // expect 3 saddEx calls from partition write, 2 calls from route
    // write, and 2 calls from board write -> 7 total calls
    expect(mockRedis.saddEx.mock.calls.length).toBe(7);
    // partition write
    const partitionWrites = mockRedis.saddEx.mock.calls.slice(0, 3);
    expect(partitionWrites.map(args => args[0])).toEqual([
      'runwayKey:aircraft',
      'region1Key:aircraft',
      'region2Key:aircraft'
    ]);
    expect(partitionWrites.map(args => args.slice(2))).toEqual([
      ['ac4', 'ac5'],
      ['ac1', 'ac2', 'ac3'],
      ['ac6', 'ac7']
    ]);
    // route write
    const routeWrites = mockRedis.saddEx.mock.calls.slice(3, 5);
    expect(routeWrites.map(args => args[0])).toEqual([
      'routeKey:arrivals',
      'routeKey:departures'
    ]);
    expect(routeWrites.map(args => args.slice(2))).toEqual([
      ['ac4', 'ac1', 'ac2', 'ac3'],
      ['ac5', 'ac6', 'ac7']
    ]);

    // board write
    const boardSaddExs = mockRedis.saddEx.mock.calls.slice(5);
    expect(boardSaddExs.map(args => args[0])).toEqual([
      'airportKey:arrivals',
      'airportKey:departures'
    ]);
    expect(boardSaddExs.map(args => args.slice(2))).toEqual([
      ['ac4', 'ac3', 'ac2', 'ac1'],
      ['ac5', 'ac6', 'ac7']
    ]);
  });

  test('only includes valid aircraft in aircraft board', async () => {
    const { ac2, ac4, ac7, ac8 } = aircraft;
    mockStore
      .getValidAircraft
      .mockReturnValueOnce(store([ac2, ac4, ac7, ac8]));
    mockRedis
      .get
      .mockReturnValueOnce('24');

    const result = await computeAirportBoard(airport);
    expect(result).toEqual({
      arriving: [ac2],
      arrived: [ac4],
      departing: [],
      departed: [ac7],
      onRunway: [ac4],
      activeRunways: ['24']
    });
  });

  test('handles empty aircraft store', async () => {
    mockStore
      .getValidAircraft
      .mockReturnValueOnce(store([]));
    const result = await computeAirportBoard(airport);
    expect(result).toBeUndefined();
  });

  test('handles no active runway', async () => {
    mockStore
      .getValidAircraft
      .mockReturnValueOnce(store(Object.values(aircraft)));
    mockRedis
      .get
      .mockReturnValueOnce(null);

    const result = await computeAirportBoard(airport);
    expect(result).toBeUndefined();
  });

  test('handles failure to compute approach/departure route', async () => {
    mockStore
      .getValidAircraft
      .mockReturnValueOnce(store(Object.values(aircraft)));
    mockRedis
      .get
      .mockReturnValueOnce('24');

    route.getApproachRouteKey = () => false;
    route.getDepartureRouteKey = () => region2.key;
    let result = await computeAirportBoard(airport);
    expect(result).toBeUndefined();

    route.getApproachRouteKey = () => region1.key;
    route.getDepartureRouteKey = () => false;
    result = await computeAirportBoard(airport);
    expect(result).toBeUndefined();
  });

  test('handles failure to find computed routes in partition', async () => {
    mockStore
      .getValidAircraft
      .mockReturnValueOnce(store(Object.values(aircraft)));
    mockRedis
      .get
      .mockReturnValueOnce('24');

    route.getApproachRouteKey = () => 'random';
    route.getDepartureRouteKey = () => region2.key;
    let result = await computeAirportBoard(airport);
    expect(result).toBeUndefined();

    route.getApproachRouteKey = () => region1.key;
    route.getDepartureRouteKey = () => 'random';
    result = await computeAirportBoard(airport);
    expect(result).toBeUndefined();
  });
});

