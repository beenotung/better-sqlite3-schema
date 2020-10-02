import { Statement } from 'better-sqlite3'
import { BetterSqlite3Helper } from 'better-sqlite3-helper'
import { Cache, newCache } from '../utils/cache'
import { chain } from '../utils/function'

export type DB = BetterSqlite3Helper.DBInstance

export function delDBFile(file: string) {
  const fs = require('fs')
  const files = [file, file + '-shm', file + '-wal']
  files.forEach(file => {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file)
    }
  })
}

export type TableSchema = {
  table: string
  fields?: TableFields
  createTableSql?: string
  autoCreateTable?: boolean
  autoAddField?: boolean
  skipFields?: string[]
  refFields?: Array<string | RefFieldSchema>
  cacheFields?: string[]
  cacheSize?: number
  whitelistFields?: string[]
  idFieldSuffix?: string
  inplaceUpdate?: boolean
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

export type InsertRowFn = (row: any) => number

export function makeInsertRowFnFromSchema(
  db: DB,
  schema: TableSchema,
): InsertRowFn {
  autoCreateTable(db, schema)
  let insertRowFn = makeInsertRowFn(db, schema.table)
  if (schema.autoAddField) {
    const table = makeTableInfo(db, schema.table)
    insertRowFn = chain(makeAutoAddFieldMapRowFn(db, table), insertRowFn)
  }
  if (schema.refFields) {
    insertRowFn = chain(
      makeRefFieldsMapRowFnFromSchema(db, schema),
      insertRowFn,
    )
  }
  if (schema.skipFields) {
    insertRowFn = chain(makeSkipFieldsMapRowFn(schema.skipFields), insertRowFn)
  }
  if (schema.whitelistFields) {
    insertRowFn = chain(
      makeWhitelistFieldsMapRowFn(schema.whitelistFields),
      insertRowFn,
    )
  }
  if (!schema?.inplaceUpdate) {
    insertRowFn = chain(cloneRowFn, insertRowFn)
  }
  return insertRowFn
}

const defaultTableFields = {
  id: `integer primary key`,
}

function autoCreateTable(
  db: DB,
  options: {
    table: string
    fields?: TableFields
    createTableSql?: string
    autoCreateTable?: boolean
  },
) {
  if (options.createTableSql) {
    db.exec(options.createTableSql)
    return
  }
  if (!options.autoCreateTable) {
    return
  }
  const fields = options.fields || defaultTableFields
  const fieldsSql = Object.entries(fields)
    .map(entry => entry.join(' '))
    .join(',')
  const sql = `create table if not exists "${options.table}" (${fieldsSql})`
  db.exec(sql)
}

function makeInsertRowFn(db: DB, table: string): InsertRowFn {
  return row => {
    return db.insert(table, row)
  }
}

type MapRowFn = <T>(row: T) => T

function cloneRowFn(row: any) {
  return { ...row }
}

function makeWhitelistFieldsMapRowFn(whitelistFields: string[]): MapRowFn {
  return (row: any) => {
    const res: any = {}
    whitelistFields.forEach(field => (res[field] = row[field]))
    return res
  }
}

function makeSkipFieldsMapRowFn(skipFields: string[]): MapRowFn {
  return (row: any) => {
    skipFields.forEach(field => delete row[field])
    return row
  }
}

function makeRefFieldsMapRowFnFromSchema(
  db: DB,
  schema: {
    refFields?: Array<string | RefFieldSchema>
    idFieldSuffix?: string
    cacheFields?: string[]
    cacheSize?: number
  },
): MapRowFn {
  const refFields = makeRefFields(db, {
    refFields: schema.refFields || [],
    idFieldSuffix: schema.idFieldSuffix || '_id',
    cacheFields: schema.cacheFields,
    cacheSize: schema.cacheSize,
  })
  return makeRefFieldsMapRowFn(refFields)
}

function makeRefFieldsMapRowFn(refFields: RefField[]): MapRowFn {
  return (row: any) => {
    refFields.forEach(refField => {
      const field = refField.field
      if (!(field in row)) {
        return
      }
      const data = row[field]
      const id = refField.getRefIdFn(data, refField.select, refField.insert)
      delete row[field]
      row[refField.idField] = id
    })
    return row
  }
}

function makeRefFields(
  db: DB,
  schema: {
    refFields: Array<string | RefFieldSchema>
    idFieldSuffix?: string
    cacheFields?: string[]
    cacheSize?: number
  },
): RefField[] {
  const idFieldSuffix = schema.idFieldSuffix || '_id'
  const cacheSchema: CacheSchema = {
    cacheFields: schema.cacheFields || [],
    cacheSize: schema.cacheSize,
    idFieldSuffix,
  }
  return schema.refFields
    .map(refField => toRefSchema(refField, cacheSchema))
    .map(refSchema => makeRefField(refSchema, idFieldSuffix, db))
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
  const row = select.get(fieldData)
  if (row) {
    return row.id
  }
  return +insert.run(fieldData).lastInsertRowid
}

function makeCachedGetRefIdWithCache(cache: Cache<number>): GetRefIdFn {
  return (fieldData, select, insert) =>
    cache.get(fieldData, () => getRefId(fieldData, select, insert))
}

export type Bool = 0 | 1
export type TableColumn = {
  cid: number
  name: string
  type: string
  notnull: Bool
  pk: Bool
}

export function getTableFields(db: DB, table: string): TableColumn[] {
  return db.prepare(`PRAGMA table_info("${table}")`).all()
}

export type TableInfo = {
  table: string
  fields: TableFields
}
export type TableFields = Record<string, string>

export function makeTableInfo(db: DB, table: string): TableInfo {
  const fields: TableFields = {}
  getTableFields(db, table).forEach(
    column => (fields[column.name] = column.type),
  )
  return {
    table,
    fields,
  }
}

export function addField(
  db: DB,
  table: TableInfo,
  field: string,
  type: string,
) {
  const sql = `alter table "${table.table}" add ${field} ${type};`
  db.exec(sql)
  table.fields[field] = type
}

function makeAutoAddFieldMapRowFn(db: DB, table: TableInfo): MapRowFn {
  return (row: any) => {
    Object.keys(row).forEach(field => {
      if (field in table.fields) {
        return
      }
      const type = toSqliteDataType(row[field])
      addField(db, table, field, type)
    })
    return row
  }
}

function toSqliteDataType(fieldData: any): string {
  switch (typeof fieldData) {
    case 'string':
      return 'text'
    case 'boolean':
      return 'boolean'
    case 'object':
      return 'jsonp'
    case 'number': {
      const str = fieldData.toString()
      if (str === parseInt(str).toString()) {
        return 'integer'
      }
      return 'real'
    }
  }
  return 'blob'
}
