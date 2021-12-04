module.exports = mocks =>
  class RedisService {
    constructor() {
      return {
        ...mocks,
        pipeline() {
          return this;
        },
      };
    }
  };
