import fs from 'fs'
import path from 'path'
import { newDB } from '../src/db'
import { expect } from 'chai'

describe('multi-db', () => {
  let file1 = path.join('data', 'db1')
  let file2 = path.join('data', 'db2')
  before(() => {
    if (!fs.existsSync('data')) {
      fs.mkdirSync('data')
    }
    for (let file of [file1, file2]) {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file)
      }
    }
  })
  it('should create multiple instance of db', () => {
    let db1 = newDB({ path: file1, migrate: false })
    let db2 = newDB({ path: file2, migrate: false })
    db1.exec('select 1')
    db2.exec('select 2')
    expect(db1).not.to.equals(db2)
    expect(fs.existsSync(file1)).to.be.true
    expect(fs.existsSync(file2)).to.be.true
  }).timeout(5000)
})
