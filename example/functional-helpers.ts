import {
  CacheOptions,
  DBInstance,
  forEach,
  InsertRowFn,
  makeDeduplicatedInsertRowFnFromSchema, makeGetRefValueFnFromSchema,
  makeInsertRowFnFromSchema, makeSelectRefFieldArray, makeSelectRowFnFromSchema,
  SelectRowFn,
  TableSchema,
} from '../src'
import { authorSchema, postImgSchema, postSchema, skippedThreadSchema, threadImgSchema, threadSchema, threadTagSchema } from './schema'

export function makePredefinedInsertRowFn(db: DBInstance): InsertRowFn {
  function makeAddRow(schema: TableSchema) {
    return makeInsertRowFnFromSchema(db, schema)
  }

  const addSkippedThread = makeAddRow(skippedThreadSchema)
  const addThread = makeAddRow(threadSchema)
  const addThreadTag = makeAddRow(threadTagSchema)
  const addThreadImg = makeAddRow(threadImgSchema)
  const addAuthor = makeDeduplicatedInsertRowFnFromSchema(
    db,
    authorSchema,
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
