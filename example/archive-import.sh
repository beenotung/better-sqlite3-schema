set -e

if [ -f data/sqlite3.db ]; then
  rm data/sqlite3.db
fi

if [ "$compress" == "1" ]; then
  unxz -k -f -T0 data/db-archive.txt.xz | npx ts-node example/archive-import.ts
else
  cat data/db-archive.txt | pv | npx ts-node example/archive-import.ts
fi
