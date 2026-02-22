import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface DriftChartProps {
  data: Array<{
    date: string;
    [key: string]: string | number;
  }>;
  models: string[];
}

const COLORS = ['#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed'];

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload || !label) return null;

  const point = payload[0]?.payload as Record<string, number> | undefined;
  if (!point) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-slate-900 mb-2">{label}</p>
      {payload.map((entry) => {
        const model = entry.dataKey;
        const prompts = point[`${model}_prompts`] || 0;
        const drifted = point[`${model}_drifted`] || 0;
        const consistency = point[`${model}_consistency`];
        const consistencyPct = consistency !== undefined ? (consistency * 100).toFixed(0) : '—';

        return (
          <div key={model} className="mb-1.5 last:mb-0">
            <span className="font-medium" style={{ color: entry.color }}>{model}</span>
            <div className="text-slate-600 text-xs ml-2">
              <span>{entry.value} submissions</span>
              <span className="mx-1">|</span>
              <span>{prompts} prompts</span>
              <span className="mx-1">|</span>
              <span>{drifted} drifted</span>
              <span className="mx-1">|</span>
              <span>{consistencyPct}% consistent</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function DriftChart({ data, models }: DriftChartProps) {
  return (
    <div className="w-full bg-white p-4 sm:p-6 rounded-lg shadow-sm">
      <h2 className="text-xl font-bold mb-4 text-slate-900">Submissions Over Time</h2>
      <div className="w-full h-64 sm:h-80 lg:h-96">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis label={{ value: 'Submissions', angle: -90, position: 'insideLeft' }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            {models.map((model, idx) => (
              <Line
                key={model}
                type="monotone"
                dataKey={model}
                stroke={COLORS[idx % COLORS.length]}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5, strokeWidth: 2 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
