# serve1090

### Overview

`serve1090` scaffolds an `express` server for receiving `dump1090` data via WebSocket; filtering, validating, and aggregating it into an API; enriching it with data from OpenSky and FlightAware; and finally, for performing geospatial computations to sort each flight into a given airspace of interest. There is also an airport engine for tracking and profiling aircraft movements at any specified airport.

### API

| Verb            | URL                                      | Function                                                                                                                                                              | Notes                                                                                                                                                                                                                                               |
|-----------------|------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `GET`           | `/`                                      | Get the root of the API, returning documentation and route info                                                                                                       |                                                                                                                                                                                                                                                     |
| `GET`&rarr;`WS` | `/aircraft/pump/.websocket`              | Make an HTTP/1.1 upgrade request to open a WebSocket connection for sending dump1090 JSON data                                                                        | Each message sent through the Websocket pipe must be a stringified JSON hash containing a property `token` whose value is equal to `PUMP_SECRET`                                                                                                    |
| `GET`           | `/aircraft/all`                          | Get all flights currently in range of all connected receivers, each of which may or may not be valid                                                                  |                                                                                                                                                                                                                                                     |
| `GET`           | `/aircraft/valid`                        | Get all validated* flights currently in range                                                                                                                         |                                                                                                                                                                                                                                                     |
| `GET`           | `/aircraft/invalid`                      | Get all flights currently in range that failed validation                                                                                                             |                                                                                                                                                                                                                                                     |
| `GET`           | `/aircraft/totalCount`                   | Get count of all flights currently in range                                                                                                                           |                                                                                                                                                                                                                                                     |
| `GET`           | `/aircraft/validCount`                   | Get count of all valid flights currently in range                                                                                                                     |                                                                                                                                                                                                                                                     |
| `GET`           | `/airports`                              | Get list of all supported airport boards                                                                                                                              |                                                                                                                                                                                                                                                     |
| `GET`           | `/airports/boards/[$airport]`            | Get the current board for `$airport`; i.e. `/airports/kdca`                                                                                                           |                                                                                                                                                                                                                                                     |
| `GET`&rarr;`WS` | `/airports/boards/[$airport]/.websocket` | Make an HTTP/1.1 upgrade request to open a WebSocket connection that will broadcast the board for `$airport` once per second; i.e. `/airports/boards/kdca/.websocket` | Upon opening the WebSocket pipe, the server will listen for 5 seconds for a message containing a stringified JSON hash with a property `token` whose value is equal to `BROADCAST_SECRET`; after this secret is validated, the broadcast will start |

*a validated aircraft conforms to the schema defined by `AIRCRAFT_SCHEMA` in [schemas.js](./src/stores/schemas.js)

### Development

#### Prerequisites

1. From the repo root, run `chmod +x scripts/setup.sh && ./scripts/setup.sh` and follow prompts
2. Optionally, add OpenSky and FlightAware FlightXML2 username/password pairs to `.env` 

Then, if running via Docker only: 

1. [Docker CLI](https://docs.docker.com/get-docker/)

Alternatively, if running the `express` server outside of a Docker container:

1. Volta: `curl https://get.volta.sh | bash`
2. Node: `volta install node`
3. Yarn: `volta install yarn`

#### Installation and execution

`yarn compose` (`docker-compose up -d --build`) will start the entire `serve1090` stack within two `docker` containers, one for the `express` server and one for KeyDB. The `express` server running in the container supports hot reloading.

By default, the app builds under `NODE_ENV=development`. For a production build without hot reloading that uses a performance logger and PM2 for crash recovery, change `NODE_ENV` to `production` in `.env` and run `yarn compose`.

It is possible to directly run `keydb-cli` against the KeyDB instance. SSH into the KeyDB Docker container and run `keydb-cli -a "KEYDB_PASSWORD"` where `KEYDB_PASSWORD` is the password generated by `setup.sh` and stored in `.env`.

See [package.json](package.json) for more info.

#### KeyDB and Redis

`serve1090` depends on [KeyDB](https://github.com/JohnSully/KeyDB), a high performance fork of [Redis](https://github.com/redis/redis) with some extra features that are particularly useful for keeping and constantly refreshing an updated data stream of aircraft. Specifically, `serve1090` leverages the `EXPIREMEMBER` command unique to KeyDB that allows for an individual member of a hash or set to be given an expiration time, something that is not possible in Redis and saves a lot of complicated store logic to purge out stale aircraft as the fly out of range of the dependent `dump1090` receiver(s).

`serve1090` will fail to persist aircraft without a properly configured instance of KeyDB exposed on port 6379 (see [keydb.conf.template](keydb.conf.template)).

#### Adding new airspaces

Coming soon!