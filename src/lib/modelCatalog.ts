import type { Provider } from '@/lib/types';

/**
 * Single source of truth for provider defaults and display labels
 * (EGM E3 / F3-09).
 *
 * INVARIANT: this module is a pure leaf — it imports only types from
 * `@/lib/types` and never providers, config, or server env. It is
 * safe on client and server.
 *
 * The ids below are the DEFAULTS. Environment overrides
 * (`GEMINI_MODEL`, `OPENAI_MODEL`) still win at runtime in
 * `src/lib/providers.ts` and `src/lib/config.ts`; `/api/config`
 * exposes the effective values.
 */
export const PROVIDERS: readonly Provider[] = [
  'gemini',
  'openai',
  'anthropic',
];

export const DEFAULT_MODEL_IDS: Record<Provider, string> = {
  gemini: 'gemini-3.5-flash',
  openai: 'gpt-6-astra',
  anthropic: 'claude-3-5-haiku-latest',
};

/** Human labels naming the model that actually runs by default. */
export const PROVIDER_LABELS: Record<Provider, string> = {
  gemini: 'Gemini 3.5 Flash',
  openai: 'OpenAI GPT-6 Astra',
  anthropic: 'Anthropic Claude 3.5 Haiku',
};
