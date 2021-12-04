const _ = require('lodash');
const { compareDistance, hex, key } = require('./utils');
const pMap = require('p-map');

const {
  ACTIVE_RUNWAY,
  BOARD,
  ARRIVALS,
  DEPARTURES,
  REGION_AIRCRAFT,
  ENRICHMENTS,
} = require('../lib/redis-keys');

const BOARD_TTL = 15;
const STATUS_TTL = 60;

module.exports = (store, redis, mongo, logger) =>
  computeAirportBoard(store, redis, mongo, logger.scope('airport-board'));

/**
 * Return an async function that fetches the airport, all valid aircraft, and subsequently
 * computes the airport's arrival/departure board
 *
 * @param store
 * @param redis
 * @param mongo
 * @param logger
 * @returns {(ident) => Promise<{}>}
 */
function computeAirportBoard(store, redis, mongo, logger) {
  return async ident => {
    try {
      const airport = await mongo.getAirport(ident);
      if (!airport) {
        logger.error('failed to fetch airport json', { airport: ident });
        return;
      }
      const { aircraft } = await store.getValidAircraftMap();

      const aircraftBoard = await buildBoard(airport, aircraft, redis);
      await writeBoard(aircraftBoard, redis, logger);

      return aircraftBoard;
    } catch (e) {
      logger.error('failed to compute airport board', { error: e });
    }
  };
}

/**
 * Build the airport's arrival/departure board and cache it in redis
 *
 * @param airport {object} - airport object from mongo
 * @param aircraft {aircraft[]} - array of all valid aircraft from store
 * @param redis
 * @returns {Promise<{}>}
 */
async function buildBoard(airport, aircraft, redis) {
  const { ident, runways } = airport;
  const fetchAircraft = fetchAircraftInRegion(aircraft, redis);

  const runwayKeys = runways.map(key);
  const activeRunways = _.compact(
    await pMap(runwayKeys, k => redis.get(ACTIVE_RUNWAY(k)))
  );
  const aircraftOnRunway = await pMap(
    _.flatten(await pMap(runwayKeys, fetchAircraft)),
    enrich(redis)
  );

  if (!activeRunways.length) {
    return boardTemplate({
      ident,
      onRunway: aircraftOnRunway,
      note: 'active runway unknown',
    });
  }

  const { approachRegionKeys, departureRegionKeys } =
    getApproachAndDepartureKeys(runways, activeRunways);

  if (!approachRegionKeys.size || !departureRegionKeys.size) {
    throw new Error(
      'malformed airport; missing approach and departure keys on runway'
    );
  }

  const arriving = await pMap(
    _.flatten(await pMap(approachRegionKeys, fetchAircraft)),
    enrich(redis)
  );

  const departed = await pMap(
    _.flatten(await pMap(departureRegionKeys, fetchAircraft)),
    enrich(redis)
  );

  const { arrived, departing } = await partitionAircraftInRunway(redis)(
    aircraftOnRunway,
    ident
  );

  const board = boardTemplate({
    ident,
    arriving,
    arrived,
    departing,
    departed,
    onRunway: aircraftOnRunway,
    activeRunways,
  });

  return sortBoard(board, airport);
}

/**
 * Return a function that fetches the aircraft hashes for a given region
 *
 * @param aircraft {aircraft[]}
 * @param redis
 * @returns {(string) => aircraft[]}
 */
function fetchAircraftInRegion(aircraft, redis) {
  return async regionKey => {
    const hexes = (await redis.smembers(REGION_AIRCRAFT(regionKey))) || [];
    return hexes.map(hex => aircraft[hex]);
  };
}

/**
 * Given the currently active surfaces, get the current approach and departure region
 * keys
 *
 * @param runways {runway[]}
 * @param actives {string[]}
 * @returns {{approachRegionKeys: Set<string>, departureRegionKeys: Set<string>}}
 */
function getApproachAndDepartureKeys(runways, actives) {
  return runways.reduce(
    (acc, runway) => {
      const activeSurface = _.find(runway.surfaces, s =>
        actives.includes(s.name)
      );
      if (
        activeSurface &&
        activeSurface.approachRegionKey &&
        activeSurface.departureRegionKey
      ) {
        acc.approachRegionKeys.add(activeSurface.approachRegionKey);
        acc.departureRegionKeys.add(activeSurface.departureRegionKey);
      }
      return acc;
    },
    {
      approachRegionKeys: new Set(),
      departureRegionKeys: new Set(),
    }
  );
}

/**
 * Return a function that partitions an array of aircraft currently located in the runway
 * into arrivals and departures
 *
 * @param redis
 */
function partitionAircraftInRunway(redis) {
  /**
   * @param aircraftOnRunway {aircraft[]} - list of aircraft hashes currently located within
   *                                        the runway boundaries
   * @param routeKey {string}
   */
  return async (aircraftOnRunway, airportKey) => {
    const res = {
      arrived: [],
      departing: [],
    };
    if (!aircraftOnRunway.length) {
      return res;
    }
    // get all aircraft that we know are arriving on the route
    const arrivalHexes = (await redis.smembers(ARRIVALS(airportKey))) || [];
    return aircraftOnRunway.reduce((acc, aircraft) => {
      const hex = aircraft.hex;
      if (arrivalHexes.includes(hex)) {
        // aircraft was previously arriving or already arrived, so it must be inbound
        acc.arrived.push(aircraft);
      } else {
        // aircraft was previously in no region, so it must be outbound
        acc.departing.push(aircraft);
      }
      return acc;
    }, res);
  };
}

/**
 * Return a function that enriches an aircraft with enrichments already generated and
 * cached by the enrichments-worker
 *
 * @param redis
 */
function enrich(redis) {
  /**
   * @param aircraft {object}
   */
  return async aircraft => {
    const enrichments = await redis.hgetAsJson(ENRICHMENTS, aircraft.hex);
    return enrichments ? _.merge(aircraft, enrichments) : aircraft;
  };
}

/**
 * Sort the arriving and departing arrays in a board according to distance;
 * aircraft located on the runway are not sorted since theoretically/hopefully
 * there should never be more than one departing or arriving aircraft on the
 * runway at a time :)
 *
 * @param airportBoard {object}
 * @param airport {object}
 * @returns {object}
 */
function sortBoard(airportBoard, airport) {
  const comparator = (a, b) => compareDistance(a, b, airport.lonlat);
  airportBoard.arriving.sort(comparator); // sort from next arrival to last arrival
  airportBoard.departed.sort(comparator).reverse(); // sort from least recent to most recent departure
  airportBoard.activeRunways.sort();
  return airportBoard;
}

/**
 * Write a generated airport board to redis
 *
 * @param board {object}
 * @param redis
 * @param logger
 * @returns {Promise<void>}
 */
async function writeBoard(board, redis, logger) {
  try {
    const pipeline = redis.pipeline();
    const { ident } = board;

    // write arrivals and departures for enrichments-worker to consume
    const arrived = board.arrived || [];
    const arriving = board.arriving || [];
    const arrivals = [...arrived, ...arriving];
    if (arrivals.length) {
      pipeline.saddEx(ARRIVALS(ident), STATUS_TTL, ...arrivals.map(hex));
    }
    const departed = board.departed || [];
    const departing = board.departing || [];
    const departures = [...departing, ...departed];
    if (departures.length) {
      pipeline.saddEx(DEPARTURES(ident), STATUS_TTL, ...departures.map(hex));
    }

    pipeline.setex(BOARD(ident), BOARD_TTL, JSON.stringify(board));
    await pipeline.exec();
  } catch (e) {
    logger.error('failed to write board partition to redis', { error: e });
  }
}

function boardTemplate(values = {}) {
  const result = {
    ident: values.ident,
    arriving: values.arriving || null,
    arrived: values.arrived || null,
    departing: values.departing || null,
    departed: values.departed || null,
    onRunway: values.onRunway || null,
    activeRunways: values.activeRunways || null,
  };
  if (values.note) {
    result.note = values.note;
  }
  return result;
}
