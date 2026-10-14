import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';

const { mockGetServiceClient, mockMaybeSingle } = vi.hoisted(() => ({
  mockGetServiceClient: vi.fn(),
  mockMaybeSingle: vi.fn(),
}));

vi.mock('@/lib/server/supabase', () => ({
  getServiceClient: (...args: unknown[]) => mockGetServiceClient(...args),
}));

function get(url: string) {
  return new Request(url, { method: 'GET' });
}

function chainFeedback(result: { data: unknown; error: unknown }) {
  mockMaybeSingle.mockResolvedValue(result);
  const limit = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
  const order = vi.fn().mockReturnValue({ limit });
  const eq = vi.fn().mockReturnValue({ order });
  const select = vi.fn().mockReturnValue({ eq });
  return { from: vi.fn().mockReturnValue({ select }) };
}

describe('/api/feedback/status GET', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns submitted:false without a session id', async () => {
    const res = await GET(get('http://localhost/api/feedback/status'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ submitted: false, feedback: null });
  });

  it('returns submitted:false when Supabase is not configured', async () => {
    mockGetServiceClient.mockReturnValue(null);
    const res = await GET(get('http://localhost/api/feedback/status?session_id=abc'));
    expect(await res.json()).toEqual({ submitted: false, feedback: null });
  });

  it.each([
    [{ feedback: 'up' }, { submitted: true, feedback: 'up' }],
    [{ feedback: ' DOWN ' }, { submitted: true, feedback: 'down' }],
    [{ feedback: 'meh' }, { submitted: false, feedback: null }],
  ])('maps row %j to %j', async (row, expected) => {
    mockGetServiceClient.mockReturnValue(chainFeedback({ data: row, error: null }));
    const res = await GET(get('http://localhost/api/feedback/status?session_id=s1'));
    expect(await res.json()).toEqual(expected);
  });

  it('returns submitted:false on query error or missing row', async () => {
    mockGetServiceClient.mockReturnValue(chainFeedback({ data: null, error: { message: 'boom' } }));
    const res = await GET(get('http://localhost/api/feedback/status?session_id=s1'));
    expect(await res.json()).toEqual({ submitted: false, feedback: null });
  });
});
