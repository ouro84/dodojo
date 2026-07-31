import { describe, expect, it } from "vitest";
import { HEROES } from "./heroes";
import { BOSSES } from "./bosses";
import raw from "./sprite-metadata.generated.json";

// Référence figée par scripts/build-sprite-sheets.mjs (issue #74). Dupliquée
// ici volontairement : un test qui lirait la même source que le code testé ne
// détecterait aucune dérive.
const LEGACY_IDLE_HEIGHTS: Record<string, number> = {
  "crystal-mauler": 39, "fire-knight": 44, "ground-monk": 35, "leaf-ranger": 44,
  "metal-bladekeeper": 42, "water-priestess": 38, "wind-hashashin": 37,
  accomplice: 71, cthulhu: 64, "demon-slime": 107, "dock-corpse": 67,
  "fire-wizard": 66, "frost-guardian": 92, gangster: 72, gorgon: 85,
  "gorgon-ivory": 85, "gorgon-scarlet": 85, idler: 76, jaded: 69, knight: 64,
  "knight-amethyst": 64, "knight-garnet": 64, "lightning-mage": 63,
  minotaur: 108, "minotaur-ardent": 86, "minotaur-occult": 93,
  "minotaur-warrior": 93, "mob-baron": 71, mushroom: 33, procrastinator: 66,
  satyr: 89, temptress: 75, "urban-zombie": 67, "wandering-mage": 66,
};

describe("sprite-metadata.generated.json", () => {
  it("couvre les 7 héros du catalogue", () => {
    for (const hero of HEROES) {
      expect(raw.heroes, `héros manquant : ${hero.slug}`).toHaveProperty(hero.slug);
    }
  });

  it("couvre les 27 boss du catalogue", () => {
    for (const boss of BOSSES) {
      expect(raw.bosses, `boss manquant : ${boss.slug}`).toHaveProperty(boss.slug);
    }
  });

  it("déclare au moins une frame par anim", () => {
    for (const group of [raw.heroes, raw.bosses]) {
      for (const [slug, meta] of Object.entries(group)) {
        for (const [anim, a] of Object.entries(meta.anims)) {
          expect(a.frames, `${slug}.${anim}`).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  it("place chaque impactFrame dans l'animation", () => {
    for (const group of [raw.heroes, raw.bosses]) {
      for (const [slug, meta] of Object.entries(group)) {
        for (const [anim, a] of Object.entries(meta.anims)) {
          if (a.impactFrame === null) continue;
          expect(a.impactFrame, `${slug}.${anim}`).toBeGreaterThanOrEqual(1);
          expect(a.impactFrame, `${slug}.${anim}`).toBeLessThan(a.frames);
        }
      }
    }
  });

  // NON-RÉGRESSION ISSUE #74 : garantit que le passage à une boîte de recadrage
  // élargie n'a pas changé la taille apparente des personnages.
  it("dérive renderScale des hauteurs de référence de l'issue #74", () => {
    for (const group of [raw.heroes, raw.bosses]) {
      for (const [slug, meta] of Object.entries(group)) {
        const legacy = LEGACY_IDLE_HEIGHTS[slug];
        expect(legacy, `pas de hauteur de référence pour ${slug}`).toBeDefined();
        expect(meta.tileH / meta.renderScale).toBeCloseTo(legacy, 5);
        expect(meta.renderScale).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("donne au moins deux variantes de VFX à chaque héros", () => {
    for (const hero of HEROES) {
      const variants = Object.keys(raw.vfx[hero.slug] ?? {});
      expect(variants.length, `VFX manquants : ${hero.slug}`).toBeGreaterThanOrEqual(2);
    }
  });

  it("laisse minotaur sans hurt ni death (pack incomplet, fallback CSS)", () => {
    expect(raw.bosses.minotaur.anims).not.toHaveProperty("hurt");
    expect(raw.bosses.minotaur.anims).not.toHaveProperty("death");
  });
});
