export interface Cache<T> {
  get(key: string, genFn: (key: string) => T): T

  clear(): void
}

export function newCache<T = any>(options?: { resetSize?: false | number }) {
  let cache: any = {}
  let size = 0
  const resetSize = options?.resetSize

  function get(key: string, genFn: (key: string) => T): T {
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

  return { get, clear }
}
