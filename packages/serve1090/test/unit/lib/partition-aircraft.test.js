const mockLogger = require('../../support/mock-logger');
const { ARRIVALS } = require('../../../src/lib/redis-keys');

const partitionAircraft = require('../../../src/lib/partition-aircraft');

describe('partition aircraft', () => {
  describe('partitionAircraftInRegion', () => {
    const { partitionAircraftInRegion } = partitionAircraft({}, mockLogger);

    const region = {
      key: 'kvkx',
      ceiling: 10000,
      boundary: [[
        [0, 0],
        [0, 50],
        [50, 50],
        [50, 0],
        [0, 0]
      ]]
    };

    let aircraftHashes;

    const inRegion = {
      hex: 'a9bb8b',
      altBaro: 50,
      lon: 25,
      lat: 25
    };
    const inRegion2 = {
      hex: 'c12afe',
      altBaro: 50,
      lon: 30,
      lat: 30
    };
    const outsideRegion = {
      hex: 'bcba89',
      altBaro: 50,
      lon: 170,
      lat: 170
    };
    const tooHigh = {
      hex: 'abf901',
      altBaro: 50000,
      lon: 30,
      lat: 30
    };

    beforeEach(() => {
      aircraftHashes = [];
    });

    test('gets single aircraft in a region', () => {
      aircraftHashes.push(inRegion);
      const result = partitionAircraftInRegion(aircraftHashes, region);
      expect(result).toEqual([inRegion]);
    });

    test('gets multiple aircraft in a region', () => {
      aircraftHashes.push(inRegion, inRegion2);
      const result = partitionAircraftInRegion(aircraftHashes, region);
      expect(result).toEqual([inRegion, inRegion2]);
    });

    test('gets multiple aircraft within and outside of a region', () => {
      aircraftHashes.push(inRegion, inRegion2, outsideRegion, tooHigh);
      const result = partitionAircraftInRegion(aircraftHashes, region);
      expect(result).toEqual([inRegion, inRegion2]);
    });

    test('throws errors', () => {
      expect(() => partitionAircraftInRegion([null], region)).toThrowError();
      expect(() => partitionAircraftInRegion([inRegion], null)).toThrowError();
      expect(() => partitionAircraftInRegion([inRegion], {})).toThrowError();
      expect(() => partitionAircraftInRegion([null], {})).toThrowError();
    });
  });

  describe('partitionAircraftInRunway', () => {
    const route = { key: 'kvkx' };
    let onRunway;

    const mockRedis = {
      smembers: jest.fn()
    };

    const { partitionAircraftInRunway } = partitionAircraft(mockRedis, mockLogger);

    const arrival = {
      hex: 'a9bb8b'
    };
    const nonArrival1 = {
      hex: 'c12afe'
    };
    const nonArrival2 = {
      hex: 'bcba89'
    };

    beforeEach(() => {
      onRunway = [];
    });

    afterEach(() => {
      Object.values(mockRedis).forEach(m => m.mockReset());
    });

    test('partitions aircraft into arrivals and departures', async () => {
      mockRedis
        .smembers
        .mockImplementation((key) => [arrival.hex]);

      onRunway = [arrival, nonArrival1, nonArrival2];
      const { arrived, departing } = await partitionAircraftInRunway(onRunway, route.key);

      expect(arrived).toEqual([arrival]);
      expect(departing).toEqual([nonArrival1, nonArrival2]);
      expect(mockRedis.smembers.mock.calls[0][0]).toBe(ARRIVALS(route.key));
    });

    test('handles empty array', async () => {
      const { arrived, departing } = await partitionAircraftInRunway([], route.key);

      expect(arrived).toEqual([]);
      expect(departing).toEqual([]);
      expect(mockRedis.smembers.mock.calls.length).toBeFalsy();
    });

    test('handles no arrivals', async () => {
      mockRedis
        .smembers
        .mockImplementation((key) => []);

      onRunway = [arrival, nonArrival1, nonArrival2];
      const { arrived, departing } = await partitionAircraftInRunway(onRunway, route.key);

      expect(arrived).toEqual([]);
      expect(departing).toEqual([arrival, nonArrival1, nonArrival2]);
      expect(mockRedis.smembers.mock.calls[0][0]).toBe(ARRIVALS(route.key));
    });

    test('handles empty runway', async () => {
      const { arrived, departing } = await partitionAircraftInRunway([], route.key);

      expect(arrived).toEqual([]);
      expect(departing).toEqual([]);
      expect(mockRedis.smembers.mock.calls.length).toBe(0);
    });

    test('handles errors', async () => {
      mockRedis
        .smembers
        .mockImplementation(() => {
          throw new Error('this should have been caught');
        });

      await expect(partitionAircraftInRunway([arrival], undefined)).rejects.toThrowError();
    });

    test('throws error on malformed params', async () => {
      await expect(partitionAircraftInRunway([arrival])).rejects.toThrowError();
    });
  });

  describe('getAircraftInRegion', () => {
    const { getAircraftInRegion } = partitionAircraft({}, mockLogger);

    test('gets aircraft located in a region', () => {
      const region = {
        key: 'kvkx',
        ceiling: 10000,
        boundary: [[
          [-50, 50],
          [-50, 100],
          [50, 100],
          [50, 50],
          [-50, 50]
        ]]
      };
      const aircraftHashes = [
        {
          hex: 'a',
          altBaro: 50,
          lon: -45,
          lat: 65
        },
        {
          hex: 'b',
          altBaro: 50,
          lon: 0,
          lat: 25
        },
        {
          hex: 'c',
          altBaro: 50,
          lon: 25,
          lat: 99
        }
      ];

      let aircraftInRegion = getAircraftInRegion(aircraftHashes, region);
      expect(aircraftInRegion).toEqual([aircraftHashes[0], aircraftHashes[2]]);

      region.boundary = [[
        [0, 0],
        [0, 50],
        [50, 50],
        [50, 0],
        [0, 0]
      ]];

      aircraftInRegion = getAircraftInRegion(aircraftHashes, region);
      expect(aircraftInRegion).toEqual([aircraftHashes[1]]);
    });

    test('gets aircraft located on a region\'s edges', () => {
      const region = {
        key: 'kvkx',
        ceiling: 10000,
        boundary: [[
          [0, 0],
          [0, 50],
          [50, 50],
          [50, 0],
          [0, 0]
        ]]
      };
      const aircraftHashes = [
        {
          hex: 'a',
          altBaro: 50,
          lon: -45,
          lat: 65
        },
        {
          hex: 'b',
          altBaro: 50,
          lon: 0,
          lat: 0
        },
        {
          hex: 'c',
          altBaro: 50,
          lon: 50,
          lat: 50
        },
        {
          hex: 'd',
          altBaro: 50,
          lon: 25,
          lat: 50
        },
        {
          hex: 'e',
          altBaro: 10000, // at ceiling
          lon: 25,
          lat: 50
        }
      ];

      const aircraftInRegion = getAircraftInRegion(aircraftHashes, region);
      expect(aircraftInRegion).toEqual(aircraftHashes.slice(1));
    });

    test('only gets aircraft located under a region\'s ceiling', () => {
      const region = {
        key: 'kvkx',
        ceiling: 10000,
        boundary: [[
          [-50, 50],
          [-50, 100],
          [50, 100],
          [50, 50],
          [-50, 50]
        ]]
      };
      const aircraftHashes = [
        {
          hex: 'a',
          altBaro: 50,
          lon: -45,
          lat: 65
        },
        {
          hex: 'b',
          altBaro: 50,
          lon: 0,
          lat: 25
        },
        {
          hex: 'c',
          altBaro: 50000,
          lon: 25,
          lat: 99
        }
      ];

      const aircraftInRegion = getAircraftInRegion(aircraftHashes, region);
      expect(aircraftInRegion).toEqual([aircraftHashes[0]]);
    });

    test('handles a region without any aircraft', () => {
      const region = {
        key: 'kvkx',
        ceiling: 10000,
        boundary: [[
          [-50, 50],
          [-50, 100],
          [50, 100],
          [50, 50],
          [-50, 50]
        ]]
      };
      const aircraftHashes = [
        {
          hex: 'a',
          altBaro: 50,
          lon: -65,
          lat: 65
        },
        {
          hex: 'b',
          altBaro: 50,
          lon: 0,
          lat: 110
        }
      ];

      const aircraftInRegion = getAircraftInRegion(aircraftHashes, region);
      expect(aircraftInRegion).toEqual([]);
    });
  });
});
