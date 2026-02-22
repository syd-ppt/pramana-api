import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/lib/auth';
import DriftChart from '@/components/DriftChart';
import Button from '@/components/Button';
import type { UserStatsResponse, ChartApiResponse, ChartDataPoint } from '@/lib/types';

function consistencyColor(v: number): string {
  if (v >= 0.95) return '#6ee7b7';
  if (v >= 0.80) return '#fcd34d';
  return '#fda4af';
}

function consistencyBadgeClass(v: number): string {
  if (v >= 0.95) return 'badge-good';
  if (v >= 0.80) return 'badge-warn';
  return 'badge-bad';
}

export default function MyStats() {
  const { session, status } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<UserStatsResponse | null>(null);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [chartModels, setChartModels] = useState<string[]>([]);
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

  const latestConsistency = useMemo(() => {
    if (chartData.length === 0) return {} as Record<string, number>;
    const latest = chartData[chartData.length - 1];
    const result: Record<string, number> = {};
    for (const model of userModels) {
      result[model] = (latest[`${model}_consistency`] as number) ?? 1.0;
    }
    return result;
  }, [chartData, userModels]);

  const avgConsistency = useMemo(() => {
    if (chartData.length === 0 || userModels.length === 0) return null;
    const latest = chartData[chartData.length - 1];
    let totalPrompts = 0;
    let weightedSum = 0;
    for (const model of userModels) {
      const prompts = (latest[`${model}_prompts`] as number) || 0;
      const consistency = (latest[`${model}_consistency`] as number) || 0;
      weightedSum += prompts * consistency;
      totalPrompts += prompts;
    }
    return totalPrompts > 0 ? weightedSum / totalPrompts : null;
  }, [chartData, userModels]);

  const modelDriftTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const model of userModels) {
      let sum = 0;
      for (const point of chartData) {
        sum += (point[`${model}_drifted`] as number) || 0;
      }
      totals[model] = sum;
    }
    return totals;
  }, [chartData, userModels]);

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

        {/* Header */}
        <div className="glass-elevated rounded-2xl p-8 mb-8">
          <h1 className="text-3xl font-bold text-[var(--text-primary)] tracking-tight mb-2">Your Statistics</h1>
          <p className="text-sm text-[var(--text-muted)] font-mono">{userId}</p>
        </div>

        {!stats ? (
          <div className="glass rounded-xl border-l-4 border-[var(--accent-amber)] p-6 mb-8">
            <h2 className="font-semibold text-[var(--accent-amber)] mb-2 text-sm">Unable to load statistics</h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Stats service is unavailable. Your submissions are still being tracked.
            </p>
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8">
              <div className="stat-card glass-elevated rounded-2xl p-6">
                <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
                  Models Tested
                </h2>
                <p className="text-4xl font-bold text-[var(--text-primary)]">{stats.models_count}</p>
                <p className="text-xs text-[var(--text-muted)] mt-2 truncate font-mono">
                  {stats.models_tested.length > 0 ? stats.models_tested.join(', ') : 'None yet'}
                </p>
              </div>

              <div className="stat-card glass-elevated rounded-2xl p-6">
                <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
                  Avg Consistency
                </h2>
                <p className="text-4xl font-bold font-mono" style={{
                  color: avgConsistency !== null ? consistencyColor(avgConsistency) : 'var(--text-muted)',
                  textShadow: avgConsistency !== null ? `0 0 20px ${consistencyColor(avgConsistency)}40` : 'none',
                }}>
                  {avgConsistency !== null ? `${(avgConsistency * 100).toFixed(1)}%` : '—'}
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-2">weighted across your models</p>
              </div>

              <div className="stat-card glass-elevated rounded-2xl p-6">
                <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
                  Total Submissions
                </h2>
                <p className="text-4xl font-bold text-[var(--text-primary)]">{stats.total_submissions}</p>
                <p className="text-xs text-[var(--text-muted)] mt-2 font-mono">
                  Last: {stats.last_submission ? new Date(stats.last_submission).toLocaleDateString() : 'Never'}
                </p>
              </div>
            </div>

            {/* Consistency Chart (filtered to user's models) */}
            {userModels.length > 0 && chartData.length > 0 && (
              <div className="mb-8">
                <DriftChart
                  data={chartData}
                  models={userModels}
                  view="consistency"
                  title="Your Models — Consistency Over Time"
                />
              </div>
            )}

            {/* Per-model consistency cards */}
            {userModels.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                {userModels
                  .sort((a, b) => (latestConsistency[a] ?? 1) - (latestConsistency[b] ?? 1))
                  .map((model) => {
                    const consistency = latestConsistency[model] ?? 1.0;
                    const subs = stats.model_submissions[model] ?? 0;
                    const drifted = modelDriftTotals[model] ?? 0;
                    const color = consistencyColor(consistency);

                    return (
                      <div key={model} className="glass glass-hover rounded-xl p-5 flex justify-between items-center transition-all">
                        <div>
                          <h3 className="font-medium text-[var(--text-primary)] text-sm">{model}</h3>
                          <p className="text-xs text-[var(--text-muted)] mt-1 font-mono">
                            {subs} submissions
                            <span className="mx-1.5 text-[var(--border-glass)]">&middot;</span>
                            <span style={{ color: drifted === 0 ? '#6ee7b7' : drifted <= 3 ? '#fcd34d' : '#fda4af' }}>
                              {drifted} drift events
                            </span>
                          </p>
                        </div>
                        <span
                          className={`text-sm px-3 py-1 rounded-full font-mono font-semibold ${consistencyBadgeClass(consistency)}`}
                          style={{ textShadow: `0 0 12px ${color}50` }}
                        >
                          {(consistency * 100).toFixed(0)}%
                        </span>
                      </div>
                    );
                  })}
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
