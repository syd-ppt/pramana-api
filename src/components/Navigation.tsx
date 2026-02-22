import { Link } from 'react-router';
import { useAuth } from '@/lib/auth';
import Button from './Button';

export default function Navigation() {
  const { session, status, signOut } = useAuth();

  return (
    <nav className="glass border-b border-[var(--border-subtle)] sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-14">
          <div className="flex items-center">
            <Link to="/" className="text-lg font-bold text-shimmer hover:opacity-80 transition-opacity">
              Pramana
            </Link>
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
                  className="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-3 py-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.05)] transition-all"
                >
                  My Stats
                </Link>
                <Link
                  to="/cli-token"
                  className="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-3 py-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.05)] transition-all"
                >
                  CLI Token
                </Link>
                <button
                  onClick={() => signOut()}
                  className="text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-secondary)] px-3 py-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.05)] transition-all"
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
