// note: this module is not currently in use
// needs SERVER_USERNAME and SERVER_PASS env vars and express-basic-auth

const express = require('express');
const logger = require('../../lib/logger')().scope('auth');
const basicAuth = require('express-basic-auth');
const { nanoid } = require('nanoid');
const RedisService = require('../../services/redis-service');

const redis = new RedisService();
const TICKET_TTL = 86400; // 1 day

module.exports = (auth) => {
  return new express.Router()
    .get('/ticket', basicAuth(auth), generateTicket)
    .use(errorHandler);
};

/**
 * Generate a unique token, store it, and send it back to the client
 */
async function generateTicket (req, res, next) {
  try {
    const ticket = nanoid(64);
    await redis.saddEx('tickets', TICKET_TTL, ticket);
    res.status(200).json({
      ticket,
      ttl: TICKET_TTL
    });
    logger.info('ticket allocated');
  } catch (e) {
    next(e);
  }
}

/**
 * Handle errors thrown at any point in the request
 */
function errorHandler (err, req, res, next) {
  try {
    const message = 'internal server error';
    const detail = err.message;
    res.locals.requestLogger.error(message, { detail });
    return res.status(500).json({
      message,
      detail
    });
  } catch (e) {
    res.status(500);
    logger.error('unhandled router error', e);
  }
}
