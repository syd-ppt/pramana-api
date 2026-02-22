import { useState } from 'react';

export default function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

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
