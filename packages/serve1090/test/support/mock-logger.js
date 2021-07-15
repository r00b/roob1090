module.exports = {
  mock: true,
  info: jest.fn(),
  debug: jest.fn(),
  verbose: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  fatal: jest.fn(),
  scope: jest.fn().mockReturnThis(),
  child: jest.fn().mockReturnThis()
};
