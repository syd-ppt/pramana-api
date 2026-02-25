import { useState } from 'react';

interface CopyButtonProps {
  text: string;
  compact?: boolean;
}

export default function CopyButton({ text, compact }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (compact) {
    return (
      <button
        onClick={handleCopy}
        className="shrink-0 p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--accent-cyan)] hover:bg-[var(--bg-surface)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-violet)]"
        aria-label={copied ? 'Copied' : 'Copy command to clipboard'}
        title={copied ? 'Copied!' : 'Copy'}
      >
        {copied ? (
          <svg className="w-4 h-4 text-[var(--status-good)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        )}
      </button>
    );
  }

  return (
    <button
      onClick={handleCopy}
      className="absolute top-3 right-3 bg-[var(--accent-violet)] hover:bg-[#7c3aed] text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-[var(--accent-violet)] focus:ring-offset-2 focus:ring-offset-[var(--bg-surface)] disabled:opacity-50 shadow-[0_0_12px_rgba(139,92,246,0.3)]"
      disabled={copied}
      aria-label="Copy token to clipboard"
    >
      {copied ? (
        <span className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Copied
        </span>
      ) : (
        'Copy'
      )}
    </button>
  );
}
