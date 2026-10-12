import { describe, it, expect, vi, afterEach } from 'vitest';
import { checkRateLimit } from './rateLimit';

describe('checkRateLimit', () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_UNLIMITED_MODE;
    vi.useRealTimers();
  });

  it('allows attempts up to the limit, then blocks', () => {
    const ip = 'rate-test-limit';
    expect(checkRateLimit(ip, 3)).toBe(true);
    expect(checkRateLimit(ip, 3)).toBe(true);
    expect(checkRateLimit(ip, 3)).toBe(true);
    expect(checkRateLimit(ip, 3)).toBe(false);
  });

  it('defaults to 5 attempts per minute', () => {
    const ip = 'rate-test-default';
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(ip)).toBe(true);
    }
    expect(checkRateLimit(ip)).toBe(false);
  });

  it('tracks IPs independently', () => {
    expect(checkRateLimit('rate-test-a', 1)).toBe(true);
    expect(checkRateLimit('rate-test-a', 1)).toBe(false);
    expect(checkRateLimit('rate-test-b', 1)).toBe(true);
  });

  it('opens a new window after 60 seconds', () => {
    vi.useFakeTimers();
    const ip = 'rate-test-window';
    expect(checkRateLimit(ip, 1)).toBe(true);
    expect(checkRateLimit(ip, 1)).toBe(false);
    vi.setSystemTime(Date.now() + 61_000);
    expect(checkRateLimit(ip, 1)).toBe(true);
  });

  it('disables throttling in unlimited local-dev mode', () => {
    process.env.NEXT_PUBLIC_UNLIMITED_MODE = 'true';
    const ip = 'rate-test-unlimited';
    for (let i = 0; i < 10; i++) {
      expect(checkRateLimit(ip, 1)).toBe(true);
    }
  });
});
