import {
  DeduplicatedTableSchema,
  escapeField,
  makeCreateRefTableSql,
  makeUniqueIndexSql,
  RefFieldSchema,
  TableSchema,
  toRefFieldNames,
  toRefIdFieldNames,
  toRefSchemas,
} from './helpers'
import { uniqueArray } from './utils/array'
import { compare } from './utils/compare'
import { toCamelCase } from './utils/string'

export type MaybeDeduplicatedTableSchema = TableSchema | DeduplicatedTableSchema

export function makeInsertSql(table: string, fields: string[]) {
  table = escapeField(table)
  const cols: string = fields.map(col => '  ' + escapeField(col)).join(',\n')
  const values: string = fields.map(() => '?').join(',')
  return `insert into ${table} (
${cols}
) values (${values})`
}

export function makeRowType(fields: string[]) {
  const keys = fields.map(escapeField).join(' | ')
  return `Partial<Record<${keys}, SqliteDataType>>`
}

export function toFieldNames(schema: TableSchema): string[] {
  return uniqueArray(
    [
      schema.idField || '',
      ...Object.keys(schema.fields || {}),
      ...(schema.deduplicateFields || []),
    ].filter(s => s),
  ).map(escapeField)
}

export function toRowFieldNames(schema: TableSchema): string[] {
  return uniqueArray(
    [
      schema.idField || '',
      ...Object.keys(schema.fields || {}),
      ...toRefIdFieldNames(schema),
      ...(schema.deduplicateFields || []),
    ].filter(s => s),
  )
}

export function toDataFieldNames(schema: TableSchema): string[] {
  return uniqueArray(
    [
      schema.idField || '',
      ...Object.keys(schema.fields || {}),
      ...toRefFieldNames(schema),
      ...(schema.deduplicateFields || []),
    ].filter(s => s),
  )
}

export function makeCreateTableSql(schema: TableSchema) {
  const table = escapeField(schema.table)
  const cols: string[] = []
  Object.entries(schema.fields || {}).forEach(([field, type]) => {
    cols.push(escapeField(field) + ' ' + type)
  })
  toRefIdFieldNames(schema).forEach(field =>
    cols.push(escapeField(field) + ' integer'),
  )
  if (schema.primaryKeys) {
    const fields = schema.primaryKeys.map(escapeField).join(', ')
    cols.push(`primary key(${fields})`)
  }
  const col = cols.map(col => '  ' + col).join(',\n')
  return `create table if not exists ${table} (
${col}
)`
}

export function makeSelectStatementName(field: string) {
  return `select_${field}_statement`
}

export function makeInsertStatementName(field: string) {
  return `insert_${field}_statement`
}

export function makeCountStatementName(field: string) {
  return `count_${field}_statement`
}

export function makeCacheName(field: string) {
  return `${field}_cache`
}

export function makeRowName(field: string) {
  return `${field}_row`
}

export function makeTables(schemas: MaybeDeduplicatedTableSchema[]) {
  return schemas.map(makeTable).join('\n')
}

export function makeTable(schema: MaybeDeduplicatedTableSchema) {
  const tableName = toCamelCase(schema.table)

  const refSchemas = toRefSchemas(schema)
  const fields = toFieldNames(schema)
  const refIdFields = toRefIdFieldNames(schema)
  const rowFields = toRowFieldNames(schema)
  const dataFields = toDataFieldNames(schema)
  const insertSql = makeInsertSql(schema.table, rowFields)
  const rowType = makeRowType(rowFields)
  const dataType = makeRowType(dataFields)
  const createTableSql = schema.createTableSql || makeCreateTableSql(schema)

  const insertRowValues = [
    ...fields.map(field => `data[${field}]`),
    ...refIdFields,
  ]

  const getRefValues = refSchemas.map(makeInlineGetRefId).join('')

  const insertName = makeInsertStatementName(schema.table)
  const insertFnName = 'insert' + tableName

  let code = `
export type ${tableName}Data = ${dataType}
export type ${tableName}Row = ${rowType}

${schema.autoCreateTable ? `db.exec(\`${createTableSql}\`)` : ''}
${schema.createIndexSql ? `db.exec(\`${schema.createIndexSql}\`)` : ''}
const ${insertName} = db.prepare(\`${insertSql}\`)

export function ${insertFnName}(data: ${tableName}Data): Int {
${getRefValues}
  return ${insertName}.run(
${insertRowValues.map(field => '    ' + field).join(',\n')}
  ).lastInsertRowid;
}
`
  if (schema.deduplicateFields && schema.idField) {
    code += makeDeduplicatedTable(Object.assign(schema))
  }
  return code
}

function makeInlineGetRefId(refField: RefFieldSchema) {
  if (refField.cacheSize) {
    return makeInlineGetCachedRefId(refField)
  }
  const field = refField.field
  const idField = refField.idField
  const select = makeSelectStatementName(idField)
  const insert = makeInsertStatementName(field)
  return `
  let ${idField} = null
  const ${field} = data["${field}"]
  if (${field} !== undefined && ${field} !== null) {
    const row = ${select}.get(${field})
    ${idField} = row
      ? row["${idField}"]
      : ${insert}.run(${field}).lastInsertRowid
  }
`
}

function makeInlineGetCachedRefId(refField: RefFieldSchema) {
  const field = refField.field
  const idField = refField.idField
  const cache = makeCacheName(idField)
  const select = makeSelectStatementName(idField)
  const insert = makeInsertStatementName(field)
  return `
  const ${field} = data["${field}"]
  const ${idField} =
    ${field} === undefined || ${field} === null
      ? null
      : ${cache}.get(${field} as string, (fieldData: string) => {
          const row = ${select}.get(fieldData) as SingleResult
          return row
            ? row["${idField}"]
            : ${insert}.run(fieldData).lastInsertRowid
        })
`
}

export function makeRefTables(schemas: TableSchema[]) {
  const refSchemas: RefFieldSchema[] = []
  schemas.forEach(schema => refSchemas.push(...toRefSchemas(schema)))
  const createdTableSqls = new Set<string>()
  return refSchemas
    .map((refSchema): string => {
      const field = refSchema.field
      const idField = refSchema.idField

      const createTableSql = makeCreateRefTableSql(refSchema)
      if (createdTableSqls.has(createTableSql)) {
        return ''
      }
      createdTableSqls.add(createTableSql)

      const createIndexSql = makeRefTableIndexSql(field)

      const selectId = makeSelectStatementName(idField)
      const selectIdSql = `select "${idField}" from "${field}" where "${field}" = ?`

      const insert = makeInsertStatementName(field)
      const insertSql = `insert into "${field}" ("${field}") values (?)`

      let code = ''
      if (refSchema.autoCreateTable) {
        code += `
db.exec(\`${createTableSql}\`)`
      }
      if (refSchema.autoCreateIndex) {
        code += `
db.exec(\`${createIndexSql}\`)`
      }
      code += `
export const ${selectId}: Statement = db.prepare(\`${selectIdSql}\`)
export const ${insert}: Statement = db.prepare(\`${insertSql}\`)`
      if (refSchema.cacheSize) {
        const cacheName = makeCacheName(idField)
        const size = refSchema.cacheSize
        code += `
export const ${cacheName} = newCache({ resetSize: ${size} })`
      }
      return code + '\n'
    })
    .join('')
}

export function makeRefTableIndexSql(field: string) {
  return makeUniqueIndexSql(field, [field])
}

// TODO make this standalone, without being proxied from makeTable
function makeDeduplicatedTable(schema: DeduplicatedTableSchema) {
  const table = schema.table
  const tableName = toCamelCase(table)
  const idField = schema.idField
  const deduplicateFields = schema.deduplicateFields
  const rowFields = toRowFieldNames(schema)

  const indexSql =
    schema.createIndexSql || makeUniqueIndexSql(table, deduplicateFields)

  const select = makeCountStatementName(idField)
  const selectSql = `select count(*) count from "${table}" where "${idField}" = ?`

  const insert = 'deduplicated_' + makeInsertStatementName(table)
  const insertSql = makeInsertSql(schema.table, rowFields)

  const fields = toFieldNames(schema)
  const refIdFields = toRefIdFieldNames(schema)
  const insertRowValues = [
    ...fields.map(field => `data[${field}]`),
    ...refIdFields,
  ]

  const refSchemas = toRefSchemas(schema)
  const getRefValues = refSchemas
    .map(makeInlineGetRefId)
    .map(line => '  ' + line)
    .join('')

  const insertFnName = 'deduplicatedInsert' + tableName

  // TODO support cache
  return `
${schema.autoCreateIndex ? `db.exec(\`${indexSql}\`)` : ''}
export const ${select}: Statement = db.prepare(\`${selectSql}\`)
export const ${insert}: Statement = db.prepare(\`${insertSql}\`)

export function ${insertFnName}(data: ${tableName}Data): Int {
  const id = data["${idField}"]
  const row = ${select}.get(id)
  if (!row.count) {
${getRefValues}
    ${insert}.run(
${insertRowValues.map(field => '      ' + field).join(',\n')}
    )
  }
  return id as any
}
`
}

export function makeImports(
  schemas: TableSchema[],
  extraImports?: string[],
): string {
  const imports: string[] = [
    `import { Statement } from 'better-sqlite3'`,
    `import { SqliteDataType, Int, SingleResult } from 'better-sqlite3-schema'`,
    ...(extraImports || []),
  ]
  const hasCache = schemas.some(
    schema =>
      schema.refFields?.some(refField => {
        if (typeof refField === 'string') {
          return schema.cacheFields?.includes(refField)
        }
        return refField.cacheSize
      }),
  )
  if (hasCache) {
    imports.push(`import { newCache } from 'better-sqlite3-schema'`)
  }
  return sortImports(imports).join('\n')
}

function sortImports(imports: string[]): string[] {
  return imports
    .map(code => {
      const module = code.split(' ').pop()!
      return { code, module }
    })
    .sort((a, b) => compare(a.module, b.module))
    .map(a => a.code)
}
