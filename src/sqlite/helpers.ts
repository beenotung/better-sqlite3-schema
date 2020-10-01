import { Statement } from 'better-sqlite3'
import { BetterSqlite3Helper } from 'better-sqlite3-helper'
import { Cache, newCache } from '../utils/cache'
import { identical } from '../utils/function'

export type DB = BetterSqlite3Helper.DBInstance

export type TableSchema = {
  table: string
  skipFields?: string[]
  refFields?: Array<string | RefFieldSchema>
  cacheFields?: string[]
  cacheSize?: number
  whitelistFields?: string[]
  idFieldSuffix?: string
}
export type RefFieldSchema = {
  field: string
  idField?: string
  cache?: Cache<number>
  cacheSize?: number
}
type RefField = {
  field: string
  idField: string
  select: Statement
  insert: Statement
  getRefIdFn: GetRefIdFn
}
type GetRefIdFn = (
  fieldData: any,
  select: Statement,
  insert: Statement,
) => number

export type InsertRowFn = (row: any) => any

export type MakeInsertRowFnOptions = {
  inplaceUpdateRefField?: boolean
}

export function makeInsertRowFn(
  db: DB,
  schema: TableSchema,
  options?: MakeInsertRowFnOptions,
): InsertRowFn {
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
      db,
      { ...schema, refFields: schema.refFields },
      options || {},
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

function makeInsertRowFnWithRefFields(
  db: DB,
  schema: {
    refFields: Array<string | RefFieldSchema>
    cacheFields?: string[]
    idFieldSuffix?: string
    cacheSize?: number
  },
  options: MakeInsertRowFnOptions,
): InsertRowFn {
  const idFieldSuffix = schema.idFieldSuffix || '_id'
  const cacheSchema: CacheSchema = {
    cacheFields: schema.cacheFields || [],
    cacheSize: schema.cacheSize,
    idFieldSuffix,
  }
  const refFields: RefField[] = schema.refFields
    .map(refField => toRefSchema(refField, cacheSchema))
    .map(refSchema => makeRefField(refSchema, idFieldSuffix, db))
  const inplaceInsertRowFnWithRefFields = makeInplaceInsertRowFnWithRefFields(
    refFields,
  )
  if (options.inplaceUpdateRefField) {
    return inplaceInsertRowFnWithRefFields
  }
  return row => {
    row = { ...row }
    return inplaceInsertRowFnWithRefFields(row)
  }
}

function makeInplaceInsertRowFnWithRefFields(
  refFields: RefField[],
): InsertRowFn {
  return row => {
    refFields.forEach(refField => {
      const field = refField.field
      if (!(field in row)) {
        return
      }
      const fieldData = row[field]
      const id = refField.getRefIdFn(fieldData, refField.select, refField.insert)
      delete row[field]
      row[refField.idField] = id
    })
  }
}

type CacheSchema = {
  cacheFields: string[]
  cacheSize?: number
  idFieldSuffix: string
}

function toRefSchema(
  refField: string | RefFieldSchema,
  schema: CacheSchema,
): RefFieldSchema {
  if (typeof refField === 'string') {
    const field = refField
    if (schema.cacheFields.includes(field)) {
      return { field, cacheSize: schema.cacheSize }
    }
    return {
      field,
    }
  }
  return refField
}

function makeRefField(
  schema: RefFieldSchema,
  idFieldSuffix: string,
  db: DB,
): RefField {
  const field = schema.field
  const sqls = makeRefSqls(field, db)
  return {
    field,
    idField: schema.idField || field + idFieldSuffix,
    select: sqls.select,
    insert: sqls.insert,
    getRefIdFn: makeGetRefIdFn(schema),
  }
}

function makeGetRefIdFn(refField: RefFieldSchema): GetRefIdFn {
  if (refField.cache) {
    return makeCachedGetRefIdWithCache(refField.cache)
  }
  if (refField.cacheSize) {
    const cache = newCache<number>({ resetSize: refField.cacheSize })
    return makeCachedGetRefIdWithCache(cache)
  }
  return getRefId
}

function createRefTableIfNotExist(field: string, db: DB) {
  db.exec(`create table if not exists "${field}" (
  id integer primary key,
  ${field} text
);`)
}

function makeRefSqls(field: string, db: DB) {
  createRefTableIfNotExist(field, db)
  const select = db.prepare(
    `select id from "${field}" where "${field}" = ? limit 1`,
  )
  const insert = db.prepare(`insert into "${field}" ("${field}") values (?)`)
  return { select, insert }
}

function getRefId(
  fieldData: any,
  select: Statement,
  insert: Statement,
): number {
  const rows = select.get(fieldData)
  if (rows.length > 0) {
    return rows[0].id
  }
  return +insert.run(fieldData).lastInsertRowid
}

function makeCachedGetRefIdWithCache(cache: Cache<number>): GetRefIdFn {
  return (fieldData, select, insert) =>
    cache.get(fieldData, () => getRefId(fieldData, select, insert))
}
