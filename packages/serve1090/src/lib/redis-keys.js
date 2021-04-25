const ALL_AIRCRAFT_STORE = 'aircraft:all';
const VALID_AIRCRAFT_STORE = 'aircraft:valid';
const INVALID_AIRCRAFT_STORE = 'aircraft:invalid';

const ARRIVALS = key => `${key}:arrivals`;
const DEPARTURES = key => `${key}:departures`;
const BOARD = key => `${key}:board`;

const ACTIVE_RUNWAY = key => `${key}:activeRunway`;
const REGION_AIRCRAFT = key => `${key}:aircraft`;

const ENRICHMENTS = 'enrichments';
const ROUTES = 'routes';
const AIRFRAMES = 'airframes';

const BROADCAST_CLIENT_COUNT = 'broadcastClientCount';
const DATA_SOURCE_COUNT = 'dataSourceCount';

module.exports = {
  ALL_AIRCRAFT_STORE,
  VALID_AIRCRAFT_STORE,
  INVALID_AIRCRAFT_STORE,
  ARRIVALS,
  DEPARTURES,
  BOARD,
  ACTIVE_RUNWAY,
  REGION_AIRCRAFT,
  ENRICHMENTS,
  ROUTES,
  AIRFRAMES,
  BROADCAST_CLIENT_COUNT,
  DATA_SOURCE_COUNT
};
