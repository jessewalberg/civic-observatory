/**
 * Returns a function that can only be called once.
 * Subsequent calls will return the result of the first call.
 * This is useful for lazy initialization.
 */
export function lazy<T>(fn: () => T): () => T {
  let called = false
  let result: T
  return () => {
    if (!called) {
      result = fn()
      called = true
    }
    return result
  }
}
