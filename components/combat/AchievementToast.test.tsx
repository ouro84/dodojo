// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import AchievementToast from "./AchievementToast";

afterEach(cleanup);

describe("AchievementToast", () => {
  it("ne rend rien sans code", () => {
    const { container } = render(<AchievementToast codes={[]} onDismissAll={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("affiche le titre et la description du succès débloqué", () => {
    render(<AchievementToast codes={["FIRST_VICTORY"]} onDismissAll={vi.fn()} />);
    expect(screen.getByText(/Aube/)).toBeInTheDocument();
    expect(screen.getByText("Première victoire remportée.")).toBeInTheDocument();
  });

  it("empile plusieurs succès débloqués simultanément", () => {
    render(
      <AchievementToast codes={["FIRST_VICTORY", "STREAK_7"]} onDismissAll={vi.fn()} />,
    );
    expect(screen.getByText(/Aube/)).toBeInTheDocument();
    expect(screen.getByText(/Calme/)).toBeInTheDocument();
  });
});
