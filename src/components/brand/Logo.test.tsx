import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Logo } from "./Logo";

describe("Logo", () => {
  it("renders the brand mark as decorative svg with the requested size", () => {
    const { container } = render(<Logo size={32} />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("width")).toBe("32");
    expect(svg?.getAttribute("height")).toBe("32");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    // Tile + prompt-as-given chevron + returned chevron + 2 annotation strokes + cursor
    expect(container.querySelectorAll("path")).toHaveLength(5);
    expect(container.querySelector("rect")).not.toBeNull();
  });

  it("defaults to 28px", () => {
    const { container } = render(<Logo />);
    expect(container.querySelector("svg")?.getAttribute("width")).toBe("28");
  });
});
