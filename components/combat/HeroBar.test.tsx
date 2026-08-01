// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
});
