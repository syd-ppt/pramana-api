import { useState, useEffect, useMemo } from 'react';
import DriftChart from '@/components/DriftChart';
import FilterPanel, { Filters } from '@/components/FilterPanel';
import StatisticalBadge from '@/components/StatisticalBadge';
import Button from '@/components/Button';
import { detectDegradation, type DegradationResult } from '@/lib/statistics';
import type { ChartDataPoint, ChartApiResponse } from '@/lib/types';

export default function Home() {
  const [filters, setFilters] = useState<Filters>({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    selectedModels: [],
  });

  const [rawData, setRawData] = useState<ChartDataPoint[]>([]);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [totalSubmissions, setTotalSubmissions] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch aggregate data ONCE on mount (no params — server returns pre-aggregated JSON)
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

  // Client-side filtering by date range + selected models
  const chartData = useMemo(() => {
    return rawData.filter((d) => {
      if (d.date < filters.startDate || d.date > filters.endDate) return false;
      return true;
    });
  }, [rawData, filters.startDate, filters.endDate]);

  const displayModels = filters.selectedModels.length > 0
    ? filters.selectedModels
    : availableModels;

  // Degradation detection per model
  const degradationResults = useMemo(() => {
    const results = new Map<string, DegradationResult>();
    for (const model of displayModels) {
      const modelData = chartData.map((d) => (d[model] as number) || 0);
      const recent = modelData.slice(-7);
      const baseline = modelData.slice(-14, -7);
      if (recent.length >= 7 && baseline.length >= 7) {
        results.set(model, detectDegradation(recent, baseline));
      }
    }
    return results;
  }, [chartData, displayModels]);

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Pramana</h1>
          <p className="text-lg text-slate-600">Crowdsourced LLM drift detection platform</p>
          {totalSubmissions > 0 && (
            <p className="text-sm text-slate-500 mt-1">{totalSubmissions} total submissions</p>
          )}
        </header>

        <FilterPanel
          onFilterChange={setFilters}
          availableModels={availableModels}
        />

        {error && (
          <div className="bg-red-50 border-l-4 border-red-600 p-4 mb-6">
            <p className="text-red-950 font-semibold">Error loading data</p>
            <p className="text-red-900 text-sm">{error}</p>
          </div>
        )}

        {!loading && !error && chartData.length === 0 && (
          <div className="bg-blue-50 border-l-4 border-blue-600 p-6 mb-6">
            <h3 className="text-blue-950 font-semibold mb-2">No data yet</h3>
            <p className="text-blue-900 text-sm mb-3">
              No eval submissions found. Start submitting results from the CLI:
            </p>
            <code className="block bg-slate-800 text-slate-100 px-3 py-2 rounded font-mono text-sm">
              uvx pramana run --tier cheap --model gpt-4
            </code>
          </div>
        )}

        {loading && !error && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin h-8 w-8 border-4 border-slate-300 border-t-slate-600 rounded-full"></div>
            <span className="ml-3 text-slate-600">Loading data...</span>
          </div>
        )}

        {!loading && !error && chartData.length > 0 && (
          <>
            <div className="mb-6 flex gap-2">
              {Array.from(degradationResults.entries()).map(([model, result]) => (
                <StatisticalBadge key={model} result={result} />
              ))}
            </div>

            <DriftChart data={chartData} models={displayModels} />
          </>
        )}

        <div className="bg-white p-6 sm:p-8 rounded-lg shadow-sm mt-8">
          <h2 className="text-2xl font-bold mb-4 text-slate-900">About Pramana</h2>
          <p className="text-base text-slate-700 mb-3">
            Pramana provides scientific data on LLM model drift through crowdsourced eval runs.
          </p>
          <p className="text-base text-slate-700 mb-6">
            Run evals locally using: <code className="bg-slate-800 text-slate-100 px-3 py-1.5 rounded font-mono text-sm">uvx pramana run --tier cheap --model gpt-5.2</code>
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
