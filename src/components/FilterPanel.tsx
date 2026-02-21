import { useState } from 'react';

interface FilterPanelProps {
  onFilterChange: (filters: Filters) => void;
  availableModels: string[];
}

export interface Filters {
  startDate: string;
  endDate: string;
  selectedModels: string[];
}

export default function FilterPanel({ onFilterChange, availableModels }: FilterPanelProps) {
  const [filters, setFilters] = useState<Filters>({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    selectedModels: [],
  });

  const updateFilters = (updates: Partial<Filters>) => {
    const newFilters = { ...filters, ...updates };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow mb-6">
      <h3 className="text-lg font-semibold mb-4 text-slate-800">Filters</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Date Range */}
        <div>
          <label className="block text-sm font-medium mb-1 text-slate-700">Start Date</label>
          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => updateFilters({ startDate: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-md bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1 text-slate-700">End Date</label>
          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => updateFilters({ endDate: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-md bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Model Selection */}
        <div>
          <label className="block text-sm font-medium mb-1 text-slate-700">
            Models {filters.selectedModels.length === 0 && availableModels.length > 0 && (
              <span className="text-slate-400 font-normal">(showing all)</span>
            )}
          </label>
          <select
            multiple
            value={filters.selectedModels}
            onChange={(e) =>
              updateFilters({
                selectedModels: Array.from(e.target.selectedOptions, option => option.value),
              })
            }
            className="w-full px-3 py-2 border border-slate-300 rounded-md bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent [&>option:checked]:bg-blue-600 [&>option:checked]:text-white [&>option]:py-2 h-24 sm:h-20"
          >
            {availableModels.map(model => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
