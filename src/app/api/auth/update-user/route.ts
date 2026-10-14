import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/server/supabase';
import { createRouteHandlerClient } from '@/lib/server/supabase';
import { checkRateLimit } from '@/lib/auth/rateLimit';
import { logWarn } from '@/lib/logger';

const PROVIDERS = ['gemini', 'openai', 'anthropic'] as const;
const MAX_MODEL_CHARS = 128;
/** BYOK keys are ~50–200 chars; cap generously to bound row size. */
const MAX_API_KEY_CHARS = 2000;

export async function POST(request: Request) {
  try {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!checkRateLimit(ip, 20)) {
      return NextResponse.json(
        { error: 'Too many requests. Please slow down.' },
        { status: 429 },
      );
    }

    const authClient = await createRouteHandlerClient();
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const userId = user.id;
    const rawProvider = typeof body.provider === 'string' ? body.provider.trim().toLowerCase() : undefined;
    const rawModel = typeof body.model === 'string' ? body.model.trim() : undefined;
    const rawApiKey = typeof body.api_key === 'string' ? body.api_key.trim() : undefined;

    if (rawProvider !== undefined && !(PROVIDERS as readonly string[]).includes(rawProvider)) {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
    }
    if (rawModel !== undefined && (rawModel.length === 0 || rawModel.length > MAX_MODEL_CHARS)) {
      return NextResponse.json({ error: 'Invalid model' }, { status: 400 });
    }
    if (rawApiKey !== undefined && rawApiKey.length > MAX_API_KEY_CHARS) {
      return NextResponse.json({ error: 'Invalid api_key' }, { status: 400 });
    }

    const provider = rawProvider;
    const model = rawModel;
    // NOTE (secret boundary): the BYOK key is stored as-sent in pp_users so
    // the server can call providers on the user's behalf. It is scoped to
    // the authenticated user (service-role write + RLS), never logged, and
    // never echoed back in any response. See SECURITY_AUDIT.md.
    const api_key = rawApiKey;

    const admin = getSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 503 }
      );
    }

    const updates: Record<string, unknown> = {};
    if (provider !== undefined) updates.provider = provider;
    if (model !== undefined) updates.model = model;
    if (api_key !== undefined) updates.api_key = api_key;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: true });
    }

    const { data: updatedRow, error } = await admin
      .from('pp_users')
      .update(updates)
      .eq('id', userId)
      .select('id')
      .maybeSingle();

    if (error) {
      logWarn('update-user', `pp_users update failed: ${error.message}`);
      return NextResponse.json(
        { error: 'Update failed' },
        { status: 500 }
      );
    }

    if (!updatedRow) {
      return NextResponse.json(
        { error: 'User profile not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    // swallow: JSON parse or validation error
    return NextResponse.json(
      { error: 'Invalid request' },
      { status: 400 }
    );
  }
}
