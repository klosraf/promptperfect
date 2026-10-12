import { describe, it, expect } from "vitest";
import {
  parseFeedbackBody,
  parseMode,
  parseOptimizeBody,
  parseProvider,
  parseTranslateBody,
} from "./apiSchemas";

describe("parseMode / parseProvider", () => {
  it("accepts known values case-insensitively, falls back otherwise", () => {
    expect(parseMode("Production")).toBe("production");
    expect(parseMode("nope")).toBe("better");
    expect(parseMode(undefined)).toBe("better");
    expect(parseProvider("OpenAI")).toBe("openai");
    expect(parseProvider("x")).toBe("gemini");
  });
});

describe("parseOptimizeBody", () => {
  it("prefers text over prompt and applies defaults", () => {
    const r = parseOptimizeBody({ text: "  hi  ", prompt: "ignored" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.prompt).toBe("hi");
      expect(r.value.mode).toBe("better");
      expect(r.value.provider).toBe("gemini");
      expect(r.value.version).toBe("v1");
    }
  });

  it("rejects missing, empty, oversized and non-object bodies", () => {
    expect(parseOptimizeBody(null).ok).toBe(false);
    expect(parseOptimizeBody({}).ok).toBe(false);
    expect(parseOptimizeBody({ prompt: "   " }).ok).toBe(false);
    expect(parseOptimizeBody({ prompt: "x".repeat(100_001) }).ok).toBe(false);
  });

  it("keeps apiKey/sessionId/version when valid", () => {
    const r = parseOptimizeBody({
      prompt: "hi",
      mode: "cot",
      provider: "openai",
      apiKey: "sk-x",
      session_id: "s1",
      version: "v2",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toMatchObject({
        mode: "cot",
        provider: "openai",
        apiKey: "sk-x",
        sessionId: "s1",
        version: "v2",
      });
    }
  });
});

describe("parseTranslateBody", () => {
  it("parses text, target, provider and apiKey", () => {
    const r = parseTranslateBody({
      text: "  hello  ",
      targetLang: "ES",
      provider: "openai",
      apiKey: "sk-x",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toMatchObject({
        text: "hello",
        target: "es",
        provider: "openai",
        apiKey: "sk-x",
      });
    }
  });

  it("accepts legacy target alias and defaults provider", () => {
    const r = parseTranslateBody({ text: "hola", target: "en" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.target).toBe("en");
      expect(r.value.provider).toBe("gemini");
      expect(r.value.apiKey).toBeUndefined();
    }
  });

  it("rejects missing, empty, oversized and mistargeted bodies", () => {
    expect(parseTranslateBody(null).ok).toBe(false);
    expect(parseTranslateBody({}).ok).toBe(false);
    expect(parseTranslateBody({ text: "   ", targetLang: "es" }).ok).toBe(false);
    expect(parseTranslateBody({ text: "x".repeat(50_001), targetLang: "es" }).ok).toBe(false);
    expect(parseTranslateBody({ text: "hi" }).ok).toBe(false);
    expect(parseTranslateBody({ text: "hi", targetLang: "fr" }).ok).toBe(false);
  });
});

describe("parseFeedbackBody", () => {
  it("requires mode, feedback and sessionId", () => {
    expect(parseFeedbackBody(null).ok).toBe(false);
    expect(parseFeedbackBody({ mode: "better" }).ok).toBe(false);
    const r = parseFeedbackBody({
      mode: "better",
      feedback: "up",
      sessionId: "s1",
      inputLength: 12.7,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.inputLength).toBe(12);
      expect(r.value.provider).toBe("gemini");
    }
  });
});
