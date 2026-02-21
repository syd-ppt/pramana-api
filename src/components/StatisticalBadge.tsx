import { DegradationResult } from '@/lib/statistics';

interface StatisticalBadgeProps {
  result: DegradationResult;
}

export default function StatisticalBadge({ result }: StatisticalBadgeProps) {
  if (!result.isDegraded) return null;

  return (
    <div className="inline-flex items-center gap-2 px-4 py-2 bg-red-900 border border-red-800 rounded-full">
      <span className="text-red-100 font-semibold text-sm">Degradation Detected</span>
      <span className="text-red-200 text-sm">
        p={result.pValue.toFixed(3)} | d={result.effectSize.toFixed(2)}s
      </span>
    </div>
  );
}
