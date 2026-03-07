import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface MultiSelectProps {
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
}

export default function MultiSelect({ options, selected, onChange, placeholder = 'All' }: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (ref.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
    if (!open) setSearch('');
  }, [open]);

  const filtered = search
    ? options.filter(o => o.toLowerCase().includes(search.toLowerCase()))
    : options;

  const label = selected.length === 0
    ? placeholder
    : selected.length === options.length
      ? placeholder
      : `${selected.length} selected`;

  const buttonRef = useRef<HTMLButtonElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 });

  const toggleDropdown = () => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    }
    setOpen(!open);
  };

  function toggle(value: string) {
    const next = selected.includes(value)
      ? selected.filter(v => v !== value)
      : [...selected, value];
    onChange(next);
  }

  function selectAll() {
    onChange([]);
  }

  return (
    <div ref={ref} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleDropdown}
        className="w-full px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border-glass)] rounded-lg text-[var(--text-primary)] text-sm font-mono text-left focus:outline-none focus:ring-2 focus:ring-[var(--accent-violet)] focus:border-transparent transition-all flex items-center justify-between"
      >
        <span className={selected.length === 0 ? 'text-[var(--text-muted)]' : ''}>{label}</span>
        <svg className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && createPortal(
        <div ref={dropdownRef} className="fixed z-50 glass-elevated rounded-lg border border-[var(--border-glass)] py-1" style={{ top: `${dropdownPos.top}px`, left: `${dropdownPos.left}px`, width: `${dropdownPos.width}px`, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
          <div className="px-2 py-1.5">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full px-2.5 py-1.5 bg-[var(--bg-surface)] border border-[var(--border-glass)] rounded-md text-[var(--text-primary)] text-xs font-mono placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-violet)]"
            />
          </div>
          <button
            type="button"
            onClick={selectAll}
            className="w-full px-3 py-1.5 text-left text-xs font-medium text-[var(--accent-cyan)] hover:bg-[var(--bg-surface)] transition-colors"
          >
            {selected.length === 0 ? 'Showing all' : 'Show all'}
          </button>
          <div className="border-t border-[var(--border-subtle)] my-1" />
          <div className="max-h-48 overflow-y-auto">
          {filtered.map(opt => {
            const checked = selected.length === 0 || selected.includes(opt);
            return (
              <label
                key={opt}
                className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer hover:bg-[var(--bg-surface)] transition-colors"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(opt)}
                  className="rounded border-[var(--border-glass)] bg-[var(--bg-surface)] text-[var(--accent-violet)] focus:ring-[var(--accent-violet)] focus:ring-offset-0 h-3.5 w-3.5"
                />
                <span className="text-sm font-mono text-[var(--text-primary)] truncate">{opt}</span>
              </label>
            );
          })}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
