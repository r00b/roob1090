const {
  airframe
} = require('../../../src/lib/schemas');

describe('schemas', () => {
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

    test('it capitalizes registration', () => {
      const input = {
        registration: 'n6619O',
        hex: 'a9bb8b'
      };

      const { value, error } = airframe.validate(input);
      expect(value.registration).toEqual('N6619O');
      expect(error).toBeUndefined();
    });

    test('it renames expected properties', () => {
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

    test('it nulls and strips expected properties', () => {
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

    test('it parses dates', () => {
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

    test('it strips unknown properties', () => {
      const input = {
        icao24: '3ef',
        foo: 'bar',
        bar: 'baz'
      };

      const expected = {
        ...baseValidated,
        hex: input.icao24,
      };

      const { value, error } = airframe.validate(input);
      expect(value).toEqual(expected);
      expect(error).toBeUndefined();
    });
  });
});
