import { useState, useRef, useEffect } from 'react';
import type { Granularity } from '@/lib/types';

interface GranularitySelectProps {
  value: Granularity;
  onChange: (value: Granularity) => void;
}

const GRANULARITY_OPTIONS: { value: Granularity; label: string }[] = [
  { value: '1h', label: '1 hour' },
  { value: '2h', label: '2 hours' },
  { value: '4h', label: '4 hours' },
  { value: '6h', label: '6 hours' },
  { value: '8h', label: '8 hours' },
  { value: '1d', label: '1 day' },
];

export default function GranularitySelect({ value, onChange }: GranularitySelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 });

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

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

  const label = GRANULARITY_OPTIONS.find(opt => opt.value === value)?.label || value;

  return (
    <div ref={ref} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleDropdown}
        className="w-full px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border-glass)] rounded-lg text-[var(--text-primary)] text-sm font-mono text-left focus:outline-none focus:ring-2 focus:ring-[var(--accent-violet)] focus:border-transparent transition-all flex items-center justify-between"
      >
        <span>{label}</span>
        <svg className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="fixed z-50 glass-elevated rounded-lg border border-[var(--border-glass)] py-1" style={{ top: `${dropdownPos.top}px`, left: `${dropdownPos.left}px`, width: `${dropdownPos.width}px`, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
          {GRANULARITY_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={`w-full px-3 py-1.5 text-left text-sm font-mono transition-colors ${
                value === opt.value
                  ? 'bg-[var(--bg-surface)] text-[var(--accent-violet)] font-semibold'
                  : 'text-[var(--text-primary)] hover:bg-[var(--bg-surface)]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
