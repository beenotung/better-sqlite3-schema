import { Statement } from 'better-sqlite3'
import DB, { BetterSqlite3Helper } from 'better-sqlite3-helper'
import { Cache, newCache } from '../utils/cache'
import { chain } from '../utils/function'

export type DB = BetterSqlite3Helper.DBInstance
export type DBInstance = DB

export function delDBFile(file: string) {
  const fs = require('fs')
  const files = [file, file + '-shm', file + '-wal']
  files.forEach(file => {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file)
    }
  })
}

export type CreateDBOptions = {
  file: string
  mode?: 'incremental' | 'overwrite' // default is incremental
} & Omit<BetterSqlite3Helper.DBOptions, 'path'>

export function createDB(options: CreateDBOptions) {
  const file = options.file
  if (options.mode === 'overwrite') {
    delDBFile(file)
  }
  delete options.mode
  return DB({
    path: file,
    migrate: false,
    ...options,
  })
}

export type TableSchema = {
  table: string
  fields?: TableFields
  createTableSql?: string
  createIndexSql?: string
  autoAddField?: boolean
  skipFields?: string[]
  refFields?: Array<string | RefFieldSchema>
  cacheFields?: string[]
  whitelistFields?: string[] | boolean
  idFieldSuffix?: string
  inplaceUpdate?: boolean
  deduplicateField?: string
} & CacheOptions &
  AutoCreateOptions
export type AutoCreateOptions = {
  autoCreateTable?: boolean
  autoCreateIndex?: boolean
}
export type RefFieldSchema = {
  field: string
  idField: string
} & CacheOptions &
  AutoCreateOptions
type InsertRefField = {
  field: string
  idField: string
  select: Statement
  insert: Statement
  getRefIdFn: GetRefIdFn
}
type GetRefIdFn = (refSqls: InsertRefSqls, fieldData: any) => number

export type InsertRowFn = (row: any) => number

export function makeInsertRowFnFromSchema(
  db: DB,
  schema: TableSchema,
): InsertRowFn {
  autoCreateTable(db, schema)
  autoCreateIndex(db, schema)
  let insertRowFn = makeInsertRowFn(db, schema.table)
  if (schema.autoAddField) {
    const table = makeTableInfo(db, schema.table)
    insertRowFn = chain(makeAutoAddFieldMapRowFn(db, table), insertRowFn)
  }
  if (schema.refFields) {
    const refFields = toRefSchemas(schema).map(refSchema =>
      makeInsertRefField(db, refSchema),
    )
    insertRowFn = chain(makeInsertRefFieldsMapRowFn(refFields), insertRowFn)
  }
  if (schema.skipFields) {
    insertRowFn = chain(makeSkipFieldsMapRowFn(schema.skipFields), insertRowFn)
  }
  const whitelistFields = getWhitelistFields(schema)
  if (whitelistFields) {
    insertRowFn = chain(
      makeWhitelistFieldsMapRowFn(whitelistFields),
      insertRowFn,
    )
  }
  if (!schema?.inplaceUpdate) {
    insertRowFn = chain(cloneRowFn, insertRowFn)
  }
  return insertRowFn
}

function getWhitelistFields(schema: TableSchema): string[] | undefined {
  if (!schema.whitelistFields) {
    return
  }
  if (Array.isArray(schema.whitelistFields)) {
    return schema.whitelistFields
  }
  if (!schema.fields) {
    return
  }
  return [...Object.keys(schema.fields), ...toRefIdFieldNames(schema)]
}

const defaultIdFieldSuffix = '_id'

function toRefIdFieldNames(
  schema: Pick<TableSchema, 'refFields' | 'idFieldSuffix'>,
): string[] {
  return (
    schema.refFields?.map(field =>
      typeof field === 'string'
        ? field + (schema.idFieldSuffix || defaultIdFieldSuffix)
        : field.idField,
    ) || []
  )
}

const defaultTableFields = {
  id: `integer primary key`,
}

function autoCreateTable(db: DB, schema: TableSchema) {
  if (schema.createTableSql) {
    return db.exec(schema.createTableSql)
  }
  if (!schema.autoCreateTable) {
    return
  }
  const fields = schema.fields || defaultTableFields
  toRefIdFieldNames(schema).forEach(field => (fields[field] = 'integer'))
  const fieldsSql = Object.entries(fields)
    .map(entry => entry.join(' '))
    .join(',')
  const sql = `create table if not exists "${schema.table}" (${fieldsSql})`
  db.exec(sql)
}

function autoCreateIndex(db: DB, schema: TableSchema) {
  if (schema.createIndexSql) {
    return db.exec(schema.createIndexSql)
  }
}

function makeInsertRowFn(db: DB, table: string): InsertRowFn {
  return row => {
    return db.insert(table, row)
  }
}

function makeDeduplicatedInsertRowFn(
  options: {
    select: Statement
    deduplicateField: string
    idField: string
  },
  insertRowFn: InsertRowFn,
): InsertRowFn {
  const deduplicateField = options.deduplicateField
  const idField = options.idField
  const select = options.select
  return row => {
    const fieldData = row[deduplicateField]
    const matchedRow = select.get(fieldData)
    if (matchedRow) {
      return matchedRow[idField]
    }
    return insertRowFn(row)
  }
}

export type DeduplicatedTableSchema = {
  table: string
  deduplicateField: string
  idField: string
} & CacheOptions

export function makeDeduplicatedInsertRowFnFromSchema(
  db: DB,
  schema: DeduplicatedTableSchema,
  insertRowFn: InsertRowFn,
): InsertRowFn {
  const idField = schema.idField
  const deduplicateField = schema.deduplicateField
  const select: Statement = db.prepare(
    `select "${idField}" from "${schema.table}" where "${deduplicateField}" = ?`,
  )
  const deduplicatedInsertRowFn = makeDeduplicatedInsertRowFn(
    {
      select,
      idField,
      deduplicateField,
    },
    insertRowFn,
  )
  const cache = toCache(schema)
  if (!cache) {
    return deduplicatedInsertRowFn
  }
  return row => {
    const fieldData = row[deduplicateField]
    return cache.get(fieldData, () => deduplicatedInsertRowFn(row))
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

function makeInsertRefFieldsMapRowFn(refFields: InsertRefField[]): MapRowFn {
  return (row: any) => {
    refFields.forEach(refField => {
      const field = refField.field
      if (!(field in row)) {
        return
      }
      const data = row[field]
      const id = refField.getRefIdFn(refField, data)
      delete row[field]
      row[refField.idField] = id
    })
    return row
  }
}

function toRefSchemas(schema: TableSchema): RefFieldSchema[] {
  return (schema.refFields || []).map(refField => toRefSchema(refField, schema))
}

function toRefSchema(
  refField: string | RefFieldSchema,
  schema: TableSchema,
): RefFieldSchema {
  if (typeof refField !== 'string') {
    return refField
  }
  const field = refField
  const idField = field + (schema.idFieldSuffix || defaultIdFieldSuffix)
  const refFieldSchema: RefFieldSchema = {
    field,
    idField,
    autoCreateTable: schema.autoCreateTable,
    autoCreateIndex: schema.autoCreateIndex,
  }
  if (schema.cacheFields?.includes(field)) {
    refFieldSchema.cache = schema.cache
    refFieldSchema.cacheSize = schema.cacheSize
  }
  return refFieldSchema
}

function makeInsertRefField(db: DB, schema: RefFieldSchema): InsertRefField {
  const field = schema.field
  const sqls = makeInsertRefSqls(db, schema)
  return {
    field,
    idField: schema.idField,
    select: sqls.select,
    insert: sqls.insert,
    getRefIdFn: makeGetRefIdFn(schema),
  }
}

function makeGetRefIdFn(refField: CacheOptions): GetRefIdFn {
  const cache = toCache(refField)
  if (cache) {
    return makeCachedGetRefIdFn(cache)
  }
  return getRefId
}

function createRefTableIfNotExist(db: DB, field: string, idField: string) {
  db.exec(`create table if not exists "${field}" (
  "${idField}" integer primary key,
  ${field} text
);`)
}

function createRefIndexIfNotExist(db: DB, field: string) {
  db.exec(
    `create unique index if not exists "${field}_idx" on "${field}" ("${field}")`,
  )
}

export type InsertRefSqls = {
  select: Statement
  insert: Statement
  idField: string
}

export function makeInsertRefSqls(
  db: DB,
  schema: {
    field: string
    idField: string
  } & AutoCreateOptions,
): InsertRefSqls {
  const field = schema.field
  const idField = schema.idField
  if (schema.autoCreateTable) {
    createRefTableIfNotExist(db, field, idField)
  }
  if (schema.autoCreateIndex) {
    createRefIndexIfNotExist(db, field)
  }
  const select = db.prepare(
    `select "${idField}" from "${field}" where "${field}" = ? limit 1`,
  )
  const insert = db.prepare(`insert into "${field}" ("${field}") values (?)`)
  return { select, insert, idField }
}

function getRefId(refSqls: InsertRefSqls, fieldData: any): number {
  const row = refSqls.select.get(fieldData)
  if (row) {
    return row[refSqls.idField]
  }
  return +refSqls.insert.run(fieldData).lastInsertRowid
}

function makeCachedGetRefIdFn(cache: Cache<number>): GetRefIdFn {
  return (refSqls, fieldData) =>
    cache.get(fieldData, () => getRefId(refSqls, fieldData))
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

export type SqliteMasterRow = {
  type: 'table' | 'index'
  name: string
  tbl_name: string // table_name
  sql: string
}

export function getIndices(db: DB, table: string): SqliteMasterRow[] {
  return db
    .prepare(
      `select * from sqlite_master where type = 'index' and tbl_name = ?`,
    )
    .all(table)
}

export function getTables(db: DB): SqliteMasterRow[] {
  return db.prepare(`select * from sqlite_master where type = 'table'`).all()
}

export function removeIndices(db: DB, table: string) {
  getIndices(db, table).forEach(row => {
    db.exec(`drop index if exists "${row.name}"`)
  })
}

export function removeAllIndices(db: DB) {
  db.prepare(`select name from sqlite_master where type = 'index'`)
    .all()
    .forEach(row => {
      db.exec(`drop index if exists "${row.name}"`)
    })
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

export function makeAutoAddFieldMapRowFn(db: DB, table: TableInfo): MapRowFn {
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

export function toSqliteDataType(fieldData: any): string {
  switch (typeof fieldData) {
    case 'string':
      return 'text'
    case 'boolean':
      return 'boolean'
    case 'object':
      return 'json'
    case 'number': {
      return isInt(fieldData) ? 'integer' : 'real'
    }
  }
  return 'blob'
}

export function isInt(number: any): boolean {
  const int = parseInt(number, 10)
  return int === +number
}

export function makeSchemaScanner() {
  const fields: TableFields = {}
  const addRowFn = (row: any) => {
    Object.keys(row).forEach(field => {
      if (field in fields) {
        return
      }
      const type = toSqliteDataType(row[field])
      fields[field] = type
    })
  }
  return { fields, addRowFn }
}

export type Id = string | number
export type IdFields = Record<string, Id>

export type CacheOptions = {
  cache?: Cache<number>
  cacheSize?: number
}

function toCache(options: CacheOptions): Cache<any> | undefined {
  if (options.cache) {
    return options.cache
  }
  if (options.cacheSize) {
    return newCache({ resetSize: options.cacheSize })
  }
}

/**
 * @remark the rows will be updated in-place
 * */
export function insertArrayField(
  rows: any[] | undefined,
  idFields: IdFields,
  insertRowFn: InsertRowFn,
) {
  rows?.forEach(row => {
    Object.assign(row, idFields)
    insertRowFn(row)
  })
}

export function forEach(rows: any[] | undefined, fn: (row: any) => void) {
  rows?.forEach(fn)
}

export type SelectRowFn = (offset: number) => any

export function makeSelectRowFnFromSchema(
  db: DB,
  schema: TableSchema,
): SelectRowFn {
  const select = db.prepare(`select * from "${schema.table}" limit 1 offset ?`)
  let selectRowFn: SelectRowFn = offset => select.get(offset)
  if (schema.refFields) {
    const refFields = toRefSchemas(schema).map(refSchema =>
      makeSelectRefField(db, refSchema),
    )
    selectRowFn = chain(selectRowFn, makeSelectRefFieldsMapRowFn(refFields))
  }
  return selectRowFn
}

type SelectRefField = {
  field: string
  idField: string
  select: Statement
  getRefValueFn: GetRefValueFn
}
type GetRefValueFn = (select: Statement, field: string, fieldId: any) => any

function makeSelectRefField(db: DB, schema: RefFieldSchema): SelectRefField {
  const field = schema.field
  const idField = schema.idField
  return {
    field,
    idField,
    select: makeSelectRefFieldSql(db, field, idField),
    getRefValueFn: makeGetRefValueFn(schema),
  }
}

export function makeSelectRefFieldSql(
  db: DB,
  field: string,
  idField: string = field + defaultIdFieldSuffix,
): Statement {
  return db.prepare(`select "${field}" from "${field}" where "${idField}" = ?`)
}

export function makeGetRefValueFnFromSchema(
  db: DB,
  schema: {
    field: string
    idField?: string
  } & CacheOptions,
) {
  const field = schema.field
  const idField = schema.idField || field + defaultIdFieldSuffix
  const select = makeSelectRefFieldSql(db, field, idField)
  const getRefValueFn = makeGetRefValueFn(schema)
  return (fieldId: Id) => getRefValueFn(select, field, fieldId)
}

function makeGetRefValueFn(refField: CacheOptions): GetRefValueFn {
  const cache = toCache(refField)
  if (cache) {
    return makeCachedGetRefValueFn(cache)
  }
  return getRefValue
}

function getRefValue(select: Statement, field: string, fieldId: Id) {
  return select.get(fieldId)[field]
}

function makeCachedGetRefValueFn(cache: Cache<any>): GetRefValueFn {
  return (select, field, fieldId) =>
    cache.get(fieldId, () => getRefValue(select, field, fieldId))
}

function makeSelectRefFieldsMapRowFn(refFields: SelectRefField[]): MapRowFn {
  return (row: any) => {
    refFields.forEach(refField => {
      const idField = refField.idField
      if (!(idField in row)) {
        return
      }
      const field = refField.field
      const id = row[idField]
      const fieldValue = refField.getRefValueFn(refField.select, field, id)
      delete row[idField]
      row[field] = fieldValue
    })
    return row
  }
}

export function countRows(db: DB, table: string): number {
  return db.queryFirstCell(`select count(*) from "${table}"`)!
}

export function makeSelectRefFieldArray(
  db: DB,
  schema: CacheOptions & {
    field: string
    table: string
    idField: string
  } & (
      | {
          joinField: string
        }
      | {
          idFieldSuffix?: string
        }
    ),
) {
  const res = makeSelectJoin(db, {
    fromTable: schema.table,
    joinTable: schema.field,
    joinField: toJoinField(schema),
    ...schema,
  })
  return res.all
}

function toJoinField(
  schema:
    | {
        field: string
        idFieldSuffix?: string
      }
    | {
        joinField: string
      },
): string {
  if ('joinField' in schema) {
    return schema.joinField
  }
  return schema.field + (schema.idFieldSuffix || defaultIdFieldSuffix)
}

export function makeSelectJoin(
  db: DB,
  schema: {
    field: string
    fromTable: string
    joinTable: string
    joinField: string
    idField: string
  } & CacheOptions,
): {
  sql: Statement
  all: (fieldId: string) => any[]
  get: (fieldId: string) => any
} {
  const field = schema.field
  const joinTable = schema.joinTable
  const fromTable = schema.fromTable
  const joinField = schema.joinField
  const idField = schema.idField
  const sql = db.prepare(
    `select "${field}" from "${fromTable}" inner join "${joinTable}" on "${fromTable}"."${joinField}" = "${joinTable}"."${joinField}" where "${idField}" = ?`,
  )
  let all = makeAllSelectJoin(sql, field)
  let get = makeGetSelectJoin(sql, field)
  const cache = toCache(schema)
  if (cache) {
    all = cache.wrapFn(all)
    get = cache.wrapFn(get)
  }
  return {
    sql,
    all,
    get,
  }
}

function makeGetSelectJoin(sql: Statement, field: string) {
  return (fieldId: string) => sql.get(fieldId)?.[field]
}

function makeAllSelectJoin(sql: Statement, field: string) {
  return (fieldId: string) => sql.all(fieldId).map(row => row[field])
}

export function* iterateRows<T>(select: (offset: number) => T, count: number) {
  for (let i = 0; i < count; i++) {
    yield select(i)
  }
}
