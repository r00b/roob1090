const {
  airframe
} = require('../../../src/lib/schemas');

describe('schemas', () => {
  describe('airframe', () => {
    const base = {
      registration: null,
      manufacturerName: null,
      model: null,
      typecode: null,
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
      hex: 'a9bb8b',
      timestamp: null
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

    test('it strips or nullifies expected properties', () => {
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
        registered: null,
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
      expect(value).toEqual(base);
      expect(error).toBeUndefined();
    });

    test('it parses dates', () => {
      const expected = {
        ...base,
        registered: new Date('2020-02-02T00:00:00.000Z'),
        regUntil: new Date('1996-01-01T05:00:00.000Z'),
        built: new Date('2010-10-02T00:10:00.009Z'),
        timestamp: new Date('2020-06-01T19:00:00.000Z')
      };
      const input = {
        hex: 'a9bb8b',
        registered: '2020-02-02',
        regUntil: '01-01-1996',
        built: '2010-10-02T00:10:00.009Z',
        timestamp: 1591038000000
      };

      const { value, error } = airframe.validate(input);
      expect(value).toEqual(expected);
      expect(error).toBeUndefined();
    });

    test('it validates an airframe', () => {
      const input = {
        registration: 'N1977E',
        manufacturerName: 'Boeing',
        model: 'Boeing 787',
        typecode: 'B78X',
        serialNumber: '12445',
        icaoAircraftClass: 'L2J',
        operator: 'GobbleTech LLC',
        operatorCallsign: 'Gobbles',
        operatorIcao: 'GT',
        operatorIata: 'GT',
        owner: 'Wells Fargo Inc.',
        categoryDescription: 'Large (75000 to 300000 lbs)',
        engines: 'Trent Rolls Royce',
        country: 'Honduras',
        hex: 'a9bb8b'
      };

      const expected = {
        ...base,
        ...input
      };

      const { value, error } = airframe.validate(input);
      expect(value).toEqual(expected);
      expect(error).toBeUndefined();
    });
  });
});