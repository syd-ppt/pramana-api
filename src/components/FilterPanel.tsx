import { useState } from 'react';
import type { Granularity } from '@/lib/types';
import MultiSelect from '@/components/MultiSelect';

interface FilterPanelProps {
  onFilterChange: (filters: Filters) => void;
  availableModels: string[];
}

export interface Filters {
  startDate: string;
  endDate: string;
  selectedModels: string[];
  granularity: Granularity;
}

export default function FilterPanel({ onFilterChange, availableModels }: FilterPanelProps) {
  const [filters, setFilters] = useState<Filters>({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    selectedModels: [],
    granularity: '4h',
  });

  const updateFilters = (updates: Partial<Filters>) => {
    const newFilters = { ...filters, ...updates };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  return (
    <div className="glass-elevated rounded-2xl p-5 mb-6">
      <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-4">Filters</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
          <label className="block text-xs font-medium mb-1.5 text-[var(--text-secondary)]">Models</label>
          <MultiSelect
            options={availableModels}
            selected={filters.selectedModels}
            onChange={(sel) => updateFilters({ selectedModels: sel })}
            placeholder="All models"
          />
        </div>

        <div>
          <label className="block text-xs font-medium mb-1.5 text-[var(--text-secondary)]">Granularity</label>
          <select
            value={filters.granularity}
            onChange={(e) => updateFilters({ granularity: e.target.value as Granularity })}
            className="w-full px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border-glass)] rounded-lg text-[var(--text-primary)] text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[var(--accent-violet)] focus:border-transparent transition-all"
          >
            <option value="1h">1 hour</option>
            <option value="2h">2 hours</option>
            <option value="4h">4 hours</option>
            <option value="6h">6 hours</option>
            <option value="8h">8 hours</option>
            <option value="1d">1 day</option>
          </select>
        </div>
      </div>
    </div>
  );
}
