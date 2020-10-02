import fs from 'fs'
import { iterateFdByLine } from '../src/utils/fs'

const file = 'res/sample.txt'

const Type = {
  Key: 1,
  Value: 2,
}

export function* iterateSamples() {
  let mode = Type.Key
  let key: string = ''
  let value: any
  const fd = fs.openSync(file, 'r')
  for (const line of iterateFdByLine(fd)) {
    switch (mode) {
      case Type.Key:
        key = JSON.parse(line)
        mode = Type.Value
        continue
      case Type.Value:
        value = JSON.parse(line)
        yield { key, value }
        mode = Type.Key
        continue
    }
  }
  fs.closeSync(fd)
}

export function countSamples() {
  let lines = 0
  const fd = fs.openSync(file, 'r')
  for (const _ of iterateFdByLine(fd)) {
    lines++
  }
  fs.closeSync(fd)
  return lines / 2
}

// for file size of 843M
export let sampleCount = 266430 // on desktop
sampleCount = 291119 // on laptop
