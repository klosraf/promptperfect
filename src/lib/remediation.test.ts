import { describe, it, expect } from "vitest";
import { appendRemediationBlock, buildRemediationBlock as buildBlock } from "./remediation";
import { buildRemediationBlock } from "./remediation";

describe("buildRemediationBlock", () => {
  it("returns empty when nothing failed", () => {
    expect(buildRemediationBlock([])).toBe("");
  });

  it("maps known check ids to directives and ignores unknown ones", () => {
    const block = buildRemediationBlock([
      "constraints",
      "nope",
      "success",
    ]);
    expect(block).toContain("Refinement pass");
    expect(block).toContain("- Constraints:");
    expect(block).toContain("- Success criteria:");
    expect(block).not.toContain("nope");
  });

  it("covers every quality check id", () => {
    const block = buildRemediationBlock([
      "length",
      "opener",
      "structure",
      "constraints",
      "format",
      "success",
      "contract",
    ]);
    for (const id of [
      "length",
      "opener",
      "structure",
      "constraints",
      "format",
      "success",
      "contract",
    ]) {
      expect(block.length).toBeGreaterThan(0);
      expect(id).toBeTruthy();
    }
    expect(block.split("\n").filter((l) => l.startsWith("- "))).toHaveLength(7);
  });
});

describe("appendRemediationBlock (EGM E3 dedupe)", () => {
  it("appends once and refuses to stack a second block", () => {
    const block = buildBlock(["length"]);
    const once = appendRemediationBlock("base prompt", block);
    expect(once).toContain("[Refinement pass —");
    expect(appendRemediationBlock(once, block)).toBe(once);
  });

  it("returns the input unchanged for a blank block", () => {
    expect(appendRemediationBlock("base", "   ")).toBe("base");
  });
});

describe("appendRemediationBlock — different block (Goldfish P2, cierre)", () => {
  it("appends a second block whose directives differ", () => {
    const first = appendRemediationBlock("base prompt", buildBlock(["length"]));
    const second = appendRemediationBlock(first, buildBlock(["format"]));
    expect(second).not.toBe(first);
    expect(second).toContain("Output format");
    expect(second.split("[Refinement pass —").length - 1).toBe(2);
  });
});
