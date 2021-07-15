class AuthError extends Error {
  constructor (message, code) {
    super(message);
    this._code = code;
  }

  get code () {
    return this._code;
  }

  get wsCode () {
    return 1008;
  }
}

class PayloadError extends Error {
  get code () {
    return 400;
  }

  get wsCode () {
    return 1007;
  }
}

class BroadcastError extends Error {
  get code () {
    return 500;
  }

  get wsCode () {
    return 1011;
  }
}

class RedisError extends Error {
  constructor (message, detail) {
    super();
    this._message = message;
    this._detail = detail;
  }

  get message () {
    return `redis error: ${this._message}`;
  }

  get detail () {
    return this._detail;
  }
}

module.exports = {
  AuthError,
  PayloadError,
  BroadcastError,
  RedisError
};
