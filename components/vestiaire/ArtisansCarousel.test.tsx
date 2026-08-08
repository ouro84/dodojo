// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ArtisansCarousel from "./ArtisansCarousel";

// Même piège que SkinCarousel.test.tsx (issue #75) : jsdom n'implémente ni
// matchMedia ni IntersectionObserver/ResizeObserver, requis par embla-carousel.
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

const emptyContext = { unlockedHeroIds: [], seenBossIds: [], seenBackgroundIds: [] };

describe("ArtisansCarousel", () => {
  it("affiche le premier artisan (Elementals) et ses tabs de catégorie", () => {
    render(<ArtisansCarousel seenContext={emptyContext} />);
    expect(screen.getByTestId("artisan-position")).toHaveTextContent("1/5");
    expect(screen.getByRole("tab", { name: "Héros" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Boss" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Décors" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Police" })).toBeInTheDocument();
  });

  it("aucun badge 'Rencontré en combat' quand le contexte est vide", () => {
    render(<ArtisansCarousel seenContext={emptyContext} />);
    expect(screen.queryByTestId("artisan-seen-badge")).not.toBeInTheDocument();
  });

  it("badge 'Rencontré en combat' affiché quand le héros centré est débloqué", () => {
    render(
      <ArtisansCarousel
        seenContext={{ ...emptyContext, unlockedHeroIds: ["fire_knight"] }}
      />,
    );
    expect(screen.getByTestId("artisan-seen-badge")).toBeInTheDocument();
  });

  it("flèche suivante avance d'un artisan", async () => {
    render(<ArtisansCarousel seenContext={emptyContext} />);
    fireEvent.click(screen.getByLabelText("Artisan suivant"));
    await waitFor(() => {
      expect(screen.getByTestId("artisan-position")).toHaveTextContent("2/5");
    });
  });

  it("annonce ARIA live contient le créateur et la lore de l'artisan centré", () => {
    render(<ArtisansCarousel seenContext={emptyContext} />);
    const live = document.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toContain("Elementals");
    expect(live?.textContent).toContain("silhouettes");
  });
});
