// @vitest-environment jsdom
import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { usePopoverDismiss } from "./usePopoverDismiss";

function Harness() {
  const { isOpen, setIsOpen, containerRef } = usePopoverDismiss();
  return (
    <div>
      <button onClick={() => setIsOpen(true)}>Ouvrir</button>
      <div ref={containerRef} data-testid="container">
        {isOpen && <div role="dialog">Contenu</div>}
      </div>
      <button>Hors du conteneur</button>
    </div>
  );
}

afterEach(cleanup);

describe("usePopoverDismiss", () => {
  it("ouvre au clic sur le déclencheur", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("Ouvrir"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("ferme au clic extérieur au conteneur", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("Ouvrir"));
    fireEvent.mouseDown(screen.getByText("Hors du conteneur"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("ne ferme pas au clic à l'intérieur du conteneur", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("Ouvrir"));
    fireEvent.mouseDown(screen.getByTestId("container"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("ferme sur Echap", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("Ouvrir"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
