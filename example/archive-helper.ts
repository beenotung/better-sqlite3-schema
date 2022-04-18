import { createDB, migrateUp } from 'better-sqlite3-schema'

export const db = createDB({ file: 'data/sqlite3.db', migrate: false })

migrateUp({
  db,
  migrations: [
    {
      is_multiple_statements: 1,
      name: 'create-tables',
      up: /* sql */ `
create table if not exists user (
  id integer primary key
, uid integer not null
, username text not null
, created_at text not null
, updated_at text null
);
create table if not exists tag (
  id integer primary key
, tag text not null
, created_at text not null
, updated_at text null
);
create table if not exists forum (
  id integer primary key
, fid integer not null
, forum text not null
, created_at text not null
, checked_at text null
, checked_page integer null
);
create table if not exists thread_type (
  id integer primary key
, type text not null
, created_at text not null
, updated_at text null
);
create table if not exists thread (
  id integer primary key
, type_id integer not null references thread_type(id)
, tid integer not null
, forum_id integer not null references forum(id)
, user_id integer not null references user(id)
, posted_at text not null
, last_cm text not null
, subject text not null
, content text null
, page integer not null
, pages integer not null
, created_at text not null
, updated_at text null
, last_checked_at text null
, last_author text null
);
create table if not exists post (
  id integer primary key
, pid integer null
, thread_id integer not null references thread(id)
, user_id integer not null references user(id)
, posted_at text not null
, content text not null
, created_at text not null
, updated_at text null
);
create table if not exists thread_tag (
  id integer primary key
, tag_id integer not null references tag(id)
, thread_id integer not null references thread(id)
, created_at text not null
, updated_at text null
);
create table if not exists skip_reason (
  id integer primary key
, reason text not null
, created_at text not null
, updated_at text null
);
create table if not exists skip_thread (
  id integer primary key
, tid integer not null
, reason_id integer not null references skip_reason(id)
, created_at text not null
, updated_at text null
);
create table if not exists image (
  id integer primary key
, url text not null unique
, created_at text not null default CURRENT_TIMESTAMP
, updated_at text null
);
create table if not exists image_link (
  id integer primary key
, image_id integer not null references image(id)
, thread_id integer null references thread(id)
, post_id integer null references post(id)
, created_at text not null
, updated_at text null
);
      `.trim(),
      down: /* sql */ `
drop table if exists image_link;
drop table if exists image;
drop table if exists skip_thread;
drop table if exists skip_reason;
drop table if exists thread_tag;
drop table if exists post;
drop table if exists thread;
drop table if exists thread_type;
drop table if exists forum;
drop table if exists tag;
drop table if exists user;
`.trim(),
    },
  ],
})
