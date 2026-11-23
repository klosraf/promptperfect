'use client';

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Modal } from "./Modal";

describe("Modal", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <Modal isOpen={false} onClose={() => {}}>
        <h2>Title</h2>
      </Modal>
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders a labelled dialog when open", () => {
    render(
      <Modal isOpen onClose={() => {}} titleId="m-title">
        <h2 id="m-title">Title</h2>
      </Modal>
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "m-title");
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose}>
        <p>body</p>
      </Modal>
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on backdrop click but not on panel click", () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose}>
        <p>body</p>
      </Modal>
    );
    fireEvent.click(screen.getByText("body"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("locks body scroll while open", () => {
    const { unmount } = render(
      <Modal isOpen onClose={() => {}}>
        <p>body</p>
      </Modal>
    );
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });
});


describe("Modal focus trap", () => {
  it("wraps Tab from the last focusable to the first", () => {
    render(
      <Modal isOpen onClose={() => {}}>
        <button type="button">First</button>
        <button type="button">Last</button>
      </Modal>
    );
    const first = screen.getByRole("button", { name: "First" });
    const last = screen.getByRole("button", { name: "Last" });
    last.focus();
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);
  });

  it("wraps Shift+Tab from the first focusable to the last", () => {
    render(
      <Modal isOpen onClose={() => {}}>
        <button type="button">First</button>
        <button type="button">Last</button>
      </Modal>
    );
    const first = screen.getByRole("button", { name: "First" });
    const last = screen.getByRole("button", { name: "Last" });
    first.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });
});
