// Issue #72 : catalogue de succès + titres équipables. Remplace titleForStreak
// (lib/game-engine.ts). Toute la logique de condition est pure ici (D2 du
// spec) : aucun accès base, tout le contexte est assemblé par l'appelant
// (app/actions/achievements.ts) avant l'appel.
// Voir docs/superpowers/specs/2026-07-31-issue72-succes-titres-design.md.
import { HEROES } from "./heroes";
import { BOSSES } from "./bosses";
import { BACKGROUNDS } from "./backgrounds";

export type AchievementRarity = "bronze" | "argent" | "or" | "platine";
export type AchievementDisplayMode = "mystery" | "progress";

export interface AchievementContext {
  level: number;
  bestStreak: number;
  hasVictory: boolean;
  unlockedHeroIds: string[];
  seenBossIds: string[];
  seenBackgroundIds: string[];
}

export interface AchievementDef {
  code: string;
  category: string;
  rarity: AchievementRarity;
  title: string;
  description: string;
  countsTowardPlatinum: boolean;
  displayMode: AchievementDisplayMode;
  isUnlocked: (ctx: AchievementContext) => boolean;
}

const HERO_TITLES: Record<string, { title: string; description: string }> = {
  fire_knight: { title: "Flamme Intérieure", description: "Chevalier de Feu débloqué." },
  water_priestess: { title: "Marée Calme", description: "Prêtresse de l'Eau débloquée." },
  ground_monk: { title: "Racines", description: "Moine de la Terre débloqué." },
  wind_hashashin: { title: "Souffle", description: "Hashashin du Vent débloqué." },
  leaf_ranger: { title: "Mue", description: "Rôdeuse des Feuilles débloquée." },
  crystal_mauler: { title: "Facette", description: "Massacreur de Cristal débloqué." },
  metal_bladekeeper: { title: "Lame Froide", description: "Gardien de Lame débloqué." },
};

const HERO_ACHIEVEMENTS: AchievementDef[] = HEROES.map((hero) => {
  const copy = HERO_TITLES[hero.id];
  return {
    code: `HERO_${hero.id.toUpperCase()}`,
    category: "hero",
    rarity: "bronze",
    title: copy.title,
    description: copy.description,
    countsTowardPlatinum: true,
    displayMode: "mystery",
    isUnlocked: (ctx) => ctx.unlockedHeroIds.includes(hero.id),
  };
});

export const PLATINUM_CODE = "PLATINUM";

const OTHER_ACHIEVEMENTS: AchievementDef[] = [
  {
    code: "ALL_HEROES",
    category: "collection",
    rarity: "or",
    title: "Ensemble on est plus fort",
    description: "Tous les héros débloqués.",
    countsTowardPlatinum: true,
    displayMode: "progress",
    isUnlocked: (ctx) => ctx.unlockedHeroIds.length >= HEROES.length,
  },
  {
    code: "FIRST_VICTORY",
    category: "progression",
    rarity: "bronze",
    title: "Aube",
    description: "Première victoire remportée.",
    countsTowardPlatinum: true,
    displayMode: "mystery",
    isUnlocked: (ctx) => ctx.hasVictory,
  },
  {
    code: "STREAK_7",
    category: "streak",
    rarity: "argent",
    title: "Calme",
    description: "Série de 7 jours de victoire.",
    countsTowardPlatinum: true,
    displayMode: "mystery",
    isUnlocked: (ctx) => ctx.bestStreak >= 7,
  },
  {
    code: "STREAK_30",
    category: "streak",
    rarity: "argent",
    title: "Silence",
    description: "Série de 30 jours de victoire.",
    countsTowardPlatinum: true,
    displayMode: "mystery",
    isUnlocked: (ctx) => ctx.bestStreak >= 30,
  },
  {
    code: "STREAK_100",
    category: "streak",
    rarity: "or",
    title: "Esprit Vide",
    description: "Série de 100 jours de victoire.",
    countsTowardPlatinum: true,
    displayMode: "mystery",
    isUnlocked: (ctx) => ctx.bestStreak >= 100,
  },
  {
    code: "HALF_BOSSES",
    category: "exploration",
    rarity: "bronze",
    title: "La moitié du chemin",
    description: "La moitié du roster de boss rencontrée.",
    countsTowardPlatinum: true,
    displayMode: "progress",
    isUnlocked: (ctx) => ctx.seenBossIds.length >= Math.ceil(BOSSES.length / 2),
  },
  {
    code: "ALL_BOSSES",
    category: "exploration",
    rarity: "or",
    title: "A vaincu une armée",
    description: "Tous les boss rencontrés.",
    countsTowardPlatinum: true,
    displayMode: "progress",
    isUnlocked: (ctx) => ctx.seenBossIds.length >= BOSSES.length,
  },
  {
    code: "ALL_BACKGROUNDS",
    category: "exploration",
    rarity: "argent",
    title: "Chaque Paysage",
    description: "Tous les décors rencontrés.",
    countsTowardPlatinum: true,
    displayMode: "progress",
    isUnlocked: (ctx) => ctx.seenBackgroundIds.length >= BACKGROUNDS.length,
  },
  {
    code: "LEVEL_10",
    category: "level",
    rarity: "bronze",
    title: "Level UP",
    description: "Niveau 10 atteint.",
    countsTowardPlatinum: true,
    displayMode: "mystery",
    isUnlocked: (ctx) => ctx.level >= 10,
  },
  {
    code: "LEVEL_20",
    category: "level",
    rarity: "bronze",
    title: "Rigueur",
    description: "Niveau 20 atteint.",
    countsTowardPlatinum: true,
    displayMode: "mystery",
    isUnlocked: (ctx) => ctx.level >= 20,
  },
  {
    code: "LEVEL_50",
    category: "level",
    rarity: "argent",
    title: "Ténacité",
    description: "Niveau 50 atteint.",
    countsTowardPlatinum: true,
    displayMode: "mystery",
    isUnlocked: (ctx) => ctx.level >= 50,
  },
  {
    code: "LEVEL_84",
    category: "level",
    rarity: "argent",
    title: "Trad's",
    description: "Niveau 84 atteint.",
    countsTowardPlatinum: true,
    displayMode: "mystery",
    isUnlocked: (ctx) => ctx.level >= 84,
  },
  {
    code: "LEVEL_100",
    category: "level",
    rarity: "argent",
    title: "Enfin !",
    description: "Niveau 100 atteint.",
    countsTowardPlatinum: true,
    displayMode: "mystery",
    isUnlocked: (ctx) => ctx.level >= 100,
  },
  {
    code: "LEVEL_212",
    category: "level",
    rarity: "or",
    title: "Prom's",
    description: "Niveau 212 atteint.",
    countsTowardPlatinum: false,
    displayMode: "mystery",
    isUnlocked: (ctx) => ctx.level >= 212,
  },
  {
    code: "LEVEL_666",
    category: "level",
    rarity: "or",
    title: "Damné",
    description: "Niveau 666 atteint.",
    countsTowardPlatinum: false,
    displayMode: "mystery",
    isUnlocked: (ctx) => ctx.level >= 666,
  },
  {
    code: "LEVEL_777",
    category: "level",
    rarity: "or",
    title: "Veinard",
    description: "Niveau 777 atteint.",
    countsTowardPlatinum: false,
    displayMode: "mystery",
    isUnlocked: (ctx) => ctx.level >= 777,
  },
  {
    code: "LEVEL_1000",
    category: "level",
    rarity: "or",
    title: "Mythe",
    description: "Niveau 1000 atteint.",
    countsTowardPlatinum: false,
    displayMode: "mystery",
    isUnlocked: (ctx) => ctx.level >= 1000,
  },
  {
    code: "LEVEL_9001",
    category: "level",
    rarity: "or",
    title: "Super Saiyan",
    description: "Niveau 9001 atteint.",
    countsTowardPlatinum: false,
    displayMode: "mystery",
    isUnlocked: (ctx) => ctx.level >= 9001,
  },
];

// 25 succès évalués en boucle par evaluateAchievements. PLATINUM n'y figure
// PAS (cas spécial : sa condition référence les 24 autres, cf. plus bas).
export const ACHIEVEMENTS: AchievementDef[] = [...HERO_ACHIEVEMENTS, ...OTHER_ACHIEVEMENTS];

const PLATINUM_ELIGIBLE_CODES = ACHIEVEMENTS.filter((a) => a.countsTowardPlatinum).map(
  (a) => a.code,
);

const PLATINUM_DEF: AchievementDef = {
  code: PLATINUM_CODE,
  category: "meta",
  rarity: "platine",
  title: "Démon Vaincu",
  description: "Tous les succès obtenus (hors paliers de niveau extrêmes).",
  countsTowardPlatinum: false,
  displayMode: "progress",
  // Jamais appelée : PLATINUM est évaluée spécifiquement dans evaluateAchievements.
  isUnlocked: () => false,
};

// 26 entrées — pour l'affichage catalogue et les lookups (getAchievement).
export const ALL_ACHIEVEMENT_DEFS: AchievementDef[] = [...ACHIEVEMENTS, PLATINUM_DEF];

export const TOTAL_ACHIEVEMENTS_COUNT = ALL_ACHIEVEMENT_DEFS.length;

export function getAchievement(code: string): AchievementDef | undefined {
  return ALL_ACHIEVEMENT_DEFS.find((a) => a.code === code);
}

export function evaluateAchievements(
  ctx: AchievementContext,
  alreadyUnlocked: Set<string>,
): string[] {
  const newlyUnlocked: string[] = [];
  for (const def of ACHIEVEMENTS) {
    if (!alreadyUnlocked.has(def.code) && def.isUnlocked(ctx)) {
      newlyUnlocked.push(def.code);
    }
  }

  const unlockedNow = new Set([...alreadyUnlocked, ...newlyUnlocked]);
  const allEligibleUnlocked = PLATINUM_ELIGIBLE_CODES.every((code) => unlockedNow.has(code));
  if (allEligibleUnlocked && !alreadyUnlocked.has(PLATINUM_CODE)) {
    newlyUnlocked.push(PLATINUM_CODE);
  }
  return newlyUnlocked;
}

const RARITY_RANK: Record<AchievementRarity, number> = {
  bronze: 0,
  argent: 1,
  or: 2,
  platine: 3,
};

// « meilleur » titre débloqué : rareté la plus haute, égalité départagée par
// la date de déblocage la plus récente.
export function bestTitleCode(unlocked: { code: string; unlockedAt: string }[]): string | null {
  if (unlocked.length === 0) return null;
  let best = unlocked[0];
  let bestRarity = getAchievement(best.code)?.rarity ?? "bronze";
  for (const candidate of unlocked.slice(1)) {
    const rarity = getAchievement(candidate.code)?.rarity ?? "bronze";
    const better =
      RARITY_RANK[rarity] > RARITY_RANK[bestRarity] ||
      (RARITY_RANK[rarity] === RARITY_RANK[bestRarity] && candidate.unlockedAt > best.unlockedAt);
    if (better) {
      best = candidate;
      bestRarity = rarity;
    }
  }
  return best.code;
}

// null pour un succès "mystère" (pas de compteur pertinent à afficher).
export function achievementProgressFor(
  code: string,
  ctx: AchievementContext,
  unlockedCodes: Set<string>,
): { current: number; total: number } | null {
  switch (code) {
    case "ALL_HEROES":
      return { current: ctx.unlockedHeroIds.length, total: HEROES.length };
    case "HALF_BOSSES":
    case "ALL_BOSSES":
      return { current: ctx.seenBossIds.length, total: BOSSES.length };
    case "ALL_BACKGROUNDS":
      return { current: ctx.seenBackgroundIds.length, total: BACKGROUNDS.length };
    case PLATINUM_CODE: {
      const current = PLATINUM_ELIGIBLE_CODES.filter((c) => unlockedCodes.has(c)).length;
      return { current, total: PLATINUM_ELIGIBLE_CODES.length };
    }
    default:
      return null;
  }
}

// Issue #142 : KPI de succès par rareté. Y = total du catalogue (toutes
// entrées de ALL_ACHIEVEMENT_DEFS, y compris paliers extrêmes or non
// éligibles au platine). X = succès effectivement débloqués. Le platine
// (PLATINUM_CODE, entrée unique de rareté "platine") est comptabilisé
// séparément — l'affichage le met sur une ligne dédiée.
export type RarityCounts = Record<
  AchievementRarity,
  { unlocked: number; total: number }
>;

export function rarityCounts(unlockedCodes: Set<string>): RarityCounts {
  const counts: RarityCounts = {
    bronze: { unlocked: 0, total: 0 },
    argent: { unlocked: 0, total: 0 },
    or: { unlocked: 0, total: 0 },
    platine: { unlocked: 0, total: 0 },
  };
  for (const def of ALL_ACHIEVEMENT_DEFS) {
    counts[def.rarity].total += 1;
    if (unlockedCodes.has(def.code)) counts[def.rarity].unlocked += 1;
  }
  return counts;
}
