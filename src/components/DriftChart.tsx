import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';

export type ChartView = 'consistency' | 'dual' | 'drift-events';

interface DriftChartProps {
  data: Array<{
    date: string;
    [key: string]: string | number;
  }>;
  models: string[];
  view?: ChartView;
  title?: string;
}

const COLORS = ['#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed'];

const pctFormatter = (v: number) => `${(v * 100).toFixed(0)}%`;

// --- Tooltips ---

function ConsistencyTooltip({ active, payload, label }: {
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
        const model = entry.dataKey.replace(/_consistency$/, '');
        const prompts = point[`${model}_prompts`] || 0;
        const drifted = point[`${model}_drifted`] || 0;
        const subs = point[model] || 0;

        return (
          <div key={entry.dataKey} className="mb-1.5 last:mb-0">
            <span className="font-medium" style={{ color: entry.color }}>{model}</span>
            <div className="text-slate-600 text-xs ml-2">
              <span className="font-semibold">{(entry.value * 100).toFixed(1)}% consistent</span>
              <span className="mx-1">|</span>
              <span>{prompts} prompts</span>
              <span className="mx-1">|</span>
              <span>{drifted} drifted</span>
              <span className="mx-1">|</span>
              <span>{subs} subs</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DriftEventsTooltip({ active, payload, label }: {
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
        const model = entry.dataKey.replace(/_drifted$/, '');
        const prompts = point[`${model}_prompts`] || 0;
        const consistency = point[`${model}_consistency`];
        const consistencyPct = consistency !== undefined ? (consistency * 100).toFixed(1) : '—';

        return (
          <div key={entry.dataKey} className="mb-1.5 last:mb-0">
            <span className="font-medium" style={{ color: entry.color }}>{model}</span>
            <div className="text-slate-600 text-xs ml-2">
              <span className="font-semibold">{entry.value} drifted</span>
              <span className="mx-1">|</span>
              <span>{consistencyPct}% consistent</span>
              <span className="mx-1">|</span>
              <span>{prompts} prompts</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// --- Chart sub-components ---

function ConsistencyChart({ data, models }: { data: DriftChartProps['data']; models: string[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis domain={[0.6, 1.0]} tickFormatter={pctFormatter} />
        <ReferenceLine y={0.95} stroke="#94a3b8" strokeDasharray="6 3" label={{ value: '95%', position: 'right', fill: '#94a3b8', fontSize: 12 }} />
        <Tooltip content={<ConsistencyTooltip />} />
        <Legend />
        {models.map((model, idx) => (
          <Line
            key={model}
            type="monotone"
            name={model}
            dataKey={`${model}_consistency`}
            stroke={COLORS[idx % COLORS.length]}
            strokeWidth={2}
            dot={{ r: 2 }}
            activeDot={{ r: 5, strokeWidth: 2 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function DriftEventsChart({ data, models }: { data: DriftChartProps['data']; models: string[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip content={<DriftEventsTooltip />} />
        <Legend />
        {models.map((model, idx) => (
          <Bar
            key={model}
            name={model}
            dataKey={`${model}_drifted`}
            stackId="drift"
            fill={COLORS[idx % COLORS.length]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function ActivityBars({ data, models }: { data: DriftChartProps['data']; models: string[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip />
        <Legend />
        {models.map((model, idx) => (
          <Bar
            key={model}
            name={model}
            dataKey={model}
            stackId="subs"
            fill={COLORS[idx % COLORS.length]}
            opacity={0.7}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

// --- Titles ---

const VIEW_TITLES: Record<ChartView, string> = {
  consistency: 'Model Consistency Over Time',
  dual: 'Consistency + Submission Activity',
  'drift-events': 'Drift Events Over Time',
};

// --- Main ---

export default function DriftChart({ data, models, view = 'consistency', title }: DriftChartProps) {
  const heading = title ?? VIEW_TITLES[view];

  return (
    <div className="w-full bg-white p-4 sm:p-6 rounded-lg shadow-sm">
      <h2 className="text-xl font-bold mb-4 text-slate-900">{heading}</h2>

      {view === 'consistency' && (
        <div className="w-full h-64 sm:h-80 lg:h-96">
          <ConsistencyChart data={data} models={models} />
        </div>
      )}

      {view === 'dual' && (
        <>
          <div className="w-full h-48 sm:h-64 lg:h-72">
            <ConsistencyChart data={data} models={models} />
          </div>
          <h3 className="text-sm font-semibold text-slate-500 mt-4 mb-2">Submissions</h3>
          <div className="w-full h-32 sm:h-40">
            <ActivityBars data={data} models={models} />
          </div>
        </>
      )}

      {view === 'drift-events' && (
        <div className="w-full h-64 sm:h-80 lg:h-96">
          <DriftEventsChart data={data} models={models} />
        </div>
      )}
    </div>
  );
}
