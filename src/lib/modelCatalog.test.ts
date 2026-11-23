import { describe, it, expect } from 'vitest';
import {
  PROVIDERS,
  DEFAULT_MODEL_IDS,
  PROVIDER_LABELS,
} from './modelCatalog';

describe('modelCatalog (EGM E3)', () => {
  it('covers exactly the three providers', () => {
    expect([...PROVIDERS].sort()).toEqual(['anthropic', 'gemini', 'openai']);
  });

  it('pins the real default model ids', () => {
    expect(DEFAULT_MODEL_IDS).toEqual({
      gemini: 'gemini-3.5-flash',
      openai: 'gpt-6-astra',
      anthropic: 'claude-3-5-haiku-latest',
    });
  });

  it('labels name the default models (no stale model names)', () => {
    for (const p of PROVIDERS) {
      expect(PROVIDER_LABELS[p]).not.toMatch(/2\.0|4o-mini|20241022/);
    }
    expect(PROVIDER_LABELS.gemini).toContain('3.5');
    expect(PROVIDER_LABELS.openai).toContain('GPT-6');
    expect(PROVIDER_LABELS.anthropic).toContain('Haiku');
  });
});
