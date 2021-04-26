const BaseJoi = require('joi');
const camelcaseKeys = require('camelcase-keys');

const Joi = BaseJoi.extend(
  joi => {
    return {
      type: 'altitude',
      base: joi.alternatives().try(joi.number(), joi.string().valid('ground')),
      coerce (value, helpers) {
        if (value === 'ground') {
          return { value: 0 };
        }
      }
    };
  }
);

// set value to null if validation fails or if value does not exist
const stringOrNull = Joi.string().failover(null).default(null);
const dateOrNull = Joi.date().failover(null).default(null);

/**
 * Schema for validating a response from the OpenSky /metadata/aircraft/icao API
 */
const airframe = Joi.object({
  hex: Joi.string().hex().required(),
  // airframe registration number
  registration: Joi.string().uppercase().failover(null).default(null),
  // manufacturer name, well-formatted (i.e. Boeing)
  manufacturerName: stringOrNull,
  // manufacturer ICAO (i.e. BOEING)
  manufacturerIcao: Joi.strip(),
  // aircraft model full name (i.e. Boeing 737-8HF)
  model: stringOrNull,
  // aircraft typecode (i.e. B737)
  type: stringOrNull,
  // airframe serial number
  serialNumber: stringOrNull,
  // airframe line number
  lineNumber: Joi.strip(),
  // ICAO class
  icaoAircraftClass: stringOrNull,
  selCal: Joi.strip(),
  // operator of aircraft
  operator: stringOrNull,
  // operator ATC callsign
  operatorCallsign: stringOrNull,
  // operator ICAO callsign/ident prefix
  operatorIcao: stringOrNull,
  // operator IATA callsign/ident prefix
  operatorIata: stringOrNull,
  // full name of owner
  owner: stringOrNull,
  // i.e. Large (75000 to 300000 lbs)
  categoryDescription: stringOrNull,
  // date registered (seems to always be null)
  registered: Joi.strip(),
  // expiration date of registration
  regUntil: dateOrNull,
  status: Joi.strip(),
  // date airframe was completed
  built: dateOrNull,
  // date of first flight (seems to always be null)
  firstFlightDate: Joi.strip(),
  // engine equipment
  engines: stringOrNull,
  modes: Joi.strip(),
  adsb: Joi.strip(),
  acars: Joi.strip(),
  vdl: Joi.strip(),
  notes: Joi.strip(),
  // country of registration
  country: stringOrNull,
  lastSeen: Joi.strip(),
  firstSeen: Joi.strip(),
  // date updated (millis)
  lastUpdated: dateOrNull
})
  .options({ stripUnknown: true })
  .rename('icao24', 'hex', { override: true })
  .rename('typecode', 'type', { override: true })
  .rename('timestamp', 'lastUpdated');

const exportSchema = function (schema) {
  return {
    ...schema,
    validate: (object) => {
      return schema.validate(camelcaseKeys(object));
    }
  };
};

module.exports = {
  airframe: exportSchema(airframe)
};
