/**
 * Per-change review: revert individual optimizer edits in the improved
 * prompt, fail-closed.
 *
 * A change is revertible only when the contract quoted its spans verbatim
 * (see structuredChanges): for REPLACE the new span must occur exactly
 * once in the improved prompt — it is swapped back for the original span;
 * for ADD the added span must occur exactly once — it is removed. Any
 * other case (no quoted spans, span missing, span ambiguous) is reported
 * as not applicable with a reason instead of guessing. DELETE, EXAMPLE
 * and STRUCTURE edits are descriptive by design and never revertible:
 * re-inserting removed content has no honest position to return to.
 */
import type { StructuredChange } from "./structuredChanges";

export type RevertCheck =
  | { ok: true }
  | { ok: false; reason: "no-spans" | "not-found" | "ambiguous" | "method" };

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count += 1;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

export function checkRevertible(
  change: StructuredChange,
  optimized: string,
): RevertCheck {
  if (change.method !== "REPLACE" && change.method !== "ADD") {
    return { ok: false, reason: "method" };
  }
  if (!change.after) return { ok: false, reason: "no-spans" };
  if (change.method === "REPLACE" && change.before === undefined) {
    return { ok: false, reason: "no-spans" };
  }
  const n = countOccurrences(optimized, change.after);
  if (n === 0) return { ok: false, reason: "not-found" };
  if (n > 1) return { ok: false, reason: "ambiguous" };
  return { ok: true };
}

export interface RevertOutcome {
  text: string;
  applied: number[];
  skipped: { index: number; reason: RevertCheck & { ok: false } }[];
}

/**
 * Apply the reverts selected by index, in order. Each step re-checks
 * against the current text, so an earlier revert can honestly disable a
 * later one (reported in `skipped`) instead of corrupting the prompt.
 */
export function applyReverts(
  optimized: string,
  changes: StructuredChange[],
  reverted: ReadonlySet<number>,
): RevertOutcome {
  let text = optimized;
  const applied: number[] = [];
  const skipped: RevertOutcome["skipped"] = [];
  for (const index of [...reverted].sort((a, b) => a - b)) {
    const change = changes[index];
    if (!change) continue;
    const check = checkRevertible(change, text);
    if (!check.ok) {
      skipped.push({ index, reason: check });
      continue;
    }
    if (change.method === "REPLACE") {
      text = text.replace(change.after!, change.before!);
    } else {
      // ADD: remove the added span; collapse the seam conservatively —
      // a doubled blank line left behind becomes a single one.
      text = text.replace(change.after!, "");
      text = text.replace(/\n{3,}/g, "\n\n");
    }
    applied.push(index);
  }
  return { text, applied, skipped };
}
