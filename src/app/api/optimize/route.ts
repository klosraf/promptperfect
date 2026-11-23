import { streamText } from 'ai';

import { splitOptimizedOutput } from '@/lib/delimiter';
import { normalizeModeForDb, parsePromptScore } from '@/lib/optimization-logs';
import { userFacingOptimizeError } from '@/lib/optimizeUserError';
import { createProvider, getProviderCallOptions } from '@/lib/providers';
import { resolveIdentity } from '@/lib/server/supabaseRequestIdentity';
import { sanitizeProviderMessage } from '@/lib/optimizeUserError';
import { getSystemPrompt } from '@/lib/prompts';
import { parseOptimizeBody } from '@/lib/apiSchemas';
import { getServiceClient } from '@/lib/server/supabase';
import { getRequestId, logApi, logWarn } from '@/lib/logger';
import { enforceRateLimit } from '@/lib/auth/rateLimit';
import { recordProviderFailure } from '@/lib/server/providerHealth';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Public streaming endpoint. Without a BYOK key it falls back to the server's
 * own provider key, so an unauthenticated caller can otherwise burn the
 * project's LLM quota one request at a time. Throttle per IP before any
 * provider work happens.
 */
const OPTIMIZE_RATE_LIMIT = 20;

export async function POST(request: Request) {
  const started = Date.now();
  const requestId = getRequestId(request);
  const res = await handlePost(request);
  // For streams this measures time-to-first-byte, not full completion.
  logApi('optimize', {
    status: res.status,
    ms: Date.now() - started,
    requestId,
  });
  return res;
}

async function handlePost(request: Request) {
  const limited = enforceRateLimit('optimize', request, OPTIMIZE_RATE_LIMIT);
  if (limited) return limited;

  try {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }
    const parsed = parseOptimizeBody(rawBody);
    if (!parsed.ok) {
      return Response.json({ error: parsed.error }, { status: 400 });
    }
    const {
      prompt: promptRaw,
      mode: modeStr,
      provider: requestedProvider,
      apiKey,
      sessionId,
    } = parsed.value;
    const dbMode = normalizeModeForDb(modeStr);

    // EGM F1-01/F2-01: honor the requested provider — the client sends
    // it and reads it back from the response headers, so silently
    // running Gemini while displaying OpenAI was a false result.
    // Guard (review P1): a non-Gemini provider spends the *server's*
    // OpenAI/Anthropic keys, so without a BYOK key it requires a
    // signed-in session (same rule as /api/optimize-sync). Guests
    // without a session are degraded to Gemini — and the response
    // headers below report the provider that actually ran.
    let provider = requestedProvider;
    if (
      provider !== 'gemini' &&
      !(typeof apiKey === 'string' && apiKey.trim())
    ) {
      const identity = await resolveIdentity(request);
      if (!identity) provider = 'gemini';
    }

    let model;
    let modelId: string;
    try {
      const resolved = createProvider(
        provider,
        typeof apiKey === 'string' ? apiKey : undefined,
      );
      model = resolved.model;
      modelId = resolved.modelId;
    } catch (e) {
      return Response.json(
        { error: userFacingOptimizeError(e, provider) },
        { status: 400 },
      );
    }

    const systemPrompt = getSystemPrompt(modeStr);

    const result = streamText({
      model,
      system: systemPrompt,
      prompt: promptRaw,
      maxRetries: 1,
      ...getProviderCallOptions(provider),
      // EGM F3-03: mid-stream provider failures were invisible — the
      // outer catch never sees them once the response has started.
      // Client disconnects (AbortError) are not provider failures and
      // must not trip the health signal.
      onError: ({ error }) => {
        const name = error instanceof Error ? error.name : '';
        if (name === 'AbortError' || name === 'TimeoutError') return;
        recordProviderFailure();
        logWarn(
          'optimize',
          `stream error (${provider}): ${sanitizeProviderMessage(
            error instanceof Error ? error.message : String(error),
          )}`,
        );
      },
      onFinish: async ({ text }) => {
        try {
          const { optimizedText: rawOpt, explanation, changes } =
            splitOptimizedOutput(text);
          const optimizedText = rawOpt.trim();
          const promptScore = parsePromptScore(text);

          if (sessionId) {
            const supabase = getServiceClient();
            if (supabase) {
              void supabase.from('optimization_logs').insert({
                session_id: sessionId,
                mode: dbMode,
                version: 'v1',
                provider,
                model: modelId,
                prompt_length: promptRaw.length,
                optimized_length: optimizedText.length,
                explanation_length: explanation.length + changes.length,
                ...(promptScore != null ? { prompt_score: promptScore } : {}),
              });
            }
          }
        } catch (logErr) {
          logWarn(
            'optimize',
            `onFinish logging error: ${logErr instanceof Error ? logErr.message : String(logErr)}`,
          );
        }
      },
    });

    // The client reads these headers to display the provider/model
    // that actually ran (see lib/client/optimizeApi.ts).
    return result.toTextStreamResponse({
      headers: {
        'x-promptperfect-provider': provider,
        'x-promptperfect-model': modelId,
      },
    });
  } catch (err) {
    recordProviderFailure();
    logWarn(
      'optimize',
      `request failed: ${err instanceof Error ? err.message : 'Invalid request'}`,
    );
    return Response.json(
      { error: userFacingOptimizeError(err) },
      { status: 500 },
    );
  }
}
