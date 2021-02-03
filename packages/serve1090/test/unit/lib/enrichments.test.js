const mockLogger = require('../../support/mock-logger');
const nock = require('nock');
const _ = require('lodash');
const enrichments = require('../../../src/lib/enrichments');

describe('enrichments', () => {
  const config = {
    openSkyApi: 'https://opensky-network.org',
    openSkyUsername: 'user1',
    openSkyPassword: 'pass1',
    faApi: 'https://flightxml.flightaware.com/json/FlightXML2',
    faUsername: 'user2',
    faPassword: 'pass2'
  };

  const aircraft = {
    hex: 'a9bb8b',
    flight: 'AAL0158'
  };

  const mockOpenSky = nock(/.*opensky-network.org/);
  const routes = `/api/routes/?callsign=${aircraft.flight}`;
  const metadata = `/api/metadata/aircraft/icao/${aircraft.hex}`;

  const mockFlightAware = nock(/.*flightxml.flightaware.com/);
  const inFlightInfo = `/json/FlightXML2/InFlightInfo/?ident=${aircraft.flight}`;

  const mockRedis = {
    hgetJson: jest.fn(),
    hsetJson: jest.fn(),
    hsetJsonEx: jest.fn(),
    get: jest.fn()
  };

  const { fetchRoute, fetchAirframe } = enrichments(config, mockRedis, mockLogger);

  afterEach(() => {
    // should always make a cache check
    expect(mockRedis.hgetJson.mock.calls.length).toBeGreaterThan(0);
    nock.cleanAll();
    mockRedis.hgetJson.mockReset();
    mockRedis.hsetJson.mockReset();
    mockRedis.hsetJsonEx.mockReset();
    mockRedis.get.mockReset();
  });

  describe('fetch route', () => {
    test('caches a route', async () => {
      const route = {
        origin: 'KVKX',
        destination: 'KDCA'
      };

      mockOpenSky
        .get(routes)
        .reply(200, { route: ['KVKX', 'KDCA'] });
      mockFlightAware
        .get(inFlightInfo)
        .replyWithError('should not be called');
      let cachedValue = undefined;
      mockRedis
        .hsetJsonEx
        .mockImplementation((key, field, value, ex) => {
          expect(key).toBe('routes');
          expect(field).toBe(aircraft.flight.toLowerCase());
          expect(value).toEqual(route);
          expect(ex).toBeGreaterThan(0);
          cachedValue = value;
        });

      const result = await fetchRoute(aircraft, 'kdca');

      expect(result).toEqual(route);
      expect(cachedValue).toEqual(result);
      expect(mockRedis.hsetJsonEx.mock.calls.length).toBe(1);
    });

    test('resolves a cached route', async () => {
      const route = {
        origin: 'KVKX',
        destination: 'KW00'
      };
      mockOpenSky
        .get(routes)
        .replyWithError('should not be called');
      mockFlightAware
        .get(inFlightInfo)
        .replyWithError('should not be called');
      mockRedis
        .hgetJson
        .mockReturnValueOnce(route);

      const result = await fetchRoute(aircraft, 'kdca');

      expect(result).toEqual(route);
      expect(mockRedis.hgetJson.mock.calls.length).toBe(1);
      expect(mockRedis.hgetJson.mock.calls[0]).toEqual(['routes', 'aal0158']);
      expect(mockOpenSky.isDone()).toBeFalsy();
      expect(mockFlightAware.isDone()).toBeFalsy();
    });

    test('passes auth to OpenSky', async () => {
      mockOpenSky
        .get(routes)
        .basicAuth({ user: 'user1', pass: 'pass1' })
        .reply(200, { route: ['KVKX', 'KDCA'] });

      await fetchRoute(aircraft, 'kdca');
      expect(mockOpenSky.isDone()).toBeTruthy();
    });

    test('resolves a non-connecting route from OpenSky', async () => {
      mockOpenSky
        .get(routes)
        .reply(200, { route: ['KVKX', 'KDCA'] });
      mockFlightAware
        .get(inFlightInfo)
        .replyWithError('should not be called');

      const result = await fetchRoute(aircraft, 'kdca');

      expect(result).toEqual({
        origin: 'KVKX',
        destination: 'KDCA'
      });
      expect(mockRedis.get.mock.calls.length).toBe(0);
      expect(mockOpenSky.isDone()).toBeTruthy();
      expect(mockFlightAware.isDone()).toBeFalsy();
    });

    test('resolves a connecting route from OpenSky when origin is current airport', async () => {
      mockOpenSky
        .get(routes)
        .reply(200, { route: ['KDCA', 'KVKX', 'KRMN'] });
      mockFlightAware
        .get(inFlightInfo)
        .replyWithError('should not be called');
      mockRedis
        .get
        .mockReturnValueOnce(['foo'])
        .mockReturnValueOnce([aircraft.hex, 'bar']);

      const result = await fetchRoute(aircraft, 'kdca');

      expect(result).toEqual({
        origin: 'KDCA',
        destination: 'KVKX'
      });

      expect(mockRedis.get.mock.calls.length).toBe(2);
      expect(mockRedis.get.mock.calls[0][0]).toBe('kdca:arrivals');
      expect(mockRedis.get.mock.calls[1][0]).toBe('kdca:departures');
      expect(mockOpenSky.isDone()).toBeTruthy();
      expect(mockFlightAware.isDone()).toBeFalsy();
    });

    test('resolves a connecting route from OpenSky when destination is current airport', async () => {
      mockOpenSky
        .get(routes)
        .reply(200, { route: ['KVKX', 'KDCA', 'KRMN'] })
        .get(routes)
        .reply(200, { route: ['KVKX', 'KRMN', 'KDCA'] });
      mockFlightAware
        .get(inFlightInfo)
        .replyWithError('should not be called');
      mockRedis
        .get
        .mockReturnValueOnce([aircraft.hex, 'bar'])
        .mockReturnValueOnce(['foo', aircraft.hex]);

      let result = await fetchRoute(aircraft, 'kdca');
      expect(result).toEqual({
        origin: 'KVKX',
        destination: 'KDCA'
      });

      result = await fetchRoute(aircraft, 'KdCa');
      expect(result).toEqual({
        origin: 'KRMN',
        destination: 'KDCA'
      });

      expect(mockRedis.get.mock.calls.length).toBe(2);
      expect(mockRedis.get.mock.calls[0][0]).toBe('kdca:arrivals');
      expect(mockRedis.get.mock.calls[1][0]).toBe('kdca:arrivals');
      expect(mockOpenSky.isDone()).toBeTruthy();
      expect(mockFlightAware.isDone()).toBeFalsy();
    });

    test('passes auth to FlightAware', async () => {
      mockOpenSky
        .get(routes)
        .reply(404);
      mockFlightAware
        .get(inFlightInfo)
        .basicAuth({ user: 'user2', pass: 'pass2' })
        .reply(200, {});
      mockRedis
        .get
        .mockReturnValueOnce(1);

      await fetchRoute(aircraft, 'kdca');
      expect(mockOpenSky.isDone()).toBeTruthy();
      expect(mockFlightAware.isDone()).toBeTruthy();
    });

    test('does not call FlightAware API when zero broadcast clients', async () => {
      mockOpenSky
        .get(routes)
        .reply(404);
      mockFlightAware
        .get(inFlightInfo)
        .replyWithError('should not be called');
      mockRedis
        .get
        .mockReturnValueOnce(0);

      const result = await fetchRoute(aircraft, 'kdca');

      expect(result).toEqual({});
      expect(mockRedis.get.mock.calls.length).toBe(1);
      expect(mockRedis.get.mock.calls[0][0]).toBe('broadcastClientCount');
      expect(mockOpenSky.isDone()).toBeTruthy();
      expect(mockFlightAware.isDone()).toBeFalsy();
    });

    test('resolves a route from FlightAware', async () => {
      const route = {
        origin: 'KRIC',
        destination: 'KRTB'
      };
      mockOpenSky
        .get(routes)
        .twice()
        .reply(404);
      mockFlightAware
        .get(inFlightInfo)
        .twice()
        .reply(200, {
          InFlightInfoResult: {
            origin: 'KRIC',
            destination: 'KRTB',
            timeout: 'ok'
          }
        });
      mockRedis
        .get
        .mockReturnValueOnce(1)
        .mockReturnValueOnce(58);

      // 1 broadcast client
      let result = await fetchRoute(aircraft, 'kdca');
      expect(result).toEqual(route);
      // > 1 broadcast clients
      result = await fetchRoute(aircraft, 'kdca');
      expect(result).toEqual(route);

      expect(mockOpenSky.isDone()).toBeTruthy();
      expect(mockFlightAware.isDone()).toBeTruthy();
    });

    test('calls FlightAware API when zero broadcast clients if force flag passed', async () => {
      mockOpenSky
        .get(routes)
        .reply(404);
      mockFlightAware
        .get(inFlightInfo)
        .reply(200, {
          InFlightInfoResult: {
            origin: 'KRIC',
            destination: 'KRTB',
            timeout: 'ok'
          }
        });
      mockRedis
        .get
        .mockReturnValueOnce(0);

      const result = await fetchRoute(aircraft, 'kdca', true);

      expect(result).toEqual({
        origin: 'KRIC',
        destination: 'KRTB'
      });
      expect(mockRedis.get.mock.calls.length).toBe(1);
      expect(mockOpenSky.isDone()).toBeTruthy();
      expect(mockFlightAware.isDone()).toBeTruthy();
    });

    test('does not resolve route when 404 from OpenSky and FlightAware', async () => {
      mockOpenSky
        .get(routes)
        .reply(404);
      mockFlightAware
        .get(inFlightInfo)
        .reply(404);
      mockRedis
        .get
        .mockReturnValue(1);

      const result = await fetchRoute(aircraft, 'kdca');

      expect(result).toEqual({});
      expect(mockOpenSky.isDone()).toBeTruthy();
      expect(mockFlightAware.isDone()).toBeTruthy();
    });

    test('does not resolve route when errors fetching from OpenSky and FlightAware', async () => {
      mockOpenSky
        .get(routes)
        .replyWithError('error');
      mockFlightAware
        .get(inFlightInfo)
        .replyWithError('error');
      mockRedis
        .get
        .mockReturnValue(1);

      const result = await fetchRoute(aircraft, 'kdca');

      expect(result).toEqual({});
      expect(mockOpenSky.isDone()).toBeTruthy();
      expect(mockFlightAware.isDone()).toBeTruthy();
    });

    test('does not resolve route when 404 from OpenSky and timed out response from FlightAware', async () => {
      mockOpenSky
        .get(routes)
        .reply(404);
      mockFlightAware
        .get(inFlightInfo)
        .reply(200, {
          InFlightInfoResult: {
            origin: 'KRIC',
            destination: 'KRTB',
            timeout: 'timed_out'
          }
        });
      mockRedis
        .get
        .mockReturnValue(1);

      const result = await fetchRoute(aircraft, 'kdca');

      expect(result).toEqual({});
      expect(mockOpenSky.isDone()).toBeTruthy();
      expect(mockFlightAware.isDone()).toBeTruthy();
    });
  });

  describe('fetch airframe', () => {
    const expected = {
      registration: 'N66198',
      manufacturerName: null,
      model: null,
      typecode: 'C172',
      serialNumber: null,
      icaoAircraftClass: null,
      operator: null,
      operatorCallsign: null,
      operatorIcao: null,
      operatorIata: null,
      owner: null,
      categoryDescription: null,
      registered: null,
      regUntil: null,
      built: null,
      engines: null,
      country: null,
      hex: aircraft.hex,
      timestamp: null
    };

    test('caches an airframe', async () => {
      mockOpenSky
        .get(metadata)
        .reply(200, {
          registration: 'N66198',
          typecode: 'C172',
          icao24: aircraft.hex
        });
      let cachedValue = undefined;
      mockRedis
        .hsetJson
        .mockImplementation((key, field, value) => {
          expect(key).toBe('airframes');
          expect(field).toBe(aircraft.hex.toLowerCase());
          expect(value).toEqual(expected);
          cachedValue = value;
        });

      const result = await fetchAirframe(aircraft);

      expect(result).toEqual(expected);
      expect(cachedValue).toEqual(result);
      expect(mockRedis.hsetJson.mock.calls.length).toBe(1);
    });

    test('resolves a cached airframe', async () => {
      mockOpenSky
        .get(metadata)
        .replyWithError('should not be called');
      mockRedis
        .hgetJson
        .mockReturnValueOnce(expected);

      const result = await fetchAirframe(aircraft);

      expect(result).toEqual(expected);
      expect(mockRedis.hgetJson.mock.calls.length).toBe(1);
      expect(mockRedis.hgetJson.mock.calls[0]).toEqual(['airframes', 'a9bb8b']);
      expect(mockOpenSky.isDone()).toBeFalsy();
    });

    test('passes auth to OpenSky', async () => {
      mockOpenSky
        .get(metadata)
        .basicAuth({ user: 'user1', pass: 'pass1' })
        .reply(200, {
          icao24: aircraft.hex
        });

      await fetchAirframe(aircraft, 'kdca');
      expect(mockOpenSky.isDone()).toBeTruthy();
    });

    test('resolves an airframe from OpenSky', async () => {
      mockOpenSky
        .get(metadata)
        .reply(200, {
          registration: 'N66198',
          typecode: 'C172',
          icao24: aircraft.hex
        });

      const result = await fetchAirframe(aircraft);
      expect(result).toEqual(expected);
    });

    test('does not resolve airframe on 404', async () => {
      mockOpenSky
        .get(metadata)
        .reply(404);

      const result = await fetchAirframe(aircraft);
      expect(result).toEqual({});
    });

    test('does not resolve airframe on error', async () => {
      mockOpenSky
        .get(metadata)
        .replyWithError('error');

      const result = await fetchAirframe(aircraft);
      expect(result).toEqual({});
    });

    describe('validation', () => {
      test('sets model to typecode when typecode missing', async () => {
        mockOpenSky
          .get(metadata)
          .reply(200, {
            registration: 'N66198',
            model: 'Cessna 172',
            icao24: aircraft.hex
          });

        const result = await fetchAirframe(aircraft);
        expect(result).toEqual({
          ...expected,
          model: 'Cessna 172',
          typecode: 'Cessna 172'
        });
      });
    });
  });
});