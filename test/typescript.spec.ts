import fs from 'fs'
import '../src'
import { expect } from 'chai'

describe('typescript setup', () => {
  it('should be able to compile', () => {
    expect(fs.existsSync('package.json')).to.be.true
    const text = fs.readFileSync('package.json').toString()
    const json = JSON.parse(text)
    expect(json).not.undefined
  })
})
