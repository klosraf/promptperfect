import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

vi.mock("@/lib/server/supabase", () => ({
  getServiceClient: () => null,
}));

vi.mock("@/lib/providers", () => ({
  createProvider: () => ({
    model: {},
    modelId: "test-model",
  }),
}));

const streamText = vi.fn();
vi.mock("ai", () => ({
  streamText: (...args: unknown[]) => streamText(...args),
}));

describe("/api/optimize POST", () => {
  beforeEach(() => {
    streamText.mockReset();
    // NOTE: ai v6 `streamText` returns the result object synchronously.
    streamText.mockReturnValue({
      toTextStreamResponse: () => new Response("streamed-output"),
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
    const call = streamText.mock.calls[0][0] as { prompt?: string };
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
});
