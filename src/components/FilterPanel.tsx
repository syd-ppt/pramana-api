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
    <div className="glass-elevated rounded-2xl p-5 mb-6">
      <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-4">Filters</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium mb-1.5 text-[var(--text-secondary)]">Start Date</label>
          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => updateFilters({ startDate: e.target.value })}
            className="w-full px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border-glass)] rounded-lg text-[var(--text-primary)] text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[var(--accent-violet)] focus:border-transparent transition-all"
          />
        </div>

        <div>
          <label className="block text-xs font-medium mb-1.5 text-[var(--text-secondary)]">End Date</label>
          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => updateFilters({ endDate: e.target.value })}
            className="w-full px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border-glass)] rounded-lg text-[var(--text-primary)] text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[var(--accent-violet)] focus:border-transparent transition-all"
          />
        </div>

        <div>
          <label className="block text-xs font-medium mb-1.5 text-[var(--text-secondary)]">
            Models {filters.selectedModels.length === 0 && availableModels.length > 0 && (
              <span className="text-[var(--text-muted)] font-normal">(showing all)</span>
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
            className="w-full px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border-glass)] rounded-lg text-[var(--text-primary)] text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[var(--accent-violet)] focus:border-transparent h-24 sm:h-20 transition-all"
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
