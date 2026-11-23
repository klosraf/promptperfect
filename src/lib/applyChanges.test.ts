import { describe, expect, it } from "vitest";
import { applyReverts, checkRevertible } from "./applyChanges";
import type { StructuredChange } from "./structuredChanges";

const OPTIMIZED =
  "Please write a four-line poem in the style of Neruda about the sea.\n\nKeep it under 40 words.";

const replaceChange: StructuredChange = {
  method: "REPLACE",
  text: "«write a poem» → «write a four-line poem» — Set the length.",
  before: "write a poem",
  after: "write a four-line poem",
};
const addChange: StructuredChange = {
  method: "ADD",
  text: "«in the style of Neruda» — Anchored the voice.",
  after: "in the style of Neruda",
};

describe("checkRevertible", () => {
  it("accepts REPLACE and ADD changes whose spans occur exactly once", () => {
    expect(checkRevertible(replaceChange, OPTIMIZED)).toEqual({ ok: true });
    expect(checkRevertible(addChange, OPTIMIZED)).toEqual({ ok: true });
  });

  it("rejects descriptive methods and span-less changes", () => {
    expect(
      checkRevertible({ method: "DELETE", text: "Removed the greeting." }, OPTIMIZED),
    ).toEqual({ ok: false, reason: "method" });
    expect(checkRevertible({ method: "ADD", text: "Added a thing." }, OPTIMIZED)).toEqual({
      ok: false,
      reason: "no-spans",
    });
  });

  it("rejects spans that are missing or ambiguous", () => {
    expect(
      checkRevertible({ ...addChange, after: "not in the text" }, OPTIMIZED),
    ).toEqual({ ok: false, reason: "not-found" });
    expect(checkRevertible({ ...addChange, after: "the" }, OPTIMIZED)).toEqual({
      ok: false,
      reason: "ambiguous",
    });
  });
});

describe("applyReverts", () => {
  it("swaps a REPLACE span back to the original wording", () => {
    const out = applyReverts(OPTIMIZED, [replaceChange], new Set([0]));
    expect(out.text).toContain("Please write a poem in the style of Neruda");
    expect(out.applied).toEqual([0]);
    expect(out.skipped).toEqual([]);
  });

  it("removes an ADD span", () => {
    const out = applyReverts(OPTIMIZED, [addChange], new Set([0]));
    expect(out.text).not.toContain("Neruda");
    expect(out.applied).toEqual([0]);
  });

  it("fails closed: a revert that stops matching is skipped, text untouched by it", () => {
    const both: StructuredChange[] = [
      { method: "ADD", text: "x", after: "in the style of Neruda" },
      { method: "REPLACE", text: "y", before: "poem", after: "Neruda about" },
    ];
    const out = applyReverts(OPTIMIZED, both, new Set([0, 1]));
    expect(out.applied).toEqual([0]);
    expect(out.skipped).toHaveLength(1);
    expect(out.skipped[0]?.index).toBe(1);
  });

  it("returns the input untouched when nothing is selected", () => {
    const out = applyReverts(OPTIMIZED, [replaceChange], new Set());
    expect(out.text).toBe(OPTIMIZED);
    expect(out.applied).toEqual([]);
  });
});
