import { checkRateLimit, rateLimitKey } from '@/lib/auth/rateLimit';
import {
  mapPasswordResetEmailError,
  resolvePasswordResetRedirect,
} from '@/lib/auth/passwordResetRedirect';
import { validateEmail } from '@/lib/auth/validation';
import {
  getSupabaseAdminClient,
  getSupabaseUrl,
  normalizeEnvValue,
} from '@/lib/server/supabase';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { logWarn } from '@/lib/logger';
import { isUnlimitedMode } from '@/lib/localMode';

function isLocalRedirect(redirectTo: string): boolean {
  try {
    const host = new URL(redirectTo).hostname;
    return host === 'localhost' || host === '127.0.0.1';
  } catch {
    return false;
  }
}

/**
 * Password recovery: admin generateLink (verifies user + builds link), then
 * resetPasswordForEmail (sends mail).
 *
 * EGM E2 (F2-05): the raw recovery link is a credential. It is returned
 * ONLY in local development — NODE_ENV !== 'production' AND unlimited
 * (local) mode AND a loopback redirect. The redirect is derived from
 * request headers, so "looks local" alone would let a caller send
 * `Host: localhost` to a deployed instance and harvest reset links.
 */
export async function POST(request: Request) {
  if (!checkRateLimit(rateLimitKey('auth/forgot-password', request), 8)) {
    return NextResponse.json(
      { error: 'Too many attempts. Please wait a minute.' },
      { status: 429 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    email?: string;
    redirectTo?: string;
  } | null;
  const raw = typeof body?.email === 'string' ? body.email.trim() : '';
  const email = raw.toLowerCase();
  const clientRedirectTo =
    typeof body?.redirectTo === 'string' ? body.redirectTo.trim() : undefined;

  if (!validateEmail(email)) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
  }

  const url = getSupabaseUrl();
  const anonKey = normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!url || !anonKey) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 503 });
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    // EGM E2 (F2-06): no internal setup hints to unauthenticated callers.
    return NextResponse.json(
      {
        error:
          'Password reset is temporarily unavailable (server configuration).',
        code: 'SERVICE_KEY_REQUIRED',
      },
      { status: 503 },
    );
  }

  const redirectTo = resolvePasswordResetRedirect(request, clientRedirectTo);
  const exposeRecoveryLink =
    process.env.NODE_ENV !== 'production' &&
    isUnlimitedMode() &&
    isLocalRedirect(redirectTo);

  const { data: linkData, error: genError } =
    await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo },
    });

  if (genError) {
    const msg = genError.message?.trim().toLowerCase() ?? '';
    const notFound =
      genError.status === 404 ||
      msg.includes('not found') ||
      msg.includes('no user') ||
      msg.includes('user not found') ||
      msg.includes('unable to find');
    if (notFound) {
      // Anti-enumeration: never reveal whether an email is registered.
      // Respond exactly like a success so attackers can't harvest accounts.
      return NextResponse.json({ ok: true, emailSent: true });
    }
    logWarn('forgot-password', `generateLink failed: ${genError.message}`);
    const mapped = mapPasswordResetEmailError(genError.message, redirectTo);
    return NextResponse.json(
      { error: mapped.error, code: mapped.code },
      { status: 400 },
    );
  }

  if (!linkData?.user?.id) {
    // Anti-enumeration: same generic success as if the email existed.
    return NextResponse.json({ ok: true, emailSent: true });
  }

  const recoveryLink =
    typeof linkData.properties?.action_link === 'string'
      ? linkData.properties.action_link
      : undefined;

  const anon = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { error: emailError } = await anon.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  if (!emailError) {
    // EGM E2 (F2-06): no googleOnlyHint — revealing that an account is
    // Google-only breaks the anti-enumeration contract of this route.
    return NextResponse.json({
      ok: true,
      emailSent: true,
      ...(exposeRecoveryLink && recoveryLink ? { recoveryLink } : {}),
    });
  }

  const msg = emailError.message?.trim() || '';
  logWarn('forgot-password', `resetPasswordForEmail failed: ${msg}`);
  const mapped = mapPasswordResetEmailError(msg, redirectTo);

  // Local dev only (triple-gated above): Supabase rate-limits emails
  // (~1/min) but generateLink still works, so return the direct link.
  if (exposeRecoveryLink && recoveryLink) {
    return NextResponse.json({
      ok: true,
      emailSent: false,
      recoveryLink,
      code: mapped.code,
      message: mapped.error,
    });
  }

  return NextResponse.json(
    { error: mapped.error, code: mapped.code },
    { status: 400 },
  );
}
