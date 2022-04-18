import readline from 'readline'
import { DBInstance } from './helpers'
import { DefaultMigrationTable } from './migrate'

export const DefaultSkipTables = [DefaultMigrationTable]

export type ArchiveTableMeta = {
  tableName: string
  createTable: string
  keys: string[]
  count: number
}

/**
 * @description Usage Example: ./scripts/export-db.ts | xz -T0 - > data/db-archive.txt.xz
 *  */
export function exportArchive(
  db: DBInstance,
  options?: {
    onLine?: (line: string) => void
    skipTables?: string[] // default ['migration']
  },
): void {
  const onLine = options?.onLine || defaultOnLine
  const skipTables = options?.skipTables || DefaultSkipTables

  let select_table = db.prepare(/* sql */ `
select name, sql
from sqlite_master
where type = 'table'
`)

  let table_rows = select_table.all()
  for (let table_row of table_rows) {
    let tableName = table_row.name
    if (skipTables?.includes(tableName)) {
      continue
    }
    let createTable = table_row.sql
    let count = db.prepare(`select count(*) from ${tableName}`).pluck().get()
    let firstRow = db.prepare(`select * from ${tableName} limit 1`).get() || {}
    let keys = Object.keys(firstRow)
    let headers: ArchiveTableMeta = {
      tableName,
      createTable,
      keys,
      count,
    }
    onLine(JSON.stringify(headers))
    let K = keys.length
    let cols = new Array(K) // reuse the same array to reduce memory consumption
    for (let row of db.prepare(`select * from ${tableName}`).iterate()) {
      for (let i = 0; i < K; i++) {
        cols[i] = row[keys[i]]
      }
      onLine(JSON.stringify(cols))
    }
  }
}

function defaultOnLine(line: string) {
  console.log(line)
}

/**
 * @description Usage Example: unxz -k -f -T0 -c data/db-archive.txt.xz | ./scripts/import-db.ts
 *  */
export function importArchive(
  db: DBInstance,
  options?: {
    rl?: readline.Interface
    skipTables?: string[] // default ['migration']
    // for progress report
    onTable?: (meta: ArchiveTableMeta) => void
  },
) {
  const rl =
    options?.rl ||
    readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    })
  const onTable = options?.onTable
  const skipTables = options?.skipTables || DefaultSkipTables

  function parseTableMeta(line: string) {
    const meta: ArchiveTableMeta = JSON.parse(line)
    const tableName = meta.tableName
    const keys = meta.keys
    const count = meta.count

    onTable?.(meta)

    if (count === 0) {
      onLine = parseTableMeta
      return
    }

    let insert: { run: (...args: any[]) => any }
    if (skipTables.includes(tableName)) {
      insert = { run: () => null } as any
    } else {
      const fields = keys.join(',')
      const values = keys.map(key => '?').join(',')
      const sql = `insert into ${tableName} (${fields}) values (${values})`
      insert = db.prepare(sql)
    }

    let i = 0
    onLine = (line: string) => {
      const cols = JSON.parse(line)
      insert.run(...cols)
      i++
      if (i === count) {
        onLine = parseTableMeta
      }
    }
  }

  let onLine = parseTableMeta

  rl.on('line', line => {
    onLine(line)
  })
}

export namespace importArchive {
  export function reportOnTable(meta: ArchiveTableMeta) {
    console.log('import table:', {
      tableName: meta.tableName,
      keys: meta.keys,
      count: meta.count.toLocaleString(),
    })
  }
}
