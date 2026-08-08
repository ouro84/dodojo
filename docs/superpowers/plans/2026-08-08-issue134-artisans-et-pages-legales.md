# Les Artisans + Pages légales (issue #134) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer les deux sous-sujets de l'issue #134 dans une seule PR : un écran "Les Artisans" créditant les créateurs d'assets (carrousel coverflow réutilisant le patron `SkinCarousel`), et trois pages légales statiques (mentions légales, confidentialité, CGU) + leur hub de découvrabilité.

**Architecture:** Deux specs indépendantes exécutées en une seule PR (décision explicite du produit — scinder en deux sous-issues GitHub au moment du PR reste recommandé pour le suivi, mais le code part en un seul lot). Partie A : catalogue statique pur (`lib/credits.ts`) + carrousel client (copie du patron Embla de `SkinCarousel.tsx`) + route `/vestiaire/artisans`. Partie B : trois routes 100% statiques + un hub, rendues publiques via `isPublicRoute`.

**Tech Stack:** Next.js 16 App Router (Server Components), `embla-carousel-react` (déjà une dépendance), Vitest + Testing Library (jsdom), Playwright e2e.

## Global Constraints

- TypeScript strict, jamais de `any` (règle de code n°1 du projet).
- Toute communication utilisateur en français (convention du projet).
- Les 4 nouvelles routes publiques (`/mentions-legales`, `/confidentialite`, `/cgu`, `/informations-legales`) doivent être ajoutées à `isPublicRoute` (`lib/supabase/middleware.ts`) — sinon `proxy.ts` bounce tout visiteur anonyme vers `/welcome` avant qu'il puisse les lire.
- Aucune donnée légale (attribution, licence) ne doit dépendre d'un état de progression de jeu — le badge "Rencontré en combat" est cosmétique, jamais un verrou d'accès à l'information (contrainte posée en spec, cf. `docs/superpowers/specs/2026-08-08-issue134-artisans-credits-design.md`).
- Contact éditeur à publier : `arnaud.solente+dodojo@gmail.com`.
- Hébergeur à publier : Vercel Inc., 440 N Barranca Avenue #4133, Covina, CA 91723, États-Unis (vérifié via `vercel.com/legal/privacy-policy`).
- Supabase (base de données + auth) est hébergé dans l'Union Européenne — aucune mention de transfert hors UE à ajouter.
- `git commit` après chaque étape marquée "Commit" — jamais de commit groupé de plusieurs tâches.

## File Structure

**Créer :**
- `lib/credits.ts` — catalogue statique des artisans + logique pure de badge "rencontré".
- `lib/credits.test.ts` — tests du catalogue et de la logique de badge.
- `components/vestiaire/ArtisansCarousel.tsx` — carrousel client (patron `SkinCarousel`).
- `components/vestiaire/ArtisansCarousel.test.tsx` — tests du composant.
- `app/vestiaire/artisans/page.tsx` + `app/vestiaire/artisans/loading.tsx`.
- `e2e/artisans.spec.ts`.
- `app/mentions-legales/page.tsx`, `app/confidentialite/page.tsx`, `app/cgu/page.tsx`, `app/informations-legales/page.tsx`.
- `e2e/informations-legales.spec.ts`.

**Modifier :**
- `app/vestiaire/page.tsx` — deux nouvelles entrées `SECTIONS` ("Les Artisans", "Informations légales").
- `lib/supabase/middleware.ts` — `isPublicRoute` accepte les 4 nouvelles routes.
- `lib/supabase/middleware.test.ts` — tests des nouvelles routes publiques.
- `app/welcome/WelcomeSignup.tsx` — lien CGU/confidentialité sous le formulaire.
- `CHANGELOG.md` — deux lignes sous `[Unreleased]`.
- `ASSETS.md` — note "Dette / points d'attention" (VFX Gigapack/Hit Effect et Raven Fantasy Icons ne sont **pas** shippés à ce jour, cf. constat ci-dessous).

**Constat fait en préparant ce plan (à documenter, pas à corriger ici)** : contrairement à ce que suggérait `ASSETS.md`, aucun fichier de `assets/VFX/` (Gigapack, Hit Effect 01, packs d'explosion) ni de `assets/Icons/` (Raven Fantasy Icons) n'est présent dans `public/` — vérifié par recherche de fichiers (`public/vfx` n'existe pas, `public/icons` ne contient que les icônes PWA) et par recherche de code (aucune référence à ces packs dans `app/`, `components/`, `lib/`, `scripts/`). Le catalogue "Les Artisans" ne peut donc, en toute honnêteté, créditer que ce qui est réellement livré : héros (`MC/`), boss (`Boss/`), décors (`Backgrounds/`), police (`Fonts/BoldPixels`). Les catégories "effets" et "icônes" n'ont aucune entrée — elles ne sont donc pas proposées en tab (une tab vide n'a aucune valeur produit).

---

### Task 1: `lib/credits.ts` — catalogue des artisans

**Files:**
- Create: `lib/credits.ts`
- Create: `lib/credits.test.ts`
- Modify: `ASSETS.md` (note de dette, cf. constat ci-dessus)

**Interfaces:**
- Produces: `ArtisanCategory` (type), `ArtisanSpriteRef` (union), `ArtisanEntry` (interface), `ARTISANS: ArtisanEntry[]`, `ArtisanSeenContext` (interface), `isArtisanSeen(entry, ctx): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/credits.test.ts
import { describe, expect, test } from "vitest";
import { ARTISANS, isArtisanSeen, type ArtisanSeenContext } from "./credits";
import { getHero } from "./heroes";
import { getBoss } from "./bosses";
import { getBackground } from "./backgrounds";

describe("ARTISANS (issue #134)", () => {
  test("catalogue non vide, catégories limitées à ce qui est réellement livré", () => {
    expect(ARTISANS.length).toBeGreaterThan(0);
    const allowed = new Set(["heros", "boss", "decors", "police"]);
    for (const entry of ARTISANS) {
      expect(allowed.has(entry.category)).toBe(true);
    }
  });

  test("chaque spriteRef résout vers une entité réellement catalogué", () => {
    for (const entry of ARTISANS) {
      if (entry.spriteRef.kind === "hero") {
        expect(getHero(entry.spriteRef.heroId)).toBeDefined();
      } else if (entry.spriteRef.kind === "boss") {
        expect(getBoss(entry.spriteRef.bossId)).toBeDefined();
      } else if (entry.spriteRef.kind === "background") {
        expect(getBackground(entry.spriteRef.backgroundId)).toBeDefined();
      }
    }
  });

  test("chaque entry a un id unique", () => {
    const ids = ARTISANS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("isArtisanSeen", () => {
  const emptyCtx: ArtisanSeenContext = {
    unlockedHeroIds: [],
    seenBossIds: [],
    seenBackgroundIds: [],
  };

  test("héros : vu si son id est dans unlockedHeroIds", () => {
    const entry = ARTISANS.find((e) => e.spriteRef.kind === "hero")!;
    expect(isArtisanSeen(entry, emptyCtx)).toBe(false);
    const heroId = (entry.spriteRef as { kind: "hero"; heroId: string }).heroId;
    expect(isArtisanSeen(entry, { ...emptyCtx, unlockedHeroIds: [heroId] })).toBe(true);
  });

  test("boss : vu si son id est dans seenBossIds", () => {
    const entry = ARTISANS.find((e) => e.spriteRef.kind === "boss")!;
    expect(isArtisanSeen(entry, emptyCtx)).toBe(false);
    const bossId = (entry.spriteRef as { kind: "boss"; bossId: string }).bossId;
    expect(isArtisanSeen(entry, { ...emptyCtx, seenBossIds: [bossId] })).toBe(true);
  });

  test("décor : vu si son id est dans seenBackgroundIds", () => {
    const entry = ARTISANS.find((e) => e.spriteRef.kind === "background")!;
    expect(isArtisanSeen(entry, emptyCtx)).toBe(false);
    const backgroundId = (entry.spriteRef as { kind: "background"; backgroundId: string })
      .backgroundId;
    expect(isArtisanSeen(entry, { ...emptyCtx, seenBackgroundIds: [backgroundId] })).toBe(true);
  });

  test("police : toujours considéré comme vu (pas de mécanique de rencontre)", () => {
    const entry = ARTISANS.find((e) => e.spriteRef.kind === "font")!;
    expect(isArtisanSeen(entry, emptyCtx)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/credits.test.ts`
Expected: FAIL — `Cannot find module './credits'` (le fichier n'existe pas encore).

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/credits.ts
// Issue #134 : crédite les créateurs des assets réellement livrés dans
// public/ (pas tout assets/ — cf. ASSETS.md § usage). Un entry par
// pack/créateur, pas par sprite individuel. Le badge "rencontré en combat"
// (isArtisanSeen) est purement cosmétique : l'attribution elle-même
// (creator/packName/license/lore) reste toujours affichée, jamais masquée
// derrière une progression de jeu — contrainte légale posée en spec.
export type ArtisanCategory = "heros" | "boss" | "decors" | "police";

export type ArtisanSpriteRef =
  | { kind: "hero"; heroId: string }
  | { kind: "boss"; bossId: string }
  | { kind: "background"; backgroundId: string }
  | { kind: "font" };

export interface ArtisanEntry {
  id: string;
  creator: string;
  packName: string;
  category: ArtisanCategory;
  lore: string;
  license?: string;
  sourceUrl?: string;
  spriteRef: ArtisanSpriteRef;
}

export const ARTISANS: ArtisanEntry[] = [
  {
    id: "elementals-series",
    creator: 'Auteur non identifié (série "Elementals")',
    packName:
      "Elementals — Fire Knight / Water Priestess / Ground Monk / Wind Hashashin / Leaf Ranger / Crystal Mauler / Metal Bladekeeper",
    category: "heros",
    lore: "Sept silhouettes taillées dans le même feu, prêtes à porter ton reflet au combat.",
    spriteRef: { kind: "hero", heroId: "fire_knight" },
  },
  {
    id: "boss-vrais-boss",
    creator: 'Auteur non identifié (packs "vrais boss")',
    packName: "Frost Guardian / Boss Demon Slime / Free Cthulhu / Mino v1.1",
    category: "boss",
    lore: "Quatre masques que porte le Boss les jours où il ne se contente pas d'un simple sbire.",
    spriteRef: { kind: "boss", bossId: "frost-guardian" },
  },
  {
    id: "boss-low-boss-craftpix",
    creator: "CraftPix",
    packName:
      'Low Boss Bundle (8 packs CraftPix : Satyr, Urban Zombie, Mushroom, Gorgon, Minotaure, Sorciers, Gangster, Chevalier — 23 boss du roster, dont plusieurs recolors)',
    category: "boss",
    license: "Licence CraftPix gratuite — usage produit final OK, revente des fichiers bruts interdite",
    sourceUrl: "https://craftpix.net/file-licenses/",
    lore: "Le plus gros du roster : vingt-trois visages différents pour la même chose qui traîne en toi.",
    spriteRef: { kind: "boss", bossId: "satyr" },
  },
  {
    id: "decors-craftpix",
    creator: "CraftPix",
    packName:
      "7 packs de décors CraftPix (Château, Temple antique, Grotte de cristal, Désert, Sommet montagneux, Ville steampunk, Monde sous-marin)",
    category: "decors",
    license: "Licence CraftPix gratuite — usage produit final OK, revente des fichiers bruts interdite",
    sourceUrl: "https://craftpix.net/file-licenses/",
    lore: "Sept décors, seize variantes : l'arène change de peau, jamais de nature.",
    spriteRef: { kind: "background", backgroundId: "castle-interior" },
  },
  {
    id: "font-boldpixels",
    creator: "Yūki (YukiPixels)",
    packName: "BoldPixels",
    category: "police",
    license: "CC BY-SA 4.0 — attribution requise",
    sourceUrl: "https://yukipixels.itch.io/",
    lore: "Chaque titre, chaque chiffre de dégâts que tu lis passe par cette police.",
    spriteRef: { kind: "font" },
  },
];

export interface ArtisanSeenContext {
  unlockedHeroIds: string[];
  seenBossIds: string[];
  seenBackgroundIds: string[];
}

// "Rencontré" n'a pas de sens pour une police (pas de mécanique de
// rencontre en jeu) — toujours vrai, jamais un verrou puisque cette valeur
// ne conditionne l'affichage de rien d'obligatoire (le composant choisit de
// ne pas afficher de badge du tout pour "font", cf. ArtisansCarousel).
export function isArtisanSeen(entry: ArtisanEntry, ctx: ArtisanSeenContext): boolean {
  switch (entry.spriteRef.kind) {
    case "hero":
      return ctx.unlockedHeroIds.includes(entry.spriteRef.heroId);
    case "boss":
      return ctx.seenBossIds.includes(entry.spriteRef.bossId);
    case "background":
      return ctx.seenBackgroundIds.includes(entry.spriteRef.backgroundId);
    case "font":
      return true;
  }
}
```

Vérifier que `lib/heroes.ts` exporte bien `getHero` et `lib/bosses.ts`/`lib/backgrounds.ts` exportent bien `getBoss`/`getBackground` (déjà le cas — utilisés tels quels par ce fichier de test, aucune modification requise sur ces trois fichiers).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/credits.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Documenter le constat sur les packs non livrés**

Ajouter à `ASSETS.md`, section "Dette / points d'attention" :

```markdown
- **Packs jamais réellement livrés (constat issue #134)** : `assets/VFX/` (Gigapack unTied Games, Hit Effect 01, packs d'explosion) et `assets/Icons/` (Raven Fantasy Icons) n'ont aucun fichier copié dans `public/` et aucune référence dans le code — malgré le "mapping gameplay recommandé" plus haut, qui reste une piste jamais implémentée (les VFX d'impact ont été remplacés par un flash CSS, cf. issue #156). Le catalogue de crédits (`lib/credits.ts`) ne référence donc que héros/boss/décors/police, les seuls réellement shippés.
```

- [ ] **Step 6: Commit**

```bash
git add lib/credits.ts lib/credits.test.ts ASSETS.md
git commit -m "feat: catalogue des artisans crédités (issue #134)"
```

---

### Task 2: `components/vestiaire/ArtisansCarousel.tsx`

**Files:**
- Create: `components/vestiaire/ArtisansCarousel.tsx`
- Create: `components/vestiaire/ArtisansCarousel.test.tsx`

**Interfaces:**
- Consumes: `ARTISANS`, `isArtisanSeen`, `ArtisanSeenContext`, `ArtisanCategory` (`lib/credits.ts`, Task 1) ; `carousel3DTransform` (`lib/carousel-3d.ts`) ; `getHero` (`lib/heroes.ts`) ; `getBoss` (`lib/bosses.ts`) ; `getBackground` (`lib/backgrounds.ts`) ; `heroSpriteMeta`/`bossSpriteMeta` (`lib/sprite-metadata.ts`) ; `HeroIdle` (`components/combat/HeroIdle.tsx`) ; `CharacterSprite` (`components/combat/CharacterSprite.tsx`).
- Produces: `export default function ArtisansCarousel({ seenContext }: { seenContext: ArtisanSeenContext })`.

- [ ] **Step 1: Write the failing test**

```tsx
// components/vestiaire/ArtisansCarousel.test.tsx
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/vestiaire/ArtisansCarousel.test.tsx`
Expected: FAIL — `Cannot find module './ArtisansCarousel'`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// components/vestiaire/ArtisansCarousel.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import useEmblaCarousel from "embla-carousel-react";
import type { EmblaCarouselType } from "embla-carousel";
import {
  ARTISANS,
  isArtisanSeen,
  type ArtisanCategory,
  type ArtisanEntry,
  type ArtisanSeenContext,
} from "@/lib/credits";
import { carousel3DTransform } from "@/lib/carousel-3d";
import { getHero } from "@/lib/heroes";
import { getBoss } from "@/lib/bosses";
import { getBackground } from "@/lib/backgrounds";
import { bossSpriteMeta } from "@/lib/sprite-metadata";
import HeroIdle from "@/components/combat/HeroIdle";
import CharacterSprite from "@/components/combat/CharacterSprite";

const CATEGORY_LABEL: Record<ArtisanCategory, string> = {
  heros: "Héros",
  boss: "Boss",
  decors: "Décors",
  police: "Police",
};

const CATEGORY_ORDER: ArtisanCategory[] = ["heros", "boss", "decors", "police"];

function ArtisanVisual({ entry }: { entry: ArtisanEntry }) {
  const ref = entry.spriteRef;
  if (ref.kind === "hero") {
    const hero = getHero(ref.heroId);
    if (!hero) return null;
    return <HeroIdle hero={hero} baseHeight={96} />;
  }
  if (ref.kind === "boss") {
    const boss = getBoss(ref.bossId);
    if (!boss) return null;
    return (
      <CharacterSprite
        spriteBase={boss.spriteBase}
        meta={bossSpriteMeta(boss.slug)}
        baseHeight={96}
        state="idle"
        flip={boss.flip}
        alt={boss.name}
        className="[image-rendering:pixelated]"
      />
    );
  }
  if (ref.kind === "background") {
    const background = getBackground(ref.backgroundId);
    if (!background) return null;
    return (
      <div className="relative h-28 w-40 overflow-hidden rounded border border-border">
        <Image
          src={background.publicPath}
          alt=""
          fill
          sizes="160px"
          className="object-cover [image-rendering:pixelated]"
        />
      </div>
    );
  }
  return (
    <p aria-hidden="true" className="font-display text-3xl text-ink">
      AaBbCc 0123
    </p>
  );
}

export default function ArtisansCarousel({
  seenContext,
}: {
  seenContext: ArtisanSeenContext;
}) {
  const categories = CATEGORY_ORDER.filter((cat) => ARTISANS.some((e) => e.category === cat));

  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: "center",
    watchDrag: ARTISANS.length > 1,
  });

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [offsets, setOffsets] = useState<number[]>(() => ARTISANS.map((_, i) => i));

  const recomputeOffsets = useCallback((api: EmblaCarouselType) => {
    const snapList = api.scrollSnapList();
    const progress = api.scrollProgress();
    const step = snapList.length > 1 ? snapList[1] - snapList[0] : 1;
    setOffsets(snapList.map((snap) => (snap - progress) / (step || 1)));
  }, []);

  useEffect(() => {
    if (!emblaApi) return;
    const onScroll = () => recomputeOffsets(emblaApi);
    const onSelect = () => setSelectedIndex(emblaApi.selectedScrollSnap());
    emblaApi.on("init", onScroll);
    emblaApi.on("scroll", onScroll);
    emblaApi.on("reInit", onScroll);
    emblaApi.on("select", onSelect);
    return () => {
      emblaApi.off("init", onScroll);
      emblaApi.off("scroll", onScroll);
      emblaApi.off("reInit", onScroll);
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi, recomputeOffsets]);

  function goToCategory(cat: ArtisanCategory) {
    const index = ARTISANS.findIndex((e) => e.category === cat);
    if (index >= 0) emblaApi?.scrollTo(index);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      emblaApi?.scrollNext();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      emblaApi?.scrollPrev();
    }
  }

  const centered = ARTISANS[selectedIndex] ?? ARTISANS[0];
  const activeCategory = centered.category;
  const showSeenBadge = centered.spriteRef.kind !== "font" && isArtisanSeen(centered, seenContext);

  return (
    <div className="flex flex-col items-center gap-3" data-testid="artisans-carousel">
      <div className="flex gap-2" role="tablist" aria-label="Catégories d'artisans">
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            role="tab"
            aria-selected={activeCategory === cat}
            onClick={() => goToCategory(cat)}
            className={`rounded-full border px-3 py-1 text-xs uppercase tracking-wide ${
              activeCategory === cat ? "border-ink bg-surface text-ink" : "border-border text-faint"
            }`}
          >
            {CATEGORY_LABEL[cat]}
          </button>
        ))}
      </div>

      <div
        ref={emblaRef}
        className="w-full overflow-hidden"
        style={{ perspective: "800px" }}
        tabIndex={0}
        role="group"
        aria-label="Artisans de Dodojo"
        aria-roledescription="carrousel"
        onKeyDown={handleKeyDown}
      >
        <div className="flex touch-pan-y">
          {ARTISANS.map((entry, i) => {
            const { transform, opacity, zIndex } = carousel3DTransform(
              offsets[i] ?? i - selectedIndex,
            );
            return (
              <div
                key={entry.id}
                className="relative flex min-w-0 flex-[0_0_60%] items-center justify-center"
                data-artisan-slide={entry.id}
              >
                <div
                  className="flex h-28 items-center justify-center"
                  style={{ transform, opacity, zIndex, transformStyle: "preserve-3d" }}
                >
                  <ArtisanVisual entry={entry} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Artisan précédent"
          onClick={() => emblaApi?.scrollPrev()}
          disabled={ARTISANS.length <= 1}
          className="rounded border border-border px-2 py-1 text-xs text-ink disabled:opacity-30"
        >
          ◀
        </button>
        <span data-testid="artisan-position" className="text-[10px] text-faint">
          {selectedIndex + 1}/{ARTISANS.length}
        </span>
        <button
          type="button"
          aria-label="Artisan suivant"
          onClick={() => emblaApi?.scrollNext()}
          disabled={ARTISANS.length <= 1}
          className="rounded border border-border px-2 py-1 text-xs text-ink disabled:opacity-30"
        >
          ▶
        </button>
      </div>

      <div className="flex max-w-sm flex-col items-center gap-1 text-center">
        <p className="font-display text-sm uppercase tracking-wide text-ink">{centered.creator}</p>
        <p className="text-xs text-muted">{centered.packName}</p>
        {centered.license && <p className="text-[10px] text-faint">{centered.license}</p>}
        <p className="text-xs text-muted">{centered.lore}</p>
        {showSeenBadge && (
          <span data-testid="artisan-seen-badge" className="text-[10px] text-faint">
            Rencontré en combat
          </span>
        )}
        {centered.sourceUrl && (
          <a
            href={centered.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-muted underline underline-offset-4"
          >
            Voir la source
          </a>
        )}
      </div>

      <p aria-live="polite" className="sr-only">
        {centered.creator}. {centered.lore}
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/vestiaire/ArtisansCarousel.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add components/vestiaire/ArtisansCarousel.tsx components/vestiaire/ArtisansCarousel.test.tsx
git commit -m "feat: carrousel Les Artisans (issue #134)"
```

---

### Task 3: Route `/vestiaire/artisans`

**Files:**
- Create: `app/vestiaire/artisans/page.tsx`
- Create: `app/vestiaire/artisans/loading.tsx`

**Interfaces:**
- Consumes: `ArtisansCarousel` (Task 2) ; `assembleAchievementContext` (`app/actions/achievements.ts`, déjà exportée) ; `BackLink` (`components/ui/BackLink.tsx`) ; `BottomNav` (`components/ui/BottomNav.tsx`).

- [ ] **Step 1: Write the page**

```tsx
// app/vestiaire/artisans/page.tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { assembleAchievementContext } from "@/app/actions/achievements";
import ArtisansCarousel from "@/components/vestiaire/ArtisansCarousel";
import BackLink from "@/components/ui/BackLink";
import BottomNav from "@/components/ui/BottomNav";

export const metadata: Metadata = { title: "Les Artisans — Dodojo" };

// Issue #134 : crédite les créateurs des assets réellement livrés. Réutilise
// assembleAchievementContext (déjà appelée par 4 autres checkpoints) plutôt
// que d'écrire une requête dédiée — seuls unlockedHeroIds/seenBossIds/
// seenBackgroundIds sont consommés ici, level/bestStreak/hasVictory sont
// ignorés sans risque.
export default async function ArtisansPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const ctx = await assembleAchievementContext(supabase, user.id);

  return (
    <main className="screen-main gap-4 px-4 py-6">
      <BackLink href="/vestiaire" label="Retour au Vestiaire" />
      <h1 className="text-center font-display text-lg uppercase tracking-wide text-ink">
        Les Artisans
      </h1>
      <p className="text-center text-xs text-muted">
        Chaque héros, chaque Boss, chaque décor a été façonné par quelqu'un avant de finir dans
        ton Arène.
      </p>
      <ArtisansCarousel
        seenContext={{
          unlockedHeroIds: ctx.unlockedHeroIds,
          seenBossIds: ctx.seenBossIds,
          seenBackgroundIds: ctx.seenBackgroundIds,
        }}
      />
      <BottomNav active="vestiaire" />
    </main>
  );
}
```

```tsx
// app/vestiaire/artisans/loading.tsx
export default function Loading() {
  return (
    <main className="screen-main gap-4 px-4 py-6">
      <div className="h-4 w-32 animate-pulse rounded bg-surface" />
      <div className="h-6 w-48 animate-pulse self-center rounded bg-surface" />
      <div className="h-28 w-full animate-pulse rounded bg-surface" />
    </main>
  );
}
```

Note sur la règle projet n°3 (3 états UI) : si `assembleAchievementContext` échoue, l'erreur remonte (comportement par défaut de Next.js — page d'erreur générique). C'est un choix volontaire cohérent avec la spec : le carrousel affiche toujours l'attribution même sans badge, mais si le fetch échoue *avant* même le premier rendu (pas seulement le badge), il n'y a pas de contenu de repli à afficher de toute façon — pas de composant d'erreur dédié à écrire ici.

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit`
Expected: aucune erreur sur les deux nouveaux fichiers.

- [ ] **Step 3: Commit**

```bash
git add app/vestiaire/artisans/page.tsx app/vestiaire/artisans/loading.tsx
git commit -m "feat: route /vestiaire/artisans (issue #134)"
```

---

### Task 4: Entrée "Les Artisans" dans Le Vestiaire

**Files:**
- Modify: `app/vestiaire/page.tsx:15-21` (tableau `SECTIONS`)
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Ajouter l'entrée**

Dans `app/vestiaire/page.tsx`, modifier le tableau `SECTIONS` :

```tsx
const SECTIONS: Array<{ href: string; icon: string; label: string }> = [
  { href: "/vestiaire/profil", icon: "👤", label: "Profil" },
  { href: "/tableau-de-chasse", icon: "🏆", label: "Tableau de Chasse" },
  { href: "/vestiaire/entrainement", icon: "🔁", label: "Mes Routines" },
  { href: "/vestiaire/artisans", icon: "🎨", label: "Les Artisans" },
  { href: "/marche-noir", icon: "🛒", label: "Le Marché Noir" },
  { href: "/guide", icon: "📖", label: "Le Guide" },
];
```

- [ ] **Step 2: Ajouter la ligne au changelog**

Dans `CHANGELOG.md`, sous `## [Unreleased]` :

```markdown
- Nouvelle section "Les Artisans" (Le Vestiaire) : carrousel créditant les créateurs des sprites/décors/police utilisés dans le jeu (issue #134).
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: pas d'erreur.

- [ ] **Step 4: Commit**

```bash
git add app/vestiaire/page.tsx CHANGELOG.md
git commit -m "feat: lien Les Artisans depuis Le Vestiaire (issue #134)"
```

---

### Task 5: e2e — Les Artisans

**Files:**
- Create: `e2e/artisans.spec.ts`

**Interfaces:**
- Consumes: `login` (`e2e/fixtures.ts`).

- [ ] **Step 1: Write the failing test**

```ts
// e2e/artisans.spec.ts
import { test, expect } from "@playwright/test";
import { login } from "./fixtures";

test.describe("Les Artisans (issue #134)", () => {
  test("accessible depuis Le Vestiaire, affiche le premier artisan et ses tabs", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/vestiaire");
    await page.getByRole("link", { name: /Les Artisans/ }).click();
    await page.waitForURL("/vestiaire/artisans");
    await expect(page.getByRole("heading", { name: "Les Artisans" })).toBeVisible();
    await expect(page.getByTestId("artisan-position")).toHaveText("1/5");
    await expect(page.getByRole("tab", { name: "Héros" })).toBeVisible();
  });

  test("navigation vers la catégorie Police affiche BoldPixels", async ({ page }) => {
    await login(page);
    await page.goto("/vestiaire/artisans");
    await page.getByRole("tab", { name: "Police" }).click();
    await expect(page.getByText("BoldPixels")).toBeVisible();
    await expect(page.getByText(/CC BY-SA 4.0/)).toBeVisible();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && npm run start` (autre terminal) puis `npx playwright test e2e/artisans.spec.ts`
Expected: FAIL avant Task 3/4 (route inexistante) — si lancé après, sert de vérification finale de la Partie A.

- [ ] **Step 3: Run against the implemented app**

Run: `npx playwright test e2e/artisans.spec.ts`
Expected: PASS (2 tests) — confirme que Tasks 1-4 s'intègrent correctement bout-en-bout.

- [ ] **Step 4: Commit**

```bash
git add e2e/artisans.spec.ts
git commit -m "test(e2e): parcours Les Artisans (issue #134)"
```

---

### Task 6: Routes légales publiques (`isPublicRoute`)

**Files:**
- Modify: `lib/supabase/middleware.ts:86-94`
- Modify: `lib/supabase/middleware.test.ts`

**Interfaces:**
- Produces: `isPublicRoute` accepte désormais `/mentions-legales`, `/confidentialite`, `/cgu`, `/informations-legales`.

- [ ] **Step 1: Write the failing test**

Ajouter à `lib/supabase/middleware.test.ts` :

```ts
test("les pages légales sont publiques (issue #134 : lisibles avant inscription)", () => {
  expect(isPublicRoute("/mentions-legales")).toBe(true);
  expect(isPublicRoute("/confidentialite")).toBe(true);
  expect(isPublicRoute("/cgu")).toBe(true);
  expect(isPublicRoute("/informations-legales")).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/supabase/middleware.test.ts`
Expected: FAIL sur les 4 nouvelles assertions (`isPublicRoute` renvoie `false`).

- [ ] **Step 3: Write minimal implementation**

Dans `lib/supabase/middleware.ts`, modifier `isPublicRoute` :

```ts
// Issue #134 : pages légales publiques — un visiteur non authentifié (avant
// inscription) doit pouvoir les lire, même raisonnement que /login/welcome.
export function isPublicRoute(path: string): boolean {
  return (
    path.startsWith("/login") ||
    path.startsWith("/welcome") ||
    path.startsWith("/api/") ||
    path.startsWith("/oauth/") ||
    path.startsWith("/.well-known/") ||
    path.startsWith("/mentions-legales") ||
    path.startsWith("/confidentialite") ||
    path.startsWith("/cgu") ||
    path.startsWith("/informations-legales")
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/supabase/middleware.test.ts`
Expected: PASS (toutes les assertions, anciennes et nouvelles).

- [ ] **Step 5: Commit**

```bash
git add lib/supabase/middleware.ts lib/supabase/middleware.test.ts
git commit -m "feat: routes légales publiques sans session (issue #134)"
```

---

### Task 7: `app/mentions-legales/page.tsx`

**Files:**
- Create: `app/mentions-legales/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
// app/mentions-legales/page.tsx
import type { Metadata } from "next";
import BackLink from "@/components/ui/BackLink";

export const metadata: Metadata = { title: "Mentions légales — Dodojo" };

// Issue #134. Page 100% statique, publique (cf. isPublicRoute) — lisible
// avant inscription. Éditeur particulier non-déclaré : identité réduite au
// minimum LCEN (art. 6-III), adresse complète communicable aux autorités
// compétentes via l'hébergeur, jamais publiée ici.
export default function MentionsLegalesPage() {
  return (
    <main className="screen-main gap-4 px-4 py-8">
      <BackLink href="/informations-legales" label="Retour aux informations légales" />
      <h1 className="text-center font-display text-lg uppercase tracking-wide text-ink">
        Mentions légales
      </h1>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-sm uppercase tracking-wide text-muted">Édition</h2>
        <p className="text-sm text-ink">
          Dodojo est édité par un particulier, à titre non professionnel.
        </p>
        <p className="text-sm text-ink">
          Contact : <a href="mailto:arnaud.solente+dodojo@gmail.com" className="underline underline-offset-4">arnaud.solente+dodojo@gmail.com</a>
        </p>
        <p className="text-xs text-muted">
          Conformément à l&apos;article 6-III de la loi n° 2004-575 du 21 juin 2004 pour la
          confiance dans l&apos;économie numérique, l&apos;éditeur, personne physique agissant à
          titre non professionnel, a communiqué son identité complète à l&apos;hébergeur
          ci-dessous. Cette identité est tenue à la disposition des autorités judiciaires qui en
          feraient la demande, sans être publiée sur ce site.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-sm uppercase tracking-wide text-muted">Hébergement</h2>
        <p className="text-sm text-ink">
          Vercel Inc.
          <br />
          440 N Barranca Avenue #4133
          <br />
          Covina, CA 91723
          <br />
          États-Unis
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-sm uppercase tracking-wide text-muted">
          Base de données et authentification
        </h2>
        <p className="text-sm text-ink">Supabase, hébergé dans l&apos;Union Européenne.</p>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add app/mentions-legales/page.tsx
git commit -m "feat: page Mentions légales (issue #134)"
```

---

### Task 8: `app/confidentialite/page.tsx`

**Files:**
- Create: `app/confidentialite/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
// app/confidentialite/page.tsx
import type { Metadata } from "next";
import BackLink from "@/components/ui/BackLink";

export const metadata: Metadata = { title: "Politique de confidentialité — Dodojo" };

// Issue #134. Tension documentée avec RG-04 (CLAUDE.md) : le droit à
// l'effacement RGPD est un droit sur les données PERSONNELLES, distinct de
// l'historique de jeu que RG-04 protège — traité manuellement par email pour
// l'instant (dette assumée MVP), jamais un flow en self-service.
export default function ConfidentialitePage() {
  return (
    <main className="screen-main gap-4 px-4 py-8">
      <BackLink href="/informations-legales" label="Retour aux informations légales" />
      <h1 className="text-center font-display text-lg uppercase tracking-wide text-ink">
        Politique de confidentialité
      </h1>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-sm uppercase tracking-wide text-muted">
          Données collectées
        </h2>
        <p className="text-sm text-ink">
          Email, pseudo, fuseau horaire, niveau d&apos;agressivité de La Voix, historique de
          tâches et de combats, souscription aux notifications push (si activée), jeton de
          webhook (si généré). Si tu connectes Gemini à Dodojo : les informations techniques de
          cette connexion (client OAuth, jetons d&apos;accès).
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-sm uppercase tracking-wide text-muted">
          Pourquoi ces données
        </h2>
        <p className="text-sm text-ink">
          Uniquement pour fournir le service que tu utilises : faire fonctionner ton compte, ton
          combat quotidien et tes réglages. Aucune finalité publicitaire, aucune revente à des
          tiers.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-sm uppercase tracking-wide text-muted">
          Qui héberge/traite ces données
        </h2>
        <ul className="list-disc pl-5 text-sm text-ink">
          <li>Supabase (base de données et authentification, hébergé dans l&apos;Union Européenne)</li>
          <li>Vercel (hébergement de l&apos;application)</li>
          <li>Inngest (envoi programmé des rappels de notification)</li>
          <li>
            Le service de notification de ton navigateur (Google, Mozilla ou Apple selon le
            navigateur utilisé) si tu actives les notifications push — il ne reçoit que l&apos;URL
            technique de ta souscription, jamais le contenu de tes tâches.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-sm uppercase tracking-wide text-muted">
          Durée de conservation
        </h2>
        <p className="text-sm text-ink">
          Tant que ton compte existe. Voir la section &laquo; Tes droits &raquo; ci-dessous pour
          en demander la suppression.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-sm uppercase tracking-wide text-muted">Cookies</h2>
        <p className="text-sm text-ink">
          Dodojo pose un seul cookie : celui de ta session de connexion (Supabase), strictement
          nécessaire au fonctionnement du service. Aucun cookie publicitaire, aucun cookie de
          suivi tiers — aucun bandeau de consentement n&apos;est donc nécessaire aujourd&apos;hui.
          Ce point sera revu si un outil de mesure d&apos;audience est ajouté un jour.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-sm uppercase tracking-wide text-muted">Tes droits</h2>
        <p className="text-sm text-ink">
          Tu peux demander l&apos;accès, la rectification ou la suppression de tes données
          personnelles à tout moment. Écris à{" "}
          <a href="mailto:arnaud.solente+dodojo@gmail.com" className="underline underline-offset-4">
            arnaud.solente+dodojo@gmail.com
          </a>{" "}
          — ta demande sera traitée manuellement, sous 30 jours.
        </p>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add app/confidentialite/page.tsx
git commit -m "feat: page Politique de confidentialité (issue #134)"
```

---

### Task 9: `app/cgu/page.tsx`

**Files:**
- Create: `app/cgu/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
// app/cgu/page.tsx
import type { Metadata } from "next";
import BackLink from "@/components/ui/BackLink";

export const metadata: Metadata = { title: "Conditions Générales d'Utilisation — Dodojo" };

// Issue #134. CGU courtes, pas de CGV (aucun paiement réel dans l'app à ce
// jour) — à ajouter si une monétisation réelle est introduite plus tard.
export default function CguPage() {
  return (
    <main className="screen-main gap-4 px-4 py-8">
      <BackLink href="/informations-legales" label="Retour aux informations légales" />
      <h1 className="text-center font-display text-lg uppercase tracking-wide text-ink">
        Conditions Générales d&apos;Utilisation
      </h1>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-sm uppercase tracking-wide text-muted">Objet</h2>
        <p className="text-sm text-ink">
          Ces conditions régissent l&apos;utilisation de Dodojo, une application personnelle de
          productivité gratuite.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-sm uppercase tracking-wide text-muted">Or virtuel</h2>
        <p className="text-sm text-ink">
          L&apos;or gagné en jouant n&apos;a aucune valeur réelle. Il ne peut être ni remboursé, ni
          converti en argent réel, ni transféré à un autre compte.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-sm uppercase tracking-wide text-muted">
          Usage du compte
        </h2>
        <p className="text-sm text-ink">
          Ton compte est personnel. Ne le partage pas, ne le revends pas.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-sm uppercase tracking-wide text-muted">Responsabilité</h2>
        <p className="text-sm text-ink">
          Dodojo est un projet personnel, fourni tel quel. Sa disponibilité continue
          n&apos;est pas garantie.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-sm uppercase tracking-wide text-muted">
          Droit applicable
        </h2>
        <p className="text-sm text-ink">Droit français.</p>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add app/cgu/page.tsx
git commit -m "feat: page CGU (issue #134)"
```

---

### Task 10: Hub `/informations-legales` + découvrabilité

**Files:**
- Create: `app/informations-legales/page.tsx`
- Modify: `app/vestiaire/page.tsx:15-22` (tableau `SECTIONS`)
- Modify: `app/welcome/WelcomeSignup.tsx:86-91`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes : les 3 routes des Tasks 7-9.

- [ ] **Step 1: Write the hub page**

```tsx
// app/informations-legales/page.tsx
import Link from "next/link";
import type { Metadata } from "next";
import BackLink from "@/components/ui/BackLink";

export const metadata: Metadata = { title: "Informations légales — Dodojo" };

const PAGES: Array<{ href: string; label: string }> = [
  { href: "/mentions-legales", label: "Mentions légales" },
  { href: "/confidentialite", label: "Politique de confidentialité" },
  { href: "/cgu", label: "Conditions Générales d'Utilisation" },
];

// Issue #134. Sommaire statique, public (cf. isPublicRoute) — pas de
// BottomNav : ce hub doit rester lisible par un visiteur non authentifié
// (lien depuis /welcome), pour qui les onglets Arène/Marché Noir n'ont pas
// de sens avant inscription.
export default function InformationsLegalesPage() {
  return (
    <main className="screen-main gap-4 px-4 py-8">
      <BackLink href="/vestiaire" label="Retour au Vestiaire" />
      <h1 className="text-center font-display text-lg uppercase tracking-wide text-ink">
        Informations légales
      </h1>
      <nav aria-label="Pages légales" className="flex flex-col gap-2">
        {PAGES.map((page) => (
          <Link
            key={page.href}
            href={page.href}
            className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-3 text-sm text-ink hover:border-ink"
          >
            {page.label}
            <span aria-hidden="true" className="text-faint">
              ›
            </span>
          </Link>
        ))}
      </nav>
    </main>
  );
}
```

- [ ] **Step 2: Ajouter l'entrée dans Le Vestiaire**

Dans `app/vestiaire/page.tsx`, étendre `SECTIONS` (poursuit Task 4) :

```tsx
const SECTIONS: Array<{ href: string; icon: string; label: string }> = [
  { href: "/vestiaire/profil", icon: "👤", label: "Profil" },
  { href: "/tableau-de-chasse", icon: "🏆", label: "Tableau de Chasse" },
  { href: "/vestiaire/entrainement", icon: "🔁", label: "Mes Routines" },
  { href: "/vestiaire/artisans", icon: "🎨", label: "Les Artisans" },
  { href: "/marche-noir", icon: "🛒", label: "Le Marché Noir" },
  { href: "/guide", icon: "📖", label: "Le Guide" },
  { href: "/informations-legales", icon: "⚖️", label: "Informations légales" },
];
```

- [ ] **Step 3: Lien depuis l'inscription**

Dans `app/welcome/WelcomeSignup.tsx`, ajouter un paragraphe juste avant le lien "Déjà un compte ?" (avant la ligne 88 actuelle) :

```tsx
      <p className="text-center text-[10px] text-faint">
        En créant ton compte, tu acceptes les{" "}
        <Link href="/cgu" className="underline underline-offset-4">
          CGU
        </Link>{" "}
        et la{" "}
        <Link href="/confidentialite" className="underline underline-offset-4">
          politique de confidentialité
        </Link>
        .
      </p>
```

(`Link` est déjà importé dans ce fichier.)

- [ ] **Step 4: Ajouter la ligne au changelog**

Dans `CHANGELOG.md`, sous `## [Unreleased]` :

```markdown
- Pages légales (mentions légales, politique de confidentialité, CGU) accessibles depuis Le Vestiaire et le formulaire d'inscription (issue #134).
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit`
Expected: pas d'erreur.

- [ ] **Step 6: Commit**

```bash
git add app/informations-legales/page.tsx app/vestiaire/page.tsx app/welcome/WelcomeSignup.tsx CHANGELOG.md
git commit -m "feat: hub Informations légales + découvrabilité (issue #134)"
```

---

### Task 11: e2e — Pages légales

**Files:**
- Create: `e2e/informations-legales.spec.ts`

**Interfaces:**
- Consumes: `login` (`e2e/fixtures.ts`).

- [ ] **Step 1: Write the failing test**

```ts
// e2e/informations-legales.spec.ts
import { test, expect } from "@playwright/test";
import { login } from "./fixtures";

test.describe("Pages légales (issue #134)", () => {
  test("les 3 pages sont accessibles sans session (visiteur anonyme)", async ({ page }) => {
    for (const path of ["/mentions-legales", "/confidentialite", "/cgu"]) {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
    }
  });

  test("mentions légales : contact et hébergeur visibles", async ({ page }) => {
    await page.goto("/mentions-legales");
    await expect(page.getByText("arnaud.solente+dodojo@gmail.com")).toBeVisible();
    await expect(page.getByText("Vercel Inc.")).toBeVisible();
  });

  test("confidentialité : mention cookies visible", async ({ page }) => {
    await page.goto("/confidentialite");
    await expect(page.getByText(/aucun bandeau de consentement/)).toBeVisible();
  });

  test("accessible depuis Le Vestiaire (utilisateur connecté) et depuis l'inscription", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/vestiaire");
    await page.getByRole("link", { name: /Informations légales/ }).click();
    await page.waitForURL("/informations-legales");
    await expect(page.getByRole("link", { name: "Mentions légales" })).toBeVisible();

    await page.goto("/welcome");
    await expect(page.getByRole("link", { name: "CGU" })).toBeVisible();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (avant Tasks 6-10) : `npx playwright test e2e/informations-legales.spec.ts`
Expected: FAIL (routes inexistantes / redirection anonyme vers `/welcome`).

- [ ] **Step 3: Run against the implemented app**

Run: `npx playwright test e2e/informations-legales.spec.ts`
Expected: PASS (4 tests) — confirme l'intégration bout-en-bout de la Partie B.

- [ ] **Step 4: Commit**

```bash
git add e2e/informations-legales.spec.ts
git commit -m "test(e2e): accès public aux pages légales (issue #134)"
```

---

## Vérification finale avant PR

Après la Task 11 :
1. `npx vitest run` — suite complète Vitest verte.
2. `npx tsc --noEmit` — aucune erreur de type.
3. `npm run build` — build de production sans erreur.
4. `npx playwright test` — suite e2e complète verte (pas seulement les 2 nouveaux fichiers — vérifie l'absence de régression, notamment sur `e2e/onboarding.spec.ts` qui touche `WelcomeSignup.tsx`).
5. `graphify update .` — graphe à jour avant de pousser la PR (demande explicite de l'utilisateur).
6. Proposer à l'utilisateur de scinder l'issue #134 en deux sous-issues GitHub (Artisans / Pages légales) pour le suivi, même si le code part en une seule PR.
