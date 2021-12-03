const Joi = require("./joi");
const camelcaseKeys = require("camelcase-keys");

const MAX_VALID_SEEN = 10;

// note: carefully review any code that consumes aircraft objects
// if changing props from required() to optional()

// https://github.com/flightaware/dump1090/blob/master/README-json.md
const aircraft = Joi.object({
  // 24-bit ICAO identifier, unique to each aircraft
  hex: Joi.string().required(),
  // callsign/tail number
  flight: Joi.string().trim().required(),

  // latitude in decimal degrees
  lat: Joi.number().required(),
  // longitude in decimal degrees
  lon: Joi.number().required(),
  // barometric altitude (feet), which may be the string 'ground'
  alt_baro: Joi.altitude().required(),
  // rate of change of barometric altitude, feet/minute
  baro_rate: Joi.number().optional(),
  // geometric altitude (feet)
  alt_geom: Joi.altitude().optional(),
  // rate of change of geometric altitude, feet/minute
  geom_rate: Joi.number().optional(),
  // true track over ground (degrees 0-359)
  track: Joi.number().required(),
  // rate of change of track, degrees/second
  track_rate: Joi.number().optional(),
  // heading, degrees clockwise from magnetic north
  mag_heading: Joi.number().optional(),
  // heading, degrees clockwise from true north
  true_heading: Joi.number().optional(),
  // roll, degrees, negative if left roll
  roll: Joi.number().optional(),
  // groundspeed (knots)
  gs: Joi.number().optional(),
  // indicated airspeed (knots)
  ias: Joi.number().optional(),
  // true airspeed (knots)
  tas: Joi.number().optional(),
  // mach number
  mach: Joi.number().optional(),

  // Mode A code / squawk (octal digits)
  squawk: Joi.string().optional(),
  // set of engaged automation modes
  nav_modes: Joi.array().items(Joi.string()).optional(),
  // selected heading
  nav_heading: Joi.number().optional(),
  // altimeter setting
  altimeter: Joi.altimeter().optional(),
  // MCP/FCU selected altitude
  nav_altitude_mcp: Joi.number().optional(),
  // FMS selected altitude
  nav_altitude_fms: Joi.number().optional(),

  // ADS-B emergency status
  emergency: Joi.string().optional(),
  // max allowed seconds for an aircraft to be considered valid
  seen: Joi.number().max(MAX_VALID_SEEN).required(),
  // how long ago in seconds position was last updated
  seen_pos: Joi.number().optional(),
  // last time aircraft was updated (always generated by serve1090)
  updated: Joi.number().forbidden().default(Date.now()),
  // if there is a validation error
  error: Joi.boolean().forbidden().default(false),
  // recent verage RSSI (signal power) (dbFS) (always negative)
  rssi: Joi.number().optional(),
  // number of Mode S messages received from aircraft
  messages: Joi.number().optional(),

  // // aircraft emitter category
  // category: Joi.string(),
  // // navigation integrity category
  // nic: Joi.number(),
  // // NIC for barometric altitude
  // nic_baro: Joi.number(),
  // // radius of containment
  // rc: Joi.number(),
  // // ADS-B version number [0, 1, 2]
  // version: Joi.number(),
  // // navigation accuracy for position
  // nac_p: Joi.number(),
  // // navigation accuracy for velocity
  // nac_v: Joi.number(),
  // // source integrity level
  // sil: Joi.number(),
  // // interpretation of SIL (unknown, perhour, persample)
  // sil_type: Joi.string(),
  // // geometric vertical accuracy
  // gva: Joi.number(),
  // // system design assurance
  // sda: Joi.number(),
  // // list of fields derived from MLAT
  // mlat: Joi.array().items(Joi.string()),
  // // list of fields derived from TISB
  // tisb: Joi.array().items(Joi.string()),
  // // type of message (ADSB vs TISB, etc)
  // type: Joi.string()
})
  .options({ stripUnknown: true })
  .rename("nav_qnh", "altimeter", { override: true });

/**
 * Schema for validating a response from the OpenSky /metadata/aircraft/icao API
 */
const airframe = Joi.object({
  hex: Joi.string().hex().required(),
  // airframe registration number
  registration: Joi.string().uppercase().failover(null).default(null),
  // manufacturer name, well-formatted (i.e. Boeing)
  manufacturerName: Joi.stringOrNull(),
  // aircraft model full name (i.e. Boeing 737-8HF)
  model: Joi.stringOrNull(),
  // aircraft typecode (i.e. B737)
  type: Joi.stringOrNull(),
  // airframe serial number
  serialNumber: Joi.stringOrNull(),
  // ICAO class
  icaoAircraftClass: Joi.stringOrNull(),
  // operator of aircraft
  operator: Joi.stringOrNull(),
  // operator ATC callsign
  operatorCallsign: Joi.stringOrNull(),
  // operator ICAO callsign/ident prefix
  operatorIcao: Joi.stringOrNull(),
  // operator IATA callsign/ident prefix
  operatorIata: Joi.stringOrNull(),
  // full name of owner
  owner: Joi.stringOrNull(),
  // i.e. Large (75000 to 300000 lbs)
  categoryDescription: Joi.stringOrNull(),
  // expiration date of registration
  regUntil: Joi.dateOrNull(),
  // date airframe was completed
  built: Joi.dateOrNull(),

  // engine equipment
  engines: Joi.stringOrNull(),
  // country of registration
  country: Joi.stringOrNull(),
  // date updated (millis)
  lastUpdated: Joi.dateOrNull(),

  // selCal: Joi.string(),
  // // manufacturer ICAO (i.e. BOEING)
  // manufacturerIcao: Joi.string(),
  // status: Joi.string(),
  // // airframe line number
  // lineNumber: Joi.string(),
  // // date registered (seems to always be null)
  // registered: Joi.string(),
  // // date of first flight (seems to always be null)
  // firstFlightDate: Joi.string(),
  // modes: Joi.boolean(),
  // adsb: Joi.boolean(),
  // acars: Joi.boolean(),
  // vdl: Joi.boolean(),
  // notes: Joi.string(),
  // lastSeen: Joi.string(),
  // firstSeen: Joi.string(),
  // // FlightAware
  // // FlightAware unique identifier for flight
  // faFlightId: Joi.string(),
  // prefix: Joi.string(),
  // suffix: Joi.string(),
  // // time of departure, epoch
  // departureTime: Joi.number(),
  // // time of first recorded position
  // firstPositionTime: Joi.number(),
  // // time of arrival
  // arrivalTime: Joi.number(),
  // // "C" when the aircraft is more than 200 feet away from its ATC-assigned altitude
  // altitudeStatus: Joi.string(),
  // // update type: TP=projected, TO=oceanic, TZ=radar, TA=broadcast, TM=multilateration, TD=datalink, TX=surface, TS=space-based
  // updateType: Joi.string(),
  // // "C" when climbing, "D" when descending, empty if neither
  // altitudeChange: Joi.string(),
  // // space-separated lat/long pairs drawing a line approximating the path of the aircraft's route
  // waypoints: Joi.string()
})
  .options({ stripUnknown: true })
  .rename("icao24", "hex", { override: true })
  .rename("typecode", "type", { override: true })
  .rename("timestamp", "lastUpdated");

const pumpBody = Joi.object({
  aircraft: Joi.array().required(),
  // router will handle missing token
  token: Joi.string().optional(),
  // device identifier, generated client-side
  device_id: Joi.string().required(),
  messages: Joi.number().required(),
  // current time in seconds since epoch
  now: Joi.number().required(),
});

const exportSchema = function (schema) {
  return {
    ...schema,
    validate: (input) => {
      const { value, ...other } = schema.validate(input);
      return {
        ...other,
        value: camelcaseKeys(value),
      };
    },
  };
};

module.exports = {
  aircraft: exportSchema(aircraft),
  airframe: exportSchema(airframe),
  pumpBody,
};
