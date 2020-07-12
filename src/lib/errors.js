class InvalidClientError extends Error {
  constructor (clientSecret) {
    super();
    this._clientSecret = clientSecret;
  }

  get message () {
    return `client provided secret (${this._clientSecret}) did not match serve1090 secret`;
  }
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

module.exports = {
  InvalidClientError,
  StaleDataError,
  LoggerError,
  StoreError
};
