/** Small deterministic helpers shared by the economy audit and its tests. */
export interface Percentiles {
  observations: number
  p10: number | null
  p50: number | null
  p90: number | null
  mean: number | null
}

/** Linear-interpolated quantile (R-7 / Excel inclusive convention). */
export function percentile(values: readonly number[], p: number): number | null {
  if (!Number.isFinite(p) || p < 0 || p > 1) throw new RangeError('p must be between 0 and 1')
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b)
  if (!sorted.length) return null
  const position = (sorted.length - 1) * p
  const lower = Math.floor(position)
  const fraction = position - lower
  return sorted[lower]! + (sorted[Math.min(lower + 1, sorted.length - 1)]! - sorted[lower]!) * fraction
}

/** Missing observations stay missing; callers must not impute dead lives as zero. */
export function describe(values: readonly (number | null | undefined)[]): Percentiles {
  const observed = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  const total = observed.reduce((sum, value) => sum + value, 0)
  return {
    observations: observed.length,
    p10: percentile(observed, .1),
    p50: percentile(observed, .5),
    p90: percentile(observed, .9),
    mean: observed.length ? total / observed.length : null
  }
}
