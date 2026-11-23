import { describe, it, expect, vi, beforeEach } from "vitest";
import { GUEST_LIMIT } from "@/lib/guest";
import * as supabaseLib from "@/lib/server/supabase";
import { GET, POST } from "./route";
import { resetRateLimits } from "@/lib/auth/rateLimit";

vi.mock("@/lib/server/supabase", () => ({
  getServiceClient: vi.fn(),
  getSupabaseAdminClient: vi.fn(),
}));

function buildGuestUsageClient() {
  const upsert = vi.fn().mockResolvedValue({});
  const single = vi
    .fn()
    .mockResolvedValue({ data: { optimization_count: 0 } });
  const rpc = vi
    .fn()
    .mockResolvedValue({ data: [{ optimization_count: 1 }], error: null });
  const from = vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single,
      })),
    })),
    upsert,
  }));
  return { from, upsert, single, rpc };
}

type GuestClient = ReturnType<typeof buildGuestUsageClient>;

function asClient(c: GuestClient) {
  return c as unknown as NonNullable<
    ReturnType<typeof supabaseLib.getSupabaseAdminClient>
  >;
}

/** Unique IP per test so the in-memory limiter never bleeds between cases. */
let ipSeed = 0;
function nextIp(): string {
  ipSeed += 1;
  return `203.0.113.${ipSeed}`;
}

function postRequest(ip: string): Request {
  return new Request("http://localhost/api/guest-usage", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ guestId: "guest_test123" }),
  });
}

describe("/api/guest-usage GET", () => {
  it("returns default count and limit when guestId is missing", async () => {
    const res = await GET(new Request("http://localhost/api/guest-usage"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.count).toBe(0);
    expect(data.limit).toBe(GUEST_LIMIT);
    expect(data.remaining).toBe(GUEST_LIMIT);
  });
});

describe("/api/guest-usage POST", () => {
  beforeEach(() => {
    vi.mocked(supabaseLib.getServiceClient).mockReset();
    vi.mocked(supabaseLib.getSupabaseAdminClient).mockReset();
    resetRateLimits();
  });

  it("returns 400 when guestId is missing", async () => {
    const client = buildGuestUsageClient();
    vi.mocked(supabaseLib.getSupabaseAdminClient).mockReturnValue(
      asClient(client),
    );

    const res = await POST(
      new Request("http://localhost/api/guest-usage", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": nextIp() },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/Guest ID required/i);
  });

  it("returns 503 when Supabase is not configured", async () => {
    vi.mocked(supabaseLib.getSupabaseAdminClient).mockReturnValue(null);

    const res = await POST(postRequest(nextIp()));
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toMatch(/Database not configured/i);
  });

  it("throttles an anonymous IP that exceeds the per-minute budget", async () => {
    vi.mocked(supabaseLib.getSupabaseAdminClient).mockReturnValue(null);

    const ip = nextIp();
    // 30 requests per minute are allowed; the throttle fires before any
    // Supabase work, so the 31st must be rejected with a 429.
    let last: Response | undefined;
    for (let i = 0; i < 30; i++) {
      last = await POST(postRequest(ip));
      expect(last.status).toBe(503);
    }

    const blocked = await POST(postRequest(ip));
    expect(blocked.status).toBe(429);
    const data = await blocked.json();
    expect(data.error).toMatch(/too many requests/i);
  });
});


describe("/api/guest-usage POST — atomic RPC (EGM E5)", () => {
  beforeEach(() => {
    vi.mocked(supabaseLib.getSupabaseAdminClient).mockReset();
    resetRateLimits();
  });

  it("increments atomically via the RPC and returns the new count", async () => {
    const client = buildGuestUsageClient();
    client.rpc.mockResolvedValue({
      data: [{ optimization_count: 3 }],
      error: null,
    });
    vi.mocked(supabaseLib.getSupabaseAdminClient).mockReturnValue(
      asClient(client),
    );
    const res = await POST(postRequest(nextIp()));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.count).toBe(3);
    expect(data.remaining).toBe(GUEST_LIMIT - 3);
    expect(client.rpc).toHaveBeenCalledWith(
      "increment_guest_usage",
      expect.objectContaining({ p_limit: GUEST_LIMIT }),
    );
    // The legacy racy path must not run when the RPC succeeds.
    expect(client.upsert).not.toHaveBeenCalled();
  });

  it("returns 429 when the RPC reports the quota exhausted (zero rows)", async () => {
    const client = buildGuestUsageClient();
    client.rpc.mockResolvedValue({ data: [], error: null });
    client.single.mockResolvedValue({
      data: { optimization_count: GUEST_LIMIT },
    });
    vi.mocked(supabaseLib.getSupabaseAdminClient).mockReturnValue(
      asClient(client),
    );
    const res = await POST(postRequest(nextIp()));
    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.limitReached).toBe(true);
    expect(data.count).toBe(GUEST_LIMIT);
  });

  it("falls back to the legacy path only when the RPC is missing (PGRST202)", async () => {
    const client = buildGuestUsageClient();
    client.rpc.mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "function not found" },
    });
    vi.mocked(supabaseLib.getSupabaseAdminClient).mockReturnValue(
      asClient(client),
    );
    const res = await POST(postRequest(nextIp()));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.count).toBe(1);
    expect(client.upsert).toHaveBeenCalledTimes(1);
  });

  it("returns 500 for other RPC errors (no silent downgrade)", async () => {
    const client = buildGuestUsageClient();
    client.rpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "permission denied" },
    });
    vi.mocked(supabaseLib.getSupabaseAdminClient).mockReturnValue(
      asClient(client),
    );
    const res = await POST(postRequest(nextIp()));
    expect(res.status).toBe(500);
    expect(client.upsert).not.toHaveBeenCalled();
  });
});
