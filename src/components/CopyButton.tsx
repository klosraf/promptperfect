'use client';

import { Copy } from 'lucide-react';
import { useCopy } from '@/lib/clipboard';

interface CopyButtonProps {
  text: string;
  label?: string;
  disabled?: boolean;
}

export function CopyButton({ text, label = 'Copy', disabled }: CopyButtonProps) {
  const { copied, copy } = useCopy(900);

  const canCopy = Boolean(text.trim()) && !disabled;

  return (
    <button
      type="button"
      onClick={() => {
        if (canCopy) void copy(text);
      }}
      disabled={!canCopy}
      className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white/70 px-3 py-2 text-xs font-semibold tracking-wide text-zinc-900 shadow-sm backdrop-blur transition hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-50 dark:hover:bg-zinc-950"
    >
      <Copy className="h-4 w-4" />
      {copied ? 'Copied' : label}
    </button>
  );
}

