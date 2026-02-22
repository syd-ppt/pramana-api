import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/lib/auth';
import Button from '@/components/Button';
import ComparisonTable from '@/components/ComparisonTable';
import DrillDownChart from '@/components/DrillDownChart';
import type { UserStatsResponse, UserSummaryResponse, ChartApiResponse, ChartDataPoint } from '@/lib/types';

export default function MyStats() {
  const { session, status } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<UserStatsResponse | null>(null);
  const [userSummary, setUserSummary] = useState<UserSummaryResponse | null>(null);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [communityTotal, setCommunityTotal] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

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
      fetch('/api/user/me/summary', { credentials: 'include' })
        .then((r) => (r.ok ? r.json() as Promise<UserSummaryResponse> : null)),
    ])
      .then(([statsData, chartResp, summaryData]) => {
        setStats(statsData);
        setCommunityTotal(chartResp?.total_submissions ?? 0);
        setChartData(chartResp?.data ?? []);
        setUserSummary(summaryData);
      })
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, [status]);

  if (status === 'loading' || (status === 'authenticated' && loading)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-slate-300 border-t-slate-600 rounded-full"></div>
      </div>
    );
  }

  if (!session) return null;

  const userId = session.user.id;
  const overallMean = stats?.model_stats
    ? Object.values(stats.model_stats).reduce((sum, m) => {
        if (m.n === 0) return sum;
        return { total: sum.total + m.mean * m.n, n: sum.n + m.n };
      }, { total: 0, n: 0 })
    : { total: 0, n: 0 };
  const meanScore = overallMean.n > 0 ? overallMean.total / overallMean.n : null;

  const contributionPct = communityTotal > 0 && stats
    ? ((stats.total_submissions / communityTotal) * 100).toFixed(1)
    : null;

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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <div className="bg-white shadow-sm rounded-lg p-6">
                <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-2">
                  Total Submissions
                </h2>
                <p className="text-3xl font-bold text-slate-900">{stats.total_submissions}</p>
                <p className="text-sm text-slate-500 mt-1">
                  Last: {stats.last_submission ? new Date(stats.last_submission).toLocaleDateString() : 'Never'}
                </p>
              </div>

              <div className="bg-white shadow-sm rounded-lg p-6">
                <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-2">
                  Total Scored
                </h2>
                <p className="text-3xl font-bold text-slate-900">{stats.total_scored}</p>
                <p className="text-sm text-slate-500 mt-1">
                  {stats.total_submissions > 0
                    ? `${((stats.total_scored / stats.total_submissions) * 100).toFixed(0)}% of submissions`
                    : 'No submissions'}
                </p>
              </div>

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
                  Overall Mean Score
                </h2>
                <p className="text-3xl font-bold text-slate-900">
                  {meanScore !== null ? meanScore.toFixed(3) : '—'}
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  Across {overallMean.n} scored submissions
                </p>
              </div>
            </div>

            {/* Comparison Table */}
            {stats.total_scored > 0 && (
              <div className="mb-8">
                <h2 className="text-xl font-semibold text-slate-900 mb-4">
                  Your Results vs Community
                </h2>
                <ComparisonTable onModelClick={setSelectedModel} />
                {selectedModel && userSummary && (
                  <DrillDownChart
                    model={selectedModel}
                    userDateStats={userSummary.date_stats}
                    chartData={chartData}
                    onClose={() => setSelectedModel(null)}
                  />
                )}
              </div>
            )}

            {/* Contribution Impact */}
            {contributionPct && (
              <div className="bg-white shadow-sm rounded-lg p-6 mb-8">
                <h2 className="text-lg font-semibold text-slate-900 mb-2">Contribution Impact</h2>
                <p className="text-slate-700">
                  <span className="font-mono font-bold">{stats.total_submissions}</span> of{' '}
                  <span className="font-mono">{communityTotal.toLocaleString()}</span> total submissions{' '}
                  (<span className="font-bold">{contributionPct}%</span>) — your data improves
                  statistical power for the entire community.
                </p>
              </div>
            )}

            {/* Per-model detail */}
            {Object.keys(stats.model_stats).length > 0 && (
              <div className="bg-white shadow-sm rounded-lg p-6 mb-8">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Per-Model Summary</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {Object.entries(stats.model_stats)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([model, m]) => (
                      <div key={model} className="border border-slate-200 rounded-lg p-4">
                        <h3 className="font-medium text-slate-900 mb-1">{model}</h3>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-slate-500">Mean:</span>{' '}
                            <span className="font-mono">{m.n > 0 ? m.mean.toFixed(3) : '—'}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Variance:</span>{' '}
                            <span className="font-mono">{m.n >= 2 ? m.variance.toFixed(4) : '—'}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Scored:</span>{' '}
                            <span className="font-mono">{m.n}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Total:</span>{' '}
                            <span className="font-mono">{m.count}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* No scored data prompt */}
            {stats.total_scored === 0 && stats.total_submissions > 0 && (
              <div className="bg-blue-50 border-l-4 border-blue-600 p-6 mb-8">
                <h2 className="font-semibold text-blue-950 mb-2">No scored submissions</h2>
                <p className="text-sm text-blue-900">
                  Your {stats.total_submissions} submissions don't include scores. To enable statistical
                  analysis, include a <code className="bg-slate-800 text-slate-100 px-1.5 py-0.5 rounded font-mono text-xs">score</code> field
                  (0–1) in your submissions.
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
