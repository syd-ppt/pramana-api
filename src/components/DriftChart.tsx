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

interface DriftChartProps {
  data: Array<{
    date: string;
    [key: string]: string | number;
  }>;
  models: string[];
}

const COLORS = ['#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed'];

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload || !label) return null;

  // Group by model (filter out CI area entries)
  const models = new Map<string, {
    mean: number;
    n: number;
    variance: number;
    ciLow: number;
    ciHigh: number;
    color: string;
  }>();

  const point = payload[0]?.payload as Record<string, number> | undefined;
  if (!point) return null;

  for (const entry of payload) {
    const dk = entry.dataKey;
    // Skip CI bands and metadata keys
    if (dk.endsWith('_ci_low') || dk.endsWith('_ci_high') || dk.endsWith('_ci_band') ||
        dk.endsWith('_n') || dk.endsWith('_variance') || dk.endsWith('_count')) continue;
    if (dk === 'date') continue;

    const model = dk;
    models.set(model, {
      mean: entry.value,
      n: (point[`${model}_n`] as number) || 0,
      variance: (point[`${model}_variance`] as number) || 0,
      ciLow: (point[`${model}_ci_low`] as number) || 0,
      ciHigh: (point[`${model}_ci_high`] as number) || 0,
      color: entry.color,
    });
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-slate-900 mb-2">{label}</p>
      {Array.from(models.entries()).map(([model, d]) => (
        <div key={model} className="mb-1.5 last:mb-0">
          <span className="font-medium" style={{ color: d.color }}>{model}</span>
          <div className="text-slate-600 text-xs ml-2">
            <span>mean={d.mean.toFixed(3)}</span>
            {d.n > 0 && (
              <>
                <span className="mx-1">|</span>
                <span>CI=[{d.ciLow.toFixed(3)}, {d.ciHigh.toFixed(3)}]</span>
                <span className="mx-1">|</span>
                <span>n={d.n}</span>
                <span className="mx-1">|</span>
                <span>var={d.variance.toFixed(4)}</span>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function DriftChart({ data, models }: DriftChartProps) {
  return (
    <div className="w-full bg-white p-4 sm:p-6 rounded-lg shadow-sm">
      <h2 className="text-xl font-bold mb-4 text-slate-900">Model Performance Over Time</h2>
      <div className="w-full h-64 sm:h-80 lg:h-96">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis domain={[0, 1]} label={{ value: 'Mean Score', angle: -90, position: 'insideLeft' }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            {models.map((model, idx) => {
              const color = COLORS[idx % COLORS.length];
              return [
                <Area
                  key={`${model}_ci_band`}
                  dataKey={`${model}_ci_high`}
                  stroke="none"
                  fill={color}
                  fillOpacity={0.1}
                  name={`${model} CI`}
                  legendType="none"
                  isAnimationActive={false}
                />,
                <Area
                  key={`${model}_ci_low_mask`}
                  dataKey={`${model}_ci_low`}
                  stroke="none"
                  fill="#ffffff"
                  fillOpacity={1}
                  legendType="none"
                  isAnimationActive={false}
                />,
                <Line
                  key={model}
                  type="monotone"
                  dataKey={model}
                  stroke={color}
                  strokeWidth={2}
                  dot={(props: Record<string, unknown>) => {
                    const { cx, cy, payload } = props as { cx: number; cy: number; payload: Record<string, number> };
                    const n = (payload[`${model}_n`] as number) || 0;
                    const r = clamp(Math.sqrt(n), 2, 6);
                    return <circle cx={cx} cy={cy} r={r} fill={color} stroke="#fff" strokeWidth={1} />;
                  }}
                  activeDot={{ r: 5, strokeWidth: 2 }}
                />,
              ];
            }).flat()}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
