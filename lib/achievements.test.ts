import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENTS,
  ALL_ACHIEVEMENT_DEFS,
  PLATINUM_CODE,
  TOTAL_ACHIEVEMENTS_COUNT,
  achievementProgressFor,
  bestTitleCode,
  evaluateAchievements,
  getAchievement,
  rarityCounts,
  type AchievementContext,
} from "./achievements";
import { HEROES } from "./heroes";
import { BOSSES } from "./bosses";
import { BACKGROUNDS } from "./backgrounds";

function baseCtx(overrides: Partial<AchievementContext> = {}): AchievementContext {
  return {
    level: 1,
    bestStreak: 0,
    hasVictory: false,
    unlockedHeroIds: [],
    seenBossIds: [],
    seenBackgroundIds: [],
    ...overrides,
  };
}

describe("evaluateAchievements", () => {
  it("ne débloque rien sur un contexte vierge", () => {
    expect(evaluateAchievements(baseCtx(), new Set())).toEqual([]);
  });

  it("débloque un succès héros quand le héros est possédé", () => {
    const codes = evaluateAchievements(baseCtx({ unlockedHeroIds: ["fire_knight"] }), new Set());
    expect(codes).toContain("HERO_FIRE_KNIGHT");
  });

  it("débloque ALL_HEROES quand tous les héros sont possédés", () => {
    const allIds = HEROES.map((h) => h.id);
    expect(evaluateAchievements(baseCtx({ unlockedHeroIds: allIds }), new Set())).toContain(
      "ALL_HEROES",
    );
  });

  it("débloque FIRST_VICTORY", () => {
    expect(evaluateAchievements(baseCtx({ hasVictory: true }), new Set())).toContain(
      "FIRST_VICTORY",
    );
  });

  it.each([
    [7, "STREAK_7"],
    [30, "STREAK_30"],
    [100, "STREAK_100"],
  ])("débloque la série %s -> %s", (streak, code) => {
    expect(evaluateAchievements(baseCtx({ bestStreak: streak as number }), new Set())).toContain(
      code,
    );
  });

  it("débloque HALF_BOSSES à la moitié du roster, pas avant", () => {
    const half = Math.ceil(BOSSES.length / 2);
    const tooFew = BOSSES.slice(0, half - 1).map((b) => b.id);
    expect(evaluateAchievements(baseCtx({ seenBossIds: tooFew }), new Set())).not.toContain(
      "HALF_BOSSES",
    );
    const enough = BOSSES.slice(0, half).map((b) => b.id);
    expect(evaluateAchievements(baseCtx({ seenBossIds: enough }), new Set())).toContain(
      "HALF_BOSSES",
    );
  });

  it("débloque ALL_BOSSES quand tout le roster est vu", () => {
    const allIds = BOSSES.map((b) => b.id);
    expect(evaluateAchievements(baseCtx({ seenBossIds: allIds }), new Set())).toContain(
      "ALL_BOSSES",
    );
  });

  it("débloque ALL_BACKGROUNDS quand tous les décors sont vus", () => {
    const allIds = BACKGROUNDS.map((b) => b.id);
    expect(evaluateAchievements(baseCtx({ seenBackgroundIds: allIds }), new Set())).toContain(
      "ALL_BACKGROUNDS",
    );
  });

  it.each([
    [10, "LEVEL_10"],
    [20, "LEVEL_20"],
    [50, "LEVEL_50"],
    [84, "LEVEL_84"],
    [100, "LEVEL_100"],
    [212, "LEVEL_212"],
    [666, "LEVEL_666"],
    [777, "LEVEL_777"],
    [1000, "LEVEL_1000"],
    [9001, "LEVEL_9001"],
  ])("débloque le niveau %s -> %s", (level, code) => {
    expect(evaluateAchievements(baseCtx({ level: level as number }), new Set())).toContain(code);
  });

  it("est idempotent : un code déjà débloqué n'est jamais re-retourné", () => {
    const already = new Set(["FIRST_VICTORY"]);
    expect(evaluateAchievements(baseCtx({ hasVictory: true }), already)).not.toContain(
      "FIRST_VICTORY",
    );
  });

  it("PLATINUM : débloqué à 20/20 succès éligibles, jamais avant, jamais via les easter eggs seuls", () => {
    const eligible = ACHIEVEMENTS.filter((a) => a.countsTowardPlatinum).map((a) => a.code);
    expect(eligible.length).toBe(20);

    const almostAll = new Set(eligible.slice(0, eligible.length - 1));
    expect(evaluateAchievements(baseCtx(), almostAll)).not.toContain(PLATINUM_CODE);

    const allEligible = new Set(eligible);
    expect(evaluateAchievements(baseCtx(), allEligible)).toContain(PLATINUM_CODE);

    const onlyEasterEggs = new Set(
      ACHIEVEMENTS.filter((a) => !a.countsTowardPlatinum).map((a) => a.code),
    );
    expect(evaluateAchievements(baseCtx({ level: 9001 }), onlyEasterEggs)).not.toContain(
      PLATINUM_CODE,
    );
  });
});

describe("bestTitleCode", () => {
  it("renvoie null sans succès débloqué", () => {
    expect(bestTitleCode([])).toBeNull();
  });

  it("choisit la rareté la plus haute", () => {
    const unlocked = [
      { code: "HERO_FIRE_KNIGHT", unlockedAt: "2026-01-01T00:00:00Z" },
      { code: "STREAK_100", unlockedAt: "2026-01-02T00:00:00Z" },
    ];
    expect(bestTitleCode(unlocked)).toBe("STREAK_100");
  });

  it("départage l'égalité de rareté par le plus récent", () => {
    const unlocked = [
      { code: "STREAK_7", unlockedAt: "2026-01-01T00:00:00Z" },
      { code: "STREAK_30", unlockedAt: "2026-01-02T00:00:00Z" },
    ];
    expect(bestTitleCode(unlocked)).toBe("STREAK_30");
  });
});

describe("achievementProgressFor", () => {
  it("renvoie null pour un succès mystère", () => {
    expect(achievementProgressFor("FIRST_VICTORY", baseCtx(), new Set())).toBeNull();
  });

  it("renvoie current/total pour ALL_HEROES", () => {
    expect(
      achievementProgressFor("ALL_HEROES", baseCtx({ unlockedHeroIds: ["fire_knight"] }), new Set()),
    ).toEqual({ current: 1, total: HEROES.length });
  });

  it("HALF_BOSSES vise la moitié du roster, distinct du total ALL_BOSSES", () => {
    const ctx = baseCtx({ seenBossIds: [BOSSES[0].id] });
    expect(achievementProgressFor("HALF_BOSSES", ctx, new Set())).toEqual({
      current: 1,
      total: Math.ceil(BOSSES.length / 2),
    });
    expect(achievementProgressFor("ALL_BOSSES", ctx, new Set())).toEqual({
      current: 1,
      total: BOSSES.length,
    });
  });

  it("PLATINUM compte les succès éligibles débloqués", () => {
    const eligible = ACHIEVEMENTS.filter((a) => a.countsTowardPlatinum).map((a) => a.code);
    expect(
      achievementProgressFor(PLATINUM_CODE, baseCtx(), new Set([eligible[0]])),
    ).toEqual({ current: 1, total: eligible.length });
  });
});

describe("catalogue", () => {
  it("expose 26 succès au total (25 + Platine)", () => {
    expect(ACHIEVEMENTS.length).toBe(25);
    expect(TOTAL_ACHIEVEMENTS_COUNT).toBe(26);
  });

  it("résout le titre Platine", () => {
    expect(getAchievement(PLATINUM_CODE)?.title).toBe("Démon Vaincu");
  });
});

describe("rarityCounts", () => {
  it("renvoie unlocked=0 pour chaque rareté quand rien n'est débloqué", () => {
    const counts = rarityCounts(new Set());
    for (const rarity of ["bronze", "argent", "or", "platine"] as const) {
      expect(counts[rarity].unlocked).toBe(0);
    }
  });

  it("calcule Y = nombre d'entrées de cette rareté dans ALL_ACHIEVEMENT_DEFS", () => {
    const counts = rarityCounts(new Set());
    for (const rarity of ["bronze", "argent", "or", "platine"] as const) {
      const expectedTotal = ALL_ACHIEVEMENT_DEFS.filter((d) => d.rarity === rarity).length;
      expect(counts[rarity].total).toBe(expectedTotal);
    }
  });

  it("compte le platine à 1/1 exclusivement (PLATINUM_CODE)", () => {
    const counts = rarityCounts(new Set());
    expect(counts.platine.total).toBe(1);
    expect(counts.platine.unlocked).toBe(0);

    const withPlatinum = rarityCounts(new Set([PLATINUM_CODE]));
    expect(withPlatinum.platine.unlocked).toBe(1);
  });

  it("incrémente chaque rareté quand un code de cette rareté est débloqué", () => {
    const sample = rarityCounts(
      new Set(["HERO_FIRE_KNIGHT", "STREAK_7", "ALL_HEROES", PLATINUM_CODE]),
    );
    expect(sample.bronze.unlocked).toBeGreaterThanOrEqual(1);
    expect(sample.argent.unlocked).toBeGreaterThanOrEqual(1);
    expect(sample.or.unlocked).toBeGreaterThanOrEqual(1);
    expect(sample.platine.unlocked).toBe(1);
  });

  it("tous débloqués -> unlocked === total pour chaque rareté", () => {
    const all = new Set(ALL_ACHIEVEMENT_DEFS.map((d) => d.code));
    const counts = rarityCounts(all);
    for (const rarity of ["bronze", "argent", "or", "platine"] as const) {
      expect(counts[rarity].unlocked).toBe(counts[rarity].total);
    }
  });

  it("les paliers extrêmes (or, countsTowardPlatinum=false) sont inclus dans le total or", () => {
    const extremeOrCodes = ALL_ACHIEVEMENT_DEFS.filter(
      (d) => d.rarity === "or" && !d.countsTowardPlatinum,
    ).map((d) => d.code);
    expect(extremeOrCodes.length).toBeGreaterThan(0);

    const withExtreme = rarityCounts(new Set(extremeOrCodes));
    expect(withExtreme.or.unlocked).toBe(extremeOrCodes.length);
  });
});

describe("noms de héros dans les succès (issue #156)", () => {
  it("chaque description reprend littéralement le nom du catalogue", () => {
    for (const hero of HEROES) {
      const def = ALL_ACHIEVEMENT_DEFS.find(
        (d) => d.code === `HERO_${hero.id.toUpperCase()}`,
      );
      expect(def, `succès manquant pour ${hero.id}`).toBeDefined();
      expect(
        def!.description,
        `"${def!.description}" ne contient pas "${hero.name}"`,
      ).toContain(hero.name);
    }
  });
});
