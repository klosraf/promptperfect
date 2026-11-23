import { describe, expect, it } from "vitest";
import {
  analyzePrompt,
  compileTemplate,
  estimateTokens,
  extractVariables,
} from "./promptAnalysis";

describe("analyzePrompt", () => {
  it("returns zeros for an empty draft without findings", () => {
    const a = analyzePrompt("   ");
    expect(a.scores.overall).toBe(0);
    expect(a.findings).toEqual([]);
    expect(a.words).toBe(0);
  });

  it("flags a very short draft as high severity", () => {
    const a = analyzePrompt("write something good");
    expect(a.findings.some((f) => f.id === "too-short")).toBe(true);
    expect(a.findings.some((f) => f.id === "vague-terms")).toBe(true);
  });

  it("detects missing format, constraints and success criteria with fixes", () => {
    const a = analyzePrompt(
      "Summarise the attached quarterly report for the leadership team in plain language.",
    );
    const ids = a.findings.map((f) => f.id);
    expect(ids).toContain("no-output-format");
    expect(ids).toContain("no-constraints");
    expect(ids).toContain("no-success");
    const fix = a.findings.find((f) => f.id === "no-output-format")?.fix;
    expect(fix?.("Base text")).toContain("Output format:");
  });

  it("scores a complete prompt high with no medium/high findings", () => {
    const complete = [
      "You are writing for engineering managers who know our platform.",
      "Summarise the incident report and return a table with one row per incident.",
      "Constraints: under 300 words, never speculate about root cause, only use facts from the report.",
      "Success looks like: a manager can decide on escalation from the summary alone.",
    ].join("\n");
    const a = analyzePrompt(complete);
    expect(a.findings.filter((f) => f.severity === "high" || f.severity === "medium")).toEqual([]);
    expect(a.scores.overall).toBeGreaterThanOrEqual(80);
  });

  it("extracts variables and reports them as info", () => {
    const a = analyzePrompt("Write a welcome email for {{name}} joining {{ team }}.");
    expect(a.variables).toEqual(["name", "team"]);
    expect(a.findings.some((f) => f.id === "variables" && f.severity === "info")).toBe(true);
  });
});

describe("template helpers", () => {
  it("extractVariables dedupes and trims spaces", () => {
    expect(extractVariables("{{a}} {{ a }} {{b.c}}")).toEqual(["a", "b.c"]);
  });

  it("compileTemplate fills known values and keeps unknown placeholders", () => {
    expect(compileTemplate("Hi {{name}}, role: {{role}}", { name: "Ana" })).toBe(
      "Hi Ana, role: {{role}}",
    );
  });

  it("estimateTokens is a ceil of chars/4", () => {
    expect(estimateTokens("123456789")).toBe(3);
    expect(estimateTokens("")).toBe(0);
  });
});
