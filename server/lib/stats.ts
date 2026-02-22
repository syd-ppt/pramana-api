/**
 * Server-side statistical functions.
 * Pure math — no I/O, no dependencies, Workers-compatible.
 */
import type { ModelDayStats } from './schemas'
import { welfordMerge, welfordVariance } from './buffer'

// -- Log-gamma (Lanczos approximation) --

function lgamma(x: number): number {
  const g = 7
  const c = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ]

  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x)
  }

  x -= 1
  let a = c[0]
  const t = x + g + 0.5
  for (let i = 1; i < g + 2; i++) {
    a += c[i] / (x + i)
  }

  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a)
}

// -- Regularized incomplete beta function --

function betaIncomplete(a: number, b: number, x: number): number {
  if (x === 0 || x === 1) return x

  const maxIterations = 200
  const epsilon = 1e-14

  if (x > (a + 1) / (a + b + 2)) {
    return 1 - betaIncomplete(b, a, 1 - x)
  }

  const lnBeta = lgamma(a) + lgamma(b) - lgamma(a + b)
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta) / a

  let f = 1
  let c = 1
  let d = 1 - (a + b) * x / (a + 1)
  if (Math.abs(d) < 1e-30) d = 1e-30
  d = 1 / d
  f = d

  for (let i = 1; i <= maxIterations; i++) {
    const m = i

    let numerator = m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m))
    d = 1 + numerator * d
    if (Math.abs(d) < 1e-30) d = 1e-30
    c = 1 + numerator / c
    if (Math.abs(c) < 1e-30) c = 1e-30
    d = 1 / d
    f *= d * c

    numerator = -(a + m) * (a + b + m) * x / ((a + 2 * m) * (a + 2 * m + 1))
    d = 1 + numerator * d
    if (Math.abs(d) < 1e-30) d = 1e-30
    c = 1 + numerator / c
    if (Math.abs(c) < 1e-30) c = 1e-30
    d = 1 / d
    const delta = d * c
    f *= delta

    if (Math.abs(delta - 1) < epsilon) break
  }

  return front * f
}

// -- t-distribution p-value (two-tailed) --

export function tDistributionPValue(tStat: number, df: number): number {
  if (df <= 0) return 1
  const x = df / (df + tStat * tStat)
  return betaIncomplete(df / 2, 0.5, x)
}

// -- Welch's t-test from summary statistics --

export interface WelchResult {
  t: number
  df: number
  pValue: number
  cohensD: number
  effectLabel: string
}

export function welchTTest(a: ModelDayStats, b: ModelDayStats): WelchResult | null {
  if (a.n < 2 || b.n < 2) return null

  const va = welfordVariance(a)
  const vb = welfordVariance(b)
  const sea = va / a.n
  const seb = vb / b.n
  const denom = Math.sqrt(sea + seb)

  if (denom === 0) return { t: 0, df: a.n + b.n - 2, pValue: 1, cohensD: 0, effectLabel: 'negligible' }

  const t = (a.mean - b.mean) / denom
  const df = (sea + seb) ** 2 / ((sea * sea) / (a.n - 1) + (seb * seb) / (b.n - 1))
  const pValue = tDistributionPValue(t, df)

  // Cohen's d using pooled standard deviation
  const sp = Math.sqrt(((a.n - 1) * va + (b.n - 1) * vb) / (a.n + b.n - 2))
  const cohensD = sp > 0 ? Math.abs(a.mean - b.mean) / sp : 0

  return { t, df, pValue, cohensD, effectLabel: interpretEffect(cohensD) }
}

// -- Cohen's d effect size interpretation --

export function interpretEffect(d: number): string {
  const abs = Math.abs(d)
  if (abs < 0.2) return 'negligible'
  if (abs < 0.5) return 'small'
  if (abs < 0.8) return 'medium'
  return 'large'
}

// -- Wilson confidence interval (for binary scores) --

export function wilsonCI(
  successes: number,
  trials: number,
  z: number = 1.96
): { lower: number; upper: number } {
  if (trials === 0) return { lower: 0, upper: 0 }
  const p = successes / trials
  const z2 = z * z
  const denom = 1 + z2 / trials
  const center = (p + z2 / (2 * trials)) / denom
  const margin = (z / denom) * Math.sqrt(p * (1 - p) / trials + z2 / (4 * trials * trials))
  return {
    lower: Math.max(0, center - margin),
    upper: Math.min(1, center + margin),
  }
}

// -- Normal confidence interval from Welford stats --

export function normalCI(
  stats: ModelDayStats,
  z: number = 1.96
): { lower: number; upper: number } {
  if (stats.n < 2) return { lower: stats.mean, upper: stats.mean }
  const se = Math.sqrt(welfordVariance(stats) / stats.n)
  return {
    lower: stats.mean - z * se,
    upper: stats.mean + z * se,
  }
}

// -- Holm-Bonferroni multiple comparison correction --

export function holmBonferroni(
  pValues: { key: string; p: number }[],
  alpha: number = 0.05
): Map<string, { adjusted: number; significant: boolean }> {
  const sorted = [...pValues].sort((a, b) => a.p - b.p)
  const m = sorted.length
  const result = new Map<string, { adjusted: number; significant: boolean }>()

  let maxAdjusted = 0
  for (let i = 0; i < m; i++) {
    const adjusted = Math.min(1, sorted[i].p * (m - i))
    // Enforce monotonicity: adjusted p-values must be non-decreasing
    maxAdjusted = Math.max(maxAdjusted, adjusted)
    result.set(sorted[i].key, {
      adjusted: maxAdjusted,
      significant: maxAdjusted < alpha,
    })
  }

  return result
}

// -- Pool multiple ModelDayStats via Welford parallel merge --

export function poolStats(statsList: ModelDayStats[]): ModelDayStats {
  let merged: ModelDayStats = { n: 0, mean: 0, m2: 0, count: 0 }
  for (const s of statsList) {
    merged = welfordMerge(merged, s)
  }
  return merged
}
