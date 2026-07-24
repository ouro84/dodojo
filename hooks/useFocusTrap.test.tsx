// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { useRef } from "react";
import { useFocusTrap } from "./useFocusTrap";

afterEach(cleanup);

function TrapHarness({
  active,
  onEscape,
}: {
  active: boolean;
  onEscape?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, { active, onEscape });
  return (
    <div>
      <button>Hors du trap</button>
      <div ref={ref} data-testid="trap">
        <button>Premier</button>
        <button>Dernier</button>
      </div>
    </div>
  );
}

describe("useFocusTrap", () => {
  it("déplace le focus sur le premier élément focusable à l'activation", () => {
    render(<TrapHarness active />);
    expect(screen.getByText("Premier")).toHaveFocus();
  });

  it("boucle Tab du dernier élément vers le premier", () => {
    render(<TrapHarness active />);
    screen.getByText("Dernier").focus();
    fireEvent.keyDown(screen.getByTestId("trap"), { key: "Tab" });
    expect(screen.getByText("Premier")).toHaveFocus();
  });

  it("boucle Shift+Tab du premier élément vers le dernier", () => {
    render(<TrapHarness active />);
    screen.getByText("Premier").focus();
    fireEvent.keyDown(screen.getByTestId("trap"), { key: "Tab", shiftKey: true });
    expect(screen.getByText("Dernier")).toHaveFocus();
  });

  it("appelle onEscape sur Echap si fourni", () => {
    const onEscape = vi.fn();
    render(<TrapHarness active onEscape={onEscape} />);
    fireEvent.keyDown(screen.getByTestId("trap"), { key: "Escape" });
    expect(onEscape).toHaveBeenCalledOnce();
  });

  it("ignore Echap si onEscape n'est pas fourni (overlay bloquant)", () => {
    render(<TrapHarness active />);
    fireEvent.keyDown(screen.getByTestId("trap"), { key: "Escape" });
    expect(screen.getByText("Premier")).toBeInTheDocument();
  });

  it("restaure le focus à l'élément déclencheur à la désactivation", () => {
    const { rerender } = render(<TrapHarness active={false} />);
    const trigger = screen.getByText("Hors du trap");
    trigger.focus();
    rerender(<TrapHarness active />);
    rerender(<TrapHarness active={false} />);
    expect(trigger).toHaveFocus();
  });
});
