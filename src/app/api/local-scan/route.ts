import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { parseLocalScanBody } from '@/lib/apiSchemas';
import { enforceRateLimit } from '@/lib/auth/rateLimit';
import { isUnlimitedMode } from '@/lib/localMode';
import { getRequestId, logApi, logWarn } from '@/lib/logger';
import {
  getLocalScanRoots,
  isPathAllowed,
  scanLocalDirectory,
} from '@/lib/server/localScan';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/local-scan — build a project digest for a server-local directory.
 *
 * Local-dev convenience only: requires `NEXT_PUBLIC_UNLIMITED_MODE` (or the
 * `UNLIMITED_MODE` server twin) AND an allowlisted absolute path
 * (`LOCAL_SCAN_DIRS`, defaulting to the user home + repo cwd). Never enable
 * in production — it exposes server filesystem listings. Throttled per IP
 * before any filesystem work happens (10 scans/min; unlimited mode bypasses
 * the gate per the local-dev contract).
 */
const LOCAL_SCAN_RATE_LIMIT = 10;

export async function POST(request: Request): Promise<Response> {
  const started = Date.now();
  const requestId = getRequestId(request);
  const res = await handlePost(request);
  logApi('local-scan', { status: res.status, ms: Date.now() - started, requestId });
  return res;
}

async function handlePost(request: Request): Promise<Response> {
  try {
    if (!isUnlimitedMode()) {
      return Response.json({ error: 'Not available' }, { status: 404 });
    }
    const limited = enforceRateLimit('local-scan', request, LOCAL_SCAN_RATE_LIMIT);
    if (limited) return limited;
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }
    const parsed = parseLocalScanBody(rawBody);
    if (!parsed.ok) {
      return Response.json({ error: parsed.error }, { status: 400 });
    }
    // EGM E2: resolve symlinks on BOTH the requested dir and the
    // allowlisted roots before comparing — `path.resolve` alone lets a
    // symlinked root inside an allowed tree point anywhere on disk
    // (the walker never follows child symlinks, but the root itself
    // was implicitly followed). A dir that does not exist is a 403,
    // indistinguishable from a disallowed one.
    let abs: string;
    try {
      abs = await fs.realpath(path.resolve(parsed.value.dir));
    } catch {
      return Response.json({ error: 'Directory not allowed' }, { status: 403 });
    }
    const roots: string[] = [];
    for (const r of getLocalScanRoots()) {
      try {
        roots.push(await fs.realpath(r));
      } catch {
        roots.push(path.normalize(r));
      }
    }
    if (!path.isAbsolute(abs) || !isPathAllowed(abs, roots)) {
      return Response.json({ error: 'Directory not allowed' }, { status: 403 });
    }
    try {
      const result = await scanLocalDirectory(
        abs,
        parsed.value.audit ? { audit: parsed.value.audit } : {},
      );
      return Response.json(result);
    } catch (err) {
      logWarn('local-scan', `scan failed: ${err instanceof Error ? err.message : 'Unknown'}`);
      return Response.json({ error: 'Could not read that directory' }, { status: 400 });
    }
  } catch (err) {
    logWarn('local-scan', `request failed: ${err instanceof Error ? err.message : 'Unknown'}`);
    return Response.json({ error: 'Scan failed' }, { status: 500 });
  }
}
