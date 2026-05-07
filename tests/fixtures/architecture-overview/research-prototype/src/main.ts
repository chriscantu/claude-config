// Research prototype: token-bucket sketch. Not production-ready.
export function tokenBucketSketch(rate: number, capacity: number) {
  return { rate, capacity, tokens: capacity };
}
