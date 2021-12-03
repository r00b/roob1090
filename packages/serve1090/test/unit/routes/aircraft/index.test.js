const { delay } = require("../../../support/helpers");
const express = require("express");
const ws = require("express-ws");
const request = require("supertest");
const requestWs = require("superwstest").default;
const httpRequestLogger = require("../../../../src/middleware/http-request-logger");
const aircraftRouter = require("../../../../src/routes/aircraft/index");
const { ENRICHMENTS } = require("../../../../src/lib/redis-keys");

jest.mock(
  "../../../../src/lib/logger",
  () => () => require("../../../support/mock-logger")
);

const WS_WAIT = 100;

describe("aircraft router", () => {
  let app, wss, store, redis;
  const pumpKey = "pumpKey";

  beforeEach(() => {
    app = express();
    wss = ws(app).getWss();
    app.use(httpRequestLogger);

    store = {
      addAircraft: jest.fn(),
      getAllAircraft: jest.fn(),
      getValidAircraft: jest.fn(),
      getInvalidAircraft: jest.fn(),
      getTotalAircraftCount: jest.fn(),
      getValidAircraftCount: jest.fn(),
    };
    redis = {
      incr: jest.fn(),
      decr: jest.fn(),
      hgetAllAsJson: jest.fn(),
    };

    app.use(aircraftRouter(pumpKey, store, redis));
  });

  describe("/pump", () => {
    let server, payload;

    beforeEach(() => {
      payload = {
        aircraft: [],
        token: pumpKey,
        device_id: "deviceId",
        messages: 20,
        now: Date.now(),
      };
      server = app.listen();
      store.addAircraft.mockReturnValue({
        catch: jest.fn(),
      });
    });

    afterEach(async () => {
      await server.close();
      await delay();
    });

    test("accepts data via WebSocket and adds it to store", async () => {
      await requestWs(wss)
        .ws("/pump")
        .sendText(JSON.stringify(payload))
        .close(1000)
        .expectClosed(1000)
        .wait(WS_WAIT);

      expect(store.addAircraft.mock.calls.length).toBe(1);
      expect(store.addAircraft.mock.calls[0][0]).toEqual(payload);

      expect(redis.incr.mock.calls.length).toBe(1);
      expect(redis.decr.mock.calls.length).toBe(1);
    });

    test("rejects payload with missing token", async () => {
      delete payload.token;

      await requestWs(wss)
        .ws("/pump")
        .sendText(JSON.stringify(payload))
        .expectText('{"message":"auth error","detail":"missing token"}')
        .expectClosed(1008, "auth error: missing token")
        .wait(WS_WAIT);

      expect(store.addAircraft.mock.calls.length).toBe(0);

      expect(redis.incr.mock.calls.length).toBe(1);
      expect(redis.decr.mock.calls.length).toBe(1);
    });

    test("rejects payload with invalid token", async () => {
      payload.token = "ruh roh";

      await requestWs(wss)
        .ws("/pump")
        .sendText(JSON.stringify(payload))
        .expectText('{"message":"auth error","detail":"bad token"}')
        .expectClosed(1008, "auth error: bad token")
        .wait(WS_WAIT);

      expect(store.addAircraft.mock.calls.length).toBe(0);

      expect(redis.incr.mock.calls.length).toBe(1);
      expect(redis.decr.mock.calls.length).toBe(1);
    });

    test("rejects malformed payload", async () => {
      delete payload.aircraft;

      await requestWs(wss)
        .ws("/pump")
        .sendText(JSON.stringify(payload))
        .expectText(
          '{"message":"malformed payload rejected","detail":"\'aircraft\' is required"}'
        )
        .expectClosed(
          1007,
          "malformed payload rejected: 'aircraft' is required"
        )
        .wait(WS_WAIT);

      expect(store.addAircraft.mock.calls.length).toBe(0);

      expect(redis.incr.mock.calls.length).toBe(1);
      expect(redis.decr.mock.calls.length).toBe(1);
    });

    test("handles internal errors", async () => {
      await requestWs(wss)
        .ws("/pump")
        .sendText("this will blow up JSON.parse")
        .expectText(
          '{"message":"internal server error","detail":"Unexpected token h in JSON at position 1"}'
        )
        .expectClosed(
          1011,
          "internal server error: Unexpected token h in JSON at position 1"
        )
        .wait(WS_WAIT);

      expect(store.addAircraft.mock.calls.length).toBe(0);

      expect(redis.incr.mock.calls.length).toBe(1);
      expect(redis.decr.mock.calls.length).toBe(1);
    });
  });

  describe("/all", () => {
    test("gets the entire aircraft store", async () => {
      store.getAllAircraft.mockResolvedValue({
        aircraft: "aircraft",
      });

      const res = await request(app)
        .get("/all")
        .set("Accept", "application/json")
        .expect("Content-Type", /json/)
        .expect(200);
      expect(res.body).toEqual({
        aircraft: "aircraft",
      });
    });

    test("handles errors", async () => {
      store.getAllAircraft.mockImplementation(() => {
        throw new Error("oh noes");
      });

      const res = await request(app)
        .get("/all")
        .set("Accept", "application/json")
        .expect("Content-Type", /json/)
        .expect(500);

      expect(res.body).toEqual({
        detail: "oh noes",
        message: "internal server error",
      });
    });
  });

  describe("/valid", () => {
    test("gets the valid aircraft store", async () => {
      store.getValidAircraft.mockResolvedValue({
        aircraft: "aircraft",
      });

      const res = await request(app)
        .get("/valid")
        .set("Accept", "application/json")
        .expect("Content-Type", /json/)
        .expect(200);
      expect(res.body).toEqual({
        aircraft: "aircraft",
      });
    });

    test("handles errors", async () => {
      store.getValidAircraft.mockImplementation(() => {
        throw new Error("oh noes");
      });

      const res = await request(app)
        .get("/valid")
        .set("Accept", "application/json")
        .expect("Content-Type", /json/)
        .expect(500);

      expect(res.body).toEqual({
        detail: "oh noes",
        message: "internal server error",
      });
    });
  });

  describe("/invalid", () => {
    test("gets the invalid aircraft store", async () => {
      store.getInvalidAircraft.mockResolvedValue({
        aircraft: "aircraft",
      });

      const res = await request(app)
        .get("/invalid")
        .set("Accept", "application/json")
        .expect("Content-Type", /json/)
        .expect(200);
      expect(res.body).toEqual({
        aircraft: "aircraft",
      });
    });

    test("handles errors", async () => {
      store.getInvalidAircraft.mockImplementation(() => {
        throw new Error("oh noes");
      });

      const res = await request(app)
        .get("/invalid")
        .set("Accept", "application/json")
        .expect("Content-Type", /json/)
        .expect(500);

      expect(res.body).toEqual({
        detail: "oh noes",
        message: "internal server error",
      });
    });
  });

  describe("/enrichments", () => {
    test("gets enrichments", async () => {
      redis.hgetAllAsJson.mockResolvedValue({
        enrichments: "enrichments",
      });

      const res = await request(app)
        .get("/enrichments")
        .set("Accept", "application/json")
        .expect("Content-Type", /json/)
        .expect(200);
      expect(res.body).toEqual({
        enrichments: "enrichments",
      });
      expect(redis.hgetAllAsJson.mock.calls[0][0]).toBe(ENRICHMENTS);
    });

    test("handles errors", async () => {
      redis.hgetAllAsJson.mockImplementation(() => {
        throw new Error("oh noes");
      });

      const res = await request(app)
        .get("/enrichments")
        .set("Accept", "application/json")
        .expect("Content-Type", /json/)
        .expect(500);

      expect(res.body).toEqual({
        detail: "oh noes",
        message: "internal server error",
      });
    });
  });

  describe("/totalCount", () => {
    test("gets the total count of all aircraft in the store", async () => {
      store.getTotalAircraftCount.mockResolvedValue(58);

      const res = await request(app)
        .get("/totalCount")
        .set("Accept", "application/json")
        .expect("Content-Type", /json/)
        .expect(200);
      expect(res.body).toBe(58);
    });

    test("handles errors", async () => {
      store.getTotalAircraftCount.mockImplementation(() => {
        throw new Error("oh noes");
      });

      const res = await request(app)
        .get("/totalCount")
        .set("Accept", "application/json")
        .expect("Content-Type", /json/)
        .expect(500);

      expect(res.body).toEqual({
        detail: "oh noes",
        message: "internal server error",
      });
    });
  });

  describe("/validCount", () => {
    test("gets the total count of valid aircraft in the store", async () => {
      store.getValidAircraftCount.mockResolvedValue(85);

      const res = await request(app)
        .get("/validCount")
        .set("Accept", "application/json")
        .expect("Content-Type", /json/)
        .expect(200);
      expect(res.body).toBe(85);
    });

    test("handles errors", async () => {
      store.getValidAircraftCount.mockImplementation(() => {
        throw new Error("oh noes");
      });

      const res = await request(app)
        .get("/validCount")
        .set("Accept", "application/json")
        .expect("Content-Type", /json/)
        .expect(500);

      expect(res.body).toEqual({
        detail: "oh noes",
        message: "internal server error",
      });
    });
  });
});
