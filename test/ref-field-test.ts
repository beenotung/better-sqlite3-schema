import { allNames } from '@beenotung/tslib/constant/character-name'
import { Random } from '@beenotung/tslib/random'
import { createDB, makeCachedPreparedRefFns } from '../src'

const db = createDB({
  file: 'db.sqlite3',
  migrate: false,
})
db.run(`
create table if not exists "name" (
  "id" integer primary key,
  "name" text unique
);
`)
const { getRefId, getRefValue } = makeCachedPreparedRefFns(db, 'name', 'id')
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
