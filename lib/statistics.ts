/**
 * Statistical analysis utilities.
 */

import { mean, standardDeviation, tTestTwoSample } from 'simple-statistics';

export interface DegradationResult {
  isDegraded: boolean;
  pValue: number;
  effectSize: number;
  recentMean: number;
  baselineMean: number;
}

/**
 * Log-gamma function using Lanczos approximation.
 */
function lgamma(x: number): number {
  const g = 7;
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
  ];

  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  }

  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) {
    a += c[i] / (x + i);
  }

  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/**
 * Regularized incomplete beta function using continued fraction expansion.
 */
function betaIncomplete(a: number, b: number, x: number): number {
  if (x === 0 || x === 1) return x;

  const maxIterations = 200;
  const epsilon = 1e-14;

  // Use the symmetry relation when x > (a+1)/(a+b+2)
  if (x > (a + 1) / (a + b + 2)) {
    return 1 - betaIncomplete(b, a, 1 - x);
  }

  const lnBeta = lgamma(a) + lgamma(b) - lgamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta) / a;

  // Lentz's continued fraction algorithm
  let f = 1;
  let c = 1;
  let d = 1 - (a + b) * x / (a + 1);
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  f = d;

  for (let i = 1; i <= maxIterations; i++) {
    const m = i;

    // Even step
    let numerator = m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m));
    d = 1 + numerator * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + numerator / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    f *= d * c;

    // Odd step
    numerator = -(a + m) * (a + b + m) * x / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + numerator * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + numerator / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const delta = d * c;
    f *= delta;

    if (Math.abs(delta - 1) < epsilon) break;
  }

  return front * f;
}

/**
 * Compute two-tailed p-value from t-statistic and degrees of freedom.
 */
function tDistributionPValue(tStat: number, df: number): number {
  if (df <= 0) return 1;
  const x = df / (df + tStat * tStat);
  const p = betaIncomplete(df / 2, 0.5, x);
  return p;
}

export function detectDegradation(
  recent: number[],
  baseline: number[],
  alpha: number = 0.05
): DegradationResult {
  if (recent.length === 0 || baseline.length === 0) {
    return {
      isDegraded: false,
      pValue: 1,
      effectSize: 0,
      recentMean: 0,
      baselineMean: 0,
    };
  }

  if (recent.length < 2 || baseline.length < 2) {
    return { isDegraded: false, pValue: 1, effectSize: 0, recentMean: mean(recent), baselineMean: mean(baseline) };
  }

  const recentMean = mean(recent);
  const baselineMean = mean(baseline);

  const tStat = tTestTwoSample(recent, baseline, 0);

  const s1 = standardDeviation(recent);
  const s2 = standardDeviation(baseline);
  const n1 = recent.length;
  const n2 = baseline.length;
  const v1 = (s1 * s1) / n1;
  const v2 = (s2 * s2) / n2;
  const df = (v1 + v2) ** 2 / ((v1 * v1) / (n1 - 1) + (v2 * v2) / (n2 - 1));
  const pValue = (tStat !== null && !isNaN(tStat)) ? tDistributionPValue(tStat, df) : 1;

  const pooled = [...recent, ...baseline];
  const pooledStd = standardDeviation(pooled);

  const effectSize = pooledStd > 0 ? (baselineMean - recentMean) / pooledStd : 0;

  const isDegraded = pValue < alpha && recentMean < baselineMean;

  return {
    isDegraded,
    pValue,
    effectSize,
    recentMean,
    baselineMean,
  };
}
