set -e

if [ "$compress" == "1" ]; then
  npx ts-node example/archive-export.ts | xz -T0 - > data/db-archive.txt.xz
else
  npx ts-node example/archive-export.ts | pv > data/db-archive.txt
fi
