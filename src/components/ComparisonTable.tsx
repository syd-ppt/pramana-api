import { useState, useEffect } from 'react';
import type { ModelComparison, ComparisonApiResponse } from '@/lib/types';

interface ComparisonTableProps {
  onModelClick?: (model: string) => void;
}

function formatCI(ci: { lower: number; upper: number }): string {
  return `[${ci.lower.toFixed(3)}, ${ci.upper.toFixed(3)}]`;
}

function formatP(p: number | null): string {
  if (p === null) return '—';
  if (p < 0.001) return '<0.001';
  return p.toFixed(3);
}

function sampleBadge(n: number): { label: string; className: string } {
  if (n < 10) return { label: 'Insufficient', className: 'bg-red-100 text-red-800' };
  if (n < 30) return { label: 'Low power', className: 'bg-yellow-100 text-yellow-800' };
  if (n < 100) return { label: 'Adequate', className: 'bg-blue-100 text-blue-800' };
  return { label: 'High power', className: 'bg-green-100 text-green-800' };
}

function rowColor(comp: ModelComparison): string {
  if (!comp.significant || comp.p_adjusted === null) return '';
  if (comp.user_mean > comp.community_mean) return 'bg-green-50';
  if (comp.user_mean < comp.community_mean) return 'bg-red-50';
  return '';
}

export default function ComparisonTable({ onModelClick }: ComparisonTableProps) {
  const [data, setData] = useState<ModelComparison[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/user/me/comparison', { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json() as Promise<ComparisonApiResponse>;
      })
      .then((json) => setData(json.comparisons))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="animate-spin h-6 w-6 border-4 border-slate-300 border-t-slate-600 rounded-full mx-auto" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border-l-4 border-red-600 p-4">
        <p className="text-red-900 text-sm">Failed to load comparison data: {error}</p>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6">
        <p className="text-slate-600 text-sm">No scored submissions to compare yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left">
            <th className="px-4 py-3 font-semibold text-slate-700">Model</th>
            <th className="px-4 py-3 font-semibold text-slate-700">Your Mean (&plusmn;CI)</th>
            <th className="px-4 py-3 font-semibold text-slate-700">Community Mean (&plusmn;CI)</th>
            <th className="px-4 py-3 font-semibold text-slate-700">Welch's t</th>
            <th className="px-4 py-3 font-semibold text-slate-700">p (adj.)</th>
            <th className="px-4 py-3 font-semibold text-slate-700">Cohen's d</th>
            <th className="px-4 py-3 font-semibold text-slate-700">Effect</th>
          </tr>
        </thead>
        <tbody>
          {data.map((comp) => {
            const userBadge = sampleBadge(comp.user_n);
            const commBadge = sampleBadge(comp.community_n);
            return (
              <tr
                key={comp.model}
                className={`border-b border-slate-100 hover:bg-slate-50 ${rowColor(comp)} ${onModelClick ? 'cursor-pointer' : ''}`}
                onClick={() => onModelClick?.(comp.model)}
              >
                <td className="px-4 py-3 font-medium text-slate-900">{comp.model}</td>
                <td className="px-4 py-3">
                  <span className="font-mono">{comp.user_mean.toFixed(3)}</span>
                  <span className="text-slate-500 text-xs ml-1">{formatCI(comp.user_ci)}</span>
                  <span className={`ml-1 text-xs px-1.5 py-0.5 rounded ${userBadge.className}`}>
                    n={comp.user_n}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono">{comp.community_mean.toFixed(3)}</span>
                  <span className="text-slate-500 text-xs ml-1">{formatCI(comp.community_ci)}</span>
                  <span className={`ml-1 text-xs px-1.5 py-0.5 rounded ${commBadge.className}`}>
                    n={comp.community_n}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono">
                  {comp.welch_t !== null ? comp.welch_t.toFixed(3) : '—'}
                </td>
                <td className="px-4 py-3 font-mono">
                  <span className={comp.significant ? 'font-bold text-red-700' : ''}>
                    {formatP(comp.p_adjusted)}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono">
                  {comp.cohens_d !== null ? comp.cohens_d.toFixed(3) : '—'}
                </td>
                <td className="px-4 py-3">
                  {comp.effect ? (
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      comp.effect === 'large' ? 'bg-red-100 text-red-800' :
                      comp.effect === 'medium' ? 'bg-orange-100 text-orange-800' :
                      comp.effect === 'small' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-green-100 text-green-800'
                    }`}>
                      {comp.effect}
                    </span>
                  ) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
