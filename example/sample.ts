import { iterateFileByLine } from '@beenotung/tslib/fs'

const file = 'res/sample.txt'
export let dbfile = 'db.sqlite3'

const Type = {
  Key: 1,
  Value: 2,
}

export function* iterateSamples() {
  let mode = Type.Key
  let key: string = ''
  let value: any
  let i = 0
  for (const line of iterateFileByLine(file)) {
    if (i >= sampleCount) {
      break
    }
    switch (mode) {
      case Type.Key:
        key = JSON.parse(line)
        mode = Type.Value
        continue
      case Type.Value:
        value = JSON.parse(line)
        yield { key, value }
        i++
        mode = Type.Key
        continue
    }
  }
}

export function countSamples() {
  let lines = 0
  for (const _ of iterateFileByLine(file)) {
    lines++
  }
  return lines / 2
}

// for file size of 843M
export let sampleCount = 266430 // on desktop
sampleCount = 291119 // on laptop

if (!'quick') {
  sampleCount /= 100
}
