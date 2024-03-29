import DB, { BetterSqlite3Helper } from '@beenotung/better-sqlite3-helper'

export function newDB(
  options: BetterSqlite3Helper.DBOptions,
): BetterSqlite3Helper.DBInstance {
  return new (DB as any)(options)
}
