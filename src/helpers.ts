import { Statement } from 'better-sqlite3'
import DB, { BetterSqlite3Helper } from 'better-sqlite3-helper'
import { IntLike } from 'integer'
import { Cache, newCache } from './utils/cache'
import { chain } from './utils/function'

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
  autoAddField?: boolean
  skipFields?: string[]
  refFields?: Array<string | RefFieldSchema>
  cacheFields?: string[]
  whitelistFields?: string[] | boolean
  idFieldSuffix?: string
  inplaceUpdate?: boolean

  // for DeduplicatedTable
  deduplicateFields?: string[]
  idField?: string

  // for implicit index
  primaryKeys?: string[]
} & CacheOptions &
  AutoCreateOptions &
  CreateOptions
export type AutoCreateOptions = {
  autoCreateTable?: boolean
  autoCreateIndex?: boolean
}
export type CreateOptions = {
  createTableSql?: string
  createIndexSql?: string
}
export type RefFieldSchema = {
  field: string
  idField: string
  type?: string
} & CacheOptions &
  AutoCreateOptions
type InsertRefField = {
  field: string
  idField: string
  select: Statement
  insert: Statement
  getRefIdFn: GetRefIdFn
}
type GetRefIdFn = (refSqls: InsertRefSqls, fieldData: any) => number | null

export type InsertRowFn = (row: any) => number

export function makeInsertRowFnFromSchema(
  db: DB,
  schema: TableSchema,
): InsertRowFn {
  autoCreateTable(db, schema)
  autoCreateIndexFromSchema(db, schema)
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

export const defaultIdFieldSuffix = '_id'

export function toRefIdFieldNames(
  schema: Pick<TableSchema, 'refFields' | 'idFieldSuffix'>,
): string[] {
  return (schema.refFields || []).map(refField =>
    typeof refField === 'string'
      ? refField + (schema.idFieldSuffix || defaultIdFieldSuffix)
      : refField.idField,
  )
}

export function toRefFieldNames(schema: TableSchema): string[] {
  return (schema.refFields || []).map(refField =>
    typeof refField === 'string' ? refField : refField.field,
  )
}

export const defaultTableFields = {
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
  const bodySqls = Object.entries(fields).map(nameAndType =>
    nameAndType.join(' '),
  )
  if (schema.primaryKeys) {
    const fields = schema.primaryKeys.map(escapeField).join(',')
    bodySqls.push(`primary key (${fields})`)
  }
  const bodySql = bodySqls.join(',')
  const sql = `create table if not exists "${schema.table}" (${bodySql})`
  db.exec(sql)
}

function autoCreateIndexFromSchema(db: DB, schema: TableSchema) {
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
    deduplicateFields: string[]
    idField: string
  },
  insertRowFn: InsertRowFn,
): InsertRowFn {
  const deduplicateFields = options.deduplicateFields
  const idField = options.idField
  const select = options.select
  return row => {
    const selectArgs = deduplicateFields.map(field => row[field])
    const matchedRow = select.get(...selectArgs)
    if (matchedRow) {
      return matchedRow[idField]
    }
    return insertRowFn(row)
  }
}

export type DeduplicatedTableSchema = {
  table: string
  deduplicateFields: string[]
  idField: string
} & Omit<TableSchema, 'deduplicateFields' | 'idField'>

export function makeDeduplicatedInsertRowFnFromSchema(
  db: DB,
  schema: DeduplicatedTableSchema,
  insertRowFn: InsertRowFn,
): InsertRowFn {
  autoCreateIndexFromDeduplicatedSchema(db, schema)
  const idField = schema.idField
  const deduplicateFields = schema.deduplicateFields
  const whereSql = deduplicateFields.map(field => `"${field}" = ?`).join(' or ')
  const select: Statement = db.prepare(
    `select "${idField}" from "${schema.table}" where ${whereSql}`,
  )
  const deduplicatedInsertRowFn = makeDeduplicatedInsertRowFn(
    {
      select,
      idField,
      deduplicateFields,
    },
    insertRowFn,
  )
  const cache = toCache(schema)
  if (!cache) {
    return deduplicatedInsertRowFn
  }
  return row => {
    const key = JSON.stringify(deduplicateFields.map(field => row[field]))
    return cache.get(key, () => deduplicatedInsertRowFn(row))
  }
}

function autoCreateIndexFromDeduplicatedSchema(
  db: DB,
  schema: DeduplicatedTableSchema,
) {
  if (!schema.autoCreateIndex) {
    return
  }
  createUniqueIndexIfNotExist(db, schema.table, schema.deduplicateFields)
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

export function toRefSchemas(schema: TableSchema): RefFieldSchema[] {
  return (schema.refFields || []).map(refField => toRefSchema(refField, schema))
}

export function toRefSchema(
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

function createRefTableIfNotExist(db: DB, schema: RefFieldSchema) {
  db.exec(makeCreateRefTableSql(schema))
}

function createUniqueIndexIfNotExist(db: DB, table: string, fields: string[]) {
  db.exec(makeUniqueIndexSql(table, fields))
}

export type InsertRefSqls = {
  select: Statement
  insert: Statement
  idField: string
}

export function makeInsertRefSqls(
  db: DB,
  schema: RefFieldSchema,
): InsertRefSqls {
  const field = schema.field
  const table = field
  const idField = schema.idField
  if (schema.autoCreateTable) {
    createRefTableIfNotExist(db, schema)
  }
  if (schema.autoCreateIndex) {
    createUniqueIndexIfNotExist(db, table, [field])
  }
  const select = db.prepare(
    `select "${idField}" from "${field}" where "${field}" = ? limit 1`,
  )
  const insert = db.prepare(`insert into "${field}" ("${field}") values (?)`)
  return { select, insert, idField }
}

function getRefId(refSqls: InsertRefSqls, fieldData: undefined | null): null
function getRefId(refSqls: InsertRefSqls, fieldData: any): number
function getRefId(refSqls: InsertRefSqls, fieldData: any): number | null {
  if (fieldData === undefined || fieldData === null) {
    return null
  }
  const row = refSqls.select.get(fieldData)
  if (row) {
    return row[refSqls.idField]
  }
  return +refSqls.insert.run(fieldData).lastInsertRowid
}

function makeCachedGetRefIdFn(cache: Cache<number>): GetRefIdFn {
  return (refSqls, fieldData) =>
    fieldData === undefined || fieldData === null
      ? null
      : cache.get(fieldData, () => getRefId(refSqls, fieldData))
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

export function getTableIndices(db: DB, table: string): SqliteMasterRow[] {
  return db
    .prepare(
      `select * from sqlite_master where type = 'index' and tbl_name = ?`,
    )
    .all(table)
}

export function getAllTables(db: DB): SqliteMasterRow[] {
  return db.prepare(`select * from sqlite_master where type = 'table'`).all()
}

export function getAllIndices(db: DB): SqliteMasterRow[] {
  return db.prepare(`select * from sqlite_master where type = 'index'`).all()
}

export function removeTableIndices(db: DB, table: string) {
  getTableIndices(db, table).forEach(row => {
    db.exec(`drop index if exists "${row.name}"`)
  })
}

/** remove all indices, including those for primary key */
export function removeTableIndicesAndPrimaryKeys(db: DB, table: string) {
  db.transaction(recreateTable)(db, table)
}

/** remove all indices, including those for primary key */
export function removeAllTableIndicesAndPrimaryKeys(db: DB) {
  db.transaction(recreateAllTable)(db)
}

function recreateAllTable(db: DB) {
  getAllTables(db).forEach(row => recreateTable(db, row.name))
}

function recreateTable(db: DB, table: string) {
  db.exec(`
create table "tmp_${table}" as select * from "${table}";
drop table "${table}";
alter table "tmp_${table}" rename to "${table}";
`)
}

export function removeAllIndices(db: DB) {
  getAllIndices(db).forEach(row => {
    if (!row.sql) {
      return // skip index of primary key
    }
    db.exec(`drop index if exists "${row.name}"`)
  })
}

export function removeAllTables(db: DB) {
  getAllTables(db).forEach(row => {
    db.exec(`drop table if exists "${row.name}"`)
  })
}

export function vacuum(db: DB) {
  db.exec(`VACUUM`)
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
      return 'integer'
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

export function cacheAllRefFields(schema: TableSchema) {
  const cacheFields = new Set<string>(schema.cacheFields)
  toRefFieldNames(schema).forEach(field => cacheFields.add(field))
  schema.cacheFields = Array.from(cacheFields)
}

export function escapeField(field: string): string {
  return JSON.stringify(field)
}

export function makeCreateRefTableSql(schema: RefFieldSchema) {
  const field = schema.field
  const idField = schema.idField
  const type = schema.type ? ' ' + schema.type : ''
  return `create table if not exists "${field}" (
  "${idField}" integer primary key,
  "${field}"${type}
)`
}

export function makeUniqueIndexSql(table: string, fields: string[]) {
  const fieldsSql = fields.map(escapeField).join(',')
  return `create unique index if not exists "${table}_unique_idx" on "${table}" (${fieldsSql})`
}

export function toExportMode(db: DB, cache_size?: number) {
  db.exec(`PRAGMA synchronous = OFF`)
  db.exec(`PRAGMA journal_mode = MEMORY`)
  setCacheSize(db, cache_size)
}

export function toSafeMode(db: DB, cache_size?: number) {
  setCacheSize(db, cache_size)
  db.exec(`PRAGMA journal_mode = WAL`)
  db.exec(`PRAGMA synchronous = NORMAL`)
}

function setCacheSize(db: DB, cache_size?: number) {
  if (typeof cache_size === 'number') {
    db.exec(`PRAGMA cache_size = ${cache_size}`)
  }
}

export type RefCache<T> = Record<string | number, T>

export function loadAllRefCache<T>(
  db: DB,
  field: string,
  idField: string = field + defaultIdFieldSuffix,
): RefCache<T> {
  const cache: Record<string | number, T> = {}
  for (const row of db
    .prepare(`select ${idField}, ${field} from ${field}`)
    .iterate()) {
    const id = row[idField]
    cache[id] = row[field]
  }
  return cache
}

export function getRefValueFromCache<T>(
  cache: RefCache<T>,
  id: string | number,
  name = 'ref value',
) {
  if (id in cache) {
    return cache[id]
  }
  console.error(`unknown ${name} id:`, { id, cache })
  throw new Error(`unknown ${name} id`)
}

/**
 * select from existing record or insert and return new id
 * @deprecated use makeCachedPreparedRefFns() instead
 * */
export function makeCachedPreparedGetRefIdFn(
  db: DB,
  field: string,
  idFields = field + defaultIdFieldSuffix,
) {
  return makeCachedPreparedRefFns(db, field, idFields).getRefId
}

export function makeCachedPreparedRefFns(
  db: DB,
  field: string,
  idFields = field + defaultIdFieldSuffix,
) {
  const select_id_statement = db.prepare(`
  select "${idFields}" from "${field}"
  where "${field}" = ?
  `)

  const select_val_statement = db.prepare(`
  select "${field}" from "${field}"
  where "${idFields}" = ?`)

  const insert_statement = db.prepare(`
  insert into "${field}" ("${field}") values (?)
  `)
  const select_all_statement = db.prepare(`
  select "${idFields}","${field}" from "${field}"
  `)

  const id_cache: any = {}
  const val_cache: any = {}

  /** select from existing record or insert and return new id */
  function getRefId(value: string): IntLike {
    if (value in val_cache) {
      return val_cache[value]
    }
    const row = select_id_statement.get(value)
    let id: IntLike
    if (row) {
      id = row[idFields]
    } else {
      id = insert_statement.run(value).lastInsertRowid
    }
    val_cache[value] = id
    return id
  }

  function getRefValue(id: IntLike) {
    id = id as string
    if (id in id_cache) {
      return id_cache[id]
    }
    const row = select_val_statement.get(id)
    if (!row) {
      console.error(`unknown "${field}" id:`, id)
      throw new Error(`unknown "${field}" id`)
    }
    const value = row[field]
    id_cache[id] = value
    return value
  }

  function populateCache() {
    for (const row of select_all_statement.all()) {
      const id = row[idFields]
      const val = row[field]
      id_cache[id] = val
      val_cache[val] = id
    }
  }

  return {
    getRefValue,
    getRefId,
    populateCache,
    val_cache,
    id_cache,
  }
}

export function makePreparedRefFns(
  db: DB,
  field: string,
  idFields = field + defaultIdFieldSuffix,
) {
  const select_id_statement = db.prepare(`
  select "${idFields}" from "${field}"
  where "${field}" = ?
  `)

  const select_val_statement = db.prepare(`
  select "${field}" from "${field}"
  where "${idFields}" = ?`)

  const insert_statement = db.prepare(`
  insert into "${field}" ("${field}") values (?)
  `)

  /** select from existing record or insert and return new id */
  function getRefId(value: string): IntLike {
    const row = select_id_statement.get(value)
    let id: IntLike
    if (row) {
      id = row[idFields]
    } else {
      id = insert_statement.run(value).lastInsertRowid
    }
    return id
  }

  function getRefValue(id: IntLike) {
    id = id as string
    const row = select_val_statement.get(id)
    if (!row) {
      console.error(`unknown "${field}" id:`, id)
      throw new Error(`unknown "${field}" id`)
    }
    return row[field]
  }

  return {
    getRefValue,
    getRefId,
  }
}
