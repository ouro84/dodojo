// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import TomorrowSheet from "./TomorrowSheet";

afterEach(cleanup);

const baseProps = {
  tasks: [],
  timezone: "Europe/Paris",
  aggressivityLevel: "direct" as const,
  voiceSeed: 1,
  onAdd: vi.fn(),
  onAddSubtask: vi.fn(),
  onSetDeadline: vi.fn(),
  onAnnihilate: vi.fn(),
  onBringToToday: vi.fn(),
  addingSubtaskParentId: null,
  isAdding: false,
  pendingMutationIds: new Set<string>(),
};

describe("TomorrowSheet", () => {
  it("affiche le contenu de TomorrowSection (empty state)", () => {
    render(<TomorrowSheet {...baseProps} onClose={vi.fn()} />);
    expect(screen.getByText("Rien de prévu encore pour demain.")).toBeInTheDocument();
  });

  it("appelle onClose au clic sur le bouton Fermer", () => {
    const onClose = vi.fn();
    render(<TomorrowSheet {...baseProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("appelle onClose sur Echap", () => {
    const onClose = vi.fn();
    render(<TomorrowSheet {...baseProps} onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
