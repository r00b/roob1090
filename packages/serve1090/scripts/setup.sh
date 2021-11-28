#!/bin/bash

printf 'Initializing environment for serve1090...\n'

random() {
  base64 /dev/urandom | tr -dc A-Za-z0-9 | head -c 64
}

# generate keys
KEYDB_PASSWORD=$(random)
MONGO_ROOT_PASSWORD=$(random)
MONGO_PASSWORD=$(random)
PUMP_KEY=$(random)
BROADCAST_KEY=$(random)

printf '\n'
printf 'Use the following pump and broadcast keys for data sources and clients:\n'
printf 'PUMP_KEY: %s\n' $PUMP_KEY
printf 'BROADCAST_KEY: %s\n' $BROADCAST_KEY
printf '\n'

printf 'Add OpenSky and FlightXML2 credentials to .env to enable enrichments.\n'
printf '\n'

printf 'Generating .env and keydb.conf...\n'

cp .env.template .env
cp keydb.conf.template keydb.conf

# inject secrets into env files
sed -i '' -e "s/PUMP_KEY=/PUMP_KEY=$PUMP_KEY/" .env
sed -i '' -e "s/BROADCAST_KEY=/BROADCAST_KEY=$BROADCAST_KEY/" .env
sed -i '' -e "s/KEYDB_PASSWORD=/KEYDB_PASSWORD=$KEYDB_PASSWORD/" .env
sed -i '' -e "s/MONGO_ROOT_PASSWORD=/MONGO_ROOT_PASSWORD=$MONGO_ROOT_PASSWORD/" .env
sed -i '' -e "s/MONGO_PASSWORD=/MONGO_PASSWORD=$MONGO_ROOT_PASSWORD/" .env
sed -i '' -e "s/REPLACE_WITH_KEYDB_PASSWORD/$KEYDB_PASSWORD/" keydb.conf

printf 'serve1090 environment setup complete\n'
