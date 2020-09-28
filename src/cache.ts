import { Sink } from './pipe'
import { int_to_str } from './utils/base-62'
const WORDS = {
  cache: 'c', // first seen a value what will be cached
  key: 'k', // ref to pre-cached value
  value: 'v', // non-cached value
}
export class CacheSink<T = any> extends Sink<T> {
  shouldCache: (value: T) => boolean
  encode: (value: T) => string
  values = new Map<T, number>()
  constructor(
    options: {
      shouldCache: (value: T) => boolean
      encode?: (value: T) => string
    },
    public sink: Sink<string>,
  ) {
    super()
    this.shouldCache = options.shouldCache
    this.encode = options.encode || (data => JSON.stringify(data))
  }

  write(data: any) {
    if (!this.shouldCache(data)) {
      this.sink.write(WORDS.value + this.encode(data))
      return
    }
    if (this.values.has(data)) {
      const key = this.values.get(data)!
      this.sink.write(WORDS.key + int_to_str(key))
      return
    }
    const key = this.values.size
    this.values.set(data, key)
    this.sink.write(WORDS.cache + this.encode(data))
  }

  close() {
    this.sink.close()
  }
}
