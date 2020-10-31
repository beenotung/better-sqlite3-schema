export function uniqueArray<T>(xs: T[]): T[] {
  return Array.from(new Set(xs))
}
