const {
  aircraft,
  airframe,
  pumpBody
} = require('../../../src/lib/schemas');

describe('schemas', () => {
  describe('aircraft', () => {
    const baseValidated = {
      hex: '3ef',
      flight: 'AAL1',
      lat: 0.0,
      lon: 10.0,
      altBaro: 100,
      baroRate: 20,
      track: 180,
      seen: 1,
      error: false
    };

    test('camelcases keys', () => {
      const input = {
        hex: '3ef',
        flight: 'AAL1',
        lat: 0.0,
        lon: 10.0,
        alt_baro: 100,
        baro_rate: 20,
        track: 180,
        seen: 1
      };

      const { value, error } = aircraft.validate(input);
      delete value.updated;

      expect(value).toEqual(baseValidated);
      expect(value.error).toBe(false);
      expect(error).toBeUndefined();
    });

    test('strips unknown keys', () => {
      const input = {
        hex: '3ef',
        flight: 'AAL1',
        lat: 0.0,
        lon: 10.0,
        alt_baro: 100,
        baro_rate: 20,
        track: 180,
        seen: 1,
        foo: 'bar',
        bar: 'baz'
      };

      const { value, error } = aircraft.validate(input);

      expect(value.foo).toBeUndefined();
      expect(value.bar).toBeUndefined();
      expect(value.error).toBe(false);
      expect(error).toBeUndefined();
    });

    test('strips expected keys', () => {
      const input = {
        hex: '3ef',
        flight: 'AAL1',
        lat: 0.0,
        lon: 10.0,
        alt_baro: 100,
        baro_rate: 20,
        track: 180,
        seen: 1,

        category: 'foo',
        nic: 1,
        nic_baro: 1,
        rc: 1,
        version: 0,
        nac_p: 1,
        nac_v: 1,
        sil: 1,
        sil_type: 'foo',
        gva: 1,
        sda: 1,
        mlat: [
          'foo'
        ],
        tisb: [
          'foo'
        ],
        type: 'foo'
      };

      const { value, error } = aircraft.validate(input);
      delete value.updated;

      expect(value).toEqual(baseValidated);
      expect(value.error).toBe(false);
      expect(error).toBeUndefined();
    });

    test('renames expected keys', () => {
      const input = {
        hex: '3ef',
        flight: 'AAL1',
        lat: 0.0,
        lon: 10.0,
        alt_baro: 100,
        baro_rate: 20,
        track: 180,
        seen: 1,
        nav_qnh: 1010.6
      };

      const { value, error } = aircraft.validate(input);
      delete value.updated;

      expect(value).toEqual({
        ...baseValidated,
        altimeter: 29.84
      });
      expect(value.error).toBe(false);
      expect(error).toBeUndefined();
    });

    test('sets updated to Date.now()', () => {
      const baseline = Date.now() - 300000;

      const input = {
        hex: '3ef',
        flight: 'AAL1',
        lat: 0.0,
        lon: 10.0,
        alt_baro: 100,
        baro_rate: 20,
        track: 180,
        seen: 1
      };

      const { value, error } = aircraft.validate(input);

      expect(value.updated).toBeGreaterThan(baseline);
      expect(value.error).toBe(false);
      expect(error).toBeUndefined();
    });

    test('forbids updated to be set prior to validation', () => {
      const input = {
        hex: '3ef',
        flight: 'AAL1',
        lat: 0.0,
        lon: 10.0,
        alt_baro: 100,
        baro_rate: 20,
        track: 180,
        seen: 1,
        updated: 1
      };

      const { error } = aircraft.validate(input);

      expect(error).toBeDefined();
    });
  });

  describe('airframe', () => {
    const baseValidated = {
      registration: null,
      manufacturerName: null,
      model: null,
      type: null,
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
      hex: 'a9bb8b',
      lastUpdated: null
    };

    test('capitalizes registration', () => {
      const input = {
        registration: 'n6619O',
        hex: 'a9bb8b'
      };

      const { value, error } = airframe.validate(input);
      expect(value.registration).toEqual('N6619O');
      expect(error).toBeUndefined();
    });

    test('renames expected keys', () => {
      const input = {
        icao24: '3ef',
        typecode: 'B788',
        timestamp: 1578942000000
      };
      const expected = {
        ...baseValidated,
        hex: input.icao24,
        type: input.typecode,
        lastUpdated: new Date(input.timestamp)
      };

      const { value, error } = airframe.validate(input);
      expect(value).toEqual(expected);
      expect(error).toBeUndefined();
    });

    test('strips expected keys and nulls expected values', () => {
      const input = {
        registration: '',
        manufacturerName: '',
        manufacturerIcao: 'foo',
        model: '',
        typecode: '',
        serialNumber: '',
        lineNumber: 'foo',
        icaoAircraftClass: '',
        selCal: 'foo',
        operator: '',
        operatorCallsign: '',
        operatorIcao: '',
        operatorIata: '',
        owner: '',
        categoryDescription: '',
        registered: 'foo',
        regUntil: '',
        status: 'foo',
        built: null,
        firstFlightDate: 'foo',
        engines: '',
        modes: false,
        adsb: false,
        acars: false,
        vdlr: false,
        notes: 'foo',
        country: '',
        lastSeen: 'foo',
        firstSeen: 'foo',
        hex: 'a9bb8b',
        timestamp: ''
      };

      const { value, error } = airframe.validate(input);
      expect(value).toEqual(baseValidated);
      expect(error).toBeUndefined();
    });

    test('parses dates', () => {
      const expected = {
        ...baseValidated,
        regUntil: new Date('2023-01-01'),
        built: new Date('1996-01-01'),
        lastUpdated: new Date('2020-06-01T19:00:00.000Z')
      };
      const input = {
        hex: 'a9bb8b',
        regUntil: '2023-01-01',
        built: '1996-01-01',
        timestamp: 1591038000000
      };

      const { value, error } = airframe.validate(input);
      expect(value).toEqual(expected);
      expect(error).toBeUndefined();
    });

    test('strips unknown keys', () => {
      const input = {
        icao24: '3ef',
        foo: 'bar',
        bar: 'baz'
      };

      const expected = {
        ...baseValidated,
        hex: input.icao24
      };

      const { value, error } = airframe.validate(input);
      expect(value).toEqual(expected);
      expect(error).toBeUndefined();
    });
  });

  describe('pump body', () => {
    test('validates payload', () => {
      const input = {
        aircraft: [],
        token: '3ef',
        device_id: '4ef',
        messages: 2,
        now: Date.now()
      };

      let res = pumpBody.validate(input);
      expect(res.value).toEqual(input);
      expect(res.error).toBeUndefined();

      input.foo = 'bar';
      res = pumpBody.validate(input);
      expect(res.error).toBeDefined();

      delete input.foo;
      delete input.aircraft;
      res = pumpBody.validate(input);
      expect(res.error).toBeDefined();
    });
  });
});
