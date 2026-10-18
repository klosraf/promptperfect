/**
 * In-memory provider-failure signal for `/api/healthz`.
 *
 * Tracks recent AI-provider call failures (sliding window) so the health
 * endpoint can report `degraded: true` without new infrastructure. Process
 * memory only — resets on restart, never persisted, no PII. Callers record
 * a failure in provider catch blocks; healthz reads `isDegraded()`.
 */

const WINDOW_MS = 5 * 60 * 1000;
const DEGRADE_AFTER = 5;

let failures: number[] = [];

function prune(now: number): void {
  const cutoff = now - WINDOW_MS;
  failures = failures.filter((t) => t >= cutoff);
}

/** Record one provider failure (call in catch blocks around provider calls). */
export function recordProviderFailure(): void {
  const now = Date.now();
  prune(now);
  failures.push(now);
}

/** True when failures in the window reach the degrade threshold. */
export function isDegraded(now = Date.now()): boolean {
  prune(now);
  return failures.length >= DEGRADE_AFTER;
}

/** Test seam: clear recorded failures. */
export function resetProviderHealth(): void {
  failures = [];
}
