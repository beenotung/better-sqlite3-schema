import fs from 'fs'
describe('ts-jest setup', () => {
  it('should be able to compile', () => {
    expect(fs.existsSync('package.json')).toBeTruthy()
    const text = fs.readFileSync('package.json').toString()
    const json = JSON.parse(text)
    expect(json).toBeDefined()
  })
})
