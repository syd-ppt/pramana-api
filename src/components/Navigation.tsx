import { Link } from 'react-router';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import Button from './Button';

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const label = theme === 'future' ? 'Switch to Bare' : 'Switch to Future';

  return (
    <button
      onClick={toggleTheme}
      title={label}
      aria-label={label}
      className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-overlay)] transition-all"
    >
      {theme === 'future' ? (
        /* Sun icon */
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      ) : (
        /* Moon icon */
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}

export default function Navigation() {
  const { session, status, signOut } = useAuth();

  return (
    <nav className="glass border-b border-[var(--border-subtle)] sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-14">
          <div className="flex items-center gap-2">
            <Link to="/" className="text-lg font-bold text-shimmer hover:opacity-80 transition-opacity">
              Pramana
            </Link>
            <ThemeToggle />
          </div>

          <div className="flex items-center gap-2">
            {status === 'loading' ? (
              <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                <div className="animate-spin h-4 w-4 border-2 border-[var(--border-glass)] border-t-[var(--accent-violet)] rounded-full" />
              </div>
            ) : session ? (
              <>
                <Link
                  to="/my-stats"
                  className="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-3 py-1.5 rounded-lg hover:bg-[var(--hover-overlay)] transition-all"
                >
                  My Stats
                </Link>
                <Link
                  to="/cli-token"
                  className="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-3 py-1.5 rounded-lg hover:bg-[var(--hover-overlay)] transition-all"
                >
                  CLI Token
                </Link>
                <button
                  onClick={() => signOut()}
                  className="text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-secondary)] px-3 py-1.5 rounded-lg hover:bg-[var(--hover-overlay)] transition-all"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <Button href="/auth/signin" variant="primary" size="sm">
                Sign In
              </Button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
