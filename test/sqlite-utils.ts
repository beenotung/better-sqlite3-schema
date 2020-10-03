import { startTimer } from '@beenotung/tslib/node'
import DB from 'better-sqlite3-helper'
import {
  CacheOptions,
  countRows,
  createDB,
  DBInstance,
  DeduplicatedTableSchema,
  forEach,
  getTableFields,
  InsertRowFn,
  makeDeduplicatedInsertRowFnFromSchema,
  makeGetRefValueFnFromSchema,
  makeInsertRowFnFromSchema,
  makeSchemaScanner,
  makeSelectRefFieldArray,
  makeSelectRowFnFromSchema,
  SelectRowFn,
  TableSchema,
} from '../src/sqlite/helpers'
import { SqliteObjectSource } from '../src/sqlite/sqlite'
import { iterateSamples, sampleCount } from './sample'

export let dbfile = 'db.sqlite3'

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

const skippedThreadSchema: TableSchema = {
  table: 'skipped_thread',
  fields: {
    tid: 'integer',
  },
  skipFields: ['type'],
  refFields: ['reason'],
}
const threadSchema: TableSchema = {
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
const threadTagSchema: TableSchema = {
  table: 'thread_tag',
  fields: {
    tid: 'integer',
  },
  refFields: ['tag'],
}
const threadImgSchema: TableSchema = {
  table: 'thread_img',
  fields: {
    tid: 'integer',
  },
  refFields: ['img'],
}
const authorSchema: TableSchema & DeduplicatedTableSchema = {
  table: 'author',
  fields: {
    uid: 'integer',
    author: 'text',
  },
  deduplicateField: 'author',
  idField: 'uid',
}
const postSchema: TableSchema = {
  table: 'post',
  fields: {
    pid: 'integer',
    tid: 'integer',
    uid: 'integer',
    create_at: 'text',
    content: 'text',
  },
}
const postImgSchema: TableSchema = {
  table: 'post_img',
  fields: {
    pid: 'integer',
  },
  refFields: ['img'],
}

export function makePredefinedInsertRowFn(db: DBInstance): InsertRowFn {
  const tableOptions: Partial<TableSchema> = {
    inplaceUpdate: true,
    autoCreateTable: true,
    // whitelistFields: true,
    autoCreateIndex: true,
    cacheSize: 20 * 1024 ** 2,
  }

  function makeAddRow(schema: TableSchema) {
    return makeInsertRowFnFromSchema(db, { ...schema, ...tableOptions })
  }

  const addSkippedThread = makeAddRow(skippedThreadSchema)
  const addThread = makeAddRow(threadSchema)
  const addThreadTag = makeAddRow(threadTagSchema)
  const addThreadImg = makeAddRow(threadImgSchema)
  const addAuthor = makeDeduplicatedInsertRowFnFromSchema(
    db,
    { ...authorSchema, ...tableOptions },
    makeAddRow(authorSchema),
  )
  const addPost = makeAddRow(postSchema)
  const addPostImg = makeAddRow(postImgSchema)
  return (row: any) => {
    const { tags, imgs, posts, author, ...thread } = row
    if (thread.type === 'skip') {
      return addSkippedThread(thread)
    }
    if (author) {
      addAuthor({ uid: thread.uid, author })
    }
    addThread(thread)
    const tid = thread.tid
    forEach(tags, tag => addThreadTag({ tid, tag }))
    forEach(imgs, img => addThreadImg({ tid, img }))
    forEach(posts, data => {
      const { imgs, author, ...post } = data
      if (author) {
        addAuthor({ uid: post.uid, author })
      }
      post.tid = tid
      addPost(post)
      const pid = post.pid
      forEach(imgs, img => addPostImg({ pid, img }))
    })
    return tid
  }
}

export function makeGeneralInsertRowFn(db: DBInstance): InsertRowFn {
  const options: Partial<TableSchema> = {
    inplaceUpdate: true,
    // autoAddField: true,
    autoCreateTable: true,
  }
  const addThread = makeInsertRowFnFromSchema(db, {
    table: 'thread',
    refFields: ['type', 'reason'],
    ...options,
  })
  const addPost = makeInsertRowFnFromSchema(db, {
    table: 'post',
    ...options,
  })
  const addThreadImg = makeInsertRowFnFromSchema(db, {
    table: 'thread_img',
    refFields: ['img'],
    ...options,
  })
  const addPostImg = makeInsertRowFnFromSchema(db, {
    table: 'post_img',
    refFields: ['img'],
    ...options,
  })
  const addThreadTag = makeInsertRowFnFromSchema(db, {
    table: 'thread_tag',
    refFields: ['tag'],
    ...options,
  })
  return row => {
    const { posts, imgs, tags, ...thread } = row
    const thread_id = addThread(thread)
    forEach(tags, tag => addThreadTag({ thread_id, tag }))
    forEach(imgs, img => addThreadImg({ thread_id, img }))
    forEach(posts, data => {
      const { imgs, ...post } = data
      const post_id = addPost({ ...post, thread_id })
      forEach(imgs, img => addPostImg({ post_id, img }))
    })
    return thread_id
  }
}

export function scanSchema() {
  const { fields: threadFields, addRowFn: addThread } = makeSchemaScanner()
  const { fields: postFields, addRowFn: addPost } = makeSchemaScanner()
  const timer = startTimer('scan schema')
  const n = sampleCount
  timer.setProgress({ totalTick: n, estimateTime: true, sampleOver: n / 100 })
  for (const data of iterateSamples()) {
    const { posts, ...thread } = data.value
    addThread(thread)
    ; (posts as any[])?.forEach(addPost)
    timer.tick()
  }
  timer.end()
  console.log({
    threadFields,
    postFields,
  })
}

export function exportToSqlite() {
  const timer = startTimer('init db')
  const db = createDB({ file: dbfile, mode: 'overwrite' })
  // const insertRowFn = makeGeneralInsertRowFn(db)
  const insertRowFn = makePredefinedInsertRowFn(db)
  const n = sampleCount / 50
  let i = 0
  timer.next('import data')
  timer.setProgress({ totalTick: n, estimateTime: true, sampleOver: n / 100 })
  for (const { key, value } of iterateSamples()) {
    i++
    timer.tick()
    if (i > n) {
      break
    }
    if (key === 'last-thread') {
      continue
    }
    if (key.startsWith('thread-')) {
      insertRowFn(value)
      continue
    }
    throw new Error('unknown data type')
  }
  timer.end()
}

export function makePredefinedSelectRowFn(db: DBInstance): SelectRowFn {
  const cacheOptions: CacheOptions = { cacheSize: 8 ** (1024 ** 2) }
  const selectThread = makeSelectRowFnFromSchema(db, threadSchema)
  const selectThreadTag = makeSelectRefFieldArray(db, {
    table: 'thread_tag',
    field: 'tag',
    idField: 'tid',
    ...cacheOptions,
  })
  const selectThreadImg = makeSelectRefFieldArray(db, {
    table: 'thread_img',
    field: 'img',
    idField: 'tid',
    ...cacheOptions,
  })
  const getAuthor = makeGetRefValueFnFromSchema(db, {
    field: 'author',
    idField: 'uid',
    ...cacheOptions,
  })
  const selectPost = db.prepare(`select * from post where tid = ?`)
  const selectPostImg = makeSelectRefFieldArray(db, {
    table: 'post_img',
    field: 'img',
    idField: 'pid',
    ...cacheOptions,
  })
  return offset => {
    const thread = selectThread(offset)
    const tid = thread.tid
    thread.tags = selectThreadTag(tid)
    thread.imgs = selectThreadImg(tid)
    thread.author = getAuthor(thread.uid)
    thread.posts = selectPost.all(tid).map(post => {
      post.imgs = selectPostImg(post.pid)
      post.author = getAuthor(post.uid)
      return post
    })
    return thread
  }
}

export function loadFromSqlite() {
  const timer = startTimer('init')
  const db = createDB({ file: dbfile })
  const countRowsFn = () => countRows(db, 'thread')
  const source = new SqliteObjectSource<any>({
    selectRowFn: makePredefinedSelectRowFn(db),
    countRowsFn,
    close: () => db.close(),
  })
  timer.next('load data')
  const n = countRowsFn()
  timer.setProgress({
    totalTick: n,
    estimateTime: true,
    sampleOver: n / 100,
  })
  for (const thread of source.iterator({ autoClose: true })) {
    timer.tick()
  }
  timer.end()
}

export function getFields() {
  const db = DB({ path: dbfile, migrate: false })
  const fields = getTableFields(db, 'threads')
  console.log(fields)
}

export function test() {
  // scanSchema()
  // getFields()
  // exportToSqlite()
  loadFromSqlite()
}

if (process.argv[1] === __filename) {
  test()
}
