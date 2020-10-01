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
    ...options,
  })
  const addPost = makeInsertRowFnFromSchema(db, {
    table: 'post',
    ...options,
  })
  const addImg = makeInsertRowFnFromSchema(db, {
    table: 'img',
    ...options,
  })
  const addTag = makeInsertRowFnFromSchema(db, {
    table: 'tag',
    ...options,
  })
  const n = sampleCount / 10
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
      addRows(
        addTag,
        { thread_id },
        tags?.map((tag: string) => ({ tag })),
      )
      addRows(
        addImg,
        { thread_id },
        imgs?.map((img: string) => ({ img })),
      )
      forEachRow(posts, { thread_id }, (data: any) => {
        const { imgs, ...post } = data
        const post_id = addPost(post)
        addRows(
          addImg,
          { post_id },
          imgs?.map((img: string) => ({ img })),
        )
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

function addRows<T>(
  addRowFn: (row: T) => number,
  refFields: Record<string, number>,
  rows: T[] | undefined,
  eachFn?: (row: T) => T,
) {
  if (!rows) {
    return
  }
  if (eachFn) { rows = rows.map(eachFn) }
  rows.forEach(row => {
    Object.assign(row, refFields)
    addRowFn(row)
  })
}

function forEachRow<T>(
  rows: any[] | undefined,
  refFields: Record<string, number>,
  eachFn: (row: T) => void,
) {
  if (!rows) { return }
  rows.forEach(row => {
    Object.assign(row, refFields)
    eachFn(row)
  })
}
