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
            <Link
              to="/about"
              className="text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] px-2 py-1.5 rounded-lg hover:bg-[var(--hover-overlay)] transition-all"
            >
              About
            </Link>
            <a
              href="https://syd-ppt.github.io/pramana-api/"
              target="_blank"
              rel="noopener noreferrer"
              title="Docs"
              aria-label="Docs"
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-overlay)] transition-all"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
            </a>
            <a
              href="https://github.com/syd-ppt/pramana"
              target="_blank"
              rel="noopener noreferrer"
              title="GitHub"
              aria-label="GitHub"
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-overlay)] transition-all"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
              </svg>
            </a>
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
