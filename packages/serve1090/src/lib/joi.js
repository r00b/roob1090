const BaseJoi = require('joi');

const Joi = {
  ...BaseJoi.extend(
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
    },
    joi => {
      return {
        type: 'altimeter',
        base: joi.number(),
        coerce (value, helpers) {
          const inHg = value * 0.02953;
          return { value: Number.parseFloat(inHg.toFixed(2)) };
        }
      };
    }
  ),
  // set value to null if validation fails or if value does not exist
  stringOrNull: () => BaseJoi.string().failover(null).default(null),
  numberOrNull: () => BaseJoi.number().failover(null).default(null),
  dateOrNull: () => BaseJoi.date().failover(null).default(null)
};

module.exports = Joi;
