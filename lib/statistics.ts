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

  const recentMean = mean(recent);
  const baselineMean = mean(baseline);

  // Use t-test as approximation (simple-statistics doesn't have Mann-Whitney U)
  const tStat = tTestTwoSample(recent, baseline, 0);
  const pValue = tStat !== null && Math.abs(tStat) > 2 ? 0.05 : 0.5; // Rough approximation

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
