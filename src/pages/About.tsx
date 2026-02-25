import Button from '@/components/Button';

export default function About() {
  return (
    <div className="min-h-screen bg-mesh">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="glass-elevated rounded-2xl p-8">
          <h1 className="text-3xl font-bold text-[var(--text-primary)] tracking-tight mb-2">
            About Pramana
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mb-8">
            Crowdsourced LLM drift detection via hash-based output consistency tracking.
          </p>

          {/* How it works */}
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 pb-2 border-b border-[var(--border-subtle)]">
            How It Works
          </h2>
          <div className="glass rounded-xl p-5 mb-6">
            <ol className="list-decimal list-inside space-y-3 text-sm text-[var(--text-secondary)]">
              <li>
                Run <code className="bg-[var(--bg-surface)] text-[var(--accent-cyan)] px-2 py-0.5 rounded font-mono text-xs">pramana run --tier cheap --model gpt-4o</code>.
                This sends 10 predefined prompts to the model with deterministic parameters
                (<code className="bg-[var(--bg-surface)] text-[var(--accent-cyan)] px-1.5 py-0.5 rounded font-mono text-xs">temperature=0</code>,{' '}
                <code className="bg-[var(--bg-surface)] text-[var(--accent-cyan)] px-1.5 py-0.5 rounded font-mono text-xs">seed=42</code>).
              </li>
              <li>
                Each response is checked against assertions — <strong className="text-[var(--text-primary)]">exact_match</strong>,{' '}
                <strong className="text-[var(--text-primary)]">contains</strong>,{' '}
                <strong className="text-[var(--text-primary)]">contains_any</strong>,{' '}
                <strong className="text-[var(--text-primary)]">is_json</strong> — across 6 categories:
                reasoning, factual, instruction-following, coding, safety, creative.
              </li>
              <li>
                Each output is hashed for drift detection. Same prompt + same model + same hash = no change.
              </li>
              <li>
                Submit results to the shared API. The backend appends records, runs daily aggregation,
                and serves the dashboard at{' '}
                <a href="https://pramana.pages.dev" className="text-[var(--accent-cyan)] hover:underline">pramana.pages.dev</a>.
              </li>
              <li>
                Three tiers — <strong className="text-[var(--text-primary)]">cheap</strong> (10),{' '}
                <strong className="text-[var(--text-primary)]">moderate</strong> (25),{' '}
                <strong className="text-[var(--text-primary)]">comprehensive</strong> (75) — cover
                the same 6 categories at different density.
              </li>
            </ol>
          </div>

          {/* Hash formula */}
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 pb-2 border-b border-[var(--border-subtle)]">
            Hash Formula
          </h2>
          <div className="bg-[var(--bg-surface)] rounded-xl p-4 mb-6 border border-[var(--border-subtle)]">
            <code className="text-[var(--accent-cyan)] font-mono text-sm">
              output_hash = SHA-256(model_id + "|" + prompt_id + "|" + output)
            </code>
          </div>
          <p className="text-sm text-[var(--text-secondary)] mb-6">
            Content-addressable versioning via SHA-256 ensures everyone runs the same suite version.
            Only hashes and aggregate counts are stored — not raw outputs.
          </p>

          {/* Detection signals */}
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 pb-2 border-b border-[var(--border-subtle)]">
            Detection Signals
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="glass rounded-xl border-l-4 border-[var(--accent-cyan)] p-5">
              <h3 className="font-semibold text-[var(--text-primary)] mb-2 text-sm">Pass Rate Changes</h3>
              <p className="text-sm text-[var(--text-secondary)]">
                If a prompt that used to pass now fails, the model's behavior degraded on that task.
              </p>
            </div>
            <div className="glass rounded-xl border-l-4 border-[var(--accent-violet)] p-5">
              <h3 className="font-semibold text-[var(--text-primary)] mb-2 text-sm">Hash Changes</h3>
              <p className="text-sm text-[var(--text-secondary)]">
                If the output hash changes even though parameters are identical, the model produced
                different output — catching changes that assertions alone might miss.
              </p>
            </div>
          </div>

          {/* Limitations */}
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 pb-2 border-b border-[var(--border-subtle)]">
            Limitations
          </h2>
          <div className="glass rounded-xl border-l-4 border-[var(--accent-amber)] p-5 mb-6">
            <ul className="space-y-3 text-sm text-[var(--text-secondary)]">
              <li>
                <strong className="text-[var(--accent-amber)]">Provider-dependent reproducibility.</strong>{' '}
                OpenAI respects temperature=0 + seed. Anthropic does not — even at temperature=0,
                outputs are non-deterministic. Hash-based detection is most reliable against OpenAI.
              </li>
              <li>
                <strong className="text-[var(--accent-amber)]">Value scales with contributors.</strong>{' '}
                One user's data shows their own history. Multiple independent submitters let you
                distinguish "my environment changed" from "the model changed for everyone."
              </li>
              <li>
                <strong className="text-[var(--accent-amber)]">Hash catches any change.</strong>{' '}
                Including benign ones (formatting, whitespace). It tells you <em>that</em> something
                changed, not <em>whether</em> it matters.
              </li>
            </ul>
          </div>

          {/* Architecture */}
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 pb-2 border-b border-[var(--border-subtle)]">
            Architecture
          </h2>
          <ul className="space-y-2 text-sm text-[var(--text-secondary)] mb-8">
            <li><strong className="text-[var(--text-primary)]">Stateless API</strong> — no database, no connection pools. CSV + JSON on R2.</li>
            <li><strong className="text-[var(--text-primary)]">Append-only storage</strong> — immutable results. No edits, no deletes.</li>
            <li><strong className="text-[var(--text-primary)]">Privacy-preserving</strong> — only hashes and aggregate counts stored, not raw outputs.</li>
            <li><strong className="text-[var(--text-primary)]">Zero cost</strong> — Cloudflare Pages free tier + R2 free tier = $0/month.</li>
          </ul>

          {/* CTAs */}
          <div className="flex flex-wrap gap-3 justify-center">
            <Button href="https://github.com/syd-ppt/pramana" variant="primary" size="md">
              GitHub (CLI)
            </Button>
            <Button href="https://syd-ppt.github.io/pramana/" variant="secondary" size="md">
              Documentation
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
