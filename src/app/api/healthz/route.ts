import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { getSupabaseAdminClient } from '@/lib/server/supabase';
import { isDegraded } from '@/lib/server/providerHealth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Build id when present (production build), else a dev marker. */
function buildVersion(): string {
  try {
    return readFileSync(join(process.cwd(), '.next', 'BUILD_ID'), 'utf8').trim();
  } catch {
    return 'dev';
  }
}

/**
 * Liveness/readiness probe for orchestrators and the Docker HEALTHCHECK.
 * Unauthenticated by design; exposes only non-sensitive signals — never
 * credentials or env names. `db` is a boolean readiness hint (whether the
 * service-role client is configured), not a live connectivity check.
 * `degraded` reflects recent provider failures (in-memory window).
 */
export async function GET(): Promise<Response> {
  return Response.json({
    status: 'ok',
    db: Boolean(getSupabaseAdminClient()),
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    version: buildVersion(),
    degraded: isDegraded(),
  });
}
