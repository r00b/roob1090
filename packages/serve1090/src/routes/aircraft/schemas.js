const Joi = require('joi');

const PUMP_SCHEMA = Joi.object({
  aircraft: Joi.array().required(),
  token: Joi.string().optional(), // router will handle missing token
  device_id: Joi.string().required(),
  messages: Joi.number().required(),
  now: Joi.number().required() // current time in seconds since epoch
});

module.exports = {
  PUMP_SCHEMA
};
