import { startTimer } from '@beenotung/tslib/node'
import {
  countRows,
  createDB,
} from '../src'
import { makePredefinedInsertRowFn, makePredefinedSelectRowFn } from './functional-helpers'
import { dbfile, iterateSamples, sampleCount } from './sample'


export function exportToSqlite() {
  const timer = startTimer('init db')
  const db = createDB({ file: dbfile, mode: 'overwrite' })
  // const insertRowFn = makeGeneralInsertRowFn(db)
  const insertRowFn = makePredefinedInsertRowFn(db)
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
      insertRowFn(value)
      continue
    }
    throw new Error('unknown data type')
  }
  timer.end()
}

export function loadFromSqlite() {
  const timer = startTimer('init')
  const db = createDB({ file: dbfile })
  const countRowsFn = () => countRows(db, 'thread')
  const selectRowFn = makePredefinedSelectRowFn(db)
  timer.next('load data')
  const n = countRowsFn()
  timer.setProgress({
    totalTick: n,
    estimateTime: true,
    sampleOver: n / 100,
  })
  for (let i = 0; i < n; i++) {
    const thread = selectRowFn(i)
    if (!thread) {
      throw new Error('failed to load thread')
    }
    timer.tick()
  }
  timer.end()
  db.close()
}

export function test() {
  exportToSqlite()
  loadFromSqlite()
}

if (process.argv[1] === __filename) {
  test()
}
