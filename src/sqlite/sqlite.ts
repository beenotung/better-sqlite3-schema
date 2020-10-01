import createDB from 'better-sqlite3-helper'
import { Sink } from '../pipe'
import {
  DB,
  InsertRowFn,
  makeInsertRowFnFromSchema,
  TableSchema,
} from './helpers'

export class SqliteSink extends Sink<any> {
  constructor(public db: DB, public insertRowFn: InsertRowFn) {
    super()
  }

  close() {
    console.log('close')
    this.db.close()
  }

  write(data: any) {
    console.log('write', data)
    this.insertRowFn(data)
  }

  static create(options: {
    file: string
    schema: TableSchema
    mode?: 'incremental' | 'overwrite' // default is incremental
  }): SqliteSink {
    const file = options.file
    console.log({ mode: options.mode })
    if (options.mode === 'overwrite') {
      const fs = require('fs')
      console.log('exist?')
      if (fs.existsSync(file)) {
        console.log('exist')
        fs.unlinkSync(file)
        console.log('unlink')
      }
    }
    console.log('create db')
    const db = createDB({ path: file, migrate: false })
    const insertRowFn = makeInsertRowFnFromSchema(db, options.schema)
    return new SqliteSink(db, insertRowFn)
  }
}
