import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/lib/auth';
import DriftChart from '@/components/DriftChart';
import Button from '@/components/Button';
import type { UserStatsResponse, ChartApiResponse, ChartDataPoint } from '@/lib/types';

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

  // Filter chart to user's tested models
  const userModels = useMemo(() => {
    if (!stats) return [];
    return stats.models_tested.filter((m) => chartModels.includes(m));
  }, [stats, chartModels]);

  // Latest consistency per model from chart data
  const latestConsistency = useMemo(() => {
    if (chartData.length === 0) return {} as Record<string, number>;
    const latest = chartData[chartData.length - 1];
    const result: Record<string, number> = {};
    for (const model of userModels) {
      result[model] = (latest[`${model}_consistency`] as number) ?? 1.0;
    }
    return result;
  }, [chartData, userModels]);

  // Weighted avg consistency across user's models
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

  // Total drift events per model across all chart data
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-slate-300 border-t-slate-600 rounded-full"></div>
      </div>
    );
  }

  if (!session) return null;

  const userId = session.user.id;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="bg-white shadow-sm rounded-lg p-8 mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Your Statistics</h1>
          <p className="text-sm text-slate-500 font-mono">{userId}</p>
        </div>

        {!stats ? (
          <div className="bg-amber-50 border-l-4 border-amber-600 p-6 mb-8">
            <h2 className="font-semibold text-amber-950 mb-2">Unable to load statistics</h2>
            <p className="text-sm text-amber-950">
              Stats service is unavailable. Your submissions are still being tracked.
            </p>
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
              <div className="bg-white shadow-sm rounded-lg p-6">
                <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-2">
                  Models Tested
                </h2>
                <p className="text-3xl font-bold text-slate-900">{stats.models_count}</p>
                <p className="text-sm text-slate-500 mt-1 truncate">
                  {stats.models_tested.length > 0 ? stats.models_tested.join(', ') : 'None yet'}
                </p>
              </div>

              <div className="bg-white shadow-sm rounded-lg p-6">
                <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-2">
                  Avg Consistency
                </h2>
                <p className={`text-3xl font-bold ${
                  avgConsistency === null ? 'text-slate-400' :
                  avgConsistency >= 0.95 ? 'text-green-700' :
                  avgConsistency >= 0.80 ? 'text-yellow-700' :
                  'text-red-700'
                }`}>
                  {avgConsistency !== null ? `${(avgConsistency * 100).toFixed(1)}%` : '—'}
                </p>
                <p className="text-sm text-slate-500 mt-1">weighted across your models</p>
              </div>

              <div className="bg-white shadow-sm rounded-lg p-6">
                <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-2">
                  Total Submissions
                </h2>
                <p className="text-3xl font-bold text-slate-900">{stats.total_submissions}</p>
                <p className="text-sm text-slate-500 mt-1">
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

                    return (
                      <div key={model} className="bg-white border border-slate-200 rounded-lg p-4 flex justify-between items-center">
                        <div>
                          <h3 className="font-medium text-slate-900">{model}</h3>
                          <p className="text-sm text-slate-500 mt-0.5">
                            {subs} submissions
                            <span className="mx-1">&middot;</span>
                            <span className={drifted === 0 ? 'text-green-700' : drifted <= 3 ? 'text-yellow-700' : 'text-red-700'}>
                              {drifted} drift events
                            </span>
                          </p>
                        </div>
                        <span className={`text-lg font-bold ${
                          consistency >= 0.95 ? 'text-green-700' :
                          consistency >= 0.80 ? 'text-yellow-700' :
                          'text-red-700'
                        }`}>
                          {(consistency * 100).toFixed(0)}%
                        </span>
                      </div>
                    );
                  })}
              </div>
            )}

            {stats.total_submissions === 0 && (
              <div className="bg-blue-50 border-l-4 border-blue-600 p-6 mb-8">
                <h2 className="font-semibold text-blue-950 mb-2">No submissions yet</h2>
                <p className="text-sm text-blue-900">
                  Run <code className="bg-slate-800 text-slate-100 px-1.5 py-0.5 rounded font-mono text-xs">uvx pramana run --tier cheap --model gpt-4</code> to start contributing.
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
