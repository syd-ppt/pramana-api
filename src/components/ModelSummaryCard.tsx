import type { ChartDataPoint } from '@/lib/types';
import type { SummaryStats } from '@/lib/statistics';
import { poolStats } from '@/lib/statistics';

interface ModelSummaryCardProps {
  model: string;
  data: ChartDataPoint[];
  color: string;
  onClick?: () => void;
}

function powerBadge(n: number): { label: string; className: string } {
  if (n < 10) return { label: 'Insufficient', className: 'bg-red-100 text-red-800' };
  if (n < 30) return { label: 'Low power', className: 'bg-yellow-100 text-yellow-800' };
  if (n < 100) return { label: 'Adequate', className: 'bg-blue-100 text-blue-800' };
  return { label: 'High power', className: 'bg-green-100 text-green-800' };
}

function getDayStats(data: ChartDataPoint[], model: string, days: number): SummaryStats[] {
  const recent = data.slice(-days);
  return recent
    .filter((d) => d[`${model}_n`] != null && (d[`${model}_n`] as number) > 0)
    .map((d) => ({
      n: d[`${model}_n`] as number,
      mean: d[model] as number,
      variance: d[`${model}_variance`] as number,
    }));
}

export default function ModelSummaryCard({ model, data, color, onClick }: ModelSummaryCardProps) {
  const recent7 = getDayStats(data, model, 7);
  const prior7 = getDayStats(data.slice(0, -7), model, 7);

  const recentPooled = poolStats(recent7);
  const priorPooled = poolStats(prior7);

  const trend = recentPooled.n > 0 && priorPooled.n > 0
    ? recentPooled.mean - priorPooled.mean
    : null;

  const trendArrow = trend === null ? '—'
    : trend > 0.01 ? '↑'
    : trend < -0.01 ? '↓'
    : '→';

  const trendColor = trend === null ? 'text-slate-400'
    : trend > 0.01 ? 'text-green-600'
    : trend < -0.01 ? 'text-red-600'
    : 'text-slate-500';

  const ciWidth = recentPooled.n >= 2
    ? 2 * 1.96 * Math.sqrt(recentPooled.variance / recentPooled.n)
    : null;

  const badge = powerBadge(recentPooled.n);

  return (
    <div
      className={`bg-white rounded-lg shadow-sm p-4 border-l-4 ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
      style={{ borderLeftColor: color }}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-slate-900 text-sm">{model}</h3>
        <span className={`text-xs px-2 py-0.5 rounded ${badge.className}`}>{badge.label}</span>
      </div>

      <div className="flex items-baseline gap-3">
        <span className="text-2xl font-bold text-slate-900">
          {recentPooled.n > 0 ? recentPooled.mean.toFixed(3) : '—'}
        </span>
        <span className={`text-lg font-semibold ${trendColor}`}>{trendArrow}</span>
      </div>

      <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
        <span>n={recentPooled.n}</span>
        {ciWidth !== null && <span>CI width={ciWidth.toFixed(3)}</span>}
        <span>7-day mean</span>
      </div>
    </div>
  );
}
