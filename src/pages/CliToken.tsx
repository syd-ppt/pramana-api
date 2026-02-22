import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/lib/auth';
import CopyButton from '@/components/CopyButton';
import Button from '@/components/Button';

export default function CliToken() {
  const { session, status } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (status === 'unauthenticated') {
      navigate('/auth/signin', { replace: true });
    }
  }, [status, navigate]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-mesh flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-[var(--border-glass)] border-t-[var(--accent-violet)] rounded-full"
          style={{ boxShadow: 'var(--glow-violet)' }} />
      </div>
    );
  }

  if (!session) return null;

  const token = session.token;

  return (
    <div className="min-h-screen bg-mesh">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="glass-elevated rounded-2xl p-8">
          <h1 className="text-3xl font-bold text-[var(--text-primary)] tracking-tight mb-4">
            Your CLI Token
          </h1>

          <p className="text-sm text-[var(--text-secondary)] mb-6">
            Use this token to authenticate the Pramana CLI and link your submissions
            to your account.
          </p>

          <div className="bg-[var(--bg-surface)] rounded-xl p-4 mb-6 relative border border-[var(--border-subtle)]">
            <code className="text-[var(--accent-cyan)] break-all font-mono text-sm">
              {token}
            </code>
            <CopyButton text={token} />
          </div>

          <div className="glass rounded-xl border-l-4 border-[var(--accent-cyan)] p-5 mb-6">
            <h2 className="font-semibold text-[var(--text-primary)] mb-3 text-sm">
              Setup Instructions
            </h2>
            <ol className="list-decimal list-inside space-y-2 text-sm text-[var(--text-secondary)]">
              <li>Copy the token above</li>
              <li>Open your terminal</li>
              <li>Run: <code className="bg-[var(--bg-surface)] text-[var(--accent-cyan)] px-2 py-0.5 rounded font-mono text-xs">pramana login</code></li>
              <li>Paste the token when prompted</li>
            </ol>
          </div>

          <div className="glass rounded-xl border-l-4 border-[var(--accent-amber)] p-5">
            <h2 className="font-semibold text-[var(--accent-amber)] mb-2 text-sm">
              Security Notice
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              This token is your session credential — treat it like a password.
              It expires after 30 days. Do not share it publicly.
              Revoke access anytime by signing out.
            </p>
          </div>

          <div className="mt-8 text-center">
            <Button href="/my-stats" variant="ghost" size="md">
              View Your Stats
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
