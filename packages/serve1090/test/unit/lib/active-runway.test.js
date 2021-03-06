const mockLogger = require('../../support/mock-logger');
const {
  REGION_AIRCRAFT,
  ACTIVE_RUNWAY
} = require('../../../src/lib/redis-keys');

const activeRunway = require('../../../src/lib/active-runway');

describe('active-runway', () => {
  const mockRedis = {
    setex: jest.fn(),
    smembers: jest.fn(),
    get: jest.fn()
  };

  const mockStore = {
    getValidAircraftWithHex: jest.fn()
  };

  const {
    computeActiveRunway,
    getActiveRunway
  } = activeRunway(mockRedis, mockStore, mockLogger);

  let route;

  beforeEach(() => {
    route = {
      key: 'kvkx:route0624',
      getActiveRunway: () => {
      },
      regions: [
        {
          key: 'kvkx:route0624:north'
        },
        {
          key: 'kvkx:route0624:south'
        }
      ]
    };
  });

  afterEach(() => {
    Object.values(mockStore).forEach(m => m.mockReset());
    Object.values(mockRedis).forEach(m => m.mockReset());
  });

  describe('computeActiveRunway', () => {
    test('computes and stores active runway with candidates from first region', async () => {
      mockRedis
        .smembers
        .mockReturnValueOnce(['a9bb8b']);
      mockStore
        .getValidAircraftWithHex
        .mockReturnValueOnce({ hex: 'a9bb8b' });
      route.getActiveRunway = sample => '24';

      const result = await computeActiveRunway(route);
      expect(result).toBe('24');
      expect(mockRedis.smembers.mock.calls.length).toBe(1);
      expect(mockRedis.smembers.mock.calls[0][0]).toBe(REGION_AIRCRAFT('kvkx:route0624:north'));
      expect(mockStore.getValidAircraftWithHex.mock.calls.length).toBe(1);
      expect(mockStore.getValidAircraftWithHex.mock.calls[0][0]).toEqual('a9bb8b');
      expect(mockRedis.setex.mock.calls.length).toBe(1);
      expect(mockRedis.setex.mock.calls[0][0]).toEqual(ACTIVE_RUNWAY('kvkx:route0624'));
      expect(mockRedis.setex.mock.calls[0][2]).toEqual('24');
    });

    test('computes active runway with other candidates from first region', async () => {
      mockRedis
        .smembers
        .mockReturnValueOnce(['a9bb8b', 'b4ab3c']);
      mockStore
        .getValidAircraftWithHex
        .mockReturnValueOnce({ hex: 'a9bb8b' })
        .mockReturnValueOnce({ hex: 'b4ab3c' });
      route.getActiveRunway = sample => {
        return sample.hex === 'b4ab3c' ? '24' : false;
      };

      const result = await computeActiveRunway(route);
      expect(result).toBe('24');
      expect(mockRedis.smembers.mock.calls.length).toBe(1);
      expect(mockStore.getValidAircraftWithHex.mock.calls.length).toBe(2);
      expect(mockStore.getValidAircraftWithHex.mock.calls[1][0]).toEqual('b4ab3c');
      expect(mockRedis.setex.mock.calls.length).toBe(1);
    });

    test('computes active runway when no candidates in first region', async () => {
      mockRedis
        .smembers
        .mockReturnValueOnce([])
        .mockReturnValueOnce(['c1de9c']);
      mockStore
        .getValidAircraftWithHex
        .mockReturnValueOnce({ hex: 'c1de9c' });
      route.getActiveRunway = sample => '24';

      const result = await computeActiveRunway(route);
      expect(result).toBe('24');
      expect(mockRedis.smembers.mock.calls.length).toBe(2);
      expect(mockRedis.smembers.mock.calls[0][0]).toBe(REGION_AIRCRAFT('kvkx:route0624:north'));
      expect(mockRedis.smembers.mock.calls[1][0]).toBe(REGION_AIRCRAFT('kvkx:route0624:south'));
      expect(mockStore.getValidAircraftWithHex.mock.calls.length).toBe(1);
      expect(mockRedis.setex.mock.calls.length).toBe(1);
    });

    test('does not compute active runway when route has no regions', async () => {
      const result = await computeActiveRunway({});
      expect(result).toBeUndefined();
      expect(mockRedis.smembers.mock.calls.length).toBe(0);
      expect(mockStore.getValidAircraftWithHex.mock.calls.length).toBe(0);
      expect(mockRedis.setex.mock.calls.length).toBe(0);
    });

    test('does not compute active runway when route has no getActiveRunway fn', async () => {
      delete route.getActiveRunway;

      const result = await computeActiveRunway(route);
      expect(result).toBeUndefined();

      expect(mockRedis.smembers.mock.calls.length).toBe(0);
      expect(mockStore.getValidAircraftWithHex.mock.calls.length).toBe(0);
      expect(mockRedis.setex.mock.calls.length).toBe(0);
    });

    test('does not compute active runway when no candidates in any region', async () => {
      mockRedis
        .smembers
        .mockReturnValueOnce([])
        .mockReturnValueOnce([]);

      const result = await computeActiveRunway(route);
      expect(result).toBeUndefined();
      expect(mockRedis.smembers.mock.calls.length).toBe(2);
      expect(mockStore.getValidAircraftWithHex.mock.calls.length).toBe(0);
      expect(mockRedis.setex.mock.calls.length).toBe(0);
    });

    test('does not compute active runway when no candidates can be found in the store', async () => {
      mockRedis
        .smembers
        .mockReturnValueOnce(['a9bb8b', 'b4ab3c']);
      mockStore
        .getValidAircraftWithHex
        .mockReturnValueOnce(undefined)
        .mockReturnValueOnce(undefined);

      const result = await computeActiveRunway(route);
      expect(result).toBeUndefined();
      expect(mockRedis.smembers.mock.calls.length).toBe(1);
      expect(mockStore.getValidAircraftWithHex.mock.calls.length).toBe(2);
      expect(mockRedis.setex.mock.calls.length).toBe(0);
    });

    test('does not compute active runway when getActiveRunway = false for every candidate', async () => {
      mockRedis
        .smembers
        .mockReturnValueOnce(['a9bb8b', 'b4ab3c']);
      mockStore
        .getValidAircraftWithHex
        .mockReturnValueOnce({ hex: 'a9bb8b' })
        .mockReturnValueOnce({ hex: 'b4ab3c' });
      route.getActiveRunway = sample => false;

      const result = await computeActiveRunway(route);
      expect(result).toBeUndefined();
      expect(mockRedis.smembers.mock.calls.length).toBe(1);
      expect(mockStore.getValidAircraftWithHex.mock.calls.length).toBe(2);
      expect(mockRedis.setex.mock.calls.length).toBe(0);
    });

    test('handles errors', async () => {
      mockRedis
        .smembers
        .mockImplementationOnce(() => {
          throw new Error('this should have been caught');
        })
        .mockReturnValue(['a9bb8b']);
      mockStore
        .getValidAircraftWithHex
        .mockImplementation(() => {
          throw new Error('this should have been caught too');
        });

      let result = await computeActiveRunway(route);
      expect(result).toBeUndefined();
      expect(mockRedis.smembers.mock.calls.length).toBe(1);
      expect(mockStore.getValidAircraftWithHex.mock.calls.length).toBe(0);
      expect(mockRedis.setex.mock.calls.length).toBe(0);

      result = await computeActiveRunway(route);
      expect(result).toBeUndefined();
      expect(mockRedis.smembers.mock.calls.length).toBe(2);
      expect(mockStore.getValidAircraftWithHex.mock.calls.length).toBe(1);
      expect(mockRedis.setex.mock.calls.length).toBe(0);
    });
  });

  describe('getActiveRunway', () => {
    test('gets the currently set active runway', async () => {
      mockRedis
        .get
        .mockReturnValueOnce('06');

      const runway = await getActiveRunway({ key: 'kvkx:route0624' });
      expect(runway).toBe('06');
      expect(mockRedis.get.mock.calls.length).toBe(1);
      expect(mockRedis.get.mock.calls[0][0]).toBe(ACTIVE_RUNWAY('kvkx:route0624'));
    });

    test('handles no active runway set', async () => {
      mockRedis
        .get
        .mockReturnValueOnce(null);

      const runway = await getActiveRunway({ key: 'kvkx:route0624' });
      expect(runway).toBeNull();
      expect(mockRedis.get.mock.calls.length).toBe(1);
      expect(mockRedis.get.mock.calls[0][0]).toBe(ACTIVE_RUNWAY('kvkx:route0624'));
    });
  });
});
