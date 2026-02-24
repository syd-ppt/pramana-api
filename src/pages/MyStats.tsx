import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/lib/auth';
import DriftChart from '@/components/DriftChart';
import type { ChartView } from '@/components/DriftChart';
import Button from '@/components/Button';
import type { UserStatsResponse, ChartApiResponse, ChartDataPoint } from '@/lib/types';
import MultiSelect from '@/components/MultiSelect';

function consistencyColor(v: number): string {
  if (v >= 0.95) return 'var(--status-good-text)';
  if (v >= 0.80) return 'var(--status-warn-text)';
  return 'var(--status-bad-text)';
}

function consistencyBadgeClass(v: number): string {
  if (v >= 0.95) return 'badge-good';
  if (v >= 0.80) return 'badge-warn';
  return 'badge-bad';
}

function driftColor(n: number): string {
  if (n === 0) return 'text-[var(--status-good-text)]';
  if (n <= 3) return 'text-[var(--status-warn-text)]';
  return 'text-[var(--status-bad-text)]';
}

const VIEW_OPTIONS: { value: ChartView; label: string }[] = [
  { value: 'consistency', label: 'Consistency' },
  { value: 'dual', label: 'Consistency + Activity' },
  { value: 'drift-events', label: 'Drift Events' },
];

export default function MyStats() {
  const { session, status } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<UserStatsResponse | null>(null);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [chartModels, setChartModels] = useState<string[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [chartView, setChartView] = useState<ChartView>('consistency');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') {
      navigate('/auth/signin', { replace: true });
    }
  }, [status, navigate]);

  useEffect(() => {
    if (status !== 'authenticated') return;

    Promise.all([
      fetch('/api/user/me/stats', { credentials: 'include' })
        .then((r) => (r.ok ? r.json() as Promise<UserStatsResponse> : null)),
      fetch('/api/data/chart')
        .then((r) => (r.ok ? r.json() as Promise<ChartApiResponse> : null)),
    ])
      .then(([statsData, chartResp]) => {
        setStats(statsData);
        if (chartResp) {
          setChartData(chartResp.data || []);
          setChartModels(chartResp.models || []);
        }
      })
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, [status]);

  const userModels = useMemo(() => {
    if (!stats) return [];
    return stats.models_tested.filter((m) => chartModels.includes(m));
  }, [stats, chartModels]);

  const displayModels = selectedModels.length > 0
    ? userModels.filter(m => selectedModels.includes(m))
    : userModels;

  const latestConsistency = useMemo(() => {
    if (chartData.length === 0) return {} as Record<string, number>;
    const latest = chartData[chartData.length - 1];
    const result: Record<string, number> = {};
    for (const model of displayModels) {
      result[model] = (latest[`${model}_consistency`] as number) ?? 1.0;
    }
    return result;
  }, [chartData, displayModels]);

  const avgConsistency = useMemo(() => {
    if (chartData.length === 0 || displayModels.length === 0) return null;
    const latest = chartData[chartData.length - 1];
    let totalPrompts = 0;
    let weightedSum = 0;
    for (const model of displayModels) {
      const prompts = (latest[`${model}_prompts`] as number) || 0;
      const consistency = (latest[`${model}_consistency`] as number) || 0;
      weightedSum += prompts * consistency;
      totalPrompts += prompts;
    }
    return totalPrompts > 0 ? weightedSum / totalPrompts : null;
  }, [chartData, displayModels]);

  const modelDriftTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const model of displayModels) {
      let sum = 0;
      for (const point of chartData) {
        sum += (point[`${model}_drifted`] as number) || 0;
      }
      totals[model] = sum;
    }
    return totals;
  }, [chartData, displayModels]);

  if (status === 'loading' || (status === 'authenticated' && loading)) {
    return (
      <div className="min-h-screen bg-mesh flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-[var(--border-glass)] border-t-[var(--accent-violet)] rounded-full"
          style={{ boxShadow: 'var(--glow-violet)' }} />
      </div>
    );
  }

  if (!session) return null;

  const userId = session.user.id;

  return (
    <div className="min-h-screen bg-mesh">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">

        {/* Header with stat pills */}
        <header className="mb-10">
          <h1 className="text-5xl font-bold tracking-tight text-shimmer mb-3">Your Statistics</h1>
          <p className="text-sm text-[var(--text-muted)] font-mono">{userId}</p>

          {stats && (
            <div className="flex flex-wrap gap-3 mt-5">
              {avgConsistency !== null && (
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-mono font-semibold ${consistencyBadgeClass(avgConsistency)}`}>
                  <span className="w-1.5 h-1.5 rounded-full pulse-glow" style={{
                    backgroundColor: avgConsistency >= 0.95 ? 'var(--status-good)' : avgConsistency >= 0.80 ? 'var(--status-warn)' : 'var(--status-bad)',
                  }} />
                  {(avgConsistency * 100).toFixed(1)}% consistency
                </div>
              )}
              <span className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-mono text-[var(--text-secondary)] bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                {stats.models_count} models
              </span>
              <span className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-mono text-[var(--text-secondary)] bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                {stats.total_submissions.toLocaleString()} submissions
              </span>
              {stats.last_submission && (
                <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-mono text-[var(--text-muted)] bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                  last {new Date(stats.last_submission).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          )}
        </header>

        {!stats ? (
          <div className="glass rounded-xl border-l-4 border-[var(--accent-amber)] p-6 mb-8">
            <h2 className="font-semibold text-[var(--accent-amber)] mb-2 text-sm">Unable to load statistics</h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Stats service is unavailable. Your submissions are still being tracked.
            </p>
          </div>
        ) : (
          <>
            {/* Model filter */}
            {userModels.length > 1 && (
              <div className="glass-elevated rounded-2xl p-5 mb-6 overflow-visible">
                <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-4">Filters</h3>
                <div className="max-w-xs">
                  <label className="block text-xs font-medium mb-1.5 text-[var(--text-secondary)]">Models</label>
                  <MultiSelect
                    options={userModels}
                    selected={selectedModels}
                    onChange={setSelectedModels}
                    placeholder="All your models"
                  />
                </div>
              </div>
            )}

            {/* Chart + view toggle */}
            {displayModels.length > 0 && chartData.length > 0 && (
              <>
                <div className="flex gap-1 mb-5 glass rounded-xl p-1 w-fit">
                  {VIEW_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setChartView(opt.value)}
                      className={`toggle-pill px-4 py-2 rounded-lg text-sm font-medium ${
                        chartView === opt.value
                          ? 'toggle-pill-active'
                          : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <DriftChart
                  data={chartData}
                  models={displayModels}
                  view={chartView}
                  title="Your Models — Consistency Over Time"
                />
              </>
            )}

            {/* Model Table */}
            {displayModels.length > 0 && (
              <div className="glass-elevated rounded-2xl overflow-hidden mt-6 mb-8">
                <div className="px-5 pt-5 pb-3">
                  <h2 className="text-lg font-semibold text-[var(--text-primary)] tracking-tight">Your Models</h2>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">Sorted by consistency — worst first</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border-subtle)]">
                        <th className="px-5 py-3 text-left text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Model</th>
                        <th className="px-5 py-3 text-left text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Consistency</th>
                        <th className="px-5 py-3 text-left text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Drift Events</th>
                        <th className="px-5 py-3 text-left text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Your Submissions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayModels
                        .sort((a, b) => (latestConsistency[a] ?? 1) - (latestConsistency[b] ?? 1))
                        .map((model) => {
                          const consistency = latestConsistency[model] ?? 1.0;
                          const subs = stats.model_submissions[model] ?? 0;
                          const drifted = modelDriftTotals[model] ?? 0;
                          return (
                            <tr key={model} className="border-b border-[var(--border-subtle)] table-row-hover">
                              <td className="px-5 py-3 font-medium text-[var(--text-primary)]">{model}</td>
                              <td className="px-5 py-3">
                                <span className={`text-xs px-2.5 py-1 rounded-full font-mono font-medium ${consistencyBadgeClass(consistency)}`}>
                                  {(consistency * 100).toFixed(1)}%
                                </span>
                              </td>
                              <td className="px-5 py-3">
                                <span className={`font-mono font-medium ${driftColor(drifted)}`}>
                                  {drifted.toLocaleString()}
                                </span>
                              </td>
                              <td className="px-5 py-3 font-mono text-[var(--text-secondary)]">{subs.toLocaleString()}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {stats.total_submissions === 0 && (
              <div className="glass rounded-xl border-l-4 border-[var(--accent-cyan)] p-6 mb-8">
                <h2 className="font-semibold text-[var(--text-primary)] mb-2 text-sm">No submissions yet</h2>
                <p className="text-sm text-[var(--text-secondary)]">
                  Run{' '}
                  <code className="bg-[var(--bg-surface)] text-[var(--accent-cyan)] px-1.5 py-0.5 rounded font-mono text-xs">
                    uvx pramana run --tier cheap --model gpt-4
                  </code>{' '}
                  to start contributing.
                </p>
              </div>
            )}
          </>
        )}

        <div className="mt-8 text-center">
          <Button href="/cli-token" variant="ghost" size="md">
            Back to CLI Token
          </Button>
        </div>
      </div>
    </div>
  );
}
