type Key = string

export interface Cache<T> {

  wrapFn: (fn: (key: Key) => T) => (key: Key) => T
  get(key: Key, genFn: (key: Key) => T): T

  clear(): void
}

export function newCache<T = any>(options?: {
  resetSize?: false | number
}): Cache<T> {
  let cache: any = {}
  let size = 0
  const resetSize = options?.resetSize

  function get(key: Key, genFn: (key: Key) => T): T {
    if (key in cache) {
      return cache[key]
    }
    const res = (cache[key] = genFn(key))
    size += key.length
    if (resetSize && size >= resetSize) {
      clear()
    }
    return res
  }

  function clear() {
    cache = {}
    size = 0
  }

  return {
    get,
    clear,
    wrapFn: fn => key => get(key, fn),
  }
}
