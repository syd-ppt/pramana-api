import { DegradationResult } from '@/lib/statistics';

interface StatisticalBadgeProps {
  model: string;
  result: DegradationResult;
  pAdjusted?: number;
}

const SEVERITY_STYLES: Record<string, { bg: string; border: string; text: string; label: string }> = {
  large: { bg: 'bg-red-900', border: 'border-red-800', text: 'text-red-100', label: 'Degradation' },
  medium: { bg: 'bg-orange-800', border: 'border-orange-700', text: 'text-orange-100', label: 'Warning' },
  small: { bg: 'bg-yellow-700', border: 'border-yellow-600', text: 'text-yellow-100', label: 'Watch' },
  negligible: { bg: 'bg-green-800', border: 'border-green-700', text: 'text-green-100', label: 'Stable' },
};

export default function StatisticalBadge({ model, result, pAdjusted }: StatisticalBadgeProps) {
  const style = result.isDegraded
    ? SEVERITY_STYLES[result.effectLabel] || SEVERITY_STYLES.negligible
    : SEVERITY_STYLES.negligible;

  const displayP = pAdjusted ?? result.pValue;

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 ${style.bg} border ${style.border} rounded-full`}>
      <span className={`${style.text} font-semibold text-xs`}>{model}</span>
      <span className={`${style.text} text-xs opacity-80`}>
        {style.label} | p={displayP < 0.001 ? '<0.001' : displayP.toFixed(3)} | d={result.effectSize.toFixed(2)}
      </span>
    </div>
  );
}
