printf 'Initializing environment for serve1090...\n'

printf 'Specify the pump1090 secret:\n'
read -p '> ' PUMP1090_SECRET

# printf 'Specify an arbitrary password for KeyDB (recommend a long, randomized string of mixed case characters, numbers, and symbols)\n'
# read -p '> ' KEYDB_PASSWORD

KEYDB_PASSWORD=$(date +%s | sha256sum | base64 | head -c 64)

printf 'Generating .env and keydb.conf...\n'

cp .env.template .env
cp keydb.conf.template keydb.conf

sed -i '' -e "s/REPLACE_WITH_SECRET/$PUMP1090_SECRET/" .env
sed -i '' -e "s/REPLACE_WITH_KEYDB_PASSWORD/$KEYDB_PASSWORD/" .env
sed -i '' -e "s/REPLACE_WITH_KEYDB_PASSWORD/$KEYDB_PASSWORD/" keydb.conf

printf 'serve1090 environment setup complete\n'