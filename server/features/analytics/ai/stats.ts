/**
 * Veefore Analytics — Statistics helpers (Phase 11).
 *
 * Small, pure numeric helpers (ordinary least squares, mean/std) shared by the
 * forecast and signal-detection modules. Deterministic and dependency-free.
 */

export interface RegressionResult {
  slope: number
  intercept: number
  /** Coefficient of determination (0–1). */
  rSquared: number
  /** Residual standard error (0 when n < 3). */
  stdErr: number
  n: number
}

/**
 * Ordinary least-squares linear regression over `ys` against x = 0..n-1.
 * Degenerate inputs (n < 2) yield a flat line with zero fit.
 */
export function linearRegression(ys: number[]): RegressionResult {
  const n = ys.length
  if (n < 2) {
    return { slope: 0, intercept: ys[0] ?? 0, rSquared: 0, stdErr: 0, n }
  }

  const xs = ys.map((_, i) => i)
  const meanX = (n - 1) / 2
  const meanY = ys.reduce((s, y) => s + y, 0) / n

  let sxy = 0
  let sxx = 0
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - meanX) * (ys[i] - meanY)
    sxx += (xs[i] - meanX) ** 2
  }

  const slope = sxx === 0 ? 0 : sxy / sxx
  const intercept = meanY - slope * meanX

  let ssRes = 0
  let ssTot = 0
  for (let i = 0; i < n; i++) {
    const predicted = intercept + slope * i
    ssRes += (ys[i] - predicted) ** 2
    ssTot += (ys[i] - meanY) ** 2
  }

  const rSquared = ssTot === 0 ? (ssRes === 0 ? 1 : 0) : Math.max(0, 1 - ssRes / ssTot)
  const stdErr = n > 2 ? Math.sqrt(ssRes / (n - 2)) : 0

  return { slope, intercept, rSquared, stdErr, n }
}

/** Arithmetic mean of a non-empty array (0 for empty). */
export function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((s, v) => s + v, 0) / values.length
}

/** Population standard deviation (0 for < 2 points). */
export function stdDev(values: number[]): number {
  const n = values.length
  if (n < 2) return 0
  const m = mean(values)
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / n
  return Math.sqrt(variance)
}
