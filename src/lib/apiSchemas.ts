/**
 * Hand-rolled request validation for API routes (typed, tested, zero deps —
 * see `lib/config.ts` for why Zod is not a direct dependency right now).
 *
 * Convention: parsers return `{ ok: true, value }` or `{ ok: false, error }`
 * where `error` is already a user-facing message suitable for a 400 body.
 */

import type { OptimizationMode, Provider } from '@/lib/types';
import type { TranslationTarget } from '@/lib/translation';

export const MAX_PROMPT_CHARS = 100_000;
export const MAX_ID_CHARS = 200;
export const MAX_TEXT_CHARS = 50_000;

const APP_MODES: readonly string[] = [
  'better',
  'specific',
  'cot',
  'developer',
  'research',
  'beginner',
  'product',
  'marketing',
  'production',
];

const PROVIDERS: readonly string[] = ['gemini', 'openai', 'anthropic'];

function asTrimmedString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t : null;
}

export function parseMode(v: unknown, fallback: OptimizationMode = 'better'): OptimizationMode {
  const t = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return (APP_MODES as readonly string[]).includes(t)
    ? (t as OptimizationMode)
    : fallback;
}

export function parseProvider(v: unknown, fallback: Provider = 'gemini'): Provider {
  const t = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return (PROVIDERS as readonly string[]).includes(t) ? (t as Provider) : fallback;
}

export interface OptimizeRequestValue {
  prompt: string;
  mode: OptimizationMode;
  provider: Provider;
  apiKey?: string;
  sessionId: string;
  version: 'v1' | 'v2';
}

/**
 * Shared body parser for `/api/optimize` and `/api/optimize-sync`.
 * Accepts `text` (preferred) or legacy `prompt`; caps length against abuse.
 */
export function parseOptimizeBody(
  body: unknown,
): { ok: true; value: OptimizeRequestValue } | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Invalid request body' };
  }
  const b = body as Record<string, unknown>;

  const text = asTrimmedString(b.text) ?? asTrimmedString(b.prompt);
  if (!text) {
    return { ok: false, error: 'Missing or empty prompt' };
  }
  if (text.length > MAX_PROMPT_CHARS) {
    return {
      ok: false,
      error: `Prompt is too long (max ${MAX_PROMPT_CHARS.toLocaleString()} characters)`,
    };
  }

  const rawKey = asTrimmedString(b.apiKey);
  const sessionId = asTrimmedString(b.session_id) ?? asTrimmedString(b.sessionId) ?? '';
  const version = b.version === 'v2' ? 'v2' : ('v1' as const);

  return {
    ok: true,
    value: {
      prompt: text,
      mode: parseMode(b.mode),
      provider: parseProvider(b.provider),
      ...(rawKey ? { apiKey: rawKey } : {}),
      sessionId: sessionId.slice(0, MAX_ID_CHARS),
      version,
    },
  };
}

export interface FeedbackBodyValue {
  mode: string;
  provider: string;
  inputLength: number;
  outputLength: number;
  feedback: string;
  sessionId: string;
}

function asNonNegativeInt(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0
    ? Math.floor(v)
    : 0;
}

export interface TranslateBodyValue {
  text: string;
  target: TranslationTarget;
  provider: Provider;
  apiKey?: string;
}

function parseTranslateTarget(v: unknown): TranslationTarget | null {
  const t = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return t === 'es' || t === 'en' ? t : null;
}

/** Shared body parser for `/api/translate`. */
export function parseTranslateBody(
  body: unknown,
): { ok: true; value: TranslateBodyValue } | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Invalid request body' };
  }
  const b = body as Record<string, unknown>;
  const text = asTrimmedString(b.text);
  if (!text) {
    return { ok: false, error: 'Missing or empty text' };
  }
  if (text.length > MAX_TEXT_CHARS) {
    return {
      ok: false,
      error: `Text is too long (max ${MAX_TEXT_CHARS.toLocaleString()} characters)`,
    };
  }
  const target = parseTranslateTarget(b.targetLang ?? b.target);
  if (!target) {
    return { ok: false, error: "targetLang is required ('es' or 'en')" };
  }
  const rawKey = asTrimmedString(b.apiKey);
  return {
    ok: true,
    value: {
      text,
      target,
      provider: parseProvider(b.provider, 'gemini'),
      ...(rawKey ? { apiKey: rawKey } : {}),
    },
  };
}

/** Shared body parser for `/api/feedback`. */
export function parseFeedbackBody(
  body: unknown,
): { ok: true; value: FeedbackBodyValue } | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Invalid request body' };
  }
  const b = body as Record<string, unknown>;
  const mode = asTrimmedString(b.mode);
  const feedback = asTrimmedString(b.feedback);
  const sessionId = asTrimmedString(b.sessionId) ?? asTrimmedString(b.session_id);
  if (!mode) return { ok: false, error: 'mode is required' };
  if (!feedback) return { ok: false, error: 'feedback is required' };
  if (!sessionId) return { ok: false, error: 'sessionId is required' };
  return {
    ok: true,
    value: {
      mode,
      provider: asTrimmedString(b.provider) ?? 'gemini',
      inputLength: asNonNegativeInt(b.inputLength),
      outputLength: asNonNegativeInt(b.outputLength),
      feedback: feedback.slice(0, 2000),
      sessionId: sessionId.slice(0, MAX_ID_CHARS),
    },
  };
}
