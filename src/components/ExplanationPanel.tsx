'use client';

import { ChevronDown, ChevronUp } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { SegmentedToggle } from '@/components/ui/SegmentedToggle';
import { estimateTokens } from '@/lib/promptAnalysis';
import {
  EDIT_METHOD_LABEL,
  parseStructuredChanges,
} from '@/lib/structuredChanges';
import { applyReverts, checkRevertible } from '@/lib/applyChanges';

const DiffViewLazy = dynamic(
  () => import('@/components/DiffView').then((m) => ({ default: m.DiffView })),
  { ssr: false, loading: () => <p className="text-[13px] text-muted-foreground">Loading diff…</p> },
);

interface ExplanationPanelProps {
  explanation: string;
  original?: string;
  optimized?: string;
  /** Raw ---CHANGES--- region; parsed into method-tagged items. */
  changes?: string;
}

function isBulletLine(line: string): boolean {
  const t = line.trim();
  return /^[-*•]\s+\S/.test(t) || /^\d+[.)]\s+\S/.test(t);
}

function stripBullet(line: string): string {
  return line.replace(/^[-*•]\s+/, '').replace(/^\d+[.)]\s+/, '').trim();
}

export function ExplanationPanel({
  explanation,
  original = '',
  optimized = '',
  changes = '',
}: ExplanationPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [viewMode, setViewMode] = useState<'explanation' | 'diff'>('explanation');

  const trimmed = explanation.trim();
  const hasDiffInputs = original.trim().length > 0 || optimized.trim().length > 0;
  const structuredChanges = parseStructuredChanges(changes);
  // Per-change review: indices of changes the user reverted. Keyed to the
  // current run's inputs so a new run starts unreviewed, without an effect.
  const reviewKey = `${optimized}\n---\n${changes}`;
  const [reviewState, setReviewState] = useState<{
    key: string;
    reverted: ReadonlySet<number>;
  }>({ key: '', reverted: new Set() });
  const reverted: ReadonlySet<number> =
    reviewState.key === reviewKey ? reviewState.reverted : new Set();
  const review =
    reverted.size > 0 && optimized
      ? applyReverts(optimized, structuredChanges, reverted)
      : null;
  const [reviewCopied, setReviewCopied] = useState(false);
  const toggleRevert = (index: number) => {
    const next = new Set(reverted);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setReviewState({ key: reviewKey, reverted: next });
    setReviewCopied(false);
  };
  const tokenDelta =
    original.trim() && optimized.trim()
      ? { from: estimateTokens(original), to: estimateTokens(optimized) }
      : null;

  if (!trimmed && !hasDiffInputs && structuredChanges.length === 0) return null;

  const lines = trimmed
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const allBullets = lines.length > 0 && lines.every(isBulletLine);

  return (
    <div className="rounded-[12px] border border-border bg-popover px-6 py-5 transition-colors duration-200 ease-out">
      <div className="flex w-full flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex min-w-0 flex-1 items-center justify-between text-left transition hover:bg-muted/50"
        >
          <span className="text-[13px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
            What changed and why
          </span>
          {expanded ? (
            <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
        </button>
        {hasDiffInputs && (
          <SegmentedToggle
            aria-label="View mode"
            value={viewMode}
            onChange={setViewMode}
            options={[
              { value: 'explanation', label: 'Explanation' },
              { value: 'diff', label: 'Diff View' },
            ]}
          />
        )}
      </div>
      {expanded && (
        <div className="mt-4 border-t border-border pt-4">
          {viewMode === 'diff' && hasDiffInputs ? (
            <DiffViewLazy original={original} optimized={optimized} />
          ) : trimmed ? (
            allBullets ? (
              <ul className="list-disc space-y-1.5 pl-5 text-[14px] leading-[1.7] text-foreground-dim marker:text-muted-foreground">
                {lines.map((line, i) => (
                  <li key={i}>{stripBullet(line)}</li>
                ))}
              </ul>
            ) : lines.length === 1 ? (
              <p className="whitespace-pre-wrap text-[14px] leading-[1.7] text-foreground-dim">
                {lines[0]}
              </p>
            ) : (
              <div className="whitespace-pre-wrap text-[14px] leading-[1.7] text-foreground-dim">
                {trimmed}
              </div>
            )
          ) : (
            <p className="text-[14px] text-muted-foreground">No explanation for this run.</p>
          )}
          {viewMode === 'explanation' && structuredChanges.length > 0 && (
            <div className="mt-5 border-t border-border pt-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                Changes made
              </p>
              <ul className="mt-2.5 space-y-2">
                {structuredChanges.map((c, i) => {
                  const check = optimized
                    ? checkRevertible(c, optimized)
                    : { ok: false as const, reason: 'no-spans' as const };
                  const isReverted = reverted.has(i);
                  return (
                    <li key={i} className="flex items-start gap-2.5 text-[14px] leading-[1.6] text-foreground-dim">
                      <span className="mt-0.5 shrink-0 rounded-full border border-border px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-accent-text">
                        {EDIT_METHOD_LABEL[c.method]}
                      </span>
                      <span className={isReverted ? 'line-through opacity-60' : undefined}>{c.text}</span>
                      {check.ok && (
                        <button
                          type="button"
                          onClick={() => toggleRevert(i)}
                          aria-pressed={isReverted}
                          className="mt-0.5 shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition hover:border-accent/60 hover:text-foreground"
                        >
                          {isReverted ? 'Reverted · Undo' : 'Revert'}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
              {review && (
                <div className="mt-4 rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                      Your reviewed version
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(review.text)
                          .then(() => setReviewCopied(true))
                          .catch(() => setReviewCopied(false));
                      }}
                      className="shrink-0 rounded-full border border-border px-2.5 py-1 text-[11.5px] font-medium text-foreground-dim transition hover:border-accent/60 hover:text-foreground"
                    >
                      {reviewCopied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <p className="mt-2.5 whitespace-pre-wrap text-[13.5px] leading-[1.65] text-foreground">
                    {review.text}
                  </p>
                  <p className="mt-2.5 text-[12px] text-muted-foreground">
                    {review.applied.length} change
                    {review.applied.length === 1 ? '' : 's'} reverted by exact
                    quoted-span swap.
                    {review.skipped.length > 0 &&
                      ` ${review.skipped.length} selected revert(s) no longer match the text verbatim and were left applied.`}
                  </p>
                </div>
              )}
            </div>
          )}
          {viewMode === 'explanation' && tokenDelta && (
            <p className="mt-4 text-[12px] text-muted-foreground">
              Length: ≈{tokenDelta.from} → ≈{tokenDelta.to} tokens (
              {tokenDelta.to - tokenDelta.from >= 0 ? '+' : ''}
              {tokenDelta.from > 0
                ? Math.round(((tokenDelta.to - tokenDelta.from) / tokenDelta.from) * 100)
                : 0}
              %)
            </p>
          )}
        </div>
      )}
    </div>
  );
}
