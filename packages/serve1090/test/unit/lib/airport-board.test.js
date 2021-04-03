const mockLogger = require('../../support/mock-logger');
const airportBoard = require('../../../src/lib/airport-board');

describe('airport-board', () => {
  const mockStore = {
    getValidAircraft: jest.fn()
  };

  const mockRedis = {
    get: jest.fn(),
    zmembers: jest.fn(),
    execPipeline: jest.fn()
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
      .zmembers
      .mockReturnValue([aircraft.ac4.hex]);
    mockRedis
      .execPipeline
      .mockResolvedValue(true);
  });

  afterEach(() => {
    mockStore.getValidAircraft.mockReset();
    mockRedis.get.mockReset();
    mockRedis.zmembers.mockReset();
    mockRedis.execPipeline.mockReset();
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
    expect(mockRedis.get.mock.calls[0][0]).toBe('airportKey:routeKey:activeRunway');

    // one pipeline for writing partitions, one pipeline for writing the board
    const execPipelineCalls = mockRedis.execPipeline.mock.calls;
    expect(execPipelineCalls.length).toBe(2);

    // writing partition
    const partitionWrites = execPipelineCalls[0][0];
    expect(partitionWrites.length).toBe(3);
    expect(partitionWrites.map(c => c.op)).toEqual([
      'saddEx',
      'saddEx',
      'saddEx'
    ]);
    expect(partitionWrites.map(c => c.args[0])).toEqual([
      'airportKey:routeKey:runwayKey:aircraft',
      'airportKey:routeKey:region1Key:aircraft',
      'airportKey:routeKey:region2Key:aircraft'
    ]);
    expect(partitionWrites.map(c => c.args.slice(2))).toEqual([
      ['ac4', 'ac5'],
      ['ac1', 'ac2', 'ac3'],
      ['ac6', 'ac7']
    ]);

    const boardWrites = execPipelineCalls[1][0];
    // writing arrivals, departures, board
    const expectedBoard = {
      arriving: [ac3, ac2, ac1],
      arrived: [ac4],
      departing: [ac5],
      departed: [ac6, ac7],
      onRunway: [ac4, ac5],
      activeRunways: ['24']
    };
    expect(boardWrites.length).toBe(3);
    expect(boardWrites.map(c => c.op)).toEqual([
      'saddEx',
      'saddEx',
      'setex'
    ]);
    expect(boardWrites.map(c => c.args[0])).toEqual([
      'airportKey:arrivals',
      'airportKey:departures',
      'airportKey:board'
    ]);
    expect(boardWrites.map(c => c.args.slice(2))).toEqual([
      ['ac4', 'ac3', 'ac2', 'ac1'],
      ['ac5', 'ac6', 'ac7'],
      [JSON.stringify(expectedBoard)]
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

