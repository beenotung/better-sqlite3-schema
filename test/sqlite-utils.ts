import { startTimer } from '@beenotung/tslib/node'
import DB from 'better-sqlite3-helper'
import {
  delDBFile,
  makeInsertRowFnFromSchema,
  TableSchema,
} from '../src/sqlite/helpers'
import { iterateSamples, sampleCount } from './sample'

export let dbfile = 'db.sqlite3'

export function exportToSqlite() {
  const timer = startTimer('init db')
  delDBFile(dbfile)
  const db = DB({ path: dbfile, migrate: false })
  const options: Partial<TableSchema> = {
    inplaceUpdate: true,
    autoAddField: true,
    autoCreateTable: true,
  }
  const addThread = makeInsertRowFnFromSchema(db, {
    table: 'thread',
    refFields: ['author', 'reason', 'type'],
    ...options,
  })
  const addPost = makeInsertRowFnFromSchema(db, {
    table: 'post',
    refFields: ['author'],
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
  const n = sampleCount
  let i = 0
  timer.next('import data')
  timer.setProgress({ totalTick: n, estimateTime: true })
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
      const { posts, imgs, tags, ...thread } = value
      const thread_id = addThread(thread)
      ; (tags as string[])?.forEach(tag => {
        addThreadTag({ thread_id, tag })
      })
      ; (imgs as string[])?.forEach(img => {
        addThreadImg({ thread_id, img })
      })
      forEachRow(posts, { thread_id }, (data: any) => {
        const { imgs, ...post } = data
        const post_id = addPost(post)
        ; (imgs as string[])?.forEach(img => {
          addPostImg({ post_id, img })
        })
      })
      continue
    }
    throw new Error('unknown data type')
  }
}

export function test() {
  // let db = DB({ path: dbfile, migrate: false })
  // let fields = getTableFields(db, 'threads')
  // console.log(fields)
  exportToSqlite()
}

test()

function forEachRow<T>(
  rows: any[] | undefined,
  refFields: Record<string, number>,
  eachFn: (row: T) => void,
) {
  if (!rows) {
    return
  }
  rows.forEach(row => {
    Object.assign(row, refFields)
    eachFn(row)
  })
}
