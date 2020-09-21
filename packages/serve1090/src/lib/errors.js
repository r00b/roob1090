class AuthError extends Error {
  constructor (message) {
    super();
    this._message = message;
  }

  get message () {
    return `authentication error: ${this._message}`;
  }
}

class BroadcastError extends Error {
}

class StaleDataError extends Error {
  constructor (clientNowISOString) {
    super();
    this._clientNowISOString = clientNowISOString;
  }

  get message () {
    return `client data rejected because of age (${this._clientNowISOString}s)`;
  }
}

class LoggerError extends Error {
}

class StoreError extends Error {
}

class ServerError extends Error {

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
  BroadcastError,
  StaleDataError,
  LoggerError,
  StoreError,
  RedisError,
  ServerError
};
