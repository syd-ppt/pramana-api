import { useState, useEffect, useMemo } from 'react';
import DriftChart from '@/components/DriftChart';
import FilterPanel, { Filters } from '@/components/FilterPanel';
import Button from '@/components/Button';
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

  // Build model table from latest data
  const modelTableData = useMemo(() => {
    return displayModels.map((model) => {
      let totalSubs = 0;
      let totalPrompts = 0;
      let totalDrifted = 0;
      let totalPromptsTested = 0;
      let lastActive: string | null = null;

      for (const point of chartData) {
        const subs = point[model] as number | undefined;
        if (subs && subs > 0) {
          totalSubs += subs;
          totalPrompts += (point[`${model}_prompts`] as number) || 0;
          totalDrifted += (point[`${model}_drifted`] as number) || 0;
          totalPromptsTested += (point[`${model}_prompts`] as number) || 0;
          if (!lastActive || point.date > lastActive) lastActive = point.date as string;
        }
      }

      const consistency = totalPromptsTested > 0
        ? (totalPromptsTested - totalDrifted) / totalPromptsTested
        : 1.0;

      return { model, totalSubs, totalPrompts, consistency, lastActive };
    });
  }, [displayModels, chartData]);

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Pramana</h1>
          <p className="text-lg text-slate-600">Crowdsourced LLM drift detection platform</p>
          <div className="flex gap-4 mt-2 text-sm text-slate-500">
            {totalSubmissions > 0 && <span>{totalSubmissions.toLocaleString()} submissions</span>}
            {displayModels.length > 0 && <span>{displayModels.length} models</span>}
            {totalContributors > 0 && <span>{totalContributors.toLocaleString()} contributors</span>}
          </div>
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
            <DriftChart data={chartData} models={displayModels} />

            {/* Model Table */}
            <div className="bg-white rounded-lg shadow-sm overflow-x-auto mt-6">
              <h2 className="text-lg font-semibold text-slate-900 px-4 pt-4">Models</h2>
              <table className="w-full text-sm mt-3">
                <thead>
                  <tr className="border-b border-slate-200 text-left">
                    <th className="px-4 py-2 font-semibold text-slate-700">Model</th>
                    <th className="px-4 py-2 font-semibold text-slate-700">Submissions</th>
                    <th className="px-4 py-2 font-semibold text-slate-700">Prompts Tested</th>
                    <th className="px-4 py-2 font-semibold text-slate-700">Consistency</th>
                    <th className="px-4 py-2 font-semibold text-slate-700">Last Active</th>
                  </tr>
                </thead>
                <tbody>
                  {modelTableData.map((row) => (
                    <tr key={row.model} className="border-b border-slate-100">
                      <td className="px-4 py-2 font-medium text-slate-900">{row.model}</td>
                      <td className="px-4 py-2 font-mono">{row.totalSubs}</td>
                      <td className="px-4 py-2 font-mono">{row.totalPrompts}</td>
                      <td className="px-4 py-2">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          row.consistency >= 0.95 ? 'bg-green-100 text-green-800' :
                          row.consistency >= 0.80 ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {(row.consistency * 100).toFixed(0)}%
                        </span>
                      </td>
                      <td className="px-4 py-2 text-slate-600">{row.lastActive ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* About / CTA */}
        <div className="bg-white p-6 sm:p-8 rounded-lg shadow-sm mt-8">
          <h2 className="text-2xl font-bold mb-4 text-slate-900">About Pramana</h2>
          <p className="text-base text-slate-700 mb-3">
            Pramana detects LLM drift through crowdsourced output consistency tracking.
            Same prompt + same model + different output = drift detected.
          </p>
          <p className="text-base text-slate-700 mb-6">
            Run evals locally: <code className="bg-slate-800 text-slate-100 px-3 py-1.5 rounded font-mono text-sm">uvx pramana run --tier cheap --model gpt-5.2</code>
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
