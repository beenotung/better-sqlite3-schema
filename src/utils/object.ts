export function mapObject<T extends Record<string, any>, R>(
  object: T,
  fn: (value: T[keyof T], key: keyof T) => R,
): Record<keyof T, R> {
  const res = {} as Record<keyof T, R>
  Object.entries(object).forEach(([key, value]) => {
    res[key as keyof T] = fn(value, key)
  })
  return res
}
