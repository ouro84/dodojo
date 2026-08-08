// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ArenaBackdrop from "./ArenaBackdrop";
import { BACKGROUNDS } from "@/lib/backgrounds";

afterEach(cleanup);

// next/image réécrit `src` en `/_next/image?url=<encodé>&w=...&q=...` (même
// en environnement de test, la construction de l'URL ne dépend pas d'un
// serveur qui tourne) — on compare le paramètre `url` décodé, jamais le `src`
// brut. Même helper que e2e/arena-desktop-backdrop.spec.ts.
function decodedImageUrlParam(src: string): string {
  const url = new URL(src, "http://localhost");
  const param = url.searchParams.get("url");
  return param ? decodeURIComponent(param) : src;
}

// Issue #167 : le fond étendu desktop doit suivre le décor RÉEL du jour
// (16 variantes / 7 thèmes, lib/backgrounds.ts), jamais un asset figé — sinon
// il se désynchronise silencieusement du cabinet (VersusScene) dès qu'un
// autre thème que celui testé manuellement sort. On vérifie ici plusieurs
// thèmes distincts, pas seulement le défaut steampunk.
describe("ArenaBackdrop — suit le décor du jour, jamais un asset figé (issue #167)", () => {
  const samples = [
    BACKGROUNDS.find((b) => b.id === "steampunk-cityscape"),
    BACKGROUNDS.find((b) => b.id === "crystal-cave"),
    BACKGROUNDS.find((b) => b.id === "underwater-world"),
    BACKGROUNDS.find((b) => b.id === "ancient-temple-3"),
  ];

  it.each(samples.map((b) => [b!.id, b!.publicPath] as const))(
    "rend l'image de fond avec le chemin reçu (%s), jamais une valeur en dur",
    (id, publicPath) => {
      render(<ArenaBackdrop backgroundPath={publicPath} />);
      const src = screen.getByTestId("arena-backdrop").getAttribute("src");
      if (!src) throw new Error("Fond sans src");
      expect(decodedImageUrlParam(src)).toBe(publicPath);
      cleanup();
    },
  );

  it("ne rend jamais deux fois le même décor pour deux backgroundPath différents", () => {
    const { rerender } = render(<ArenaBackdrop backgroundPath="/backgrounds/desert-oasis.png" />);
    const firstSrc = screen.getByTestId("arena-backdrop").getAttribute("src");

    rerender(<ArenaBackdrop backgroundPath="/backgrounds/mountain-peak.png" />);
    const secondSrc = screen.getByTestId("arena-backdrop").getAttribute("src");
    if (!firstSrc || !secondSrc) throw new Error("Fond sans src");

    expect(decodedImageUrlParam(secondSrc)).not.toBe(decodedImageUrlParam(firstSrc));
    expect(decodedImageUrlParam(secondSrc)).toBe("/backgrounds/mountain-peak.png");
  });
});
