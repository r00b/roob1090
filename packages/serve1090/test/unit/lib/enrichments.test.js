const nock = require('nock');
const {
  ARRIVALS,
  DEPARTURES,
  BROADCAST_CLIENT_COUNT,
  AIRFRAMES,
} = require('../../../src/lib/redis-keys');

jest.mock(
  '../../../src/lib/logger',
  () => () => require('../../support/mock-logger')
);

const enrichments = require('../../../src/lib/enrichments');

describe('enrichments', () => {
  const config = {
    openSkyApi: 'https://opensky-network.org',
    openSkyUsername: 'user1',
    openSkyPassword: 'pass1',
    faApi: 'https://flightxml.flightaware.com/json/FlightXML2',
    faUsername: 'user2',
    faPassword: 'pass2',
  };

  const aircraft = {
    hex: 'a9bb8b',
    flight: 'AAL0158',
  };

  const mockOpenSky = nock(/.*opensky-network.org/);
  const routes = `/api/routes/?callsign=${aircraft.flight}`;
  const metadata = `/api/metadata/aircraft/icao/${aircraft.hex}`;

  const mockFlightAware = nock(/.*flightxml.flightaware.com/);
  const inFlightInfo = `/json/FlightXML2/InFlightInfo/?ident=${aircraft.flight}`;

  const mockRedis = {
    hgetAsJson: jest.fn(),
    hsetJson: jest.fn(),
    hsetJsonEx: jest.fn(),
    smembers: jest.fn(),
    get: jest.fn(),
  };

  const { fetchRoute, fetchAirframe } = enrichments(config, mockRedis);

  afterEach(() => {
    // should always make a cache check
    expect(mockRedis.hgetAsJson.mock.calls.length).toBeGreaterThan(0);
    nock.cleanAll();
    Object.values(mockRedis).forEach(m => m.mockReset());
  });

  describe('fetch route', () => {
    test('does not resolve a route when no apis provided', async () => {
      const { fetchRoute } = enrichments({}, mockRedis);
      const result = await fetchRoute(aircraft, 'kdca');
      expect(result).toBeUndefined();
    });

    test('caches a route', async () => {
      const route = {
        origin: 'KVKX',
        destination: 'KDCA',
      };

      mockOpenSky.get(routes).reply(200, { route: ['KVKX', 'KDCA'] });
      mockFlightAware.get(inFlightInfo).replyWithError('should not be called');
      let cachedValue = undefined;
      mockRedis.hsetJsonEx.mockImplementation((key, field, value, ex) => {
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
        destination: 'KW00',
      };
      mockOpenSky.get(routes).replyWithError('should not be called');
      mockFlightAware.get(inFlightInfo).replyWithError('should not be called');
      mockRedis.hgetAsJson.mockReturnValueOnce(route);

      const result = await fetchRoute(aircraft, 'kdca');

      expect(result).toEqual(route);
      expect(mockRedis.hgetAsJson.mock.calls.length).toBe(1);
      expect(mockRedis.hgetAsJson.mock.calls[0]).toEqual(['routes', 'aal0158']);
      expect(mockOpenSky.isDone()).toBeFalsy();
      expect(mockFlightAware.isDone()).toBeFalsy();
    });

    test('resolves a cached route even when no apis provided', async () => {
      const route = {
        origin: 'KVKX',
        destination: 'KW00',
      };
      mockRedis.hgetAsJson.mockReturnValueOnce(route);

      const { fetchRoute } = enrichments({}, mockRedis);

      const result = await fetchRoute(aircraft, 'kdca');

      expect(result).toEqual(route);
      expect(mockRedis.hgetAsJson.mock.calls.length).toBe(1);
      expect(mockRedis.hgetAsJson.mock.calls[0]).toEqual(['routes', 'aal0158']);
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
      mockOpenSky.get(routes).reply(200, { route: ['KVKX', 'KDCA'] });
      mockFlightAware.get(inFlightInfo).replyWithError('should not be called');

      const result = await fetchRoute(aircraft, 'kdca');

      expect(result).toEqual({
        origin: 'KVKX',
        destination: 'KDCA',
      });
      expect(mockRedis.smembers.mock.calls.length).toBe(0);
      expect(mockOpenSky.isDone()).toBeTruthy();
      expect(mockFlightAware.isDone()).toBeFalsy();
    });

    test('does not resolve a non-connecting route from OpenSky when airport not in route', async () => {
      mockOpenSky.get(routes).reply(200, { route: ['KVKX', 'KEZF'] });
      mockFlightAware.get(inFlightInfo).replyWithError('should not be called');

      const result = await fetchRoute(aircraft, 'kdca');

      expect(result).toBeUndefined();
      expect(mockRedis.smembers.mock.calls.length).toBe(0);
      expect(mockOpenSky.isDone()).toBeTruthy();
      expect(mockFlightAware.isDone()).toBeFalsy();
    });

    test('resolves a connecting route from OpenSky when arriving to the specified airport', async () => {
      const testComplexArrival = async (route, airport, origin) => {
        mockFlightAware
          .get(inFlightInfo)
          .replyWithError('should not be called');
        mockOpenSky.get(routes).reply(200, { route });
        mockRedis.smembers.mockReset();
        mockRedis.smembers.mockReturnValueOnce(['foo', aircraft.hex, 'bar']);

        const result = await fetchRoute(aircraft, airport);

        if (origin) {
          expect(result).toEqual({
            origin,
            destination: airport.toUpperCase(),
          });
          expect(mockRedis.smembers.mock.calls.length).toBe(1);
        } else {
          expect(result).toBeUndefined();
        }

        expect(mockRedis.smembers.mock.calls[0][0]).toBe(
          ARRIVALS(airport.toLowerCase())
        );
        expect(mockOpenSky.isDone()).toBeTruthy();
        expect(mockFlightAware.isDone()).toBeFalsy();
      };

      await testComplexArrival(['KSFO', 'KDCA', 'KSEA'], 'KDCA', 'KSFO');
      await testComplexArrival(['KSFO', 'KDCA', 'KSEA'], 'kdca', 'KSFO');
      await testComplexArrival(['ksfo', 'kdca', 'ksea'], 'KDCA', 'KSFO');
      await testComplexArrival(['KDCA', 'KMCO', 'KSEA'], 'KDCA', false);

      await testComplexArrival(['KSFO', 'KSEA', 'KDCA'], 'KDCA', 'KSEA');
      await testComplexArrival(['KDCA', 'KSEA', 'KDCA'], 'KDCA', 'KSEA');
      await testComplexArrival(['KDCA', 'KSEA', 'KADW'], 'KDCA', false);
      await testComplexArrival(['KSEA', 'KDCA', 'KDCA'], 'KDCA', false);
      await testComplexArrival(['KDCA', 'KDCA', 'KDCA'], 'KDCA', false);

      await testComplexArrival(
        ['KDCA', 'KBWI', 'KDCA', 'KSEA'],
        'KDCA',
        'KBWI'
      );
      await testComplexArrival(['KSEA', 'KDCA', 'KBWI', 'KDCA'], 'KDCA', false);
      await testComplexArrival(['KDCA', 'KDCA', 'KBWI', 'KDCA'], 'KDCA', false);
      await testComplexArrival(
        ['KDCA', 'KRDU', 'KDAB', 'KMIA', 'KAUS', 'KDCA', 'KIAH', 'KDEN'],
        'KDCA',
        'KAUS'
      );
      await testComplexArrival(
        ['KDCA', 'KRDU', 'KDAB', 'KMIA', 'KAUS', 'KIAH', 'KDEN', 'KDCA'],
        'KDCA',
        'KDEN'
      );
      await testComplexArrival(
        ['KNYG', 'KDCA', 'KDAB', 'KMIA', 'KAUS', 'KIAH', 'KDEN', 'KDCA'],
        'KDCA',
        false
      );
      await testComplexArrival(
        ['KDCA', 'KDCA', 'KDAB', 'KMIA', 'KAUS', 'KIAH', 'KDEN', 'KSBY'],
        'KDCA',
        false
      );
    });

    test('resolves a connecting route from OpenSky when departing from the specified airport', async () => {
      const testComplexDeparture = async (route, airport, destination) => {
        mockFlightAware
          .get(inFlightInfo)
          .replyWithError('should not be called');
        mockOpenSky.get(routes).reply(200, { route });
        mockRedis.smembers.mockReset();
        mockRedis.smembers
          .mockReturnValueOnce(['baz'])
          .mockReturnValueOnce(['foo', aircraft.hex, 'bar']);

        const result = await fetchRoute(aircraft, airport);

        if (destination) {
          expect(result).toEqual({
            origin: airport.toUpperCase(),
            destination,
          });
          expect(mockRedis.smembers.mock.calls.length).toBe(2);
        } else {
          expect(result).toBeUndefined();
        }

        expect(mockRedis.smembers.mock.calls[0][0]).toBe(
          ARRIVALS(airport.toLowerCase())
        );
        expect(mockRedis.smembers.mock.calls[1][0]).toBe(
          DEPARTURES(airport.toLowerCase())
        );
        expect(mockOpenSky.isDone()).toBeTruthy();
        expect(mockFlightAware.isDone()).toBeFalsy();
      };

      await testComplexDeparture(['KSFO', 'KDCA', 'KSEA'], 'KDCA', 'KSEA');
      await testComplexDeparture(['KSFO', 'KDCA', 'KSEA'], 'kdca', 'KSEA');
      await testComplexDeparture(['ksfo', 'kdca', 'ksea'], 'KDCA', 'KSEA');
      await testComplexDeparture(['KSFO', 'KSEA', 'KDCA'], 'KDCA', false);

      await testComplexDeparture(['KDCA', 'KSEA', 'KDCA'], 'KDCA', 'KSEA');
      await testComplexDeparture(['KSEA', 'KDCA', 'KVKX'], 'KDCA', 'KVKX');
      await testComplexDeparture(['KSFO', 'KSEA', 'KDCA'], 'KDCA', false);
      await testComplexDeparture(['KSEA', 'KDCA', 'KDCA'], 'KDCA', false);
      await testComplexDeparture(['KDCA', 'KDCA', 'KDCA'], 'KDCA', false);

      await testComplexDeparture(
        ['KSEA', 'KDCA', 'KBWI', 'KDCA'],
        'KDCA',
        'KBWI'
      );
      await testComplexDeparture(
        ['KSEA', 'KDCA', 'KBWI', 'KAUS'],
        'KDCA',
        'KBWI'
      );
      await testComplexDeparture(
        ['KDCA', 'KBWI', 'KDCA', 'KSEA'],
        'KDCA',
        false
      );
      await testComplexDeparture(
        ['KDCA', 'KDCA', 'KBWI', 'KDCA'],
        'KDCA',
        false
      );

      await testComplexDeparture(
        ['KDCA', 'KRDU', 'KDAB', 'KMIA', 'KAUS', 'KIAH', 'KDEN', 'KDCA'],
        'KDCA',
        'KRDU'
      );
      await testComplexDeparture(
        ['KNYG', 'KDCA', 'KDAB', 'KMIA', 'KAUS', 'KIAH', 'KDEN', 'KDCA'],
        'KDCA',
        'KDAB'
      );
      await testComplexDeparture(
        ['KDCA', 'KRDU', 'KDAB', 'KMIA', 'KAUS', 'KDCA', 'KIAH', 'KDEN'],
        'KDCA',
        false
      );
      await testComplexDeparture(
        ['KDCA', 'KDCA', 'KDAB', 'KMIA', 'KAUS', 'KIAH', 'KDEN', 'KSBY'],
        'KDCA',
        false
      );
    });

    test('does not resolve a connecting route from OpenSky when airport not in route', async () => {
      mockFlightAware.get(inFlightInfo).replyWithError('should not be called');
      mockOpenSky.get(routes).reply(200, { route: ['KAUS', 'KBWI', 'KRDU'] });
      mockRedis.smembers
        .mockReturnValueOnce(['baz', aircraft.hex])
        .mockReturnValueOnce(['foo', 'bar']);

      const result = await fetchRoute(aircraft, 'KDCA');
      expect(result).toBeUndefined();
    });

    test('does not resolve a connecting route from OpenSky when aircraft is not in arrivals or departures', async () => {
      mockFlightAware.get(inFlightInfo).replyWithError('should not be called');
      mockOpenSky.get(routes).reply(200, { route: ['KDCA', 'KBWI', 'KRDU'] });
      mockRedis.smembers
        .mockReturnValueOnce(['baz'])
        .mockReturnValueOnce(['foo', 'bar']);

      const result = await fetchRoute(aircraft, 'KDCA');

      expect(result).toBeUndefined();
      expect(mockRedis.smembers.mock.calls[0][0]).toBe(ARRIVALS('kdca'));
      expect(mockRedis.smembers.mock.calls[1][0]).toBe(DEPARTURES('kdca'));
      expect(mockOpenSky.isDone()).toBeTruthy();
      expect(mockFlightAware.isDone()).toBeFalsy();
    });

    test('does not call FlightAware API when no FlightAware auth', async () => {
      mockFlightAware.get(inFlightInfo).replyWithError('should not be called');
      mockOpenSky.get(routes).reply(404);
      const { fetchRoute } = enrichments(
        {
          openSkyApi: config.openSkyApi,
          openSkyUsername: config.openSkyUsername,
          openSkyPassword: config.openSkyPassword,
        },
        mockRedis
      );
      mockRedis.get.mockReturnValueOnce(1);

      const result = await fetchRoute(aircraft, 'kdca');

      expect(result).toBeUndefined();
      expect(mockRedis.get.mock.calls.length).toBe(0);
      expect(mockOpenSky.isDone()).toBeTruthy();
      expect(mockFlightAware.isDone()).toBeFalsy();
    });

    test('passes auth to FlightAware', async () => {
      mockOpenSky.get(routes).reply(404);
      mockFlightAware
        .get(inFlightInfo)
        .basicAuth({ user: 'user2', pass: 'pass2' })
        .reply(200, {});
      mockRedis.get.mockReturnValueOnce(1);

      await fetchRoute(aircraft, 'kdca');
      expect(mockRedis.get.mock.calls.length).toBe(1);
      expect(mockRedis.get.mock.calls[0][0]).toBe(BROADCAST_CLIENT_COUNT);
      expect(mockOpenSky.isDone()).toBeTruthy();
      expect(mockFlightAware.isDone()).toBeTruthy();
    });

    test('does not call FlightAware API when zero broadcast clients', async () => {
      mockOpenSky.get(routes).reply(404);
      mockFlightAware.get(inFlightInfo).replyWithError('should not be called');
      mockRedis.get.mockReturnValueOnce(0);

      const result = await fetchRoute(aircraft, 'kdca');

      expect(result).toBeUndefined();
      expect(mockRedis.get.mock.calls.length).toBe(1);
      expect(mockRedis.get.mock.calls[0][0]).toBe(BROADCAST_CLIENT_COUNT);
      expect(mockOpenSky.isDone()).toBeTruthy();
      expect(mockFlightAware.isDone()).toBeFalsy();
    });

    test('resolves a route from FlightAware', async () => {
      const route = {
        origin: 'KRIC',
        destination: 'KRTB',
      };
      mockOpenSky.get(routes).twice().reply(404);
      mockFlightAware
        .get(inFlightInfo)
        .twice()
        .reply(200, {
          InFlightInfoResult: {
            origin: 'KRIC',
            destination: 'KRTB',
            timeout: 'ok',
          },
        });
      mockRedis.get.mockReturnValueOnce(1).mockReturnValueOnce(58);

      // 1 broadcast client
      let result = await fetchRoute(aircraft, 'kdca');
      expect(result).toEqual(route);
      // > 1 broadcast clients
      result = await fetchRoute(aircraft, 'kdca');
      expect(result).toEqual(route);

      expect(mockOpenSky.isDone()).toBeTruthy();
      expect(mockFlightAware.isDone()).toBeTruthy();
      expect(mockRedis.get.mock.calls.length).toBe(2);
    });

    test('calls FlightAware API when zero broadcast clients if force flag passed', async () => {
      mockOpenSky.get(routes).reply(404);
      mockFlightAware.get(inFlightInfo).reply(200, {
        InFlightInfoResult: {
          origin: 'KRIC',
          destination: 'KRTB',
          timeout: 'ok',
        },
      });
      mockRedis.get.mockReturnValueOnce(0);

      const result = await fetchRoute(aircraft, 'kdca', true);

      expect(result).toEqual({
        origin: 'KRIC',
        destination: 'KRTB',
      });
      expect(mockRedis.get.mock.calls.length).toBe(1);
      expect(mockOpenSky.isDone()).toBeTruthy();
      expect(mockFlightAware.isDone()).toBeTruthy();
    });

    test('does not resolve route when 404 from OpenSky and timed out response from FlightAware', async () => {
      mockOpenSky.get(routes).reply(404);
      mockFlightAware.get(inFlightInfo).reply(200, {
        InFlightInfoResult: {
          origin: 'KRIC',
          destination: 'KRTB',
          timeout: 'timed_out',
        },
      });
      mockRedis.get.mockReturnValue(1);

      const result = await fetchRoute(aircraft, 'kdca');

      expect(result).toBeUndefined();
      expect(mockOpenSky.isDone()).toBeTruthy();
      expect(mockFlightAware.isDone()).toBeTruthy();
    });

    test('does not resolve route when 404 from OpenSky and FlightAware', async () => {
      mockOpenSky.get(routes).reply(404);
      mockFlightAware.get(inFlightInfo).reply(404);
      mockRedis.get.mockReturnValue(1);

      const result = await fetchRoute(aircraft, 'kdca');

      expect(result).toBeUndefined();
      expect(mockOpenSky.isDone()).toBeTruthy();
      expect(mockFlightAware.isDone()).toBeTruthy();
    });

    test('does not resolve route when errors fetching from OpenSky and FlightAware', async () => {
      mockOpenSky.get(routes).replyWithError('error');
      mockFlightAware.get(inFlightInfo).replyWithError('error');
      mockRedis.get.mockReturnValue(1);

      const result = await fetchRoute(aircraft, 'kdca');

      expect(result).toBeUndefined();
      expect(mockOpenSky.isDone()).toBeTruthy();
      expect(mockFlightAware.isDone()).toBeTruthy();
    });
  });

  describe('fetch airframe', () => {
    const expected = {
      registration: 'N66198',
      manufacturerName: null,
      model: null,
      type: 'C172',
      serialNumber: null,
      icaoAircraftClass: null,
      operator: null,
      operatorCallsign: null,
      operatorIcao: null,
      operatorIata: null,
      owner: null,
      categoryDescription: null,
      regUntil: null,
      built: null,
      engines: null,
      country: null,
      hex: aircraft.hex,
      lastUpdated: null,
    };

    test('caches an airframe', async () => {
      mockOpenSky.get(metadata).reply(200, {
        registration: 'N66198',
        typecode: 'C172',
        icao24: aircraft.hex,
      });
      let cachedValue = undefined;
      mockRedis.hsetJson.mockImplementation((key, field, value) => {
        expect(key).toBe(AIRFRAMES);
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
      mockOpenSky.get(metadata).replyWithError('should not be called');
      mockRedis.hgetAsJson.mockReturnValueOnce(expected);

      const result = await fetchAirframe(aircraft);

      expect(result).toEqual(expected);
      expect(mockRedis.hgetAsJson.mock.calls.length).toBe(1);
      expect(mockRedis.hgetAsJson.mock.calls[0]).toEqual([AIRFRAMES, 'a9bb8b']);
      expect(mockOpenSky.isDone()).toBeFalsy();
    });

    test('passes auth to OpenSky', async () => {
      mockOpenSky
        .get(metadata)
        .basicAuth({ user: 'user1', pass: 'pass1' })
        .reply(200, {
          icao24: aircraft.hex,
        });

      await fetchAirframe(aircraft, 'kdca');
      expect(mockOpenSky.isDone()).toBeTruthy();
    });

    test('resolves an airframe from OpenSky', async () => {
      mockOpenSky.get(metadata).reply(200, {
        registration: 'N66198',
        typecode: 'C172',
        icao24: aircraft.hex,
      });

      const result = await fetchAirframe(aircraft);
      expect(result).toEqual(expected);
    });

    test('does not resolve airframe on 404', async () => {
      mockOpenSky.get(metadata).reply(404);

      const result = await fetchAirframe(aircraft);
      expect(result).toBeUndefined();
    });

    test('does not resolve airframe on error', async () => {
      mockOpenSky.get(metadata).replyWithError('error');

      const result = await fetchAirframe(aircraft);
      expect(result).toBeUndefined();
    });

    describe('validation', () => {
      test('sets model to typecode when typecode missing', async () => {
        mockOpenSky.get(metadata).reply(200, {
          registration: 'N66198',
          model: 'Cessna 172',
          icao24: aircraft.hex,
        });

        const result = await fetchAirframe(aircraft);
        expect(result).toEqual({
          ...expected,
          model: 'Cessna 172',
          type: 'Cessna 172',
        });
      });
    });
  });
});
