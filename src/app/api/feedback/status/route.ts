import { getServiceClient } from '@/lib/server/supabase';
import { enforceRateLimit } from '@/lib/auth/rateLimit';

export const runtime = 'nodejs';

/**
 * Unauthenticated read that hits `optimization_logs` with a client-supplied
 * `session_id`. Anyone can enumerate candidate ids and force a DB query per
 * attempt at no cost to themselves, so the IP budget is the only brake.
 * 60/min leaves room for the UI polling the bar on load without letting a
 * scraper walk the table.
 */
const STATUS_RATE_LIMIT = 60;

/** Bound untrusted query input (ids are ≤80 chars; 128 is generous). */
const MAX_SESSION_ID = 128;

/** Whether optimization_logs already has feedback for this per-run optimize session id. */
export async function GET(request: Request) {
  const limited = enforceRateLimit('feedback-status', request, STATUS_RATE_LIMIT);
  if (limited) return limited;

  const sid = new URL(request.url).searchParams.get('session_id')?.trim();
  if (!sid || sid.length > MAX_SESSION_ID) {
    return Response.json({ submitted: false, feedback: null as string | null });
  }

  const supabase = getServiceClient();
  if (!supabase) {
    // E1 v2 consequence table (Goldfish P3, cierre): an unconfigured
    // server is an explicit 503, not a 200 indistinguishable from
    // "no feedback yet". The body keeps {submitted:false} so existing
    // clients degrade exactly as before.
    return Response.json(
      {
        error: 'Feedback status is not configured on this server.',
        submitted: false,
        feedback: null as string | null,
      },
      { status: 503 },
    );
  }

  const { data, error } = await supabase
    .from('optimization_logs')
    .select('feedback')
    .eq('session_id', sid)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return Response.json({ submitted: false, feedback: null as string | null });
  }

  const raw = typeof data.feedback === 'string' ? data.feedback.trim().toLowerCase() : '';
  if (raw === 'up' || raw === 'down') {
    return Response.json({ submitted: true, feedback: raw });
  }

  return Response.json({ submitted: false, feedback: null as string | null });
}
