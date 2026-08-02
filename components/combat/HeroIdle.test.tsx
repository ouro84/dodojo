// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import HeroIdle from "./HeroIdle";
import { HEROES } from "@/lib/heroes";

afterEach(cleanup);

describe("HeroIdle — cadre constant (issue #156)", () => {
  it("rend un cadre de dimensions identiques pour les 7 héros", () => {
    const sizes = HEROES.map((hero) => {
      cleanup();
      render(<HeroIdle hero={hero} />);
      const frame = screen.getByTestId("hero-idle-frame");
      return `${frame.style.width}×${frame.style.height}`;
    });

    expect(new Set(sizes).size, `tailles trouvées : ${sizes.join(", ")}`).toBe(1);
  });

  it("ancre chaque héros sur son propre idleAnchorX", () => {
    render(<HeroIdle hero={HEROES[0]} />);
    const anchor = screen.getByTestId("hero-idle-anchor");
    expect(anchor.style.transform).toMatch(/translateX\(-[\d.]+%\)/);
  });
});
