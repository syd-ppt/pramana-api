import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/lib/auth';
import Button from '@/components/Button';
import type { UserStatsResponse, ChartApiResponse } from '@/lib/types';

export default function MyStats() {
  const { session, status } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<UserStatsResponse | null>(null);
  const [communityTotal, setCommunityTotal] = useState<number>(0);
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
        setCommunityTotal(chartResp?.total_submissions ?? 0);
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
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
                  Models Tested
                </h2>
                <p className="text-3xl font-bold text-slate-900">{stats.models_count}</p>
                <p className="text-sm text-slate-500 mt-1 truncate">
                  {stats.models_tested.length > 0 ? stats.models_tested.join(', ') : 'None yet'}
                </p>
              </div>

              <div className="bg-white shadow-sm rounded-lg p-6">
                <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-2">
                  Contribution
                </h2>
                <p className="text-3xl font-bold text-slate-900">
                  {contributionPct ? `${contributionPct}%` : '—'}
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  of {communityTotal.toLocaleString()} total submissions
                </p>
              </div>
            </div>

            {/* Per-model submissions */}
            {Object.keys(stats.model_submissions).length > 0 && (
              <div className="bg-white shadow-sm rounded-lg p-6 mb-8">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Per-Model Submissions</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {Object.entries(stats.model_submissions)
                    .sort(([, a], [, b]) => b - a)
                    .map(([model, count]) => (
                      <div key={model} className="border border-slate-200 rounded-lg p-4 flex justify-between items-center">
                        <h3 className="font-medium text-slate-900">{model}</h3>
                        <span className="font-mono text-lg text-slate-700">{count}</span>
                      </div>
                    ))}
                </div>
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
