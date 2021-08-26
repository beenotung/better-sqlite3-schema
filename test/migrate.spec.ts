import { createDB, DBInstance } from '../src/helpers'
import {
  DefaultMigrationTable,
  migrateUp,
  migrateDown,
  MigrationItem,
  migrateDownUntil,
} from '../src/migrate'
import { expect } from 'chai'

describe('migrate.ts TestSuit', () => {
  let db: DBInstance
  before(() => {
    db = createDB({
      file: 'db.sqlite3',
      mode: 'overwrite',
    })
  })
  const migrations = [
    {
      name: 'create-user',
      up: 'create table user (id integer primary key, username)',
      down: 'drop table user',
    },
    {
      name: 'create-post',
      up: 'create table post (id integer primary key, uid references user(id), content)',
      down: 'drop table post',
    },
  ]
  it('should run migrates with given name', () => {
    migrateUp({
      db,
      migrations,
    })
  })
  it('should not run existing migrations', () => {
    migrateUp({ db, migrations })
    expect(
      db
        .prepare(`select count(id) from ${DefaultMigrationTable}`)
        .pluck()
        .get(),
    ).to.equals(2)
  })
  it('should be able to migrate down', () => {
    const count_user = db.prepare(`select count(*) as count from user`).pluck()
    expect(count_user.get()).to.equals(0)
    migrateUp({
      db,
      migrations: [
        {
          name: 'seed-sample-user',
          up: "insert into user (username) values ('Alice')",
          down: "delete from user where username = 'Alice'",
        },
      ],
    })
    expect(count_user.get()).to.equals(1)
    migrateDown({ db, name: 'seed-sample-user', throw: true })
    expect(count_user.get()).to.equals(0)
  })
  it('should be able to batch rollback', () => {
    const count_user = db.prepare(`select count(*) as count from user`).pluck()
    let migrations: MigrationItem[] = []
    let N = 10
    for (let i = 1; i <= N; i++) {
      migrations.push({
        name: 'batch-' + i,
        up: `insert into user (username) values ('user-${i}')`,
        down: `delete from user where username = 'user-${i}'`,
      })
    }
    expect(count_user.get()).to.equals(0)
    migrateUp({ db, migrations })
    expect(count_user.get()).to.equals(N)
    migrateDownUntil({ db, name: migrations[0].name })
    expect(count_user.get()).to.equals(0)
  })
})
