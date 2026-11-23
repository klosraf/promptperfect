import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PromptAnalysisPanel } from "./PromptAnalysisPanel";

describe("PromptAnalysisPanel", () => {
  it("renders nothing for an empty draft", () => {
    const { container } = render(
      <PromptAnalysisPanel text="   " onApplyFix={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows dimension scores and findings for a vague draft", () => {
    render(<PromptAnalysisPanel text="write something good" onApplyFix={() => {}} />);
    expect(screen.getByText("Prompt analysis")).toBeInTheDocument();
    expect(screen.getByText("Clarity")).toBeInTheDocument();
    expect(screen.getByText(/Vague wording/)).toBeInTheDocument();
  });

  it("applies a scaffold fix through onApplyFix", () => {
    const onApplyFix = vi.fn();
    render(
      <PromptAnalysisPanel
        text="Summarise the attached quarterly report for the leadership team in plain language."
        onApplyFix={onApplyFix}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add format scaffold" }));
    expect(onApplyFix).toHaveBeenCalledTimes(1);
    expect(String(onApplyFix.mock.calls[0]?.[0])).toContain("Output format:");
  });

  it("renders variable inputs and a compiled preview", () => {
    render(
      <PromptAnalysisPanel
        text="Write a welcome email for {{name}} joining the team."
        onApplyFix={() => {}}
      />,
    );
    const input = screen.getByPlaceholderText("test value");
    fireEvent.change(input, { target: { value: "Ana" } });
    expect(screen.getByText(/Write a welcome email for Ana/)).toBeInTheDocument();
  });
});
