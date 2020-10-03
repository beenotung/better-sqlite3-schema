import { Sink, Source } from '../pipe'
import {
  countRows,
  createDB,
  DB,
  InsertRowFn,
  makeInsertRowFnFromSchema,
  makeSelectRowFnFromSchema,
  SelectRowFn,
  TableSchema,
} from './helpers'

export type SqliteSinkOptions = {
  insertRowFn: InsertRowFn
  close?: () => void
}

export function makeSqliteSinkOptions(
  db: DB,
  schema: TableSchema,
  options?: {
    autoClose?: boolean
  },
): SqliteSinkOptions {
  return {
    insertRowFn: makeInsertRowFnFromSchema(db, schema),
    close: options?.autoClose ? () => db.close() : undefined,
  }
}

export class SqliteObjectSink<T extends object> extends Sink<T> {
  public insertRowFn: InsertRowFn

  constructor(options: SqliteSinkOptions) {
    super()
    this.insertRowFn = options.insertRowFn
    if (options.close) {
      this.close = options.close
    }
  }

  close() {
    // noop
  }

  write(data: any) {
    this.insertRowFn(data)
  }

  static create<T extends object>(options: {
    file: string
    schema: TableSchema
    mode?: 'incremental' | 'overwrite' // default is incremental
  }): SqliteObjectSink<T> {
    const { file, schema, mode } = options
    const db = createDB({ file, mode })
    return new SqliteObjectSink({
      insertRowFn: makeInsertRowFnFromSchema(db, schema),
      close: () => db.close(),
    })
  }
}

export class SqliteValueSink extends SqliteObjectSink<any> {
  write(data: any) {
    const value = JSON.stringify(data)
    super.write({ value })
  }
}

export type SqliteSourceOptions = {
  selectRowFn: SelectRowFn
  countRowsFn: () => number
  close?: () => void
}

export function makeSqliteSourceOptions(
  db: DB,
  schema: TableSchema,
  options?: {
    autoClose?: boolean
  },
): SqliteSourceOptions {
  return {
    selectRowFn: makeSelectRowFnFromSchema(db, schema),
    countRowsFn: () => countRows(db, schema.table),
    close: options?.autoClose ? () => db.close() : undefined,
  }
}

export class SqliteObjectSource<T extends object> extends Source<T> {
  offset = 0
  selectRow: SelectRowFn
  countRows: () => number

  constructor(options: SqliteSourceOptions) {
    super()
    this.selectRow = options.selectRowFn
    this.countRows = options.countRowsFn
    if (options.close) {
      this.close = options.close
    }
  }

  read(): T {
    const res = this.selectRow(this.offset)
    this.offset++
    return res
  }

  *iterator(options?: { autoClose?: boolean }): Generator<T> {
    const n = this.countRows()
    while (this.offset < n) {
      yield this.read()
    }
    if (options?.autoClose) {
      this.close()
    }
  }

  close() {
    // noop
  }

  static create<T extends object>(options: {
    file: string
    schema: TableSchema
  }) {
    const db = createDB({ file: options.file })
    const schema = options.schema
    return new SqliteObjectSource({
      selectRowFn: makeSelectRowFnFromSchema(db, schema),
      countRowsFn: () => countRows(db, schema.table),
      close: () => db.close(),
    })
  }
}

export class SqliteValueSource extends SqliteObjectSource<any> {
  read(): any {
    const value = super.read().value
    return JSON.parse(value)
  }
}
