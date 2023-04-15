import { DBInstance } from './helpers'
import { SingleResult } from './types'

export const DefaultMigrationTable = 'migration'

export type MigrationItem = {
  name: string
  is_multiple_statements?: boolean | 1 | 0
  up: string
  down: string
}
/**
 * This function has different from the better-sqlite3-helper behavior.
 *
 * This function works well when the database already has migrations from files.
 * (Mixing file mode and string array mode.)
 */
export function migrateUp(options: {
  db: DBInstance
  table?: string // default 'migration'
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
  if (
    !db.queryFirstCell<number>(`
select
count(*) as count
from sqlite_master
where type = 'table'
  and name = '${table}'
  and sql like '%is_multiple_statements%'
`)
  ) {
    db.run(`
alter table ${table}
add column is_multiple_statements integer default 0 not null
`)
  }
  const select = db.prepare(`
select id from ${table}
where name = ?
limit 1
`)
  const insert = db.prepare(`
insert into ${table}
(name, up, down, is_multiple_statements)
values
(:name, :up, :down, :is_multiple_statements)
`)
  options.migrations.forEach(
    db.transaction((migrate: MigrationItem) => {
      if (select.get(migrate.name)) return
      run({
        db,
        is_multiple_statements: migrate.is_multiple_statements,
        sql: migrate.up,
      })
      migrate.is_multiple_statements = migrate.is_multiple_statements ? 1 : 0
      insert.run(migrate)
    }),
  )
}

export function migrateDown(options: {
  db: DBInstance
  table?: string // default 'migration'
  name: string
  throw?: boolean // throw error if the migration is not found, default false
}) {
  const db = options.db
  const table = options.table || DefaultMigrationTable
  const row = db
    .prepare(
      `select id, down, is_multiple_statements from ${table} where name = ?`,
    )
    .get(options.name) as SingleResult<{
    id: number
    down: string
    is_multiple_statements: 1 | 0
  }>
  if (!row) {
    if (options.throw) throw new Error('migration not found')
    return
  }
  const delete_row = db.prepare(`delete from ${table} where id = ?`)
  db.transaction(() => {
    run({
      db,
      is_multiple_statements: row.is_multiple_statements,
      sql: row.down,
    })
    delete_row.run(row.id)
  })()
}

/**
 * rollback all the migrations until 'name' (inclusive)
 */
export function migrateDownUntil(options: {
  db: DBInstance
  table?: string // default 'migration'
  name: string
  throw?: boolean // throw error if the migration is not found, default false
}) {
  const db = options.db
  const table = options.table || DefaultMigrationTable
  const lastRow = db
    .prepare(`select id from ${table} where name = ?`)
    .get(options.name) as SingleResult<{ id: number }>
  if (!lastRow) {
    if (options.throw) throw new Error('migration not found')
    return
  }
  const delete_row = db.prepare(`delete from ${table} where id = ?`)
  db.prepare(
    `
select id, down, is_multiple_statements
from ${table}
where id >= ?
`,
  )
    .all(lastRow.id)
    .forEach(
      db.transaction(row => {
        run({
          db,
          is_multiple_statements: row.is_multiple_statements,
          sql: row.down,
        })
        delete_row.run(row.id)
      }),
    )
}

function run({
  db,
  sql,
  is_multiple_statements,
}: {
  db: DBInstance
  sql: string
  is_multiple_statements: boolean | undefined | 1 | 0
}) {
  let list = [sql]
  if (is_multiple_statements) {
    list = sql.split(';')
  }
  list.forEach(sql => {
    sql = sql.trim()
    if (sql) {
      db.run(sql)
    }
  })
}
