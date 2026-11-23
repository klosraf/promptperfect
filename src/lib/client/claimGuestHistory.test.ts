'use client';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { claimGuestHistoryAfterAuth } from './claimGuestHistory';

const GUEST_ID = 'guest_test123456';

function seedGuest() {
  localStorage.setItem('pp_guest_id', GUEST_ID);
  sessionStorage.clear();
  localStorage.setItem(
    'pp_history_session_id',
    'session-target-123456',
  );
}

function mockClaimResponse(status: number, body: unknown) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/auth/claim-guest-history')) {
      return new Response(JSON.stringify(body), { status });
    }
    return new Response('{}', { status: 200 });
  });
}

describe('claimGuestHistoryAfterAuth (EGM E5 / F5-11)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    seedGuest();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('clears the guest id only when the server confirms the claim', async () => {
    vi.stubGlobal(
      'fetch',
      mockClaimResponse(200, { ok: true, migrated: 2 }),
    );
    await claimGuestHistoryAfterAuth();
    expect(localStorage.getItem('pp_guest_id')).toBeNull();
  });

  it('keeps the guest id on an honest 503 so the claim retries later', async () => {
    vi.stubGlobal(
      'fetch',
      mockClaimResponse(503, { error: 'Server not configured' }),
    );
    await claimGuestHistoryAfterAuth();
    expect(localStorage.getItem('pp_guest_id')).toBe(GUEST_ID);
  });

  it('keeps the guest id on the legacy skipped shape', async () => {
    vi.stubGlobal(
      'fetch',
      mockClaimResponse(200, { ok: true, skipped: true, migrated: 0 }),
    );
    await claimGuestHistoryAfterAuth();
    expect(localStorage.getItem('pp_guest_id')).toBe(GUEST_ID);
  });

  it('never issues a direct anon update against the history table', async () => {
    const fetchMock = mockClaimResponse(200, { ok: true, migrated: 0 });
    vi.stubGlobal('fetch', fetchMock);
    await claimGuestHistoryAfterAuth();
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('pp_optimization_history'))).toBe(false);
  });
});

describe('claimGuestHistoryAfterAuth — local rows (Goldfish P2, cierre)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    seedGuest();
    localStorage.setItem(
      'pp:optimization_history_local',
      JSON.stringify([
        {
          id: 'row-local-1',
          session_id: GUEST_ID,
          prompt_original: 'a',
          prompt_optimized: 'b',
          mode: 'better',
          explanation: '',
          created_at: '2026-11-12T00:00:00.000Z',
        },
      ]),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not re-post local rows on the next sign-in when the server claim is pending (503)', async () => {
    const fetchMock = mockClaimResponse(503, { error: 'not configured' });
    vi.stubGlobal('fetch', fetchMock);
    await claimGuestHistoryAfterAuth();
    // Guest identity kept for the server-claim retry…
    expect(localStorage.getItem('pp_guest_id')).toBe(GUEST_ID);
    // …but the accepted row is gone locally, so it cannot duplicate.
    expect(localStorage.getItem('pp:optimization_history_local')).toBe('[]');
    await claimGuestHistoryAfterAuth();
    const historyPosts = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('/api/history'),
    );
    expect(historyPosts).toHaveLength(1);
  });
});
