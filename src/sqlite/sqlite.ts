import { Sink } from '../pipe'
import {
  DB,
  InsertRowFn,
  makeInsertRowFn,
  MakeInsertRowFnOptions,
  TableSchema,
} from './helpers'

export class SqliteSink extends Sink<any> {

  constructor(public db: DB, public insertRowFn: InsertRowFn) {
    super()
  }

  close() {
    this.db.close()
  }

  write(data: any) {
    this.insertRowFn(data)
  }
  static create(
    db: DB,
    schema: TableSchema,
    options?: MakeInsertRowFnOptions,
  ): SqliteSink {
    const insertRowFn = makeInsertRowFn(db, schema, options)
    return new SqliteSink(db, insertRowFn)
  }
}
