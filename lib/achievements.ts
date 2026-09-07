// Issue #72 : catalogue de succès + titres équipables. Remplace titleForStreak
// (lib/game-engine.ts). Toute la logique de condition est pure ici (D2 du
// spec) : aucun accès base, tout le contexte est assemblé par l'appelant
// (lib/domain/achievements.ts) avant l'appel.
// Voir docs/superpowers/specs/2026-07-31-issue72-succes-titres-design.md.
import type { AggressivityLevel, DayOutcome } from "../types";
import { HEROES } from "./heroes";
import { BOSSES } from "./bosses";
import { BACKGROUNDS } from "./backgrounds";
import { SKINS } from "./hero-skins";

export type AchievementRarity = "bronze" | "argent" | "or" | "platine";
export type AchievementDisplayMode = "mystery" | "progress";

// Issue #199 : le contexte porte les LIGNES brutes de day_results, jamais des
// scalaires pré-agrégés par l'appelant. C'est ce qui permet à
// assembleAchievementContext (lib/domain/achievements.ts) de rester une simple
// lecture (D2 du spec #72) et garde toute l'agrégation ici, pure et testable
// sans base.
export type AchievementDayResult = {
  outcome: DayOutcome;
  tasks_completed: number;
  tasks_abandoned: number;
  gold_earned: number;
  boss_max_hp: number;
};

export interface AchievementContext {
  level: number;
  bestStreak: number;
  unlockedHeroIds: string[];
  unlockedSkinIds: string[];
  seenBossIds: string[];
  seenBackgroundIds: string[];
  dayResults: AchievementDayResult[];
  // Compteurs à coût fixe (count exact, head:true) — aucune ligne transférée.
  rageQuitCount: number;
  routineCount: number;
  shareSuccessCount: number;
  aggressivityLevel: AggressivityLevel;
}

export interface DayResultsSummary {
  tasksCompleted: number;
  victories: number;
  goldEarned: number;
  maxTasksInADay: number;
  hasCleanVictory: boolean;
  hasDefeat: boolean;
  maxVictoryBossHp: number;
}

// Une seule passe sur l'historique. Appelée par plusieurs `isUnlocked` : à
// ~1 ligne par jour de jeu, le recalcul est négligeable et évite un cache à
// invalider.
export function summarizeDayResults(rows: AchievementDayResult[]): DayResultsSummary {
  const summary: DayResultsSummary = {
    tasksCompleted: 0,
    victories: 0,
    goldEarned: 0,
    maxTasksInADay: 0,
    hasCleanVictory: false,
    hasDefeat: false,
    maxVictoryBossHp: 0,
  };
  for (const row of rows) {
    summary.tasksCompleted += row.tasks_completed;
    summary.goldEarned += row.gold_earned;
    summary.maxTasksInADay = Math.max(summary.maxTasksInADay, row.tasks_completed);
    if (row.outcome === "defeat") summary.hasDefeat = true;
    if (row.outcome === "victory") {
      summary.victories += 1;
      if (row.tasks_abandoned === 0) summary.hasCleanVictory = true;
      summary.maxVictoryBossHp = Math.max(summary.maxVictoryBossHp, row.boss_max_hp);
    }
  }
  return summary;
}

// Les tenues "default" n'ont jamais de ligne unlocked_skins (D4 du spec US-53) :
// seules les alternatives se collectionnent. Le filtrage sur le catalogue rend
// aussi le compteur insensible à un id devenu obsolète côté base.
const ALT_SKIN_IDS = new Set(SKINS.filter((s) => !s.isDefault).map((s) => s.id));
export const ALT_SKIN_COUNT = ALT_SKIN_IDS.size;

export function ownedAltSkinCount(unlockedSkinIds: string[]): number {
  return unlockedSkinIds.filter((id) => ALT_SKIN_IDS.has(id)).length;
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

// Issue #156 : la table ne garde que le TITRE du succès — « Souffle », « Lame
// Froide »… qui sont bien des titres, pas des noms de héros — plus le genre,
// pour l'accord du participe. La description se compose depuis `hero.name`.
// Les descriptions écrites en dur avaient dérivé du catalogue sur quatre
// héros sur sept (Hashashin/Assassin du Vent, Rôdeuse/Rôdeur des Feuilles,
// Massacreur/Broyeur de Cristal, Gardien de Lame/des Lames) — application
// directe de la leçon du reframe #51 : toute valeur d'un type partagé
// dupliquée en dur ailleurs que dans sa source casse au prochain renommage.
const HERO_TITLES: Record<string, { title: string; feminine?: boolean }> = {
  fire_knight: { title: "Flamme Intérieure" },
  water_priestess: { title: "Marée Calme", feminine: true },
  ground_monk: { title: "Racines" },
  wind_hashashin: { title: "Souffle" },
  leaf_ranger: { title: "Mue" },
  crystal_mauler: { title: "Facette" },
  metal_bladekeeper: { title: "Lame Froide", feminine: true },
};

const HERO_ACHIEVEMENTS: AchievementDef[] = HEROES.map((hero) => {
  const copy = HERO_TITLES[hero.id];
  return {
    code: `HERO_${hero.id.toUpperCase()}`,
    category: "hero",
    rarity: "bronze",
    title: copy.title,
    description: `${hero.name} débloqué${copy.feminine ? "e" : ""}.`,
    countsTowardPlatinum: true,
    displayMode: "mystery",
    isUnlocked: (ctx) => ctx.unlockedHeroIds.includes(hero.id),
  };
});

export const PLATINUM_CODE = "PLATINUM";

// Seuils du lot #199. Nommés parce que chacun est lu deux fois : par la
// condition du succès et par sa barre de progression — les diverger ferait
// afficher « 100/100 » sur un succès encore verrouillé.
const FIVE_SKINS_TARGET = 5;
const TASKS_100_TARGET = 100;
const TASKS_1000_TARGET = 1000;
const VICTORIES_10_TARGET = 10;
const VICTORIES_50_TARGET = 50;
const GOLD_TARGET = 10_000;

const OTHER_ACHIEVEMENTS: AchievementDef[] = [
  {
    code: "ALL_HEROES",
    category: "collection",
    rarity: "or",
    title: "Attrapez les tous !",
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
    isUnlocked: (ctx) => summarizeDayResults(ctx.dayResults).victories >= 1,
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
  // ————— Issue #199 : lot « collection / progression / combat / méta ».
  // Tous dérivés de données déjà en base (aucune migration). Les compteurs
  // cumulés (tâches, victoires, or) viennent de `day_results` et non de
  // `tasks` : ils ignorent donc le jour en cours, décalage d'un jour assumé —
  // l'alternative coûterait une requête sur une table qui ne se purge jamais
  // (RG-04).
  {
    code: "FIRST_SKIN",
    category: "collection",
    rarity: "bronze",
    title: "Première Mue",
    description: "Une première tenue débloquée.",
    countsTowardPlatinum: true,
    displayMode: "mystery",
    isUnlocked: (ctx) => ownedAltSkinCount(ctx.unlockedSkinIds) >= 1,
  },
  {
    code: "FIVE_SKINS",
    category: "collection",
    rarity: "argent",
    title: "Garde-robe",
    description: "Cinq tenues débloquées.",
    countsTowardPlatinum: true,
    displayMode: "progress",
    isUnlocked: (ctx) => ownedAltSkinCount(ctx.unlockedSkinIds) >= FIVE_SKINS_TARGET,
  },
  {
    code: "ALL_SKINS",
    category: "collection",
    rarity: "or",
    title: "Fashion Week",
    description: "Toutes les tenues de tous les héros débloquées.",
    countsTowardPlatinum: true,
    displayMode: "progress",
    isUnlocked: (ctx) => ownedAltSkinCount(ctx.unlockedSkinIds) >= ALT_SKIN_COUNT,
  },
  {
    code: "TASKS_100",
    category: "progression",
    rarity: "argent",
    title: "Centurion",
    description: "100 tâches terminées.",
    countsTowardPlatinum: true,
    displayMode: "progress",
    isUnlocked: (ctx) => summarizeDayResults(ctx.dayResults).tasksCompleted >= TASKS_100_TARGET,
  },
  {
    code: "TASKS_1000",
    category: "progression",
    rarity: "or",
    title: "Millénaire",
    description: "1000 tâches terminées.",
    countsTowardPlatinum: true,
    displayMode: "progress",
    isUnlocked: (ctx) => summarizeDayResults(ctx.dayResults).tasksCompleted >= TASKS_1000_TARGET,
  },
  {
    code: "VICTORIES_10",
    category: "progression",
    rarity: "bronze",
    title: "Habitué",
    description: "10 journées gagnées.",
    countsTowardPlatinum: true,
    displayMode: "progress",
    isUnlocked: (ctx) => summarizeDayResults(ctx.dayResults).victories >= VICTORIES_10_TARGET,
  },
  {
    code: "VICTORIES_50",
    category: "progression",
    rarity: "argent",
    title: "Vétéran",
    description: "50 journées gagnées.",
    countsTowardPlatinum: true,
    displayMode: "progress",
    isUnlocked: (ctx) => summarizeDayResults(ctx.dayResults).victories >= VICTORIES_50_TARGET,
  },
  {
    code: "GOLD_10000",
    category: "progression",
    rarity: "argent",
    title: "Coffre-fort",
    description: "10 000 or gagnés au total.",
    countsTowardPlatinum: true,
    displayMode: "progress",
    isUnlocked: (ctx) => summarizeDayResults(ctx.dayResults).goldEarned >= GOLD_TARGET,
  },
  {
    code: "DAY_10_TASKS",
    category: "combat",
    rarity: "bronze",
    title: "Journée Pleine",
    description: "10 tâches terminées dans la même journée.",
    countsTowardPlatinum: true,
    displayMode: "mystery",
    isUnlocked: (ctx) => summarizeDayResults(ctx.dayResults).maxTasksInADay >= 10,
  },
  {
    code: "NO_ABANDON_VICTORY",
    category: "combat",
    rarity: "bronze",
    title: "Sans Bavure",
    description: "Une journée gagnée sans un seul abandon.",
    countsTowardPlatinum: true,
    displayMode: "mystery",
    isUnlocked: (ctx) => summarizeDayResults(ctx.dayResults).hasCleanVictory,
  },
  {
    code: "TITAN_BOSS",
    category: "combat",
    rarity: "or",
    title: "Titan",
    description: "Un Boss à 500 HP terrassé.",
    countsTowardPlatinum: true,
    displayMode: "mystery",
    isUnlocked: (ctx) => summarizeDayResults(ctx.dayResults).maxVictoryBossHp >= 500,
  },
  {
    code: "FIRST_DEFEAT",
    category: "combat",
    rarity: "bronze",
    title: "Ça arrive",
    description: "Une première défaite encaissée.",
    countsTowardPlatinum: true,
    displayMode: "mystery",
    isUnlocked: (ctx) => summarizeDayResults(ctx.dayResults).hasDefeat,
  },
  {
    code: "FIRST_RAGE_QUIT",
    category: "combat",
    rarity: "bronze",
    title: "Lucidité",
    description: "Un premier Rage Quit assumé.",
    countsTowardPlatinum: true,
    displayMode: "mystery",
    isUnlocked: (ctx) => ctx.rageQuitCount >= 1,
  },
  {
    code: "FIRST_ROUTINE",
    category: "meta",
    rarity: "bronze",
    title: "Discipline",
    description: "Une première routine créée.",
    countsTowardPlatinum: true,
    displayMode: "mystery",
    isUnlocked: (ctx) => ctx.routineCount >= 1,
  },
  {
    code: "FIRST_SHARE",
    category: "meta",
    rarity: "bronze",
    title: "Vantard",
    description: "Une première victoire partagée.",
    countsTowardPlatinum: true,
    displayMode: "mystery",
    isUnlocked: (ctx) => ctx.shareSuccessCount >= 1,
  },
  {
    // Seul succès du lot hors Platine : l'y inclure imposerait un choix de ton
    // au joueur pour compléter le catalogue.
    code: "BRUT_VOLUME",
    category: "meta",
    rarity: "bronze",
    title: "Volume Max",
    description: "Volume Intérieur poussé à Brut.",
    countsTowardPlatinum: false,
    displayMode: "mystery",
    isUnlocked: (ctx) => ctx.aggressivityLevel === "brut",
  },
];


// 41 succès évalués en boucle par evaluateAchievements. PLATINUM n'y figure
// PAS (cas spécial : sa condition référence les autres, cf. plus bas).
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

// 42 entrées — pour l'affichage catalogue et les lookups (getAchievement).
export const ALL_ACHIEVEMENT_DEFS: AchievementDef[] = [...ACHIEVEMENTS, PLATINUM_DEF];

export const TOTAL_ACHIEVEMENTS_COUNT = ALL_ACHIEVEMENT_DEFS.length;

// Libellé de section de /tableau-de-chasse/succes. Vit ici plutôt que dans la
// page : c'est un Record en dur, et une catégorie sans entrée rend sa section
// SILENCIEUSEMENT absente de l'écran (le rendu itère sur cette table, pas sur
// le catalogue). Un test verrouille la couverture.
export const CATEGORY_LABELS: Record<string, string> = {
  hero: "Héros",
  collection: "Collection",
  progression: "Progression",
  combat: "Combat",
  streak: "Séries",
  exploration: "Exploration",
  level: "Niveau",
  meta: "Méta",
};

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

// Issue #187 : source unique du nom d'icône par rareté (GameIconName) —
// remplace les deux Record<AchievementRarity, string> d'emoji dupliqués en
// dur dans succes/page.tsx et AchievementToast.tsx.
export const RARITY_ICON_NAME: Record<AchievementRarity, "bronze" | "silver" | "gold" | "platinum"> = {
  bronze: "bronze",
  argent: "silver",
  or: "gold",
  platine: "platinum",
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
// `current` est plafonné à `total` : un compteur cumulé (tâches, or) dépasse
// largement sa cible une fois le succès obtenu, et une barre à 5000/100 se
// lirait comme un bug.
export function achievementProgressFor(
  code: string,
  ctx: AchievementContext,
  unlockedCodes: Set<string>,
): { current: number; total: number } | null {
  const progress = rawProgressFor(code, ctx, unlockedCodes);
  if (!progress) return null;
  return { current: Math.min(progress.current, progress.total), total: progress.total };
}

function rawProgressFor(
  code: string,
  ctx: AchievementContext,
  unlockedCodes: Set<string>,
): { current: number; total: number } | null {
  switch (code) {
    case "ALL_HEROES":
      return { current: ctx.unlockedHeroIds.length, total: HEROES.length };
    case "HALF_BOSSES":
      return { current: ctx.seenBossIds.length, total: Math.ceil(BOSSES.length / 2) };
    case "ALL_BOSSES":
      return { current: ctx.seenBossIds.length, total: BOSSES.length };
    case "ALL_BACKGROUNDS":
      return { current: ctx.seenBackgroundIds.length, total: BACKGROUNDS.length };
    case "FIVE_SKINS":
      return { current: ownedAltSkinCount(ctx.unlockedSkinIds), total: FIVE_SKINS_TARGET };
    case "ALL_SKINS":
      return { current: ownedAltSkinCount(ctx.unlockedSkinIds), total: ALT_SKIN_COUNT };
    case "TASKS_100":
      return {
        current: summarizeDayResults(ctx.dayResults).tasksCompleted,
        total: TASKS_100_TARGET,
      };
    case "TASKS_1000":
      return {
        current: summarizeDayResults(ctx.dayResults).tasksCompleted,
        total: TASKS_1000_TARGET,
      };
    case "VICTORIES_10":
      return { current: summarizeDayResults(ctx.dayResults).victories, total: VICTORIES_10_TARGET };
    case "VICTORIES_50":
      return { current: summarizeDayResults(ctx.dayResults).victories, total: VICTORIES_50_TARGET };
    case "GOLD_10000":
      return { current: summarizeDayResults(ctx.dayResults).goldEarned, total: GOLD_TARGET };
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
