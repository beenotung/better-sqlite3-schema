import {  makeImports, makeRefTables,  makeTables } from '../src/codegen'
import { schemas } from './schema'

const schemaArray = Object.values(schemas);

`
${makeImports(schemaArray)}
import { createDB } from 'better-sqlite3-schema'
import { dbfile } from './sample'

export const db = createDB({ file: dbfile })

${makeRefTables(schemaArray)}
${makeTables(schemaArray)}
`.trim()
