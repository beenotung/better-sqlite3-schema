import { forEach, Int } from 'better-sqlite3-schema'
import {
  deduplicatedInsertAuthor,
  insertPost,
  insertPostImg,
  insertSkippedThread,
  insertThread,
  insertThreadImg,
  insertThreadTag,
} from './schema-codegen'

export function insertData(data: any): Int {
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

export function loadData() {
}
