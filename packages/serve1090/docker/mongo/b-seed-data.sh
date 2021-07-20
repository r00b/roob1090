# note: init scripts are run alphabetically by filename

for file in /data/seed_data/airports/*
do
  mongoimport --db serve1090 --collection airports --file $file --username $MONGO_USERNAME --password $MONGO_PASSWORD --authenticationDatabase admin
done

for file in /data/seed_data/airspaces/*
do
  mongoimport --db serve1090 --collection airspaces --file $file --username $MONGO_USERNAME --password $MONGO_PASSWORD --authenticationDatabase admin
done
