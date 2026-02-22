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

// Luminous neon palette
const COLORS = ['#818cf8', '#f472b6', '#34d399', '#fbbf24', '#22d3ee'];
const GLOW_COLORS = [
  'rgba(129, 140, 248, 0.6)',
  'rgba(244, 114, 182, 0.6)',
  'rgba(52, 211, 153, 0.6)',
  'rgba(251, 191, 36, 0.6)',
  'rgba(34, 211, 238, 0.6)',
];

const pctFormatter = (v: number) => `${(v * 100).toFixed(0)}%`;
const dateFormatter = (d: string) => {
  const parts = d.split('-');
  return `${parts[1]}/${parts[2]}`;
};

/** SVG filter definitions for line glow */
function GlowFilters() {
  return (
    <defs>
      {COLORS.map((_, i) => (
        <filter key={i} id={`glow-${i}`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      ))}
      <linearGradient id="bar-gradient-drift" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="rgba(244, 63, 94, 0.8)" />
        <stop offset="100%" stopColor="rgba(244, 63, 94, 0.2)" />
      </linearGradient>
    </defs>
  );
}

// --- Tooltips (frosted glass) ---

function TooltipShell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="glass-elevated rounded-xl px-4 py-3 text-sm min-w-[200px]"
      style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 20px rgba(139, 92, 246, 0.1)' }}>
      <p className="font-mono text-xs text-[var(--text-muted)] mb-2">{label}</p>
      {children}
    </div>
  );
}

function ConsistencyTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload || !label) return null;
  const point = payload[0]?.payload as Record<string, number> | undefined;
  if (!point) return null;

  return (
    <TooltipShell label={label}>
      {payload.map((entry) => {
        const model = entry.dataKey.replace(/_consistency$/, '');
        const prompts = point[`${model}_prompts`] || 0;
        const drifted = point[`${model}_drifted`] || 0;

        return (
          <div key={entry.dataKey} className="mb-2 last:mb-0">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color, boxShadow: `0 0 6px ${entry.color}` }} />
              <span className="text-[var(--text-primary)] font-medium text-xs">{model}</span>
              <span className="ml-auto font-mono font-semibold" style={{ color: entry.color }}>
                {(entry.value * 100).toFixed(1)}%
              </span>
            </div>
            <div className="text-[var(--text-muted)] text-xs ml-4 mt-0.5 font-mono">
              {prompts} prompts &middot; {drifted} drifted
            </div>
          </div>
        );
      })}
    </TooltipShell>
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
    <TooltipShell label={label}>
      {payload.map((entry) => {
        const model = entry.dataKey.replace(/_drifted$/, '');
        const consistency = point[`${model}_consistency`];
        const pct = consistency !== undefined ? (consistency * 100).toFixed(1) : '—';

        return (
          <div key={entry.dataKey} className="mb-2 last:mb-0">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color, boxShadow: `0 0 6px ${entry.color}` }} />
              <span className="text-[var(--text-primary)] font-medium text-xs">{model}</span>
              <span className="ml-auto font-mono font-semibold" style={{ color: entry.color }}>
                {entry.value}
              </span>
            </div>
            <div className="text-[var(--text-muted)] text-xs ml-4 mt-0.5 font-mono">
              {pct}% consistent
            </div>
          </div>
        );
      })}
    </TooltipShell>
  );
}

// --- Chart sub-components ---

function ConsistencyChart({ data, models }: { data: DriftChartProps['data']; models: string[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <GlowFilters />
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
        <XAxis
          dataKey="date"
          tickFormatter={dateFormatter}
          stroke="rgba(255,255,255,0.08)"
          tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
        />
        <YAxis
          domain={[0.6, 1.0]}
          tickFormatter={pctFormatter}
          stroke="rgba(255,255,255,0.08)"
          tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
        />
        <ReferenceLine
          y={0.95}
          stroke="rgba(139, 92, 246, 0.3)"
          strokeDasharray="6 4"
          label={{ value: '95%', position: 'right', fill: 'rgba(139, 92, 246, 0.5)', fontSize: 11 }}
        />
        <Tooltip content={<ConsistencyTooltip />} />
        <Legend
          wrapperStyle={{ paddingTop: 8 }}
          formatter={(value: string) => (
            <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{value}</span>
          )}
        />
        {models.map((model, idx) => (
          <Line
            key={model}
            type="monotone"
            name={model}
            dataKey={`${model}_consistency`}
            stroke={COLORS[idx % COLORS.length]}
            strokeWidth={2.5}
            dot={false}
            activeDot={{
              r: 5,
              strokeWidth: 2,
              stroke: COLORS[idx % COLORS.length],
              fill: 'var(--bg-surface)',
              style: { filter: `drop-shadow(0 0 6px ${GLOW_COLORS[idx % GLOW_COLORS.length]})` },
            }}
            style={{ filter: `drop-shadow(0 0 4px ${GLOW_COLORS[idx % GLOW_COLORS.length]})` }}
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
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
        <XAxis
          dataKey="date"
          tickFormatter={dateFormatter}
          stroke="rgba(255,255,255,0.08)"
          tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
        />
        <YAxis
          stroke="rgba(255,255,255,0.08)"
          tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
        />
        <Tooltip content={<DriftEventsTooltip />} />
        <Legend
          wrapperStyle={{ paddingTop: 8 }}
          formatter={(value: string) => (
            <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{value}</span>
          )}
        />
        {models.map((model, idx) => (
          <Bar
            key={model}
            name={model}
            dataKey={`${model}_drifted`}
            stackId="drift"
            fill={COLORS[idx % COLORS.length]}
            opacity={0.75}
            radius={idx === models.length - 1 ? [2, 2, 0, 0] : undefined}
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
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
        <XAxis
          dataKey="date"
          tickFormatter={dateFormatter}
          stroke="rgba(255,255,255,0.08)"
          tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
        />
        <YAxis
          stroke="rgba(255,255,255,0.08)"
          tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
        />
        <Tooltip />
        <Legend
          wrapperStyle={{ paddingTop: 8 }}
          formatter={(value: string) => (
            <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{value}</span>
          )}
        />
        {models.map((model, idx) => (
          <Bar
            key={model}
            name={model}
            dataKey={model}
            stackId="subs"
            fill={COLORS[idx % COLORS.length]}
            opacity={0.5}
            radius={idx === models.length - 1 ? [2, 2, 0, 0] : undefined}
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
    <div className="chart-container glass-elevated rounded-2xl p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 tracking-tight">{heading}</h2>

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
          <div className="mt-4 pt-4 border-t border-[var(--border-subtle)]">
            <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Submissions</h3>
            <div className="w-full h-32 sm:h-40">
              <ActivityBars data={data} models={models} />
            </div>
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
