/**
 * Statistical analysis utilities.
 */

import { mean, sampleStandardDeviation, standardDeviation, tTestTwoSample } from 'simple-statistics';

export interface DegradationResult {
  isDegraded: boolean;
  pValue: number;
  effectSize: number;
  effectLabel: string;
  recentMean: number;
  baselineMean: number;
}

export interface SummaryStats {
  n: number;
  mean: number;
  variance: number;
}

// -- Log-gamma (Lanczos approximation) --

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

// -- Regularized incomplete beta --

function betaIncomplete(a: number, b: number, x: number): number {
  if (x === 0 || x === 1) return x;

  const maxIterations = 200;
  const epsilon = 1e-14;

  if (x > (a + 1) / (a + b + 2)) {
    return 1 - betaIncomplete(b, a, 1 - x);
  }

  const lnBeta = lgamma(a) + lgamma(b) - lgamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta) / a;

  let f = 1;
  let c = 1;
  let d = 1 - (a + b) * x / (a + 1);
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  f = d;

  for (let i = 1; i <= maxIterations; i++) {
    const m = i;

    let numerator = m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m));
    d = 1 + numerator * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + numerator / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    f *= d * c;

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

// -- t-distribution p-value (two-tailed) --

function tDistributionPValue(tStat: number, df: number): number {
  if (df <= 0) return 1;
  const x = df / (df + tStat * tStat);
  const p = betaIncomplete(df / 2, 0.5, x);
  return p;
}

// -- Cohen's d interpretation --

export function interpretEffect(d: number): string {
  const abs = Math.abs(d);
  if (abs < 0.2) return 'negligible';
  if (abs < 0.5) return 'small';
  if (abs < 0.8) return 'medium';
  return 'large';
}

// -- Raw-array degradation detection (backward compat) --

export function detectDegradation(
  recent: number[],
  baseline: number[],
  alpha: number = 0.05
): DegradationResult {
  if (recent.length === 0 || baseline.length === 0) {
    return { isDegraded: false, pValue: 1, effectSize: 0, effectLabel: 'negligible', recentMean: 0, baselineMean: 0 };
  }

  if (recent.length < 2 || baseline.length < 2) {
    return { isDegraded: false, pValue: 1, effectSize: 0, effectLabel: 'negligible', recentMean: mean(recent), baselineMean: mean(baseline) };
  }

  const recentMean = mean(recent);
  const baselineMean = mean(baseline);

  const tStat = tTestTwoSample(recent, baseline, 0);

  const s1 = sampleStandardDeviation(recent);
  const s2 = sampleStandardDeviation(baseline);
  const n1 = recent.length;
  const n2 = baseline.length;
  const v1 = (s1 * s1) / n1;
  const v2 = (s2 * s2) / n2;
  const df = (v1 + v2) ** 2 / ((v1 * v1) / (n1 - 1) + (v2 * v2) / (n2 - 1));
  const pValue = (tStat !== null && !isNaN(tStat)) ? tDistributionPValue(tStat, df) : 1;

  const pooled = [...recent, ...baseline];
  const pooledStd = standardDeviation(pooled);

  const effectSize = pooledStd > 0 ? (baselineMean - recentMean) / pooledStd : 0;
  const effectLabel = interpretEffect(effectSize);

  const isDegraded = pValue < alpha && recentMean < baselineMean;

  return { isDegraded, pValue, effectSize, effectLabel, recentMean, baselineMean };
}

// -- Summary-stats based degradation detection --

export function detectDegradationFromStats(
  recent: SummaryStats,
  baseline: SummaryStats,
  alpha: number = 0.05
): DegradationResult {
  if (recent.n < 2 || baseline.n < 2) {
    return {
      isDegraded: false,
      pValue: 1,
      effectSize: 0,
      effectLabel: 'negligible',
      recentMean: recent.mean,
      baselineMean: baseline.mean,
    };
  }

  const sea = recent.variance / recent.n;
  const seb = baseline.variance / baseline.n;
  const denom = Math.sqrt(sea + seb);

  if (denom === 0) {
    return {
      isDegraded: false,
      pValue: 1,
      effectSize: 0,
      effectLabel: 'negligible',
      recentMean: recent.mean,
      baselineMean: baseline.mean,
    };
  }

  const t = (recent.mean - baseline.mean) / denom;
  const df = (sea + seb) ** 2 / ((sea * sea) / (recent.n - 1) + (seb * seb) / (baseline.n - 1));
  const pValue = tDistributionPValue(t, df);

  // Cohen's d with pooled SD
  const sp = Math.sqrt(
    ((recent.n - 1) * recent.variance + (baseline.n - 1) * baseline.variance) /
    (recent.n + baseline.n - 2)
  );
  const effectSize = sp > 0 ? Math.abs(baseline.mean - recent.mean) / sp : 0;
  const effectLabel = interpretEffect(effectSize);

  const isDegraded = pValue < alpha && recent.mean < baseline.mean;

  return { isDegraded, pValue, effectSize, effectLabel, recentMean: recent.mean, baselineMean: baseline.mean };
}

// -- Pool summary stats via Welford parallel merge --

export function poolStats(statsList: SummaryStats[]): SummaryStats {
  if (statsList.length === 0) return { n: 0, mean: 0, variance: 0 };

  let n = 0;
  let mean_acc = 0;
  let m2 = 0;

  for (const s of statsList) {
    if (s.n === 0) continue;
    const newN = n + s.n;
    const delta = s.mean - mean_acc;
    const newMean = (n * mean_acc + s.n * s.mean) / newN;
    // m2 for the other group from variance: m2_b = variance_b * (n_b - 1)
    const m2_b = s.n > 1 ? s.variance * (s.n - 1) : 0;
    m2 = m2 + m2_b + delta * delta * (n * s.n) / newN;
    mean_acc = newMean;
    n = newN;
  }

  return {
    n,
    mean: mean_acc,
    variance: n < 2 ? 0 : m2 / (n - 1),
  };
}

// -- Holm-Bonferroni correction --

export function holmBonferroni(
  pValues: { key: string; p: number }[],
  alpha: number = 0.05
): Map<string, { adjusted: number; significant: boolean }> {
  const sorted = [...pValues].sort((a, b) => a.p - b.p);
  const m = sorted.length;
  const result = new Map<string, { adjusted: number; significant: boolean }>();

  let maxAdjusted = 0;
  for (let i = 0; i < m; i++) {
    const adjusted = Math.min(1, sorted[i].p * (m - i));
    maxAdjusted = Math.max(maxAdjusted, adjusted);
    result.set(sorted[i].key, {
      adjusted: maxAdjusted,
      significant: maxAdjusted < alpha,
    });
  }

  return result;
}
