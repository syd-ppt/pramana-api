import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export type Theme = 'bare' | 'future';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  chartColors: string[];
}

const CHART_COLORS: Record<Theme, string[]> = {
  future: ['#818cf8', '#f472b6', '#34d399', '#fbbf24', '#22d3ee'],
  bare: ['#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed'],
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem('pramana-theme');
    if (stored === 'bare' || stored === 'future') return stored;
  } catch { /* SSR / blocked storage */ }
  return 'future';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  function apply(t: Theme) {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('pramana-theme', t); } catch { /* noop */ }
  }

  useEffect(() => { apply(theme); }, [theme]);

  function setTheme(t: Theme) { setThemeState(t); }
  function toggleTheme() { setThemeState((prev) => (prev === 'future' ? 'bare' : 'future')); }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, chartColors: CHART_COLORS[theme] }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
