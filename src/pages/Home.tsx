import { useState, useEffect, useMemo } from 'react';
import DriftChart from '@/components/DriftChart';
import type { ChartView } from '@/components/DriftChart';
import FilterPanel from '@/components/FilterPanel';
import type { Filters } from '@/components/FilterPanel';
import Button from '@/components/Button';
import type { ChartDataPoint, ChartApiResponse } from '@/lib/types';

const VIEW_OPTIONS: { value: ChartView; label: string }[] = [
  { value: 'consistency', label: 'Consistency' },
  { value: 'dual', label: 'Consistency + Activity' },
  { value: 'drift-events', label: 'Drift Events' },
];

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

export default function Home() {
  const [filters, setFilters] = useState<Filters>({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    selectedModels: [],
  });

  const [chartView, setChartView] = useState<ChartView>('consistency');
  const [rawData, setRawData] = useState<ChartDataPoint[]>([]);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [totalSubmissions, setTotalSubmissions] = useState(0);
  const [totalContributors, setTotalContributors] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch('/api/data/chart');
        if (!res.ok) throw new Error(`API error: ${res.status}`);

        const json = await res.json() as ChartApiResponse;
        if (cancelled) return;

        setRawData(json.data || []);
        setTotalSubmissions(json.total_submissions || 0);
        setTotalContributors(json.total_contributors || 0);
        if (json.models?.length > 0) setAvailableModels(json.models);
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load data:', err);
          setError(err instanceof Error ? err.message : 'Failed to load data');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadData();
    return () => { cancelled = true; };
  }, []);

  const chartData = useMemo(() => {
    return rawData.filter((d) => {
      if (d.date < filters.startDate || d.date > filters.endDate) return false;
      return true;
    });
  }, [rawData, filters.startDate, filters.endDate]);

  const displayModels = filters.selectedModels.length > 0
    ? filters.selectedModels
    : availableModels;

  // Weighted average consistency from latest data point
  const overallConsistency = useMemo(() => {
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

  // Model table: sorted by consistency ascending (worst first)
  const modelTableData = useMemo(() => {
    const rows = displayModels.map((model) => {
      let totalSubs = 0;
      let totalPrompts = 0;
      let totalDrifted = 0;
      let lastActive: string | null = null;

      for (const point of chartData) {
        const subs = point[model] as number | undefined;
        if (subs && subs > 0) {
          totalSubs += subs;
          totalPrompts += (point[`${model}_prompts`] as number) || 0;
          totalDrifted += (point[`${model}_drifted`] as number) || 0;
          if (!lastActive || point.date > lastActive) lastActive = point.date as string;
        }
      }

      const consistency = totalPrompts > 0
        ? (totalPrompts - totalDrifted) / totalPrompts
        : 1.0;

      return { model, totalSubs, totalPrompts, totalDrifted, consistency, lastActive };
    });

    return rows.sort((a, b) => a.consistency - b.consistency);
  }, [displayModels, chartData]);

  return (
    <main className="min-h-screen bg-mesh">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Hero Header */}
        <header className="mb-10">
          <h1 className="text-5xl font-bold tracking-tight text-shimmer mb-3">Pramana</h1>
          <p className="text-base text-[var(--text-secondary)]">Crowdsourced LLM drift detection</p>

          {/* Stat pills */}
          <div className="flex flex-wrap gap-3 mt-5">
            {overallConsistency !== null && (
              <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-mono font-semibold ${consistencyBadgeClass(overallConsistency)}`}>
                <span className="w-1.5 h-1.5 rounded-full pulse-glow" style={{
                  backgroundColor: overallConsistency >= 0.95 ? 'var(--status-good)' : overallConsistency >= 0.80 ? 'var(--status-warn)' : 'var(--status-bad)',
                }} />
                {(overallConsistency * 100).toFixed(1)}% overall
              </div>
            )}
            {displayModels.length > 0 && (
              <span className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-mono text-[var(--text-secondary)] bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                {displayModels.length} models
              </span>
            )}
            {totalContributors > 0 && (
              <span className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-mono text-[var(--text-secondary)] bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                {totalContributors.toLocaleString()} contributors
              </span>
            )}
            {totalSubmissions > 0 && (
              <span className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-mono text-[var(--text-secondary)] bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                {totalSubmissions.toLocaleString()} submissions
              </span>
            )}
          </div>
        </header>

        <FilterPanel
          onFilterChange={setFilters}
          availableModels={availableModels}
        />

        {error && (
          <div className="glass rounded-xl border-l-4 border-[var(--accent-rose)] p-5 mb-6">
            <p className="text-[var(--accent-rose)] font-semibold text-sm">Error loading data</p>
            <p className="text-[var(--text-secondary)] text-sm mt-1">{error}</p>
          </div>
        )}

        {!loading && !error && chartData.length === 0 && (
          <div className="glass rounded-xl border-l-4 border-[var(--accent-cyan)] p-6 mb-6">
            <h3 className="text-[var(--text-primary)] font-semibold mb-2">No data yet</h3>
            <p className="text-[var(--text-secondary)] text-sm mb-3">
              No eval submissions found. Start submitting results from the CLI:
            </p>
            <code className="block bg-[var(--bg-surface)] text-[var(--accent-cyan)] px-4 py-2.5 rounded-lg font-mono text-sm border border-[var(--border-subtle)]">
              uvx pramana run --tier cheap --model gpt-4
            </code>
          </div>
        )}

        {loading && !error && (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin h-8 w-8 border-2 border-[var(--border-glass)] border-t-[var(--accent-violet)] rounded-full"
              style={{ boxShadow: 'var(--glow-violet)' }} />
            <span className="ml-3 text-[var(--text-muted)] text-sm">Loading data...</span>
          </div>
        )}

        {!loading && !error && chartData.length > 0 && (
          <>
            {/* View Toggle */}
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

            <DriftChart data={chartData} models={displayModels} view={chartView} />

            {/* Model Table */}
            <div className="glass-elevated rounded-2xl overflow-hidden mt-6">
              <div className="px-5 pt-5 pb-3">
                <h2 className="text-lg font-semibold text-[var(--text-primary)] tracking-tight">Models</h2>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">Sorted by consistency — worst first</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border-subtle)]">
                      <th className="px-5 py-3 text-left text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Model</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Consistency</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Drift Events</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Prompts</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Submissions</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Last Active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modelTableData.map((row) => (
                      <tr key={row.model} className="border-b border-[var(--border-subtle)] table-row-hover">
                        <td className="px-5 py-3 font-medium text-[var(--text-primary)]">{row.model}</td>
                        <td className="px-5 py-3">
                          <span className={`text-xs px-2.5 py-1 rounded-full font-mono font-medium ${consistencyBadgeClass(row.consistency)}`}>
                            {(row.consistency * 100).toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`font-mono font-medium ${driftColor(row.totalDrifted)}`}>
                            {row.totalDrifted.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-5 py-3 font-mono text-[var(--text-secondary)]">{row.totalPrompts.toLocaleString()}</td>
                        <td className="px-5 py-3 font-mono text-[var(--text-secondary)]">{row.totalSubs.toLocaleString()}</td>
                        <td className="px-5 py-3 font-mono text-[var(--text-muted)] text-xs">{row.lastActive ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* About / CTA */}
        <div className="glass-elevated rounded-2xl p-6 sm:p-8 mt-8">
          <h2 className="text-2xl font-bold mb-4 text-[var(--text-primary)] tracking-tight">About Pramana</h2>
          <p className="text-sm text-[var(--text-secondary)] mb-3 leading-relaxed">
            Pramana detects LLM drift through crowdsourced output consistency tracking.
            Same prompt + same model + different output = drift detected.
          </p>
          <p className="text-sm text-[var(--text-secondary)] mb-6">
            Run evals locally:{' '}
            <code className="bg-[var(--bg-surface)] text-[var(--accent-cyan)] px-2.5 py-1 rounded-lg font-mono text-xs border border-[var(--border-subtle)]">
              uvx pramana run --tier cheap --model gpt-5.2
            </code>
          </p>
          <Button
            href="https://github.com/syd-ppt/pramana"
            variant="secondary"
            size="md"
          >
            View on GitHub
          </Button>
        </div>
      </div>
    </main>
  );
}
