// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import HeroBar from "./HeroBar";

afterEach(cleanup);

describe("HeroBar", () => {
  it("n'affiche que le pseudo sans titre équipé", () => {
    render(<HeroBar heroName="Ari" currentHp={80} maxHp={100} />);
    expect(screen.getByText("Ari")).toBeInTheDocument();
    expect(screen.queryByText(/-/)).not.toBeInTheDocument();
  });

  it("affiche 'Pseudo - Titre' quand un titre est fourni", () => {
    render(<HeroBar heroName="Ari" title="Calme" currentHp={80} maxHp={100} />);
    expect(screen.getByText("Ari")).toBeInTheDocument();
    expect(screen.getByText("- Calme")).toBeInTheDocument();
  });

  it("n'affiche rien après le pseudo pour un titre vide", () => {
    render(<HeroBar heroName="Ari" title="" currentHp={80} maxHp={100} />);
    expect(screen.queryByText(/-/)).not.toBeInTheDocument();
  });

  it("ouvre le popover au clic et le ferme au clic extérieur (branche avec penaltiesBreakdown)", () => {
    render(
      <div>
        <HeroBar
          heroName="Ari"
          currentHp={80}
          maxHp={100}
          penaltiesBreakdown={{
            overdueCount: 0,
            overdueHpPerItem: 20,
            missedCount: 0,
            missedHpPerItem: 10,
          }}
        />
        <button>Hors</button>
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Ari/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByText("Hors"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("affiche le titre équipé dans le dialog quand fourni", () => {
    render(
      <HeroBar
        heroName="Ari"
        title="Calme"
        currentHp={80}
        maxHp={100}
        penaltiesBreakdown={{ overdueCount: 0, overdueHpPerItem: 20, missedCount: 0, missedHpPerItem: 10 }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Ari/ }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Calme");
  });

  it("affiche l'XP jusqu'au niveau suivant dans le dialog quand fourni", () => {
    render(
      <HeroBar
        heroName="Ari"
        currentHp={80}
        maxHp={100}
        xpToNextLevel={45}
        penaltiesBreakdown={{ overdueCount: 0, overdueHpPerItem: 20, missedCount: 0, missedHpPerItem: 10 }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Ari/ }));
    expect(screen.getByRole("dialog")).toHaveTextContent("45");
  });
});
