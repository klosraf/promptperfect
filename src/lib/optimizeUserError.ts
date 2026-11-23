/**
 * Maps low-level provider / AI SDK errors into clearer UI copy for
 * /app Optimize. Provider-aware (EGM F3-05): a BYOK user of OpenAI or
 * Anthropic must never receive Gemini instructions or server `.env`
 * directions that do not apply to them.
 */
/**
 * Strips secret-like material (API keys, tokens, key-bearing URLs) from
 * provider error text before it reaches clients or logs. Detection in
 * `userFacingOptimizeError` still runs on the raw message; only the
 * *output* is sanitized, so mappings are unaffected.
 */
export function sanitizeProviderMessage(msg: string): string {
  const out = msg
    .replace(/([?&](?:key|api_key|token|access_token)=)[^&\s]+/gi, '$1[redacted]')
    .replace(/(Bearer\s+)[A-Za-z0-9\-._~+/=]{8,}/g, '$1[redacted]')
    .replace(/(x-api-key\s*[:=]\s*)\S+/gi, '$1[redacted]')
    .replace(/("api_key"\s*:\s*")[^"]+(")/gi, '$1[redacted]$2')
    .replace(
      /\b(sk-[A-Za-z0-9-_]{8,}|AIza[A-Za-z0-9-_]{10,}|xox[baprs]-[A-Za-z0-9-]{8,})\b/g,
      '[redacted]',
    );
  return out.length > 500 ? out.slice(0, 500) + '…' : out;
}

type OptimizeProvider = 'gemini' | 'openai' | 'anthropic';

const PROVIDER_LABEL: Record<OptimizeProvider, string> = {
  gemini: 'Google Gemini',
  openai: 'OpenAI',
  anthropic: 'Anthropic Claude',
};

const PROVIDER_CONSOLE: Record<OptimizeProvider, string> = {
  gemini: 'Google AI Studio',
  openai: 'platform.openai.com',
  anthropic: 'console.anthropic.com',
};

/** True for the real error shapes produced by AbortSignal.timeout / aborts. */
function isTimeoutError(err: unknown, m: string): boolean {
  const name = err instanceof Error ? err.name : '';
  return (
    name === 'TimeoutError' ||
    name === 'AbortError' ||
    m.includes('signal aborted') ||
    m.includes('operation was aborted') ||
    m.includes('aborted due to timeout')
  );
}

export function userFacingOptimizeError(
  err: unknown,
  provider: OptimizeProvider = 'gemini',
): string {
  const raw =
    err instanceof Error ? err.message.trim() : String(err).trim();
  const m = raw.toLowerCase();
  const label = PROVIDER_LABEL[provider];
  const consoleName = PROVIDER_CONSOLE[provider];

  if (!raw) return 'Optimization failed. Please try again.';

  if (isTimeoutError(err, m)) {
    return (
      `${label} took too long to respond and the request timed out. ` +
      'Wait a moment and try again, or try a shorter prompt.'
    );
  }

  if (
    m.includes('credit_balance_exhausted') ||
    m.includes('insufficient_quota') ||
    m.includes('no credits remaining') ||
    m.includes('billing')
  ) {
    if (provider === 'anthropic') {
      return (
        'This API key has no credits left. Add credits in the Anthropic ' +
        'Console (console.anthropic.com) or switch provider and try again.'
      );
    }
    return (
      'This API key has no credits left. Add credits at ' +
      'https://platform.openai.com/settings/organization/billing (OpenAI) ' +
      'or switch provider/model and try again.'
    );
  }

  if (
    m.includes('no longer available') ||
    (m.includes('not_found') && m.includes('model')) ||
    (/\b404\b/.test(m) && m.includes('model'))
  ) {
    if (provider === 'gemini') {
      return (
        'The configured Gemini model was retired by Google. Set GEMINI_MODEL in your environment ' +
        'to a current model (for example gemini-3.5-flash or gemini-flash-latest) and try again.'
      );
    }
    return (
      `The configured ${label} model is no longer available. ` +
      'Switch provider or model in Settings and try again.'
    );
  }

  if (m.includes('missing') && m.includes('api key')) {
    if (provider === 'openai') {
      return `${sanitizeProviderMessage(raw)} Add your OpenAI API key in Settings, or set OPENAI_API_KEY on the server.`;
    }
    if (provider === 'anthropic') {
      return `${sanitizeProviderMessage(raw)} Add your Anthropic API key in Settings, or set ANTHROPIC_API_KEY on the server.`;
    }
    return (
      `${sanitizeProviderMessage(raw)} Set GOOGLE_GENERATIVE_AI_API_KEY, GEMINI_API_KEY, or GOOGLE_API_KEY on the server.`
    );
  }

  if (
    m.includes('resource exhausted') ||
    m.includes('resource_exhausted') ||
    /\b429\b/.test(m) ||
    m.includes('too many requests') ||
    m.includes('rate limit') ||
    (m.includes('quota') && !m.includes('missing'))
  ) {
    return (
      provider === 'gemini'
        ? 'Google Gemini is limiting requests right now (quota or rate limit). Wait a few minutes and try again. ' +
          'Check usage and billing in Google AI Studio. If it keeps happening, set GEMINI_MODEL in your environment ' +
          'to another model (for example gemini-3.5-flash).'
        : `${label} is limiting requests right now (quota or rate limit). Wait a few minutes and try again. ` +
          `Check usage and billing in ${consoleName}.`
    );
  }

  if (
    m.includes('maxretries') ||
    m.includes('failed after') ||
    m.includes('retry')
  ) {
    if (m.includes('resource exhausted') || m.includes('429')) {
      return (
        provider === 'gemini'
        ? 'Google Gemini is limiting requests right now (quota or rate limit). Wait a few minutes and try again. ' +
          'Check usage and billing in Google AI Studio. If it keeps happening, set GEMINI_MODEL in your environment ' +
          'to another model (for example gemini-3.5-flash).'
        : `${label} is limiting requests right now (quota or rate limit). Wait a few minutes and try again. ` +
          `Check usage and billing in ${consoleName}.`
      );
    }
    return (
      provider === 'gemini'
        ? 'The model did not respond after retries. Wait a moment and try again, or switch GEMINI_MODEL in .env.'
        : 'The model did not respond after retries. Wait a moment and try again, or switch provider in Settings.'
    );
  }

  if (
    m.includes('api key') ||
    m.includes('invalid api') ||
    m.includes('permission_denied') ||
    m.includes('403')
  ) {
    if (provider === 'openai') {
      return 'OpenAI API key is missing or invalid. Check the key saved in Settings and try again.';
    }
    if (provider === 'anthropic') {
      return 'Anthropic API key is missing or invalid. Check the key saved in Settings and try again.';
    }
    return (
      'Google API key is missing or invalid. Verify GOOGLE_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY for this deployment.'
    );
  }

  return sanitizeProviderMessage(raw);
}
