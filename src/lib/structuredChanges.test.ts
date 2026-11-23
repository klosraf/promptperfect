import { describe, expect, it } from "vitest";
import { parseStructuredChanges } from "./structuredChanges";

describe("parseStructuredChanges", () => {
  it("parses tagged lines into methods", () => {
    const out = parseStructuredChanges(
      "- [ADD] Added a word budget.\n- [REPLACE] Swapped the intro for a role definition.\n- [EXAMPLE] Added one worked example.",
    );
    expect(out).toEqual([
      { method: "ADD", text: "Added a word budget." },
      { method: "REPLACE", text: "Swapped the intro for a role definition." },
      { method: "EXAMPLE", text: "Added one worked example." },
    ]);
  });

  it("keeps untagged legacy lines as OTHER, text unchanged", () => {
    const out = parseStructuredChanges("- Clarified the goal.\n- Tightened the format.");
    expect(out).toEqual([
      { method: "OTHER", text: "Clarified the goal." },
      { method: "OTHER", text: "Tightened the format." },
    ]);
  });

  it("is case-insensitive on tags and tolerant of blank lines", () => {
    const out = parseStructuredChanges("\n- [delete] Removed the greeting.\n\n");
    expect(out).toEqual([{ method: "DELETE", text: "Removed the greeting." }]);
  });

  it("returns [] for empty input", () => {
    expect(parseStructuredChanges("")).toEqual([]);
    expect(parseStructuredChanges("  \n ")).toEqual([]);
  });
});
