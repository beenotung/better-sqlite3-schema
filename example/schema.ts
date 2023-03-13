import { startTimer } from '@beenotung/tslib/node'
import DB from '@beenotung/better-sqlite3-helper'
import {
  cacheAllRefFields,
  DeduplicatedTableSchema,
  getTableFields,
  makeSchemaScanner,
  TableSchema,
} from '../src'
import { dbfile, iterateSamples, sampleCount } from './sample'

export namespace JsonData {
  export const threadFields = {
    type: 'text', // refField
    tid: 'integer',
    fid: 'integer',
    create_at: 'text',
    last_cm: 'text',
    subject: 'text',
    page: 'integer',
    pages: 'integer',
    reason: 'text', // refField
    content: 'text',
    tags: 'json', // extracted
    imgs: 'json', // extracted
    posts: 'json', // extracted
    author: 'text', // extracted
    uid: 'integer',
  }
  export const postFields = {
    pid: 'integer',
    create_at: 'text',
    content: 'text',
    imgs: 'json', // extracted
    author: 'text', // extracted
    uid: 'integer',
  }
  // used in thread
  export let tagFields: {
    tag: string
  }
  // used in thread and post
  export let imgFields: {
    img: string
  }
  // used in thread and post
  export let authorFields: {
    author: 'text'
    uid: 'integer'
  }
}

export const tableOptions: Partial<TableSchema> = {
  inplaceUpdate: true,
  autoCreateTable: true,
  // whitelistFields: true,
  autoCreateIndex: true,
  cacheSize: 20 * 1024 ** 2,
}

export const skippedThreadSchema: TableSchema = {
  table: 'skipped_thread',
  fields: {
    tid: 'integer',
  },
  skipFields: ['type'],
  refFields: ['reason'],
}
export const threadSchema: TableSchema = {
  table: 'thread',
  fields: {
    tid: 'integer',
    fid: 'integer',
    uid: 'integer',
    create_at: 'text',
    last_cm: 'text',
    subject: 'text',
    page: 'integer',
    pages: 'integer',
    content: 'text',
  },
  refFields: ['type'],
}
export const threadTagSchema: TableSchema = {
  table: 'thread_tag',
  fields: {
    tid: 'integer',
  },
  refFields: ['tag'],
}
export const threadImgSchema: TableSchema = {
  table: 'thread_img',
  fields: {
    tid: 'integer',
  },
  refFields: ['img'],
}
export const authorSchema: TableSchema & DeduplicatedTableSchema = {
  table: 'author',
  fields: {
    uid: 'integer',
    author: 'text',
  },
  deduplicateFields: ['author'],
  idField: 'uid',
}
export const postSchema: TableSchema = {
  table: 'post',
  fields: {
    pid: 'integer',
    tid: 'integer',
    uid: 'integer',
    create_at: 'text',
    content: 'text',
  },
}
export const postImgSchema: TableSchema = {
  table: 'post_img',
  fields: {
    pid: 'integer',
  },
  refFields: ['img'],
}

export const schemas = {
  skippedThreadSchema,
  threadSchema,
  threadTagSchema,
  threadImgSchema,
  authorSchema,
  postSchema,
  postImgSchema,
}

Object.values(schemas).forEach(schema => {
  Object.assign(schema, tableOptions)
  cacheAllRefFields(schema)
})

function test() {
  scanSchema()
  getFields()
}

function scanSchema() {
  const { fields: threadFields, addRowFn: addThread } = makeSchemaScanner()
  const { fields: postFields, addRowFn: addPost } = makeSchemaScanner()
  const timer = startTimer('scan schema')
  const n = sampleCount
  timer.setProgress({ totalTick: n, estimateTime: true, sampleOver: n / 100 })
  for (const data of iterateSamples()) {
    const { posts, ...thread } = data.value
    addThread(thread)
    ;(posts as any[])?.forEach(addPost)
    timer.tick()
  }
  timer.end()
  console.log({
    threadFields,
    postFields,
  })
}

function getFields() {
  const db = DB({ path: dbfile, migrate: false })
  const fields = getTableFields(db, 'thread')
  console.log(fields)
}

if (process.argv[1] === __filename) {
  test()
}
