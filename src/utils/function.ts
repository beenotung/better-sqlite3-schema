export function identical<T>(data: T): T {
  return data
}

export function chain<T, M, R>(
  first: (data: T) => M,
  second: (dat: M) => R,
): (data: T) => R {
  return data => {
    return second(first(data))
  }
}
