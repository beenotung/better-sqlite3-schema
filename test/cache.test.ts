import { UniqueValueSource } from '../src'
import { CacheSink } from '../src/cache'
import { RawLineFileSink, RawLineFileSource } from '../src/raw-line-file'
import { jsonSample } from './sample-object'
import { testSuit } from './test-utils'

const file = 'db.log'
describe('Cache Pipe TestSuit', () => {
  testSuit(
    jsonSample,
    () =>
      new CacheSink(
        { shouldCache: () => true },
        RawLineFileSink.fromFile(file),
      ),
    () => new UniqueValueSource(RawLineFileSource.fromFile(file)),
  )
})
