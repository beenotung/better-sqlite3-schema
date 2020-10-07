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

### Functional Approach (compose at runtime)

The functional approach allows one to compose customizable helper functions at runtime.

Explore the dataset and auto built schema with
- `makeSchemaScanner()`

Compose insert functions with
- `makeInsertRowFnFromSchema()`
- `makeDeduplicatedInsertRowFnFromSchema()`

Compose select functions with
- `makeSelectRowFnFromSchema()`
- `makeSelectRefFieldArray()`
- `makeGetRefValueFnFromSchema()`

Detail example see `makePredefinedInsertRowFn()` and `makeGeneralInsertRowFn()` in [functional-test.ts](./example/functional-test.ts)

### Code Generation Approach (compose at build-time)

The code generation approach allows one to compose customizable helper functions at build-time. Which can archive ~50% speed up compared to the runtime composing.
