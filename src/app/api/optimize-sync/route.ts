import { generateText } from 'ai';
import type { NextRequest } from 'next/server';

import { getSupabaseAdminClient } from '@/lib/server/supabase';
import { checkRateLimit } from '@/lib/auth/rateLimit';
import { createRouteHandlerClient } from '@/lib/server/supabase';
import { splitOptimizedOutput } from '@/lib/delimiter';
import { normalizeModeForDb, parsePromptScore } from '@/lib/optimization-logs';
import { userFacingOptimizeError } from '@/lib/optimizeUserError';
import { createProvider, getProviderCallOptions, hasServerKey } from '@/lib/providers';
import { isUnlimitedMode } from '@/lib/localMode';
import { getSystemPrompt } from '@/lib/prompts';
import { parseOptimizeBody } from '@/lib/apiSchemas';
import { getRequestId, logApi } from '@/lib/logger';
import type { OptimizationLogInsert } from '@/types/database';

export const runtime = 'nodejs';
export const maxDuration = 60;

function parseAllowedOrigins(): string[] {
  const raw = process.env.ALLOWED_ORIGINS?.trim();
  if (!raw) {
    return [
      'http://localhost:3000',
      'https://promptperfect-beaglecorp.vercel.app',
    ];
  }
  return raw
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

/**
 * Echo Origin only when it appears in ALLOWED_ORIGINS or is a browser-extension
 * origin (chrome-extension:// / moz-extension://). Extension origins cannot be
 * spoofed from a web page, so allowing all of them is safe.
 * Anything else gets no CORS headers → browser refuses the cross-origin request.
 */
function corsHeadersForRequest(req: NextRequest): Record<string, string> {
  const allowed = parseAllowedOrigins();
  const origin = req.headers.get('origin')?.trim().replace(/\/$/, '') ?? '';
  const isBrowserExtension =
    origin.startsWith('chrome-extension://') ||
    origin.startsWith('moz-extension://');
  if (origin && (isBrowserExtension || allowed.includes(origin))) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Vary': 'Origin',
    };
  }
  // Origin absent or not in allowlist — omit ACAO header so the browser blocks the request.
  return {};
}

export async function OPTIONS(req: NextRequest) {
  return new Response(null, {
    status: 204,
    headers: corsHeadersForRequest(req),
  });
}

export async function POST(req: NextRequest) {
  const started = Date.now();
  const requestId = getRequestId(req);
  const res = await handlePost(req);
  logApi('optimize-sync', {
    status: res.status,
    ms: Date.now() - started,
    requestId,
  });
  return res;
}

async function handlePost(req: NextRequest) {
  const corsHeaders = corsHeadersForRequest(req);

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!checkRateLimit(ip, 30)) {
    return Response.json(
      { error: 'Too many requests. Please slow down.' },
      { status: 429, headers: corsHeaders },
    );
  }

  try {
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return Response.json(
        { error: 'Invalid request body' },
        { status: 400, headers: corsHeaders },
      );
    }
    const parsed = parseOptimizeBody(rawBody);
    if (!parsed.ok) {
      return Response.json(
        { error: parsed.error },
        { status: 400, headers: corsHeaders },
      );
    }
    const {
      prompt: promptRaw,
      mode,
      provider,
      apiKey: apiKeyFromBody,
      sessionId,
      version,
    } = parsed.value;

    const authHeader = req.headers.get('Authorization') || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const apiKey = bearer || apiKeyFromBody;

    // When no BYOK key is supplied the request would use the server's default
    // API key. Require an authenticated Supabase session in that case to
    // prevent unauthenticated consumption of server-side quota — except in
    // unlimited local-dev mode, where sign-in is unavailable and the server
    // key belongs to the local developer.
    if (!apiKey && !(isUnlimitedMode() && hasServerKey(provider))) {
      const authClient = await createRouteHandlerClient();
      const { data: { user } } = await authClient.auth.getUser();
      if (!user) {
        return Response.json(
          { error: 'Sign in to use PromptPerfect, or provide your own API key.' },
          { status: 401, headers: corsHeaders },
        );
      }
    }

    let providerConfig;
    try {
      providerConfig = createProvider(provider, apiKey);
    } catch (e) {
      return Response.json(
        { error: userFacingOptimizeError(e) },
        { status: 400, headers: corsHeaders },
      );
    }

    const { model, modelId } = providerConfig;
    const system = getSystemPrompt(mode);

    try {
      const result = await generateText({
        model,
        system,
        prompt: promptRaw,
        maxRetries: 1,
        ...getProviderCallOptions(provider),
      });

      const rawText = result.text ?? '';
      const { optimizedText: rawOptimized, explanation, changes } =
        splitOptimizedOutput(rawText);
      const optimizedText = rawOptimized.trim();
      const promptScore = parsePromptScore(rawText);

      if (sessionId) {
        const admin = getSupabaseAdminClient();
        const db = admin;
        if (db) {
          const logRow: OptimizationLogInsert = {
            session_id: sessionId,
            mode: normalizeModeForDb(mode),
            version,
            provider,
            model: modelId,
            prompt_length: promptRaw.length,
            optimized_length: optimizedText.length,
            explanation_length: explanation.length + changes.length,
            ...(promptScore != null ? { prompt_score: promptScore } : {}),
          };
          void db.from('optimization_logs').insert(logRow);
        }
      }

      return Response.json(
        {
          optimizedText,
          explanation,
          changes,
          rawText,
          provider,
          model: modelId,
        },
        { headers: corsHeaders },
      );
    } catch (err) {
      return Response.json(
        { error: userFacingOptimizeError(err) },
        { status: 500, headers: corsHeaders },
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid request';
    return Response.json({ error: message }, { status: 400, headers: corsHeaders });
  }
}
