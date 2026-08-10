// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import SkinCarousel from "./SkinCarousel";
import { getHero } from "@/lib/heroes";

// jsdom n'implémente pas matchMedia ; embla-carousel s'en sert pour ses
// options réactives par breakpoint (non utilisées ici, mais appelées
// inconditionnellement à l'init) et plante sinon avec un TypeError opaque.
beforeAll(() => {
  window.matchMedia =
    window.matchMedia ??
    ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }));
  // jsdom n'implémente ni IntersectionObserver (visibilité des slides) ni
  // ResizeObserver (recalage sur resize) — stubs minimaux suffisants.
  window.IntersectionObserver =
    window.IntersectionObserver ??
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  window.ResizeObserver =
    window.ResizeObserver ??
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
});

afterEach(cleanup);

const fireKnight = getHero("fire_knight")!; // 2 tenues (Tier B)
const waterPriestess = getHero("water_priestess")!; // 4 tenues (Tier A)

describe("SkinCarousel", () => {
  it("héros non possédé : lecture seule, pas de CTA d'action, message de déblocage affiché", () => {
    render(
      <SkinCarousel
        hero={fireKnight}
        heroOwned={false}
        isHeroEquipped={false}
        equippedSkinId={null}
        ownedSkinIds={[]}
        balance={0}
        pending={false}
        onEquip={() => {}}
        onRequestPurchase={() => {}}
      />,
    );
    expect(screen.queryByTestId("skin-cta")).not.toBeInTheDocument();
    expect(screen.getByText("Débloque le héros d'abord")).toBeInTheDocument();
    // Navigation reste possible (Q19) : les flèches sont bien rendues.
    expect(screen.getByLabelText("Tenue suivante")).toBeInTheDocument();
  });

  it("héros possédé, tenue par défaut déjà équipée : CTA désactivé '✓ Équipé'", () => {
    render(
      <SkinCarousel
        hero={fireKnight}
        heroOwned={true}
        isHeroEquipped={true}
        equippedSkinId={null}
        ownedSkinIds={[]}
        balance={1000}
        pending={false}
        onEquip={() => {}}
        onRequestPurchase={() => {}}
      />,
    );
    const cta = screen.getByTestId("skin-cta");
    expect(cta).toHaveTextContent("✓ Équipé");
    expect(cta).toBeDisabled();
    expect(screen.getByTestId("skin-equipped-badge")).toBeInTheDocument();
  });

  it("héros possédé, solde insuffisant après navigation vers l'alternative : CTA désactivé avec message explicite", async () => {
    // La tenue centrée à l'ouverture est toujours l'équipée (ou le défaut) —
    // pour tester l'état d'une alternative non équipée/non possédée, il faut
    // naviguer jusqu'à elle (aucun prop ne permet de forcer un centrage
    // arbitraire, ce serait un raccourci de test qui ne reflète aucun usage réel).
    render(
      <SkinCarousel
        hero={fireKnight}
        heroOwned={true}
        isHeroEquipped={true}
        equippedSkinId={null}
        ownedSkinIds={[]}
        balance={100}
        pending={false}
        onEquip={() => {}}
        onRequestPurchase={() => {}}
      />,
    );
    fireEvent.click(screen.getByLabelText("Tenue suivante"));
    await waitFor(() => {
      expect(screen.getByTestId("skin-position")).toHaveTextContent("2/2");
    });
    const cta = screen.getByTestId("skin-cta");
    expect(cta).toHaveTextContent("300 · Or insuffisant");
    expect(cta).toBeDisabled();
  });

  it("héros possédé, tenue alternative possédée mais pas équipée : CTA actif 'Équiper', clic déclenche onEquip", async () => {
    const onEquip = vi.fn();
    render(
      <SkinCarousel
        hero={fireKnight}
        heroOwned={true}
        isHeroEquipped={true}
        equippedSkinId={null}
        ownedSkinIds={["fire_knight_shadow_purple"]}
        balance={1000}
        pending={false}
        onEquip={onEquip}
        onRequestPurchase={() => {}}
      />,
    );
    fireEvent.click(screen.getByLabelText("Tenue suivante"));
    await waitFor(() => {
      expect(screen.getByTestId("skin-position")).toHaveTextContent("2/2");
    });
    const cta = screen.getByTestId("skin-cta");
    expect(cta).toHaveTextContent("Équiper");
    expect(cta).not.toBeDisabled();
    cta.click();
    expect(onEquip).toHaveBeenCalledWith("fire_knight_shadow_purple");
  });

  it("compteur de position affiche 1/N pour la tenue centrée initiale", () => {
    render(
      <SkinCarousel
        hero={waterPriestess}
        heroOwned={true}
        isHeroEquipped={true}
        equippedSkinId={null}
        ownedSkinIds={[]}
        balance={0}
        pending={false}
        onEquip={() => {}}
        onRequestPurchase={() => {}}
      />,
    );
    expect(screen.getByTestId("skin-position")).toHaveTextContent("1/4");
  });

  it("annonce ARIA live contient le nom et la lore de la tenue centrée", () => {
    render(
      <SkinCarousel
        hero={fireKnight}
        heroOwned={true}
        isHeroEquipped={true}
        equippedSkinId={null}
        ownedSkinIds={[]}
        balance={0}
        pending={false}
        onEquip={() => {}}
        onRequestPurchase={() => {}}
      />,
    );
    const live = document.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toContain("Défaut");
    expect(live?.textContent).toContain("Autrefois garde");
  });
});
