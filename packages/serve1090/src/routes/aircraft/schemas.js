const Joi = require('joi');

const PUMP_SCHEMA = Joi.object({
  aircraft: Joi.array().required(),
  token: Joi.string().optional(),
  device_id: Joi.string().required(),
  messages: Joi.number().required(),
  now: Joi.number().required()
});

module.exports = {
  PUMP_SCHEMA
};