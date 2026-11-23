'use client';

import { clearGuestLocalStorage, getStoredGuestId } from '@/lib/guest';
import {
  deleteLocalHistoryRow,
  getLocalHistoryForSession,
  getOrCreateSessionId,
} from '@/lib/client/optimizationHistory';

/**
 * Re-parent guest optimizations to the signed-in account after authentication.
 *
 * Two strategies run in parallel so all guest data is captured regardless of
 * whether it was persisted to Supabase or only survived in localStorage:
 *
 * 1. Server-side DB claim — updates `pp_optimization_history` rows whose
 *    `session_id` matches the guest id (handles rows that did reach Supabase).
 *    Only rows still unclaimed (`user_id IS NULL`) can be adopted.
 *
 * 2. localStorage claim — reads rows that never reached Supabase (common when
 *    RLS blocks anonymous inserts) and POSTs each one to `/api/history` with
 *    the user's auth session so they are properly linked to the account.
 *
 * EGM E5 (F5-11): the guest id is cleared ONLY when the server confirms
 * the claim (200 with a migrated count, including 0). A 503/skipped or
 * failed claim keeps the guest id so a later sign-in retries. The old
 * third path — a direct anon-client UPDATE of the history table — is
 * gone: it bypassed the route's unclaimed-only guard and could pull
 * rows already owned by another account.
 */
export async function claimGuestHistoryAfterAuth(): Promise<void> {
  const guestId = getStoredGuestId();
  if (!guestId) return;
  const targetSessionId = getOrCreateSessionId();
  if (!targetSessionId || guestId === targetSessionId) return;

  // ── 1. Server-side DB claim ──────────────────────────────────────────────
  let serverClaimed = false;
  try {
    const res = await fetch('/api/auth/claim-guest-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ guestId, targetSessionId }),
    });
    if (res.ok) {
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        migrated?: unknown;
        skipped?: boolean;
      } | null;
      serverClaimed =
        body?.ok === true &&
        body.skipped !== true &&
        typeof body.migrated === 'number';
    }
  } catch {
    // swallow — localStorage claim below still runs; the guest id is
    // kept (see the end of this function) so the claim retries later.
  }

  // ── 2. localStorage claim ────────────────────────────────────────────────
  // Guest history rows saved while Supabase was unavailable (or RLS blocked
  // the anon insert) live here, keyed by the guest's session id.
  const localRows = getLocalHistoryForSession(guestId);
  if (localRows.length > 0) {
    const results = await Promise.allSettled(
      localRows.map((row) =>
        fetch('/api/history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            prompt_original: row.prompt_original,
            prompt_optimized: row.prompt_optimized,
            mode: row.mode,
            explanation: row.explanation,
            session_id: targetSessionId,
          }),
        }),
      ),
    );
    // Goldfish P2 (cierre EGM): a row whose POST the server accepted is
    // removed from local storage immediately — even when the server-side
    // claim is still pending (503). Otherwise every later sign-in would
    // re-POST the same rows and duplicate the history. Rows whose POST
    // failed stay local so a later sign-in retries exactly those.
    results.forEach((result, i) => {
      const row = localRows[i];
      if (row && result.status === 'fulfilled' && result.value.ok) {
        deleteLocalHistoryRow(row.id);
      }
    });
  }

  // Clear the guest identity only on a confirmed server claim.
  if (serverClaimed) {
    clearGuestLocalStorage();
  }
}
