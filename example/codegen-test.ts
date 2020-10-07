import { createDB, forEach } from '../src'
import { dbfile } from './sample'
const db = createDB({ file: dbfile, mode: 'overwrite' })
import { startTimer } from '@beenotung/tslib/node'
import { iterateSamples, sampleCount } from './sample'
import {
  insertThread,
  insertSkippedThread,
  deduplicatedInsertAuthor,
  insertThreadTag,
  insertThreadImg,
  insertPost, insertPostImg,
} from './schema-codegen'
import Integer from 'integer'

export function insertData(data: any): Integer.IntLike {
  const { tags, imgs, posts, author, ...thread } = data
  if (thread.type === 'skip') {
    return insertSkippedThread(data)
  }
  if (author) {
    deduplicatedInsertAuthor({ uid: thread.uid, author })
  }
  insertThread(thread)
  const tid = thread.tid
  forEach(tags, tag => insertThreadTag({ tid, tag }))
  forEach(imgs, img => insertThreadImg({ tid, img }))
  forEach(posts, data => {
    const { imgs, author, ...post } = data
    if (author) {
      deduplicatedInsertAuthor({ uid: post.uid, author })
    }
    post.tid = tid
    insertPost(post)
    const pid = post.pid
    forEach(imgs, img => insertPostImg({ pid, img }))
  })
  return tid
}

export function exportToSqlite() {
  const timer = startTimer('init db')
  // const insertRowFn = makeGeneralInsertRowFn(db)
  const n = sampleCount
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
      insertData(value)
      continue
    }
    throw new Error('unknown data type')
  }
  timer.end()
}

export function loadFromSqlite() {
// TODO
}

export function test() {
  exportToSqlite()
  loadFromSqlite()
}

if (process.argv[1] === __filename) {
  test()
}
