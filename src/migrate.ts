import { DBInstance } from './helpers'

export const DefaultMigrationTable = 'migrations'

export type MigrationItem = { name: string; up: string; down: string }
/**
 * This function has different from the better-sqlite3-helper behavior.
 *
 * This function works well when the database already has migrations from files.
 * (Mixing file mode and string array mode.)
 */
export function migrateUp(options: {
  db: DBInstance
  table?: string // default 'migrations'
  migrations: MigrationItem[]
}) {
  const db = options.db
  const table = options.table || DefaultMigrationTable
  db.run(`
create table if not exists ${table} (
  id integer primary key
, name text not null
, up text not null
, down text not null
);
`)
  const select = db.prepare(`
select id from ${table}
where name = ?
limit 1
`)
  const insert = db.prepare(`
insert into ${table}
(name, up, down)
values
(:name, :up, :down)
`)
  options.migrations.forEach(
    db.transaction(migrate => {
      if (select.get(migrate.name)) return
      db.run(migrate.up)
      insert.run(migrate)
    }),
  )
}

export function migrateDown(options: {
  db: DBInstance
  table?: string // default 'migrations'
  name: string
  throw?: boolean // throw error if the migration is not found, default false
}) {
  const db = options.db
  const table = options.table || DefaultMigrationTable
  const row = db
    .prepare(`select id, down from ${table} where name = ?`)
    .get(options.name)
  if (!row) {
    if (options.throw) throw new Error('migration not found')
    return
  }
  const delete_row = db.prepare(`delete from ${table} where id = ?`)
  db.transaction(() => {
    db.run(row.down)
    delete_row.run(row.id)
  })()
}

/**
 * rollback all the migrations until 'name' (inclusive)
 *
 */
export function migrateDownUntil(options: {
  db: DBInstance
  table?: string // default 'migrations'
  name: string
  throw?: boolean // throw error if the migration is not found, default false
}) {
  const db = options.db
  const table = options.table || DefaultMigrationTable
  const lastRow = db
    .prepare(`select id from ${table} where name = ?`)
    .get(options.name)
  if (!lastRow) {
    if (options.throw) throw new Error('migration not found')
    return
  }
  const delete_row = db.prepare(`delete from ${table} where id = ?`)
  db.prepare(
    `
select id, down
from ${table}
where id >= ?
`,
  )
    .all(lastRow.id)
    .forEach(
      db.transaction(row => {
        db.run(row.down)
        delete_row.run(row.id)
      }),
    )
}
