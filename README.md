# better-sqlite3-schema

Migrate (nested and multi-dimensional) json data to/from sqlite database with better-sqlite3-helper

[![npm Package Version](https://img.shields.io/npm/v/better-sqlite3-schema.svg?maxAge=3600)](https://www.npmjs.com/package/better-sqlite3-schema)

## Usage Example

Sample json data type:
```typescript
interface Thread {
  tid: number
  subject: string
  uid: string
  author: string
  posts: Post[]
  tags: string[]
}

interface Post {
  pid: number
  uid: string
  author: string
  content: string
  imgs: string[]
}
```

Sample table schema:
```typescript
import { TableSchema } from '.'

const threadSchema: TableSchema = {
  table: 'thread',
  fields: {
    tid: 'integer',
    subject: 'text',
    uid: 'integer',
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

const postSchema: TableSchema = {
  table: 'post',
  fields: {
    pid: 'integer',
    tid: 'integer',
    uid: 'integer',
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
```

Detail example see `makePredefinedInsertRowFn()` and `makeGeneralInsertRowFn()` in [sample-test.ts](./test/sample-test.ts)
