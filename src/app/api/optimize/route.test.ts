import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

vi.mock("@/lib/server/supabase", () => ({
  getServiceClient: () => null,
}));

const createProvider = vi.fn((...args: unknown[]) => {
  void args;
  return {
    model: {},
    modelId: "test-model",
  };
});
vi.mock("@/lib/providers", () => ({
  createProvider: (...args: unknown[]) => createProvider(...args),
  getProviderCallOptions: () => ({}),
}));

const resolveIdentity = vi.fn(async (...args: unknown[]) => {
  void args;
  return undefined;
});
vi.mock("@/lib/server/supabaseRequestIdentity", () => ({
  resolveIdentity: (...args: unknown[]) => resolveIdentity(...args),
}));

const streamText = vi.fn();
vi.mock("ai", () => ({
  streamText: (...args: unknown[]) => streamText(...args),
}));

describe("/api/optimize POST", () => {
  beforeEach(() => {
    streamText.mockReset();
    createProvider.mockClear();
    resolveIdentity.mockClear();
    resolveIdentity.mockResolvedValue(undefined);
    // NOTE: ai v6 `streamText` returns the result object synchronously.
    streamText.mockReturnValue({
      toTextStreamResponse: (init?: ResponseInit) =>
        new Response("streamed-output", init),
    });
  });

  it("streams output for a valid prompt", async () => {
    const res = await POST(
      new Request("http://localhost/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "Hello world", mode: "better" }),
      })
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("streamed-output");
    expect(streamText).toHaveBeenCalledTimes(1);
    const firstCall = streamText.mock.calls[0];
    expect(firstCall).toBeDefined();
    const call = (firstCall?.[0] ?? {}) as { prompt?: string };
    expect(call.prompt).toBe("Hello world");
  });

  it("returns 400 for missing prompt", async () => {
    const res = await POST(
      new Request("http://localhost/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "better" }),
      })
    );
    expect(res.status).toBe(400);
    expect(streamText).not.toHaveBeenCalled();
  });

  it("returns 400 for oversized prompt", async () => {
    const res = await POST(
      new Request("http://localhost/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "x".repeat(100_001) }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("throttles an IP that exceeds the per-minute budget", async () => {
    // 20 requests per minute are allowed; without a BYOK key the route would
    // otherwise spend the server's own provider quota on every call.
    const ip = "198.51.100.7";
    const req = () =>
      new Request("http://localhost/api/optimize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": ip,
        },
        body: JSON.stringify({ prompt: "Hello world", mode: "better" }),
      });

    let last: Response | undefined;
    for (let i = 0; i < 20; i++) {
      last = await POST(req());
      expect(last.status).toBe(200);
    }

    const blocked = await POST(req());
    expect(blocked.status).toBe(429);
    expect(streamText).toHaveBeenCalledTimes(20);
  });

  it("honors a non-Gemini provider when a BYOK key is present (EGM F1-01)", async () => {
    const res = await POST(
      new Request("http://localhost/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "Hello world",
          mode: "better",
          provider: "openai",
          apiKey: "sk-test-byok",
        }),
      })
    );
    expect(res.status).toBe(200);
    expect(createProvider).toHaveBeenCalledWith("openai", "sk-test-byok");
    expect(res.headers.get("x-promptperfect-provider")).toBe("openai");
    expect(res.headers.get("x-promptperfect-model")).toBe("test-model");
  });

  it("degrades an anonymous non-Gemini request to Gemini and says so (EGM F2-01 guard)", async () => {
    const res = await POST(
      new Request("http://localhost/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "Hello world",
          mode: "better",
          provider: "anthropic",
        }),
      })
    );
    expect(res.status).toBe(200);
    expect(createProvider).toHaveBeenCalledWith("gemini", undefined);
    expect(res.headers.get("x-promptperfect-provider")).toBe("gemini");
  });
});
