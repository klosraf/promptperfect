import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BootSplash } from "./BootSplash";
import { WorkspaceSkeleton } from "@/components/workspace/WorkspaceSkeleton";

describe("BootSplash", () => {
  it("exposes a status role with the loading label", () => {
    render(<BootSplash />);
    expect(screen.getByRole("status")).toHaveAttribute(
      "aria-label",
      "Loading PromptPerfect",
    );
    expect(screen.getByText("PromptPerfect")).toBeInTheDocument();
  });

  it("accepts a route-specific label", () => {
    render(<BootSplash label="Loading shared prompt" />);
    expect(screen.getByRole("status")).toHaveAttribute(
      "aria-label",
      "Loading shared prompt",
    );
  });
});

describe("WorkspaceSkeleton", () => {
  it("announces the busy workspace region", () => {
    const { container } = render(<WorkspaceSkeleton />);
    const root = container.firstElementChild;
    expect(root).toHaveAttribute("aria-busy", "true");
    expect(root).toHaveAttribute("aria-label", "Loading workspace");
    expect(screen.getByText("Loading workspace…")).toBeInTheDocument();
  });
});
