class AuthError extends Error {
  constructor(message, code) {
    super(message);
    this._code = code;
  }

  get code() {
    return this._code;
  }

  get wsCode() {
    return 1008;
  }
}

class PayloadError extends Error {
  get code() {
    return 400;
  }

  get wsCode() {
    return 1007;
  }
}

class BroadcastError extends Error {
  get code() {
    return 500;
  }

  get wsCode() {
    return 1011;
  }
}

class DatabaseError extends Error {
  constructor(message, detail) {
    super();
    this._message = message;
    this._detail = detail;
  }

  get message() {
    return `database error: ${this._message}`;
  }

  get detail() {
    return this._detail;
  }
}

class RedisError extends DatabaseError {
  get message() {
    return `redis error: ${this._message}`;
  }
}

class MongoError extends DatabaseError {
  get message() {
    return `mongo error: ${this._message}`;
  }
}

module.exports = {
  AuthError,
  PayloadError,
  BroadcastError,
  RedisError,
  MongoError,
};
