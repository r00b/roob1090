# serve1090

### Overview

`serve1090` scaffolds an `express` server for receiving `dump1090` data via WebSocket; filtering, validating, and aggregating it into an API; and finally, for performing geospatial work using aircraft data to determine which airspaces they are located in and which aircraft are currently arriving or departing a specified airport. Further features are under active development.

### Prerequisites

1. Node as defined in `.nvmrc` (recommend using `nvm`)
2. A running instance of KeyDB exposed on port 6379

### Installation and execution

`yarn start`

### Remarks

The server depends on a running instance of KeyDB, a fork of Redis, for managing aircraft and other runtime data. KeyDB was chosen specifically because it supports the `EXPIREMEMBER` command which enables members of hashes and sets to self-destruct after a given timeout, a critical feature for managing aircraft data that quickly becomes stale as aircraft fly in and out of the range of the dependent `dump1090` receivers.