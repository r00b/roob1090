const mockLogger = require('../../support/mock-logger');
const activeRunway = require('../../../src/lib/active-runway');

describe('active-runway', () => {
  const route = {
    key: 'kaus',
    regions: [
      {
        key: 'kaus:north:01-19'
      },
      {
        key: 'kaus:south:01-19'
      }
    ]
  };

  const mockRedis = {
    hgetJson: jest.fn(),
    setex: jest.fn(),
    smembers: jest.fn()
  };

  let activeRunwayFor;

  beforeEach(() => {
    activeRunwayFor = activeRunway(mockRedis, mockLogger);
    delete route.computeActiveRunway;
  });

  afterEach(() => {
    mockRedis.hgetJson.mockReset();
    mockRedis.setex.mockReset();
    mockRedis.smembers.mockReset();
  });

  test('computes and stores active runway with candidates from first region', async () => {
    mockRedis
      .smembers
      .mockReturnValueOnce(['a9bb8b']);
    mockRedis
      .hgetJson
      .mockReturnValueOnce({ hex: 'a9bb8b' });
    route.computeActiveRunway = sample => '24';

    const result = await activeRunwayFor(route);
    expect(result).toBe('24');
    expect(mockRedis.smembers.mock.calls.length).toBe(1);
    expect(mockRedis.smembers.mock.calls[0][0]).toBe('kaus:north:01-19:aircraft');
    expect(mockRedis.hgetJson.mock.calls.length).toBe(1);
    expect(mockRedis.hgetJson.mock.calls[0]).toEqual(['store:valid', 'a9bb8b']);
    expect(mockRedis.setex.mock.calls.length).toBe(1);
    expect(mockRedis.setex.mock.calls[0][0]).toEqual('kaus:activeRunway');
    expect(mockRedis.setex.mock.calls[0][2]).toEqual('24');
  });

  test('computes active runway with other candidates from first region', async () => {
    mockRedis
      .smembers
      .mockReturnValueOnce(['a9bb8b', 'b4ab3c']);
    mockRedis
      .hgetJson
      .mockReturnValueOnce({ hex: 'a9bb8b' })
      .mockReturnValueOnce({ hex: 'b4ab3c' });
    route.computeActiveRunway = sample => {
      return sample.hex === 'b4ab3c' ? '24' : false;
    };

    const result = await activeRunwayFor(route);
    expect(result).toBe('24');
    expect(mockRedis.smembers.mock.calls.length).toBe(1);
    expect(mockRedis.hgetJson.mock.calls.length).toBe(2);
    expect(mockRedis.hgetJson.mock.calls[1]).toEqual(['store:valid', 'b4ab3c']);
    expect(mockRedis.setex.mock.calls.length).toBe(1);
  });

  test('computes active runway when no candidates in first region', async () => {
    mockRedis
      .smembers
      .mockReturnValueOnce([])
      .mockReturnValueOnce(['c1de9c']);
    mockRedis
      .hgetJson
      .mockReturnValueOnce({ hex: 'c1de9c' });
    route.computeActiveRunway = sample => '24';

    const result = await activeRunwayFor(route);
    expect(result).toBe('24');
    expect(mockRedis.smembers.mock.calls.length).toBe(2);
    expect(mockRedis.smembers.mock.calls[0][0]).toBe('kaus:north:01-19:aircraft');
    expect(mockRedis.smembers.mock.calls[1][0]).toBe('kaus:south:01-19:aircraft');
    expect(mockRedis.hgetJson.mock.calls.length).toBe(1);
    expect(mockRedis.setex.mock.calls.length).toBe(1);
  });

  test('does not compute active runway when no regions', async () => {
    const result = await activeRunwayFor({});
    expect(result).toBeUndefined();
    expect(mockRedis.smembers.mock.calls.length).toBe(0);
    expect(mockRedis.hgetJson.mock.calls.length).toBe(0);
    expect(mockRedis.setex.mock.calls.length).toBe(0);
  });

  test('does not compute active runway when no candidates in any region', async () => {
    mockRedis
      .smembers
      .mockReturnValueOnce([])
      .mockReturnValueOnce([]);

    const result = await activeRunwayFor(route);
    expect(result).toBeUndefined();
    expect(mockRedis.smembers.mock.calls.length).toBe(2);
    expect(mockRedis.hgetJson.mock.calls.length).toBe(0);
    expect(mockRedis.setex.mock.calls.length).toBe(0);
  });

  test('does not compute active runway when no candidate can be found in the store', async () => {
    mockRedis
      .smembers
      .mockReturnValueOnce(['a9bb8b', 'b4ab3c']);
    mockRedis
      .hgetJson
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce(undefined);

    const result = await activeRunwayFor(route);
    expect(result).toBeUndefined();
    expect(mockRedis.smembers.mock.calls.length).toBe(1);
    expect(mockRedis.hgetJson.mock.calls.length).toBe(2);
    expect(mockRedis.setex.mock.calls.length).toBe(0);
  });

  test('does not compute active runway when computeActiveRunway = false for every candidate', async () => {
    mockRedis
      .smembers
      .mockReturnValueOnce(['a9bb8b', 'b4ab3c']);
    mockRedis
      .hgetJson
      .mockReturnValueOnce({ hex: 'a9bb8b' })
      .mockReturnValueOnce({ hex: 'b4ab3c' });
    route.computeActiveRunway = sample => false;

    const result = await activeRunwayFor(route);
    expect(result).toBeUndefined();
    expect(mockRedis.smembers.mock.calls.length).toBe(1);
    expect(mockRedis.hgetJson.mock.calls.length).toBe(2);
    expect(mockRedis.setex.mock.calls.length).toBe(0);
  });

  test('handles errors', async () => {
    mockRedis
      .smembers
      .mockImplementation(() => {
        throw new Error('this should have been caught');
      });

    const result = await activeRunwayFor(route);
    expect(result).toBeUndefined();
    expect(mockRedis.smembers.mock.calls.length).toBe(1);
    expect(mockRedis.hgetJson.mock.calls.length).toBe(0);
    expect(mockRedis.setex.mock.calls.length).toBe(0);
  });
});
