const _ = require('lodash');
const mockLogger = require('../../support/mock-logger');
const { mockAirport, mockAircraft } = require('../../support/mock-data');
const {
  BOARD,
  ARRIVALS,
  DEPARTURES,
  REGION_AIRCRAFT,
  ENRICHMENTS,
} = require('../../../src/lib/redis-keys');
const airportBoard = require('../../../src/lib/airport-board');

describe('airport-board', () => {
  let computeAirportBoard, airport, aircraft;

  const mockStore = {
    getValidAircraftMap: jest.fn(),
  };
  const mockRedis = {
    get: jest.fn(),
    smembers: jest.fn(),
    hgetAsJson: jest.fn(),
    pipeline: jest.fn(),
    saddEx: jest.fn(),
    setex: jest.fn(),
    exec: jest.fn(),
  };
  const mockMongo = {
    getAirport: jest.fn(),
  };

  // see mock-data for visual description of airport and aircraft locations

  function simpleAirport(airport, aircraft) {
    const { ac1, ac2, ac3, ac4, ac5, ac6, ac7, ac8, ac10 } = aircraft;
    return key => {
      switch (key) {
        case REGION_AIRCRAFT('airspace1'):
          return [ac1.hex, ac2.hex, ac3.hex];
        case REGION_AIRCRAFT('runway1'):
          return [ac4.hex, ac5.hex];
        case REGION_AIRCRAFT('airspace2'):
          return [ac6.hex, ac7.hex];
        case ARRIVALS(airport.ident):
          return [ac4.hex];
        default:
          return [];
      }
    };
  }

  function complexAirport(airport, aircraft) {
    const { ac1, ac2, ac3, ac4, ac5, ac6, ac7, ac10 } = aircraft;
    return key => {
      switch (key) {
        case REGION_AIRCRAFT('airspace1'):
          return [ac1.hex, ac2.hex, ac3.hex];
        case REGION_AIRCRAFT('runway1'):
          return [ac4.hex, ac5.hex];
        case REGION_AIRCRAFT('airspace2'):
          return [ac6.hex, ac7.hex];
        case REGION_AIRCRAFT('runway2'):
          return [ac10.hex];
        case ARRIVALS(airport.ident):
          return [ac4.hex, ac10.hex];
        default:
          return [];
      }
    };
  }

  beforeEach(() => {
    computeAirportBoard = airportBoard(
      mockStore,
      mockRedis,
      mockMongo,
      mockLogger
    );
    airport = mockAirport();
    aircraft = mockAircraft();

    mockStore.getValidAircraftMap.mockReturnValue({ aircraft });
    mockRedis.pipeline.mockReturnValue(mockRedis);
    mockMongo.getAirport.mockReturnValue(airport);
  });

  afterEach(() => {
    Object.values(mockStore).forEach(m => m.mockReset());
    Object.values(mockRedis).forEach(m => m.mockReset());
    Object.values(mockMongo).forEach(m => m.mockReset());
  });

  test('computes, sorts, and writes airport board for airport with single runway', async () => {
    const { ac1, ac2, ac3, ac4, ac5, ac6, ac7 } = aircraft;
    mockRedis.get.mockReturnValueOnce('24');
    mockRedis.smembers.mockImplementation(simpleAirport(airport, aircraft));

    const result = await computeAirportBoard(airport.ident);

    expect(result).toEqual({
      ident: airport.ident,
      arriving: [ac3, ac2, ac1],
      arrived: [ac4],
      departing: [ac5],
      departed: [ac7, ac6],
      onRunway: [ac4, ac5],
      activeRunways: ['24'],
    });

    expect(mockRedis.pipeline.mock.calls.length).toBe(1);

    expect(mockRedis.saddEx.mock.calls.length).toBe(2);
    expect(mockRedis.saddEx.mock.calls[0]).toEqual([
      ARRIVALS(airport.ident),
      60,
      ac4.hex,
      ac3.hex,
      ac2.hex,
      ac1.hex,
    ]);
    expect(mockRedis.saddEx.mock.calls[1]).toEqual([
      DEPARTURES(airport.ident),
      60,
      ac5.hex,
      ac7.hex,
      ac6.hex,
    ]);

    expect(mockRedis.setex.mock.calls.length).toBe(1);
    expect(mockRedis.setex.mock.calls[0]).toEqual([
      BOARD(airport.ident),
      15,
      JSON.stringify(result),
    ]);

    expect(mockRedis.exec.mock.calls.length).toBe(1);
  });

  test('computes, sorts, and writes airport board for airport with multiple runways', async () => {
    const { ac1, ac2, ac3, ac4, ac5, ac6, ac7, ac10 } = aircraft;

    mockRedis.get.mockReturnValueOnce('24').mockReturnValueOnce('01');
    mockRedis.smembers.mockImplementation(complexAirport(airport, aircraft));

    airport = mockAirport(true);
    mockMongo.getAirport.mockReturnValue(airport);

    const result = await computeAirportBoard(airport.ident);

    expect(result).toEqual({
      ident: airport.ident,
      arriving: [ac3, ac2, ac1],
      arrived: [ac4, ac10],
      departing: [ac5],
      departed: [ac7, ac6],
      onRunway: [ac4, ac5, ac10],
      activeRunways: ['01', '24'],
    });

    expect(mockRedis.pipeline.mock.calls.length).toBe(1);
    expect(mockRedis.saddEx.mock.calls.length).toBe(2);
    expect(mockRedis.setex.mock.calls.length).toBe(1);
    expect(mockRedis.exec.mock.calls.length).toBe(1);
  });

  test('fetches enrichments for aircraft', async () => {
    const { ac1, ac2, ac3, ac4, ac5, ac6, ac7 } = aircraft;

    mockRedis.get.mockReturnValueOnce('24');
    mockRedis.smembers.mockImplementation(simpleAirport(airport, aircraft));
    mockRedis.hgetAsJson.mockImplementation((key, hex) => {
      expect(key).toBe(ENRICHMENTS);
      switch (hex) {
        case ac3.hex:
          return {
            model: 'B787',
          };
        case ac4.hex:
          return {
            model: 'C172',
          };
        case ac6.hex:
          return {
            model: 'BE35',
            origin: '5B2',
            destination: '2W5',
          };
        default:
          return null;
      }
    });

    const result = await computeAirportBoard(airport.ident);

    // ac1
    expect(result.arriving[2]).toEqual(ac1);
    // ac2
    expect(result.arriving[1]).toEqual(ac2);
    // ac3
    expect(result.arriving[0].model).toBe('B787');
    // ac4
    expect(result.arrived[0].model).toBe('C172');
    // ac5
    expect(result.departing[0]).toEqual(ac5);
    // ac6
    expect(result.departed[1].model).toBe('BE35');
    expect(result.departed[1].origin).toBe('5B2');
    expect(result.departed[1].destination).toBe('2W5');
    // ac7
    expect(result.departed[0]).toEqual(ac7);

    // called for every aircraft, even the ones that didn't have enrichments
    expect(mockRedis.hgetAsJson.mock.calls.length).toBe(7);
  });

  test('handles no active runway', async () => {
    const { ac4, ac5 } = aircraft;
    mockRedis.get.mockReturnValue(null);
    mockRedis.smembers.mockImplementation(simpleAirport(airport, aircraft));

    const result = await computeAirportBoard(airport.ident);

    expect(result).toEqual({
      ident: airport.ident,
      arriving: null,
      arrived: null,
      departing: null,
      departed: null,
      onRunway: [ac4, ac5],
      activeRunways: null,
      note: 'active runway unknown',
    });

    expect(mockRedis.pipeline.mock.calls.length).toBe(1);
    expect(mockRedis.saddEx.mock.calls.length).toBe(0);
    expect(mockRedis.setex.mock.calls.length).toBe(1);
    expect(mockRedis.exec.mock.calls.length).toBe(1);
  });

  test('handles malformed airport runway surface', async () => {
    mockRedis.get.mockReturnValue('24');
    mockRedis.smembers.mockImplementation(simpleAirport(airport, aircraft));

    delete airport.runways[0].surfaces[0].approachRegionKey;
    mockMongo.getAirport.mockReturnValueOnce(airport);

    let result = await computeAirportBoard(airport.ident);
    expect(result).toBeFalsy();

    airport = mockAirport();
    delete airport.runways[0].surfaces[0].departureRegionKey;
    mockMongo.getAirport.mockReturnValueOnce(airport);

    result = await computeAirportBoard(airport.ident);
    expect(result).toBeFalsy();
  });

  test('handles redis read error', async () => {
    mockRedis.smembers.mockImplementationOnce(() => {
      throw new Error('this should have been caught');
    });

    const result = await computeAirportBoard(airport.ident);
    expect(result).toBeFalsy();
  });

  test('handles redis write error', async () => {
    mockRedis.saddEx.mockImplementationOnce(() => {
      throw new Error('this should have been caught');
    });

    const result = await computeAirportBoard(airport.ident);
    expect(result).toBeTruthy();
  });

  test('handles missing airport', async () => {
    mockMongo.getAirport.mockReturnValueOnce(null);

    const result = await computeAirportBoard(airport.ident);
    expect(result).toBeFalsy();
  });

  test('handles mongo error', async () => {
    mockMongo.getAirport.mockImplementationOnce(() => {
      throw new Error('this should have been caught');
    });

    const result = await computeAirportBoard(airport.ident);
    expect(result).toBeFalsy();
  });
});
