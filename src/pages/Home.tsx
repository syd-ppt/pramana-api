import { useState, useEffect, useMemo } from 'react';
import DriftChart from '@/components/DriftChart';
import FilterPanel, { Filters } from '@/components/FilterPanel';
import StatisticalBadge from '@/components/StatisticalBadge';
import ModelSummaryCard from '@/components/ModelSummaryCard';
import MethodologyPanel from '@/components/MethodologyPanel';
import Button from '@/components/Button';
import {
  detectDegradationFromStats,
  poolStats,
  holmBonferroni,
  type DegradationResult,
  type SummaryStats,
} from '@/lib/statistics';
import type { ChartDataPoint, ChartApiResponse } from '@/lib/types';

const COLORS = ['#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed'];

function getDayStats(data: ChartDataPoint[], model: string, days: number): SummaryStats[] {
  const recent = data.slice(-days);
  return recent
    .filter((d) => d[`${model}_n`] != null && (d[`${model}_n`] as number) > 0)
    .map((d) => ({
      n: d[`${model}_n`] as number,
      mean: d[model] as number,
      variance: d[`${model}_variance`] as number,
    }));
}

export default function Home() {
  const [filters, setFilters] = useState<Filters>({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    selectedModels: [],
  });

  const [rawData, setRawData] = useState<ChartDataPoint[]>([]);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [totalSubmissions, setTotalSubmissions] = useState(0);
  const [totalScored, setTotalScored] = useState(0);
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
        setTotalScored(json.total_scored || 0);
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

  // Degradation detection: pool recent 7 vs baseline 7 per model, then Holm-Bonferroni
  const { degradationResults, adjustedPValues } = useMemo(() => {
    const results = new Map<string, DegradationResult>();
    const pValues: { key: string; p: number }[] = [];

    for (const model of displayModels) {
      const recent7 = getDayStats(chartData, model, 7);
      const prior7 = getDayStats(chartData.slice(0, -7), model, 7);

      const recentPooled = poolStats(recent7);
      const baselinePooled = poolStats(prior7);

      const result = detectDegradationFromStats(recentPooled, baselinePooled);
      results.set(model, result);
      pValues.push({ key: model, p: result.pValue });
    }

    const adjusted = holmBonferroni(pValues);
    return { degradationResults: results, adjustedPValues: adjusted };
  }, [chartData, displayModels]);

  // Build summary table data
  const summaryTableData = useMemo(() => {
    return displayModels.map((model) => {
      const result = degradationResults.get(model);
      const adj = adjustedPValues.get(model);
      const recent7 = getDayStats(chartData, model, 7);
      const prior7 = getDayStats(chartData.slice(0, -7), model, 7);
      const recentPooled = poolStats(recent7);
      const baselinePooled = poolStats(prior7);

      return {
        model,
        n: recentPooled.n,
        baselineMean: baselinePooled.mean,
        recentMean: recentPooled.mean,
        delta: recentPooled.n > 0 && baselinePooled.n > 0 ? recentPooled.mean - baselinePooled.mean : null,
        pAdjusted: adj?.adjusted ?? null,
        significant: adj?.significant ?? false,
        cohensD: result?.effectSize ?? null,
        effectLabel: result?.effectLabel ?? 'negligible',
      };
    });
  }, [displayModels, chartData, degradationResults, adjustedPValues]);

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Pramana</h1>
          <p className="text-lg text-slate-600">Crowdsourced LLM drift detection platform</p>
          <div className="flex gap-4 mt-2 text-sm text-slate-500">
            {totalSubmissions > 0 && <span>{totalSubmissions.toLocaleString()} submissions</span>}
            {totalScored > 0 && <span>{totalScored.toLocaleString()} scored</span>}
            {displayModels.length > 0 && <span>{displayModels.length} models</span>}
          </div>
        </header>

        {/* Model Status Bar */}
        {!loading && !error && chartData.length > 0 && (
          <div className="mb-6 flex flex-wrap gap-2">
            {displayModels.map((model) => {
              const result = degradationResults.get(model);
              const adj = adjustedPValues.get(model);
              if (!result) return null;
              return (
                <StatisticalBadge
                  key={model}
                  model={model}
                  result={result}
                  pAdjusted={adj?.adjusted}
                />
              );
            })}
          </div>
        )}

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
            {/* DriftChart */}
            <DriftChart data={chartData} models={displayModels} />

            {/* Model Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
              {displayModels.map((model, idx) => (
                <ModelSummaryCard
                  key={model}
                  model={model}
                  data={chartData}
                  color={COLORS[idx % COLORS.length]}
                />
              ))}
            </div>

            {/* Statistical Summary Table */}
            <div className="bg-white rounded-lg shadow-sm overflow-x-auto mt-6">
              <h2 className="text-lg font-semibold text-slate-900 px-4 pt-4">Statistical Summary</h2>
              <table className="w-full text-sm mt-3">
                <thead>
                  <tr className="border-b border-slate-200 text-left">
                    <th className="px-4 py-2 font-semibold text-slate-700">Model</th>
                    <th className="px-4 py-2 font-semibold text-slate-700">n</th>
                    <th className="px-4 py-2 font-semibold text-slate-700">Baseline</th>
                    <th className="px-4 py-2 font-semibold text-slate-700">Recent</th>
                    <th className="px-4 py-2 font-semibold text-slate-700">&Delta;</th>
                    <th className="px-4 py-2 font-semibold text-slate-700">p (adj.)</th>
                    <th className="px-4 py-2 font-semibold text-slate-700">d</th>
                    <th className="px-4 py-2 font-semibold text-slate-700">Effect</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryTableData.map((row) => (
                    <tr key={row.model} className="border-b border-slate-100">
                      <td className="px-4 py-2 font-medium text-slate-900">{row.model}</td>
                      <td className="px-4 py-2 font-mono">{row.n}</td>
                      <td className="px-4 py-2 font-mono">{row.baselineMean > 0 ? row.baselineMean.toFixed(3) : '—'}</td>
                      <td className="px-4 py-2 font-mono">{row.recentMean > 0 ? row.recentMean.toFixed(3) : '—'}</td>
                      <td className={`px-4 py-2 font-mono ${row.delta !== null && row.delta < 0 ? 'text-red-600' : row.delta !== null && row.delta > 0 ? 'text-green-600' : ''}`}>
                        {row.delta !== null ? (row.delta > 0 ? '+' : '') + row.delta.toFixed(3) : '—'}
                      </td>
                      <td className="px-4 py-2 font-mono">
                        <span className={row.significant ? 'font-bold text-red-700' : ''}>
                          {row.pAdjusted !== null ? (row.pAdjusted < 0.001 ? '<0.001' : row.pAdjusted.toFixed(3)) : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-2 font-mono">{row.cohensD !== null ? row.cohensD.toFixed(3) : '—'}</td>
                      <td className="px-4 py-2">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          row.effectLabel === 'large' ? 'bg-red-100 text-red-800' :
                          row.effectLabel === 'medium' ? 'bg-orange-100 text-orange-800' :
                          row.effectLabel === 'small' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {row.effectLabel}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Methodology Panel */}
        <MethodologyPanel />

        {/* About / CTA */}
        <div className="bg-white p-6 sm:p-8 rounded-lg shadow-sm mt-8">
          <h2 className="text-2xl font-bold mb-4 text-slate-900">About Pramana</h2>
          <p className="text-base text-slate-700 mb-3">
            Pramana provides scientific data on LLM model drift through crowdsourced eval runs.
            Statistical hypothesis testing (Welch's t-test, Cohen's d, Holm-Bonferroni correction) — not heuristics.
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
