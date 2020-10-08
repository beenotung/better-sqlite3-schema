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

## Benchmark

### Sample 1: HTTP Proxy Log

8GiB of HTTP proxy server log.
Each line is a compact json text.

Sample text:
```json
{"timestamp":1600713130016,"type":"request","userAgent":"Mozilla/5.0 (Linux; Android 10; LIO-AL00) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.108 Mobile Safari/537.36","referer":"https://www.example.net/sw.js","protocol":"https","host":"www.example.net","method":"GET","url":"/build/p-7794655c.js"}
```

When stored into sqlite3, the data are normalized into multiple tables to avoid duplication, e.g. only storing the full text of each type of user agent and url once.

File size in varies format:

| storage | size | size compared with plain text | Remark |
|---|---|---|---|
| plain text | 8256M | - | |
| sqlite without index | 920M | 11.1% | |
| zip of non-indexed sqlite file | 220M | 2.7% | 23.9% of sqlite3 file |
| sqlite with indices | 1147M | 13.9% | +24% of sqlite file |
| zip of indexed sqlite file | 268M | 3.2% | 23.4% of indexed sqlite3 file |

Time used to import:

- 6 minutes 10 seconds: with inlined helper functions with code generation
- 14 minutes: with runtime-composed helper functions

Optimization used:

- code generation from schema
- bulk insert (batch each 8K items with a transaction)
- cache id of normalized, repeatable values (with js object)
- create unique index on normalized values
- `PRAGMA synchronous = OFF`
- `PRAGMA journal_mode = MEMORY`
- `PRAGMA cache_size = ${(200 * 1000 ** 2) / 4}`
(default page size is 4K, we largely increase the cache_size to avoid massive tedious disk write)

**Remark**:

Using index increases the file size by 1/4, but hugely speeds up the import process.

To archive the best of both aspects, create indices during import;
and remove indices (then VACUUM) for archive file.

It takes 4.9s to build the indices;
and 16.3s to vacuum the database after removal of indices.


### Sample 2: Online Forum Data

291119 sample json data crawled from online forum (threads and posts)

Total size: 843M

The objects have consistent shape.

Some data are duplicated, e.g. user name, and some common comments.

Same as the dataset used in [binary-object](https://github.com/beenotung/binary-object)

File size in varies format:

| storage | size |
|---|---|
| json text | 843M |
| sqlite3 with index | 669M |
| sqlite3 without index | 628M |
| zip of sqlite3 without index | 171M |

**Remark**:
The data in sqlite3 are normalized to avoid duplication
