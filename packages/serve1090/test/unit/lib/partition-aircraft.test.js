const mockLogger = require('../../support/mock-logger');
const partitionAircraft = require('../../../src/lib/partition-aircraft');

describe('partition aircraft', () => {
  describe('getAndWriteAircraftInRegion', () => {
    const mockRedis = {
      saddEx: jest.fn()
    };

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
      alt_baro: 50,
      lon: 25,
      lat: 25
    };
    const inRegion2 = {
      hex: 'c12afe',
        alt_baro: 50,
      lon: 30,
      lat: 30
    };
    const outsideRegion = {
      hex: 'bcba89',
      alt_baro: 50,
      lon: 170,
      lat: 170
    };
    const tooHigh = {
      hex: 'abf901',
      alt_baro: 50000,
      lon: 30,
      lat: 30
    }

    const { getAndWriteAircraftInRegion } = partitionAircraft(mockRedis, mockLogger);

    beforeEach(() => {
      aircraftHashes = [];
    });

    afterEach(() => {
      mockRedis.saddEx.mockReset();
    });

    test('gets single aircraft in a region and writes it to redis', async () => {
      aircraftHashes.push(inRegion);
      const result = await getAndWriteAircraftInRegion(aircraftHashes, region);

      expect(result).toEqual([inRegion]);
      expect(mockRedis.saddEx.mock.calls.length).toBe(1);
      expect(mockRedis.saddEx.mock.calls[0][0]).toBe('kvkx:aircraft');
      expect(mockRedis.saddEx.mock.calls[0].slice(2)).toEqual(['a9bb8b']);
    });

    test('gets multiple aircraft in a region and writes it to redis', async () => {
      aircraftHashes.push(inRegion, inRegion2);
      const result = await getAndWriteAircraftInRegion(aircraftHashes, region);

      expect(result).toEqual([inRegion, inRegion2]);
      expect(mockRedis.saddEx.mock.calls.length).toBe(1);
      expect(mockRedis.saddEx.mock.calls[0][0]).toBe('kvkx:aircraft');
      expect(mockRedis.saddEx.mock.calls[0].slice(2)).toEqual(['a9bb8b', 'c12afe']);
    });

    test('gets multiple aircraft within and outside of a region and writes them to redis', async () => {
      aircraftHashes.push(inRegion, inRegion2, outsideRegion, tooHigh);

      const result = await getAndWriteAircraftInRegion(aircraftHashes, region);
      expect(result).toEqual([inRegion, inRegion2]);
      expect(mockRedis.saddEx.mock.calls.length).toBe(1);
      expect(mockRedis.saddEx.mock.calls[0][0]).toBe('kvkx:aircraft');
      expect(mockRedis.saddEx.mock.calls[0].slice(2)).toEqual(['a9bb8b', 'c12afe']);
    });

    test('handles errors', async () => {
      mockRedis
        .saddEx
        .mockImplementation(() => {
          throw new Error('this should have been caught');
        });

      const result = await getAndWriteAircraftInRegion(aircraftHashes, region);
      expect(result).toBeUndefined();
      expect(mockRedis.saddEx.mock.calls.length).toBe(1);
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
          alt_baro: 50,
          lon: -45,
          lat: 65
        },
        {
          hex: 'b',
          alt_baro: 50,
          lon: 0,
          lat: 25
        },
        {
          hex: 'c',
          alt_baro: 50,
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
          alt_baro: 50,
          lon: -45,
          lat: 65
        },
        {
          hex: 'b',
          alt_baro: 50,
          lon: 0,
          lat: 0
        },
        {
          hex: 'c',
          alt_baro: 50,
          lon: 50,
          lat: 50
        },
        {
          hex: 'd',
          alt_baro: 50,
          lon: 25,
          lat: 50
        }
      ];

      const aircraftInRegion = getAircraftInRegion(aircraftHashes, region);
      expect(aircraftInRegion).toEqual([aircraftHashes[1], aircraftHashes[2], aircraftHashes[3]]);
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
          alt_baro: 50,
          lon: -45,
          lat: 65
        },
        {
          hex: 'b',
          alt_baro: 50,
          lon: 0,
          lat: 25
        },
        {
          hex: 'c',
          alt_baro: 50000,
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
          alt_baro: 50,
          lon: -65,
          lat: 65
        },
        {
          hex: 'b',
          alt_baro: 50,
          lon: 0,
          lat: 110
        }
      ];

      const aircraftInRegion = getAircraftInRegion(aircraftHashes, region);
      expect(aircraftInRegion).toEqual([]);
    });
  });
});