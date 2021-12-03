// note: init scripts are run alphabetically by filename

db = db.getSiblingDB('serve1090');
db.airports.createIndex({ ident: 1 }, { unique: true });
db.airspaces.createIndex({ key: 1 }, { unique: true });
