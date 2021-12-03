// note: init scripts are run alphabetically by filename

db = db.getSiblingDB("admin");
db.auth(
  _getEnv("MONGO_INITDB_ROOT_USERNAME"),
  _getEnv("MONGO_INITDB_ROOT_PASSWORD")
);

// create a user for serve1090
db.createUser({
  user: _getEnv("MONGO_USERNAME"),
  pwd: _getEnv("MONGO_PASSWORD"),
  roles: [
    {
      role: "readWrite",
      db: "serve1090",
    },
  ],
});
