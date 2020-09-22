class AuthError extends Error {
  constructor (message, code) {
    super();
    this._message = message;
    this._code = code;
  }

  get message () {
    return `authentication error: ${this._message}`;
  }

  get code () {
    return this._code;
  }
}

class PumpError extends Error {
}

class BroadcastError extends Error {
}

class RedisError extends Error {
  constructor (message, details) {
    super();
    this._message = message;
    this._details = details;
  }

  get message () {
    return `RedisError: ${this._message}`;
  }

  get details () {
    return this._details;
  }
}

module.exports = {
  AuthError,
  PumpError,
  BroadcastError,
  RedisError
};
