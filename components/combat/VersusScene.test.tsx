// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import VersusScene from "./VersusScene";
import { heroSpriteMeta, bossSpriteMeta } from "@/lib/sprite-metadata";

afterEach(cleanup);

const base = {
  heroName: "Gardien des Lames",
  heroSpriteBase: "/sprites/mc/metal-bladekeeper",
  heroSlug: "metal-bladekeeper",
  heroHp: 100,
  heroMaxHp: 100,
  bossName: "Baron",
  bossSpriteBase: "/sprites/bosses/mob-baron",
  bossSlug: "mob-baron",
  bossFlip: false,
  backgroundPath: "/backgrounds/dummy.png",
  currentHp: 100,
  maxHp: 140,
};

function anchorPercent(el: HTMLElement): number {
  // "translateX(-41.2345%)" -> 41.2345
  const match = /translateX\((-?[\d.]+)%\)/.exec(el.style.transform);
  if (!match) throw new Error(`transform inattendu : ${el.style.transform}`);
  return -Number(match[1]);
}

describe("VersusScene — ancrage horizontal (issue #156)", () => {
  it("décale le héros de son propre idleAnchorX, pas d'une valeur fixe", () => {
    render(<VersusScene {...base} />);
    const anchor = screen.getByTestId("sprite-anchor-hero");
    expect(anchorPercent(anchor)).toBeCloseTo(
      heroSpriteMeta("metal-bladekeeper").idleAnchorX * 100,
      3,
    );
  });

  it("applique une ancre différente à un héros de tuile différente", () => {
    const { rerender } = render(<VersusScene {...base} />);
    const first = anchorPercent(screen.getByTestId("sprite-anchor-hero"));

    rerender(
      <VersusScene
        {...base}
        heroSlug="wind-hashashin"
        heroSpriteBase="/sprites/mc/wind-hashashin"
      />,
    );
    const second = anchorPercent(screen.getByTestId("sprite-anchor-hero"));

    // Deux tuiles très différentes (189×58 vs 209×112) : si le décalage était
    // identique, c'est que l'ancre n'est pas lue par personnage.
    expect(second).not.toBeCloseTo(first, 2);
  });

  it("miroite l'ancre du Boss quand il est flippé", () => {
    const meta = bossSpriteMeta("mob-baron");

    const { rerender } = render(<VersusScene {...base} bossFlip={false} />);
    expect(anchorPercent(screen.getByTestId("sprite-anchor-boss"))).toBeCloseTo(
      meta.idleAnchorX * 100,
      3,
    );

    rerender(<VersusScene {...base} bossFlip />);
    expect(anchorPercent(screen.getByTestId("sprite-anchor-boss"))).toBeCloseTo(
      (1 - meta.idleAnchorX) * 100,
      3,
    );
  });
});
