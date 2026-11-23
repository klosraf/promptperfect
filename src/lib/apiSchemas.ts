/**
 * Hand-rolled request validation for API routes (typed, tested, zero deps —
 * see `lib/config.ts` for why Zod is not a direct dependency right now).
 *
 * Convention: parsers return `{ ok: true, value }` or `{ ok: false, error }`
 * where `error` is already a user-facing message suitable for a 400 body.
 */

import type { OptimizationMode, Provider } from '@/lib/types';
import type { TranslationTarget } from '@/lib/translation';
import { assertGuestId } from '@/lib/guest';

export const MAX_PROMPT_CHARS = 100_000;
export const MAX_ID_CHARS = 200;
export const MAX_TEXT_CHARS = 50_000;
export const MAX_PATH_CHARS = 1024;

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
  // EGM F2-03: feedback is a vote, not free text — the DB column has no
  // CHECK, so the parser is the only enum enforcement. Anything else is
  // a malformed client, not data.
  if (feedback !== 'up' && feedback !== 'down') {
    return { ok: false, error: 'feedback must be "up" or "down"' };
  }
  if (!sessionId) return { ok: false, error: 'sessionId is required' };
  return {
    ok: true,
    value: {
      mode,
      provider: asTrimmedString(b.provider) ?? 'gemini',
      inputLength: asNonNegativeInt(b.inputLength),
      outputLength: asNonNegativeInt(b.outputLength),
      feedback,
      sessionId: sessionId.slice(0, MAX_ID_CHARS),
    },
  };
}

const MAX_EMAIL_CHARS = 320;
const MAX_PASSWORD_CHARS = 200;

export interface CredentialsBodyValue {
  /** Trimmed + lowercased email (for auth calls). */
  email: string;
  /** Trimmed original-case email (for downstream display/personalization). */
  rawEmail: string;
  password: string;
}

/**
 * Shared credentials parser for `/api/auth/login` (and reusable for other
 * password routes). Returns a single, non-enumerating error message for
 * missing/oversized fields so it never leaks which credential is wrong.
 */
export function parseLoginBody(
  body: unknown,
): { ok: true; value: CredentialsBodyValue } | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Email and password are required' };
  }
  const b = body as Record<string, unknown>;
  const rawEmail = typeof b.email === 'string' ? b.email.trim() : '';
  const password = typeof b.password === 'string' ? b.password : '';
  if (!rawEmail || !password) {
    return { ok: false, error: 'Email and password are required' };
  }
  if (rawEmail.length > MAX_EMAIL_CHARS || password.length > MAX_PASSWORD_CHARS) {
    return { ok: false, error: 'Email and password are required' };
  }
  return { ok: true, value: { email: rawEmail.toLowerCase(), rawEmail, password } };
}

const UPDATE_USER_PROVIDERS: readonly string[] = ['gemini', 'openai', 'anthropic'];
const UPDATE_USER_MAX_MODEL_CHARS = 128;
/** BYOK keys are ~50–200 chars; cap generously to bound row size. */
const UPDATE_USER_MAX_API_KEY_CHARS = 2000;

export interface UpdateUserBodyValue {
  provider?: string;
  model?: string;
}

/**
 * Shared parser for `/api/auth/update-user`. `provider` is allow-listed and
 * lowercased; `model` is length-bounded. Returns the exact user-facing error
 * for a 400 body. A BYOK `api_key` field from an already-deployed client is
 * still validated (same 400 contract) and then DISCARDED: the server never
 * persists user API keys (ADR-0010), so it is absent from the returned value.
 */
export function parseUpdateUserBody(
  body: unknown,
): { ok: true; value: UpdateUserBodyValue } | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Invalid request' };
  }
  const b = body as Record<string, unknown>;
  const value: UpdateUserBodyValue = {};

  if (b.provider !== undefined) {
    const p = typeof b.provider === 'string' ? b.provider.trim().toLowerCase() : '';
    if (!UPDATE_USER_PROVIDERS.includes(p)) return { ok: false, error: 'Invalid provider' };
    value.provider = p;
  }
  if (b.model !== undefined) {
    const m = typeof b.model === 'string' ? b.model.trim() : '';
    if (m.length === 0 || m.length > UPDATE_USER_MAX_MODEL_CHARS) {
      return { ok: false, error: 'Invalid model' };
    }
    value.model = m;
  }
  if (b.api_key !== undefined) {
    const k = typeof b.api_key === 'string' ? b.api_key.trim() : '';
    if (k.length > UPDATE_USER_MAX_API_KEY_CHARS) {
      return { ok: false, error: 'Invalid api_key' };
    }
    // Validated above; intentionally not copied into the value (ADR-0010).
    void k;
  }
  return { ok: true, value };
}

export interface ClaimGuestHistoryBodyValue {
  guestId: string;
  targetSessionId: string;
}
/**
 * Shared parser for `/api/auth/claim-guest-history`. Validates the guest id
 * via `assertGuestId`, requires a bounded `targetSessionId`, and rejects the
 * self-claim case (guest === target). Single non-enumerating error.
 */
export function parseClaimGuestHistoryBody(
  body: unknown,
): { ok: true; value: ClaimGuestHistoryBodyValue } | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Invalid payload' };
  }
  const b = body as Record<string, unknown>;
  const guestId = assertGuestId(b.guestId);
  const targetSessionId =
    typeof b.targetSessionId === 'string' ? b.targetSessionId.trim() : '';
  if (
    !guestId ||
    !targetSessionId ||
    targetSessionId.length > 200 ||
    guestId === targetSessionId
  ) {
    return { ok: false, error: 'Invalid payload' };
  }
  return { ok: true, value: { guestId, targetSessionId } };
}

export interface SaveHistoryBodyValue {
  session_id: string;
  prompt_original: string;
  prompt_optimized: string;
  mode: string;
  explanation: string;
  provider: string | null;
  optimize_session_id: string | null;
}
/**
 * Shared parser for `/api/save-history`. Extracts the history row fields and
 * bounds `prompt_original`/`prompt_optimized` against the same budget as
 * `parseOptimizeBody` (DoS defense) — the route previously had no cap.
 */
export interface LocalScanBodyValue {
  dir: string;
  audit?: 'system';
}

/**
 * Shared parser for `/api/local-scan`. `dir` is a bounded absolute-path
 * string (resolution + allowlist happen in the route); `audit` is an
 * allow-listed literal — anything else is ignored so unknown modes can
 * never widen the scan surface.
 */
export function parseLocalScanBody(
  body: unknown,
): { ok: true; value: LocalScanBodyValue } | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Invalid request body' };
  }
  const b = body as Record<string, unknown>;
  const dir = typeof b.dir === 'string' ? b.dir.trim() : '';
  if (!dir || dir.length > MAX_PATH_CHARS) {
    return { ok: false, error: 'Missing or invalid dir' };
  }
  const value: LocalScanBodyValue = { dir };
  if (b.audit === 'system') value.audit = 'system';
  return { ok: true, value };
}

export function parseSaveHistoryBody(
  body: unknown,
): { ok: true; value: SaveHistoryBodyValue } | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Invalid JSON' };
  }
  const b = body as Record<string, unknown>;
  const session_id = typeof b.session_id === 'string' ? b.session_id.trim() : '';
  const prompt_original = typeof b.prompt_original === 'string' ? b.prompt_original : '';
  const prompt_optimized = typeof b.prompt_optimized === 'string' ? b.prompt_optimized : '';
  if (!session_id || !prompt_original || !prompt_optimized) {
    return { ok: false, error: 'Missing required fields' };
  }
  if (prompt_original.length > MAX_PROMPT_CHARS || prompt_optimized.length > MAX_PROMPT_CHARS) {
    return {
      ok: false,
      error: `Prompt is too long (max ${MAX_PROMPT_CHARS.toLocaleString()} characters)`,
    };
  }
  // EGM F1-03: mirror the DB CHECK bounds (migration 20261012:
  // session_id 1-300, explanation <= 20000) so an oversized payload is a
  // clean 400 here instead of a generic 500 from a rejected insert.
  if (session_id.length > 300) {
    return { ok: false, error: 'session_id is too long (max 300 characters)' };
  }
  const explanationRaw = typeof b.explanation === 'string' ? b.explanation : '';
  if (explanationRaw.length > 20000) {
    return { ok: false, error: 'explanation is too long (max 20000 characters)' };
  }
  return {
    ok: true,
    value: {
      session_id,
      prompt_original,
      prompt_optimized,
      mode: typeof b.mode === 'string' ? b.mode : 'better',
      explanation: explanationRaw,
      provider: typeof b.provider === 'string' ? b.provider : null,
      optimize_session_id:
        typeof b.optimize_session_id === 'string' ? b.optimize_session_id : null,
    },
  };
}
