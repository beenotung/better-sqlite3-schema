import { allNames } from '@beenotung/tslib/constant/character-name'
import { Random } from '@beenotung/tslib/random'
import { createDB, makeCachedPreparedRefFns, setUnsafeMode } from '../src'

const db = createDB({
  file: 'db.sqlite3',
  migrate: false,
})
type Name = {
  id: number
  name: string
}
db.run(`
create table if not exists "name" (
  "id" integer primary key,
  "name" text unique
);
`)
const { getRefId, getRefValue, populateCache, val_cache, id_cache } =
  makeCachedPreparedRefFns(db, 'name', 'id')

populateCache()
console.log({ id_cache, val_cache })

let maxId = 0
for (let i = 0; i < 100; i++) {
  const name = Random.element(allNames)
  const id = getRefId(name)
  maxId = Math.max(maxId, +id.toString())
  console.log({ name, id })
}
for (let id = 1; id <= maxId; id++) {
  const name = getRefValue(id)
  console.log({ id, name })
}

db.exec(`drop table if exists test`)
db.exec(`create table test (id integer, name text)`)
setUnsafeMode(db, true)
for (let row of db
  .prepare(`select * from name`)
  .iterate() as IterableIterator<Name>) {
  db.insert('test', row)
}
setUnsafeMode(db, false)
