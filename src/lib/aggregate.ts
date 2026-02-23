import type { ChartDataPoint, Granularity } from './types';

const GRANULARITY_HOURS: Record<Granularity, number> = {
  '1h': 1,
  '2h': 2,
  '4h': 4,
  '6h': 6,
  '8h': 8,
  '1d': 24,
};

/**
 * Aggregate hourly chart data (YYYY-MM-DD-HH keys) into coarser buckets.
 * Pure function — no side effects.
 */
export function aggregateByGranularity(
  data: ChartDataPoint[],
  granularity: Granularity,
  models: string[],
): ChartDataPoint[] {
  if (granularity === '1h') return data;

  const size = GRANULARITY_HOURS[granularity];
  const groups = new Map<string, ChartDataPoint[]>();

  for (const point of data) {
    const bucketKey = snapBucket(point.date, size);
    if (!groups.has(bucketKey)) groups.set(bucketKey, []);
    groups.get(bucketKey)!.push(point);
  }

  const result: ChartDataPoint[] = [];
  for (const [bucketKey, points] of Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    const merged: ChartDataPoint = { date: bucketKey };

    for (const model of models) {
      let submissions = 0;
      let prompts = 0;
      let uniqueOutputs = 0;
      let drifted = 0;

      for (const p of points) {
        submissions += (p[model] as number) || 0;
        prompts += (p[`${model}_prompts`] as number) || 0;
        uniqueOutputs += (p[`${model}_unique_outputs`] as number) || 0;
        drifted += (p[`${model}_drifted`] as number) || 0;
      }

      merged[model] = submissions;
      merged[`${model}_prompts`] = prompts;
      merged[`${model}_unique_outputs`] = uniqueOutputs;
      merged[`${model}_drifted`] = drifted;
      merged[`${model}_consistency`] = prompts > 0
        ? (prompts - drifted) / prompts
        : 1.0;
    }

    result.push(merged);
  }

  return result;
}

/** Snap an hourly key (YYYY-MM-DD-HH) to the start of its granularity bucket. */
function snapBucket(date: string, sizeHours: number): string {
  if (sizeHours >= 24) {
    // Daily: truncate to YYYY-MM-DD
    return date.slice(0, 10);
  }
  const parts = date.split('-');
  if (parts.length < 4) return date; // already daily
  const hour = parseInt(parts[3], 10);
  const snapped = Math.floor(hour / sizeHours) * sizeHours;
  return `${parts[0]}-${parts[1]}-${parts[2]}-${String(snapped).padStart(2, '0')}`;
}
