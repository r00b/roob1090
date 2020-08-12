# serve1090

### Overview

`serve1090` scaffolds an `express` server for receiving `dump1090` data via WebSocket; filtering, validating, and aggregating it into an API; and finally, for performing geospatial work using aircraft data to determine which airspaces they are located in and which aircraft are currently arriving or departing a specified airport. Further features are under active development.

### Prerequisites

#### Just running it

1. [Docker CLI](https://docs.docker.com/get-docker/)
2. A `secret` configured in `.env`; do `cp .env-template .env` and populate the `SECRET` field with a uuid that matches the configured `pump1090` secret.

#### Local development

1. Node as defined in `.nvmrc` (recommend using `nvm`)
2. A running instance of KeyDB exposed on port 6379 (highly recommend using the included npm commands to run it in a Docker container)
3. A `secret` configured in `.env`; do `cp .env-template .env` and populate the `SECRET` field with a uuid that matches the configured `pump1090` secret.

### Installation and execution

`yarn serve` (`docker-compose up -d --build`) will start the entire `serve1090` stack within two `docker` containers, one for the `express` server and one for KeyDB.

`yarn serve:dev` will run *KeyDB only* in a `docker` container and start the `express` server with `nodemon` to support hot reloading.

See [package.json](package.json) for more info.

### KeyDB and Redis

`serve1090` depends on [KeyDB](https://github.com/JohnSully/KeyDB), a high performance fork of [Redis](https://github.com/redis/redis) with some extra features that are particularly useful for keeping and constantly refreshing an updated data stream of aircraft. Specifically, `serve1090` leverages the `EXPIREMEMBER` command unique to KeyDB that allows for an individual member of a hash or set to be given an expiration time, something that is not possible in Redis and saves a lot of complicated store logic to purge out stale aircraft as the fly out of range of the dependent `dump1090` receiver(s).

`serve1090` will fail to persist aircraft without a properly configured instance of KeyDB exposed on port 6379 (see [keydb.conf](keydb.conf)). 