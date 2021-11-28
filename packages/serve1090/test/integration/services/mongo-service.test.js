const MongoService = require('../../../src/services/mongo-service');
const { MongoMemoryServer } = require('mongodb-memory-server');

jest.mock('../../../src/lib/logger', () => () => require('../../support/mock-logger'));

describe('mongo-service', () => {

  let mongod, service, port;
  const dbName = 'foo';

  beforeAll(async () => {
    mongod = new MongoMemoryServer({
      instance: {
        dbName
      }
    });
    await mongod.start();
    const uri = mongod.getUri();
    port = uri.match(/(?<=1:)(\d*)(?=\/)/)[0];
  });

  beforeEach(async () => {
    service = new MongoService({
      host: '127.0.0.1',
      port,
      dbName
    });
    await service.connect();
  });

  afterEach(async () => {
    await service.close();
  });

  afterAll(async () => {
    await mongod.stop();
  });

  test('ping', async () => {
    const ping = await service.ping();
    expect(ping.ok).toBe(1);
  });

  test('getAirport', async () => {
    const airports = service.airports;
    await airports.insertOne({ ident: 'kvkx' });

    const vkx = await service.getAirport('kvkx');

    expect(vkx.ident).toBe('kvkx');
  });

  test('getAllActiveAirportIdents', async () => {
    const airports = service.airports;
    await airports.insertMany([
      { ident: 'kvkx', active: true },
      { ident: '2w5', active: false },
      { ident: 'kaus' }
    ]);

    const idents = await service.getAllActiveAirportIdents();
    expect(idents).toEqual(['kvkx']);
  });
});
