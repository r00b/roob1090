#!/bin/sh

# note: init scripts are run alphabetically by filename
function import {
  mongoimport --db serve1090 --collection $1 --file $file --username $MONGO_USERNAME --password $MONGO_PASSWORD --authenticationDatabase admin
}

for file in /data/seed_data/airports/*; do
  import airports
done

for file in /data/seed_data/airspaces/*; do
  import airspaces
done

