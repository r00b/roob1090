# dump1090

### Overview

This package contains a [git submodule](https://git-scm.com/book/en/v2/Git-Tools-Submodules) referencing [FlightAware's fork of dump1090](https://github.com/flightaware/dump1090)).

### Installation

1. `git submodule init` if not already done
2. `git submodule update` will fetch `dump1090` if not already done
3. From the `scripts` directory, `sudo chmod +x scripts/install.sh && ./scripts/install.sh`

(or, follow the instructions in `dump1090-fa/README.md`)

Removing the generated debian build files that pollute the Git source tree should not cause any major problems.

### Execution

1. Modify `dump.sh` with the correct gain, latitude, and longitude appropriate for the receiver
2. From the `scripts` directory, `sudo chmod +x scripts/dump.sh && ./scripts/dump.sh`
3. To compute gain, from the `scripts` directory, `sudo chmod +x scripts/gain.sh && ./scripts/gain.sh`

It is also possible to directly execute `dump1090-fa/dump1090` if desired. Try `./dump1090 -h` for more information.

### Remarks

`gain.sh` is an included script that calculates the percentage of strong signals parsed by the receiver. One should adjust the receiver's gain specified in `install.sh` until `gain.sh` yields a percentage around 5 percent, or 10-15 percent if near an airport, but the desired value may differ depending on the location of the receiver. [This thread](https://discussions.flightaware.com/t/thoughts-on-optimizing-gain/44482) is a good resource.