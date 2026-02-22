import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { ChartDataPoint } from '@/lib/types';

interface ModelDayStats {
  n: number;
  mean: number;
  m2: number;
  count: number;
}

interface DrillDownChartProps {
  model: string;
  userDateStats: Record<string, Record<string, ModelDayStats>>;
  chartData: ChartDataPoint[];
  onClose: () => void;
}

export default function DrillDownChart({ model, userDateStats, chartData, onClose }: DrillDownChartProps) {
  // Build merged data: user daily mean + community daily mean with CI
  const data = chartData
    .filter((d) => d[`${model}_n`] != null)
    .map((d) => {
      const date = d.date as string;
      const userStats = userDateStats[date]?.[model];
      return {
        date,
        user: userStats && userStats.n > 0 ? userStats.mean : null,
        community: d[model] as number,
        ci_low: d[`${model}_ci_low`] as number,
        ci_high: d[`${model}_ci_high`] as number,
      };
    });

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6 mt-4">
        <p className="text-slate-600 text-sm">No data available for {model}.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-slate-900">
          {model} — Your scores vs Community
        </h3>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 text-lg leading-none px-2"
          aria-label="Close"
        >
          &times;
        </button>
      </div>
      <div className="w-full" style={{ height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis domain={[0, 1]} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Area
              dataKey="ci_high"
              stroke="none"
              fill="#94a3b8"
              fillOpacity={0.15}
              name="Community CI"
              legendType="none"
              isAnimationActive={false}
            />
            <Area
              dataKey="ci_low"
              stroke="none"
              fill="#ffffff"
              fillOpacity={1}
              legendType="none"
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="community"
              stroke="#94a3b8"
              strokeWidth={2}
              dot={false}
              name="Community"
            />
            <Line
              type="monotone"
              dataKey="user"
              stroke="#2563eb"
              strokeWidth={2}
              dot={{ r: 3, fill: '#2563eb' }}
              name="You"
              connectNulls={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
