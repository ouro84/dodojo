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
  summarizeDayResults,
  CATEGORY_LABELS,
  type AchievementContext,
  type AchievementDayResult,
} from "./achievements";
import { HEROES } from "./heroes";
import { BOSSES } from "./bosses";
import { BACKGROUNDS } from "./backgrounds";
import { SKINS } from "./hero-skins";

// Un jour de combat minimal — seuls les champs lus par le catalogue.
function day(overrides: Partial<AchievementDayResult> = {}): AchievementDayResult {
  return {
    outcome: "victory",
    tasks_completed: 1,
    tasks_abandoned: 0,
    gold_earned: 0,
    boss_max_hp: 20,
    ...overrides,
  };
}

const ALT_SKIN_IDS = SKINS.filter((s) => !s.isDefault).map((s) => s.id);

function baseCtx(overrides: Partial<AchievementContext> = {}): AchievementContext {
  return {
    level: 1,
    bestStreak: 0,
    unlockedHeroIds: [],
    unlockedSkinIds: [],
    seenBossIds: [],
    seenBackgroundIds: [],
    dayResults: [],
    rageQuitCount: 0,
    routineCount: 0,
    shareSuccessCount: 0,
    aggressivityLevel: "direct",
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

  it("débloque FIRST_VICTORY à la première journée gagnée, jamais sur une retraite", () => {
    expect(
      evaluateAchievements(baseCtx({ dayResults: [day({ outcome: "retreat" })] }), new Set()),
    ).not.toContain("FIRST_VICTORY");
    expect(evaluateAchievements(baseCtx({ dayResults: [day()] }), new Set())).toContain(
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
    expect(evaluateAchievements(baseCtx({ dayResults: [day()] }), already)).not.toContain(
      "FIRST_VICTORY",
    );
  });

  it("PLATINUM : débloqué à 35/35 succès éligibles, jamais avant, jamais via les easter eggs seuls", () => {
    const eligible = ACHIEVEMENTS.filter((a) => a.countsTowardPlatinum).map((a) => a.code);
    expect(eligible.length).toBe(35);

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
  it("expose 42 succès au total (41 + Platine)", () => {
    expect(ACHIEVEMENTS.length).toBe(41);
    expect(TOTAL_ACHIEVEMENTS_COUNT).toBe(42);
  });

  it("aucun code dupliqué", () => {
    const codes = ALL_ACHIEVEMENT_DEFS.map((d) => d.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  // Une catégorie sans label rend sa section SILENCIEUSEMENT absente de
  // /tableau-de-chasse/succes (le rendu itère sur CATEGORY_LABELS, pas sur le
  // catalogue). Ce test est la seule garde contre un succès invisible.
  it("chaque catégorie du catalogue a un label d'affichage", () => {
    for (const def of ALL_ACHIEVEMENT_DEFS) {
      expect(CATEGORY_LABELS[def.category], `catégorie sans label : ${def.category}`).toBeDefined();
    }
  });

  it("tout succès à compteur expose une progression, et aucun succès mystère n'en expose", () => {
    const ctx = baseCtx();
    for (const def of ALL_ACHIEVEMENT_DEFS) {
      const progress = achievementProgressFor(def.code, ctx, new Set());
      if (def.displayMode === "progress") {
        expect(progress, `pas de progression pour ${def.code}`).not.toBeNull();
        expect(progress!.total).toBeGreaterThan(0);
      } else {
        expect(progress, `progression inattendue pour ${def.code}`).toBeNull();
      }
    }
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

  it("Gardienne des Lames (issue #75, héroïne) accorde 'débloquée' au féminin", () => {
    const def = ALL_ACHIEVEMENT_DEFS.find((d) => d.code === "HERO_METAL_BLADEKEEPER");
    expect(def?.description).toBe("Gardienne des Lames débloquée.");
  });
});

// Issue #199 : lot de 16 succès dérivés de day_results / unlocked_skins /
// compteurs. Les agrégats sont purs (summarizeDayResults) donc testables sans
// base — c'est ce qui permet à assembleAchievementContext de rester une simple
// lecture (D2 du spec #72).
describe("summarizeDayResults", () => {
  it("renvoie des zéros sur un historique vide", () => {
    expect(summarizeDayResults([])).toEqual({
      tasksCompleted: 0,
      victories: 0,
      goldEarned: 0,
      maxTasksInADay: 0,
      hasCleanVictory: false,
      hasDefeat: false,
      maxVictoryBossHp: 0,
    });
  });

  it("agrège en une passe sur plusieurs jours", () => {
    const rows = [
      day({ outcome: "victory", tasks_completed: 4, gold_earned: 60, boss_max_hp: 80 }),
      day({ outcome: "retreat", tasks_completed: 7, tasks_abandoned: 2, gold_earned: 15 }),
      day({ outcome: "defeat", tasks_completed: 0, gold_earned: 0 }),
    ];
    expect(summarizeDayResults(rows)).toEqual({
      tasksCompleted: 11,
      victories: 1,
      goldEarned: 75,
      maxTasksInADay: 7,
      hasCleanVictory: true,
      hasDefeat: true,
      maxVictoryBossHp: 80,
    });
  });

  it("hasCleanVictory ignore une journée sans abandon qui n'est pas une victoire", () => {
    const rows = [day({ outcome: "retreat", tasks_abandoned: 0 })];
    expect(summarizeDayResults(rows).hasCleanVictory).toBe(false);
  });

  it("maxVictoryBossHp ignore les Boss non terrassés", () => {
    const rows = [
      day({ outcome: "defeat", boss_max_hp: 900 }),
      day({ outcome: "victory", boss_max_hp: 120 }),
    ];
    expect(summarizeDayResults(rows).maxVictoryBossHp).toBe(120);
  });
});

describe("succès de collection (tenues)", () => {
  it("FIRST_SKIN dès la première tenue alternative", () => {
    expect(evaluateAchievements(baseCtx(), new Set())).not.toContain("FIRST_SKIN");
    expect(
      evaluateAchievements(baseCtx({ unlockedSkinIds: [ALT_SKIN_IDS[0]] }), new Set()),
    ).toContain("FIRST_SKIN");
  });

  it("FIVE_SKINS à cinq tenues, pas à quatre", () => {
    expect(
      evaluateAchievements(baseCtx({ unlockedSkinIds: ALT_SKIN_IDS.slice(0, 4) }), new Set()),
    ).not.toContain("FIVE_SKINS");
    expect(
      evaluateAchievements(baseCtx({ unlockedSkinIds: ALT_SKIN_IDS.slice(0, 5) }), new Set()),
    ).toContain("FIVE_SKINS");
  });

  it("ALL_SKINS quand toutes les tenues alternatives du catalogue sont possédées", () => {
    expect(
      evaluateAchievements(baseCtx({ unlockedSkinIds: ALT_SKIN_IDS.slice(0, -1) }), new Set()),
    ).not.toContain("ALL_SKINS");
    expect(evaluateAchievements(baseCtx({ unlockedSkinIds: ALT_SKIN_IDS }), new Set())).toContain(
      "ALL_SKINS",
    );
  });

  // Les tenues "default" n'ont jamais de ligne unlocked_skins (D4 du spec
  // US-53). Une ligne inconnue en base ne doit pas non plus gonfler le compteur.
  it("ne compte ni les tenues par défaut ni un id hors catalogue", () => {
    const noise = [...SKINS.filter((s) => s.isDefault).map((s) => s.id), "skin_fantome"];
    const ctx = baseCtx({ unlockedSkinIds: noise });
    expect(evaluateAchievements(ctx, new Set())).not.toContain("FIRST_SKIN");
    expect(achievementProgressFor("ALL_SKINS", ctx, new Set())).toEqual({
      current: 0,
      total: ALT_SKIN_IDS.length,
    });
  });
});

describe("succès de progression (day_results)", () => {
  it.each([
    [99, false],
    [100, true],
  ])("TASKS_100 à %s tâches cumulées -> %s", (total, expected) => {
    const rows = [day({ tasks_completed: total as number })];
    const codes = evaluateAchievements(baseCtx({ dayResults: rows }), new Set());
    expect(codes.includes("TASKS_100")).toBe(expected);
  });

  it("TASKS_1000 cumule bien sur plusieurs jours", () => {
    const rows = Array.from({ length: 100 }, () => day({ tasks_completed: 10 }));
    expect(evaluateAchievements(baseCtx({ dayResults: rows }), new Set())).toContain("TASKS_1000");
  });

  it.each([
    [9, "VICTORIES_10", false],
    [10, "VICTORIES_10", true],
    [49, "VICTORIES_50", false],
    [50, "VICTORIES_50", true],
  ])("%s victoires -> %s = %s", (count, code, expected) => {
    const rows = Array.from({ length: count as number }, () => day({ outcome: "victory" }));
    const codes = evaluateAchievements(baseCtx({ dayResults: rows }), new Set());
    expect(codes.includes(code as string)).toBe(expected);
  });

  it("GOLD_10000 somme l'or gagné, jamais le solde restant", () => {
    const rows = Array.from({ length: 100 }, () => day({ gold_earned: 100 }));
    expect(evaluateAchievements(baseCtx({ dayResults: rows }), new Set())).toContain("GOLD_10000");
  });
});

describe("succès de combat", () => {
  it("DAY_10_TASKS sur une seule journée à 10 tâches, jamais sur un cumul", () => {
    const spread = Array.from({ length: 10 }, () => day({ tasks_completed: 1 }));
    expect(evaluateAchievements(baseCtx({ dayResults: spread }), new Set())).not.toContain(
      "DAY_10_TASKS",
    );
    const single = [day({ tasks_completed: 10 })];
    expect(evaluateAchievements(baseCtx({ dayResults: single }), new Set())).toContain(
      "DAY_10_TASKS",
    );
  });

  it("NO_ABANDON_VICTORY exige une victoire sans abandon", () => {
    const dirty = [day({ outcome: "victory", tasks_abandoned: 1 })];
    expect(evaluateAchievements(baseCtx({ dayResults: dirty }), new Set())).not.toContain(
      "NO_ABANDON_VICTORY",
    );
    const clean = [day({ outcome: "victory", tasks_abandoned: 0 })];
    expect(evaluateAchievements(baseCtx({ dayResults: clean }), new Set())).toContain(
      "NO_ABANDON_VICTORY",
    );
  });

  it("TITAN_BOSS à 500 HP terrassés, pas à 480", () => {
    const almost = [day({ outcome: "victory", boss_max_hp: 480 })];
    expect(evaluateAchievements(baseCtx({ dayResults: almost }), new Set())).not.toContain(
      "TITAN_BOSS",
    );
    const titan = [day({ outcome: "victory", boss_max_hp: 500 })];
    expect(evaluateAchievements(baseCtx({ dayResults: titan }), new Set())).toContain("TITAN_BOSS");
  });

  it("FIRST_DEFEAT à la première défaite", () => {
    expect(
      evaluateAchievements(baseCtx({ dayResults: [day({ outcome: "retreat" })] }), new Set()),
    ).not.toContain("FIRST_DEFEAT");
    expect(
      evaluateAchievements(baseCtx({ dayResults: [day({ outcome: "defeat" })] }), new Set()),
    ).toContain("FIRST_DEFEAT");
  });

  it("FIRST_RAGE_QUIT au premier Rage Quit", () => {
    expect(evaluateAchievements(baseCtx(), new Set())).not.toContain("FIRST_RAGE_QUIT");
    expect(evaluateAchievements(baseCtx({ rageQuitCount: 1 }), new Set())).toContain(
      "FIRST_RAGE_QUIT",
    );
  });
});

describe("succès méta", () => {
  it("FIRST_ROUTINE à la première routine", () => {
    expect(evaluateAchievements(baseCtx(), new Set())).not.toContain("FIRST_ROUTINE");
    expect(evaluateAchievements(baseCtx({ routineCount: 1 }), new Set())).toContain(
      "FIRST_ROUTINE",
    );
  });

  it("FIRST_SHARE au premier partage réussi", () => {
    expect(evaluateAchievements(baseCtx(), new Set())).not.toContain("FIRST_SHARE");
    expect(evaluateAchievements(baseCtx({ shareSuccessCount: 1 }), new Set())).toContain(
      "FIRST_SHARE",
    );
  });

  it("BRUT_VOLUME uniquement au niveau brut, et reste hors du Platine", () => {
    expect(evaluateAchievements(baseCtx({ aggressivityLevel: "doux" }), new Set())).not.toContain(
      "BRUT_VOLUME",
    );
    expect(evaluateAchievements(baseCtx({ aggressivityLevel: "brut" }), new Set())).toContain(
      "BRUT_VOLUME",
    );
    // Sinon obtenir le Platine imposerait un choix de ton au joueur.
    expect(getAchievement("BRUT_VOLUME")?.countsTowardPlatinum).toBe(false);
  });
});

describe("achievementProgressFor — succès du lot #199", () => {
  it.each([
    ["FIVE_SKINS", 5],
    ["TASKS_100", 100],
    ["TASKS_1000", 1000],
    ["VICTORIES_10", 10],
    ["VICTORIES_50", 50],
    ["GOLD_10000", 10000],
  ])("%s vise %s", (code, total) => {
    expect(achievementProgressFor(code as string, baseCtx(), new Set())?.total).toBe(total);
  });

  it("ALL_SKINS vise le nombre de tenues alternatives du catalogue", () => {
    expect(achievementProgressFor("ALL_SKINS", baseCtx(), new Set())).toEqual({
      current: 0,
      total: ALT_SKIN_IDS.length,
    });
  });

  it("la progression d'un compteur est plafonnée à sa cible", () => {
    const rows = [day({ tasks_completed: 5000 })];
    expect(achievementProgressFor("TASKS_100", baseCtx({ dayResults: rows }), new Set())).toEqual({
      current: 100,
      total: 100,
    });
  });
});
