import { describe, expect, test } from "vitest";
import { ARTISANS, isArtisanSeen, type ArtisanSeenContext } from "./credits";
import { getHero } from "./heroes";
import { getBoss } from "./bosses";
import { getBackground } from "./backgrounds";

describe("ARTISANS (issue #134)", () => {
  test("catalogue non vide, catégories limitées à ce qui est réellement livré", () => {
    expect(ARTISANS.length).toBeGreaterThan(0);
    const allowed = new Set(["heros", "boss", "decors", "police", "icones"]);
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
