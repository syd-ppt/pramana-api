import { Link } from 'react-router';
import { useAuth } from '@/lib/auth';
import Button from './Button';

export default function Navigation() {
  const { session, status, signOut } = useAuth();

  return (
    <nav className="bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link to="/" className="text-xl font-bold text-slate-900 hover:text-slate-700 transition-colors">
              Pramana
            </Link>
          </div>

          <div className="flex items-center gap-3">
            {status === 'loading' ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <div className="animate-spin h-4 w-4 border-2 border-slate-300 border-t-slate-600 rounded-full"></div>
                Loading...
              </div>
            ) : session ? (
              <>
                <Link
                  to="/my-stats"
                  className="text-sm font-medium text-slate-700 hover:text-slate-900 px-3 py-2 rounded-md hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500"
                >
                  My Stats
                </Link>
                <Link
                  to="/cli-token"
                  className="text-sm font-medium text-slate-700 hover:text-slate-900 px-3 py-2 rounded-md hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500"
                >
                  CLI Token
                </Link>
                <button
                  onClick={() => signOut()}
                  className="text-sm font-medium text-slate-600 hover:text-slate-800 px-3 py-2 rounded-md hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <Button href="/auth/signin" variant="primary" size="md">
                Sign In
              </Button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
