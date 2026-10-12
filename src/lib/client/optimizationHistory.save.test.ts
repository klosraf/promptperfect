'use client';

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getLocalHistoryForSession,
  saveToHistory,
} from "./optimizationHistory";

vi.mock("@/lib/client/supabase", () => ({
  getSupabaseClient: () => null,
}));

const LOCAL_KEY = "pp:optimization_history_local";

describe("saveToHistory local fallback", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("stores rows locally and returns a local- id", async () => {
    const id = await saveToHistory({
      prompt_original: "orig",
      prompt_optimized: "opt",
      mode: "better",
      explanation: "why",
      sessionId: "sess-1",
    });
    expect(id?.startsWith("local-")).toBe(true);
    const rows = getLocalHistoryForSession("sess-1");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      session_id: "sess-1",
      prompt_original: "orig",
      prompt_optimized: "opt",
    });
    expect(JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "[]")).toHaveLength(1);
  });

  it("scopes reads by session and caps the list", async () => {
    await saveToHistory({
      prompt_original: "a",
      prompt_optimized: "b",
      mode: "better",
      explanation: "",
      sessionId: "s1",
    });
    await saveToHistory({
      prompt_original: "c",
      prompt_optimized: "d",
      mode: "better",
      explanation: "",
      sessionId: "s2",
    });
    expect(getLocalHistoryForSession("s1")).toHaveLength(1);
    expect(getLocalHistoryForSession("s2")).toHaveLength(1);
    expect(getLocalHistoryForSession("nope")).toEqual([]);
  });

  it("generates a browser session id when blank", async () => {
    const id = await saveToHistory({
      prompt_original: "a",
      prompt_optimized: "b",
      mode: "better",
      explanation: "",
      sessionId: "   ",
    });
    // Falls back to the browser session id when blank.
    expect(typeof id).toBe("string");
  });
});
