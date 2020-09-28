import { Statement } from 'better-sqlite3'
import { BetterSqlite3Helper } from 'better-sqlite3-helper'
import { Cache, newCache } from '../utils/cache'
import { identical } from '../utils/function'

type DB = BetterSqlite3Helper.DBInstance

export type TableSchema = {
  table: string
  skipFields?: string[]
  refFields?: Array<string | RefFieldSchema>
  cacheFields?: string[]
  whitelistFields?: string[]
  idFieldSuffix?: string
}
export type RefFieldSchema = {
  field: string
  idField?: string
  cache?: Cache<number>
  cacheSize?: number
}

export type InsertRowFn = (row: any) => any

export function makeInsertRowFn(schema: TableSchema, db: DB): InsertRowFn {
  if (schema.whitelistFields) {
    return makeInsertRowFnWithWhitelistFields(schema.whitelistFields)
  }
  let skipFieldsFn: InsertRowFn | undefined
  if (schema.skipFields) {
    skipFieldsFn = makeInsertRowFnWithSkipFields(schema.skipFields)
  }
  let refFieldsFn: InsertRowFn | undefined
  if (schema.refFields) {
    refFieldsFn = makeInsertRowFnWithRefFields(
      { ...schema, refFields: schema.refFields },
      db,
    )
  }
  if (skipFieldsFn && refFieldsFn) {
    return row => refFieldsFn!(skipFieldsFn!(row))
  }
  return skipFieldsFn ?? refFieldsFn ?? identical
}

function makeInsertRowFnWithWhitelistFields(
  whitelistFields: string[],
): InsertRowFn {
  return row => {
    const res: any = {}
    whitelistFields.forEach(field => (res[field] = row[field]))
    return res
  }
}

function makeInsertRowFnWithSkipFields(skipFields: string[]): InsertRowFn {
  return row => {
    const res = { ...row }
    skipFields.forEach(field => delete res[field])
    return res
  }
}

type RefField = {
  field: string
  idField: string
  getRefIdFn: GetRefIdFn
}
type GetRefIdFn = (
  fieldData: any,
  select: Statement,
  insert: Statement,
) => number

function makeRefField(
  refField: string | RefFieldSchema,
  idFieldSuffix: string,
): RefField {
  if (typeof refField === 'string') {
    return {
      field: refField,
      idField: refField + idFieldSuffix,
      getRefIdFn: insertOrReference,
    }
  }
  const field = refField.field
  const idField = refField.idField || field + idFieldSuffix
  let getRefIdFn: GetRefIdFn
  if (refField.cache) {
    getRefIdFn = makeCachedInsertOrReference(refField.cache)
  } else if (refField.cacheSize) {
    const cache = newCache<number>({ resetSize: refField.cacheSize })
    getRefIdFn = makeCachedInsertOrReference(cache)
  } else {
    getRefIdFn = insertOrReference
  }
  return {
    field,
    idField,
    getRefIdFn,
  }
}

function makeInsertRowFnWithRefFields(
  schema: {
    refFields: Array<string | RefFieldSchema>
    cacheFields?: string[]
    idFieldSuffix?: string
  },
  db: DB,
): InsertRowFn {
  const idFieldSuffix = schema.idFieldSuffix || '_id'
  const refFields: RefField[] = schema.refFields.map(ref => {
    let field: string
    if (typeof ref === 'string') { createRefTableIfNotExist(field, db) }
    const select = db.prepare(
      `select id from "${field}" where "${field}" = ? limit 1`,
    )
    const insert = db.prepare(`insert into "${field}" ("${field}") values (?)`)
    return {
      field,
      idField: field + idFieldSuffix,
      getId: fieldData => insertOrReference(fieldData, select, insert),
    }
  })
  return row => {
    const res: any = { ...row }
    refFields.forEach(ref => {
      const field = ref.field
      if (!(field in res)) {
        return
      }
      const id = insertOrReference(field, ref)
      delete res[field]
      res[ref.idField] = id
    })
  }
}

function insertOrReference(
  fieldData: string,
  select: Statement,
  insert: Statement,
): number {
  const res = select.get(fieldData)
  if (res.length > 0) {
    return res[0].id
  }
  return +insert.run(fieldData).lastInsertRowid
}

function makeCachedInsertOrReference(cache: Cache<number>): GetRefIdFn {
  return (fieldData, select, insert) =>
    cache.get(fieldData, () => insertOrReference(fieldData, select, insert))
}

function createRefTableIfNotExist(field: string, db: DB) {
  db.exec(`create table if not exists "${field}" (
  id integer primary key,
  ${field} text
);`)
}

function makeRefSqls(field: string, db: DB) {
  const select = db.prepare(
    `select id from "${field}" where "${field}" = ? limit 1`,
  )
  const insert = db.prepare(`insert into "${field}" ("${field}") values (?)`)
  return { select, insert }
}
