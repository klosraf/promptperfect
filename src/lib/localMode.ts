/**
 * Local / unlimited mode.
 *
 * When `NEXT_PUBLIC_UNLIMITED_MODE` is `"true"` or `"1"` (local dev), every
 * artificial limitation is disabled: the guest optimization quota, the
 * limit modal / token bar, and server-side rate limits. Supabase-backed
 * features transparently use localStorage fallbacks instead.
 *
 * Production default (flag unset): all limits behave exactly as before.
 */

// Re-exported from the shared env module so server/browser factories and
// feature flags share one definition. Prefer importing from `@/lib/env`.
export {
  isPlaceholderSupabaseUrl,
  normalizeSupabaseUrl,
} from '@/lib/env';

/**
 * True when the unlimited local-dev mode flag is set AND the runtime is not
 * production. The NODE_ENV guard is load-bearing: without it a leaked flag
 * in production env would disable ALL server rate limits (see rateLimit.ts)
 * and open `/api/local-scan`. Never remove the guard; see localMode.test.ts.
 * Safe on server and client.
 */
export function isUnlimitedMode(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  const raw = process.env.NEXT_PUBLIC_UNLIMITED_MODE?.trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}
