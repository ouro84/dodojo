import { describe, expect, it } from "vitest";
import { HEROES } from "./heroes";
import { BOSSES } from "./bosses";
import rawJson from "./sprite-metadata.generated.json";
import type { CharacterSpriteMeta, VfxMeta } from "./sprite-metadata";

// Le JSON importé infère un type littéral distinct par personnage (les clés
// `anims` diffèrent entre héros et boss, et minotaur n'a pas hurt/death) :
// Object.entries sur cette union ferait perdre le typage. On recadre donc sur
// les mêmes types que lib/sprite-metadata.ts, qui sert déjà d'accesseur runtime.
const raw = rawJson as {
  heroes: Record<string, CharacterSpriteMeta>;
  bosses: Record<string, CharacterSpriteMeta>;
  vfx: Record<string, Record<string, VfxMeta>>;
};

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

  it("expose une ancre horizontale d'idle pour chaque héros et chaque boss", () => {
    const all = [
      ...Object.entries(raw.heroes).map(([slug, m]) => [`héros ${slug}`, m] as const),
      ...Object.entries(raw.bosses).map(([slug, m]) => [`boss ${slug}`, m] as const),
    ];

    for (const [label, meta] of all) {
      expect(typeof meta.idleAnchorX, `${label} : idleAnchorX manquant`).toBe("number");
      expect(typeof meta.idleWidthRatio, `${label} : idleWidthRatio manquant`).toBe("number");

      // L'ancre est le centre de la silhouette idle, en fraction de tuile.
      expect(meta.idleAnchorX, `${label} : ancre hors tuile`).toBeGreaterThan(0);
      expect(meta.idleAnchorX, `${label} : ancre hors tuile`).toBeLessThan(1);

      // La silhouette idle ne peut pas être plus large que la tuile (qui est
      // l'union de toutes les anims, donc toujours au moins aussi large).
      expect(meta.idleWidthRatio, `${label} : largeur idle nulle`).toBeGreaterThan(0);
      expect(meta.idleWidthRatio, `${label} : largeur idle > tuile`).toBeLessThanOrEqual(1);

      // Cohérence : la silhouette centrée sur l'ancre reste dans la tuile.
      const half = meta.idleWidthRatio / 2;
      expect(meta.idleAnchorX - half, `${label} : silhouette débordant à gauche`)
        .toBeGreaterThanOrEqual(-1e-9);
      expect(meta.idleAnchorX + half, `${label} : silhouette débordant à droite`)
        .toBeLessThanOrEqual(1 + 1e-9);
    }
  });

});
