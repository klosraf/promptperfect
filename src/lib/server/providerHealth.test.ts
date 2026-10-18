import { describe, it, expect, beforeEach } from 'vitest';

import {
  isDegraded,
  recordProviderFailure,
  resetProviderHealth,
} from './providerHealth';

beforeEach(() => {
  resetProviderHealth();
});

describe('providerHealth', () => {
  it('is healthy with no failures', () => {
    expect(isDegraded()).toBe(false);
  });

  it('degrades after the threshold within the window', () => {
    for (let i = 0; i < 4; i++) recordProviderFailure();
    expect(isDegraded()).toBe(false);
    recordProviderFailure();
    expect(isDegraded()).toBe(true);
  });

  it('recovers when failures age out of the window', () => {
    for (let i = 0; i < 5; i++) recordProviderFailure();
    expect(isDegraded()).toBe(true);
    expect(isDegraded(Date.now() + 6 * 60 * 1000)).toBe(false);
  });
});
