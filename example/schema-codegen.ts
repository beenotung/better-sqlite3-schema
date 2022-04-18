import { Statement } from 'better-sqlite3'
import { SqliteDataType, Int } from 'better-sqlite3-schema'
import { newCache } from 'better-sqlite3-schema'
import { createDB } from 'better-sqlite3-schema'
import { dbfile } from './sample'

export const db = createDB({ file: dbfile })


db.exec(`create table if not exists "reason" (
  "reason_id" integer primary key,
  "reason"
)`)
db.exec(`create unique index if not exists "reason_unique_idx" on "reason" ("reason")`)
export const select_reason_id_statement: Statement = db.prepare(`select "reason_id" from "reason" where "reason" = ?`)
export const insert_reason_statement: Statement = db.prepare(`insert into "reason" ("reason") values (?)`)
export const reason_id_cache = newCache({ resetSize: 20971520 })

db.exec(`create table if not exists "type" (
  "type_id" integer primary key,
  "type"
)`)
db.exec(`create unique index if not exists "type_unique_idx" on "type" ("type")`)
export const select_type_id_statement: Statement = db.prepare(`select "type_id" from "type" where "type" = ?`)
export const insert_type_statement: Statement = db.prepare(`insert into "type" ("type") values (?)`)
export const type_id_cache = newCache({ resetSize: 20971520 })

db.exec(`create table if not exists "tag" (
  "tag_id" integer primary key,
  "tag"
)`)
db.exec(`create unique index if not exists "tag_unique_idx" on "tag" ("tag")`)
export const select_tag_id_statement: Statement = db.prepare(`select "tag_id" from "tag" where "tag" = ?`)
export const insert_tag_statement: Statement = db.prepare(`insert into "tag" ("tag") values (?)`)
export const tag_id_cache = newCache({ resetSize: 20971520 })

db.exec(`create table if not exists "img" (
  "img_id" integer primary key,
  "img"
)`)
db.exec(`create unique index if not exists "img_unique_idx" on "img" ("img")`)
export const select_img_id_statement: Statement = db.prepare(`select "img_id" from "img" where "img" = ?`)
export const insert_img_statement: Statement = db.prepare(`insert into "img" ("img") values (?)`)
export const img_id_cache = newCache({ resetSize: 20971520 })


export type SkippedThreadData = Partial<Record<"tid" | "reason", SqliteDataType>>
export type SkippedThreadRow = Partial<Record<"tid" | "reason_id", SqliteDataType>>

db.exec(`create table if not exists "skipped_thread" (
  "tid" integer,
  "reason_id" integer
)`)

const insert_skipped_thread_statement = db.prepare(`insert into "skipped_thread" (
  "tid",
  "reason_id"
) values (?,?)`)

export function insertSkippedThread(data: SkippedThreadData): Int {

  const reason = data["reason"]
  const reason_id =
    reason === undefined || reason === null
      ? null
      : reason_id_cache.get(reason as string, (fieldData: string) => {
          const row = select_reason_id_statement.get(fieldData)
          return row
            ? row["reason_id"]
            : insert_reason_statement.run(fieldData).lastInsertRowid
        })

  return insert_skipped_thread_statement.run(
    data["tid"],
    reason_id
  ).lastInsertRowid;
}


export type ThreadData = Partial<Record<"tid" | "fid" | "uid" | "create_at" | "last_cm" | "subject" | "page" | "pages" | "content" | "type", SqliteDataType>>
export type ThreadRow = Partial<Record<"tid" | "fid" | "uid" | "create_at" | "last_cm" | "subject" | "page" | "pages" | "content" | "type_id", SqliteDataType>>

db.exec(`create table if not exists "thread" (
  "tid" integer,
  "fid" integer,
  "uid" integer,
  "create_at" text,
  "last_cm" text,
  "subject" text,
  "page" integer,
  "pages" integer,
  "content" text,
  "type_id" integer
)`)

const insert_thread_statement = db.prepare(`insert into "thread" (
  "tid",
  "fid",
  "uid",
  "create_at",
  "last_cm",
  "subject",
  "page",
  "pages",
  "content",
  "type_id"
) values (?,?,?,?,?,?,?,?,?,?)`)

export function insertThread(data: ThreadData): Int {

  const type = data["type"]
  const type_id =
    type === undefined || type === null
      ? null
      : type_id_cache.get(type as string, (fieldData: string) => {
          const row = select_type_id_statement.get(fieldData)
          return row
            ? row["type_id"]
            : insert_type_statement.run(fieldData).lastInsertRowid
        })

  return insert_thread_statement.run(
    data["tid"],
    data["fid"],
    data["uid"],
    data["create_at"],
    data["last_cm"],
    data["subject"],
    data["page"],
    data["pages"],
    data["content"],
    type_id
  ).lastInsertRowid;
}


export type ThreadTagData = Partial<Record<"tid" | "tag", SqliteDataType>>
export type ThreadTagRow = Partial<Record<"tid" | "tag_id", SqliteDataType>>

db.exec(`create table if not exists "thread_tag" (
  "tid" integer,
  "tag_id" integer
)`)

const insert_thread_tag_statement = db.prepare(`insert into "thread_tag" (
  "tid",
  "tag_id"
) values (?,?)`)

export function insertThreadTag(data: ThreadTagData): Int {

  const tag = data["tag"]
  const tag_id =
    tag === undefined || tag === null
      ? null
      : tag_id_cache.get(tag as string, (fieldData: string) => {
          const row = select_tag_id_statement.get(fieldData)
          return row
            ? row["tag_id"]
            : insert_tag_statement.run(fieldData).lastInsertRowid
        })

  return insert_thread_tag_statement.run(
    data["tid"],
    tag_id
  ).lastInsertRowid;
}


export type ThreadImgData = Partial<Record<"tid" | "img", SqliteDataType>>
export type ThreadImgRow = Partial<Record<"tid" | "img_id", SqliteDataType>>

db.exec(`create table if not exists "thread_img" (
  "tid" integer,
  "img_id" integer
)`)

const insert_thread_img_statement = db.prepare(`insert into "thread_img" (
  "tid",
  "img_id"
) values (?,?)`)

export function insertThreadImg(data: ThreadImgData): Int {

  const img = data["img"]
  const img_id =
    img === undefined || img === null
      ? null
      : img_id_cache.get(img as string, (fieldData: string) => {
          const row = select_img_id_statement.get(fieldData)
          return row
            ? row["img_id"]
            : insert_img_statement.run(fieldData).lastInsertRowid
        })

  return insert_thread_img_statement.run(
    data["tid"],
    img_id
  ).lastInsertRowid;
}


export type AuthorData = Partial<Record<"uid" | "author", SqliteDataType>>
export type AuthorRow = Partial<Record<"uid" | "author", SqliteDataType>>

db.exec(`create table if not exists "author" (
  "uid" integer,
  "author" text
)`)

const insert_author_statement = db.prepare(`insert into "author" (
  "uid",
  "author"
) values (?,?)`)

export function insertAuthor(data: AuthorData): Int {

  return insert_author_statement.run(
    data["uid"],
    data["author"]
  ).lastInsertRowid;
}

db.exec(`create unique index if not exists "author_unique_idx" on "author" ("author")`)
export const count_uid_statement: Statement = db.prepare(`select count(*) count from "author" where "uid" = ?`)
export const deduplicated_insert_author_statement: Statement = db.prepare(`insert into "author" (
  "uid",
  "author"
) values (?,?)`)

export function deduplicatedInsertAuthor(data: AuthorData): Int {
  const id = data["uid"]
  const row = count_uid_statement.get(id)
  if (!row.count) {

    deduplicated_insert_author_statement.run(
      data["uid"],
      data["author"]
    )
  }
  return id as any
}


export type PostData = Partial<Record<"pid" | "tid" | "uid" | "create_at" | "content", SqliteDataType>>
export type PostRow = Partial<Record<"pid" | "tid" | "uid" | "create_at" | "content", SqliteDataType>>

db.exec(`create table if not exists "post" (
  "pid" integer,
  "tid" integer,
  "uid" integer,
  "create_at" text,
  "content" text
)`)

const insert_post_statement = db.prepare(`insert into "post" (
  "pid",
  "tid",
  "uid",
  "create_at",
  "content"
) values (?,?,?,?,?)`)

export function insertPost(data: PostData): Int {

  return insert_post_statement.run(
    data["pid"],
    data["tid"],
    data["uid"],
    data["create_at"],
    data["content"]
  ).lastInsertRowid;
}


export type PostImgData = Partial<Record<"pid" | "img", SqliteDataType>>
export type PostImgRow = Partial<Record<"pid" | "img_id", SqliteDataType>>

db.exec(`create table if not exists "post_img" (
  "pid" integer,
  "img_id" integer
)`)

const insert_post_img_statement = db.prepare(`insert into "post_img" (
  "pid",
  "img_id"
) values (?,?)`)

export function insertPostImg(data: PostImgData): Int {

  const img = data["img"]
  const img_id =
    img === undefined || img === null
      ? null
      : img_id_cache.get(img as string, (fieldData: string) => {
          const row = select_img_id_statement.get(fieldData)
          return row
            ? row["img_id"]
            : insert_img_statement.run(fieldData).lastInsertRowid
        })

  return insert_post_img_statement.run(
    data["pid"],
    img_id
  ).lastInsertRowid;
}