import { NextResponse } from 'next/server'
import { GUEST_LIMIT, assertGuestId } from '@/lib/guest'
import { getServiceClient, getSupabaseAdminClient } from '@/lib/server/supabase'
import { getRequestId, logApi, logWarn } from '@/lib/logger'
import { enforceRateLimit } from '@/lib/auth/rateLimit'

/**
 * Public, unauthenticated endpoint (no session, no auth header). The guest id
 * is client-generated, so it cannot identify a caller: only the IP can, and
 * only weakly. Throttle both verbs so the endpoint cannot be used to burn
 * server quota or to flood `guest_usage` rows.
 */
const GUEST_USAGE_RATE_LIMIT = 30

export async function POST(request: Request) {
  const started = Date.now();
  const res = await handlePost(request);
  logApi('guest-usage', {
    status: res.status,
    ms: Date.now() - started,
    requestId: getRequestId(request),
  });
  return res;
}

async function handlePost(request: Request) {
  const limited = enforceRateLimit('guest-usage', request, GUEST_USAGE_RATE_LIMIT)
  if (limited) return limited

  // EGM E5: the atomic increment runs only through the admin client
  // (the RPC's EXECUTE is granted to service_role alone). No admin
  // client -> honest 503, never a silent downgrade.
  const admin = getSupabaseAdminClient()
  if (!admin) {
    return NextResponse.json(
      { error: 'Database not configured' },
      { status: 503 }
    )
  }

  let body: { guestId?: string; mode?: string; provider?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const { guestId: rawGuestId, mode, provider } = body;
  const guestId = assertGuestId(rawGuestId);

  if (!guestId) {
    return NextResponse.json({ error: 'Guest ID required' }, { status: 400 })
  }

  // Atomic check-and-increment (migration 20261112000001): the RPC
  // returns the new count only when the increment stays within the
  // limit; zero rows means the quota was already exhausted.
  const { data: rpcRows, error: rpcError } = await admin.rpc(
    'increment_guest_usage',
    {
      p_guest_id: guestId,
      p_limit: GUEST_LIMIT,
      p_mode: mode ?? null,
      p_provider: provider ?? null,
    },
  )

  if (!rpcError) {
    const newCount = rpcRows?.[0]?.optimization_count
    if (typeof newCount === 'number') {
      return NextResponse.json({
        count: newCount,
        limit: GUEST_LIMIT,
        remaining: GUEST_LIMIT - newCount,
      })
    }
    // Quota exhausted: report the standing count with the 429.
    const { data: standing } = await admin
      .from('guest_usage')
      .select('optimization_count')
      .eq('guest_id', guestId)
      .single()
    const currentCount = standing?.optimization_count ?? GUEST_LIMIT
    return NextResponse.json(
      {
        error: 'Guest limit reached. Sign up for unlimited access.',
        limitReached: true,
        count: currentCount,
        limit: GUEST_LIMIT,
      },
      { status: 429 }
    )
  }

  // Fallback to the legacy read-then-upsert ONLY when the RPC does not
  // exist yet on this database (PGRST202 / 42883: migration not
  // applied). Any other RPC error is a real 500 — never a silent
  // downgrade to the racy path.
  const rpcCode = (rpcError as { code?: string }).code ?? ''
  if (rpcCode !== 'PGRST202' && rpcCode !== '42883') {
    logWarn('guest-usage', `increment RPC failed: ${rpcError.message}`)
    return NextResponse.json({ error: 'Failed to record usage' }, { status: 500 })
  }
  logWarn(
    'guest-usage',
    'increment_guest_usage RPC missing (migration 20261112000001 not applied); using legacy path',
  )

  const { data: existing } = await admin
    .from('guest_usage')
    .select('optimization_count')
    .eq('guest_id', guestId)
    .single()

  const currentCount = existing?.optimization_count ?? 0

  if (currentCount >= GUEST_LIMIT) {
    return NextResponse.json(
      {
        error: 'Guest limit reached. Sign up for unlimited access.',
        limitReached: true,
        count: currentCount,
        limit: GUEST_LIMIT,
      },
      { status: 429 }
    )
  }

  const { error: upsertError } = await admin
    .from('guest_usage')
    .upsert(
      {
        guest_id: guestId,
        optimization_count: currentCount + 1,
        last_used_at: new Date().toISOString(),
        last_mode: mode ?? null,
        last_provider: provider ?? null,
      },
      { onConflict: 'guest_id' }
    )

  if (upsertError) {
    return NextResponse.json({ error: 'Failed to record usage' }, { status: 500 })
  }

  return NextResponse.json({
    count: currentCount + 1,
    limit: GUEST_LIMIT,
    remaining: GUEST_LIMIT - 1 - currentCount,
  })
}

export async function GET(request: Request) {
  const limited = enforceRateLimit('guest-usage', request, GUEST_USAGE_RATE_LIMIT)
  if (limited) return limited

  const supabase = getServiceClient()
  const { searchParams } = new URL(request.url)
  const guestId = assertGuestId(searchParams.get('guestId'))

  if (!guestId) {
    return NextResponse.json({ count: 0, limit: GUEST_LIMIT, remaining: GUEST_LIMIT })
  }

  if (!supabase) {
    // Signal to client that server tracking is unavailable — don't overwrite local count.
    return NextResponse.json({ count: 0, limit: GUEST_LIMIT, remaining: GUEST_LIMIT, serverTracking: false })
  }

  const { data } = await supabase
    .from('guest_usage')
    .select('optimization_count')
    .eq('guest_id', guestId)
    .single()

  const count = data?.optimization_count ?? 0

  return NextResponse.json({
    count,
    limit: GUEST_LIMIT,
    remaining: Math.max(0, GUEST_LIMIT - count),
  })
}
