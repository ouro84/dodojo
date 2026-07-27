// US-20 : logique pure du partage de victoires — mapping, troncature,
// sérialisation querystring et choix de stratégie de partage client. Isolé du
// calcul de jeu (lib/game-engine.ts) car ce n'est pas une formule HP/XP,
// cohérent avec le pattern lib/bosses.ts / lib/heroes.ts / lib/guide.ts.

export const SHARE_CARD_LABEL_MAX_LENGTH = 24;

// Troncature défensive avec ellipse — pseudo déjà capé à 24 caractères à la
// création (OnboardingFlow.tsx, maxLength={24}), même traitement appliqué ici
// par cohérence de template (et pour tout autre libellé, ex. titre de palier).
export function truncateForCard(
  text: string,
  maxLength: number = SHARE_CARD_LABEL_MAX_LENGTH,
): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

export const SHARE_CARD_MILESTONES = [7, 30, 100] as const;

// US-12/US-20 : la carte bascule en variante "flourish" si le jour partagé
// franchit un palier de série (mêmes paliers que titleForStreak).
export function milestoneStreak(streakLength: number): number | null {
  return (SHARE_CARD_MILESTONES as readonly number[]).includes(streakLength)
    ? streakLength
    : null;
}

export type ShareEventType = "share_clicked" | "share_succeeded" | "share_downloaded";
export type ShareSource = "perfect_overlay" | "crepuscule";

export interface ShareCapabilities {
  canShareFiles: boolean;
  canWriteClipboard: boolean;
}

export type ShareStrategy = "native" | "clipboard" | "download";

// US-20 : ordre de préférence client — partage natif OS (fichiers) > copie
// presse-papier > téléchargement direct (dernier recours universel).
export function pickShareStrategy(capabilities: ShareCapabilities): ShareStrategy {
  if (capabilities.canShareFiles) return "native";
  if (capabilities.canWriteClipboard) return "clipboard";
  return "download";
}

import type { DaySummary } from "./game-engine";

export type ShareCardSummary = Pick<
  DaySummary,
  "outcome" | "damageDealt" | "xpEarned" | "tasksCompleted"
>;

export interface ShareCardContext {
  username: string;
  heroId: string;
  bossId: string;
  level: number;
  title: string;
  streak: number;
  dayDate: string;
}

export interface ShareCardParams {
  username: string;
  heroId: string;
  bossId: string;
  outcome: DaySummary["outcome"];
  damageDealt: number;
  xpEarned: number;
  tasksCompleted: number;
  streak: number;
  level: number;
  title: string;
  dayDate: string;
  milestone: number | null;
}

// US-20 : fonctionne identiquement pour les deux points d'entrée (PerfectOverlay
// avant clôture, récap fin de journée après clôture) car les deux calculent leur
// résumé via summarizeDay (lib/game-engine.ts) — aucun lookup day_result requis.
export function buildShareCardParams(
  summary: ShareCardSummary,
  context: ShareCardContext,
): ShareCardParams {
  return {
    username: truncateForCard(context.username),
    heroId: context.heroId,
    bossId: context.bossId,
    outcome: summary.outcome,
    damageDealt: summary.damageDealt,
    xpEarned: summary.xpEarned,
    tasksCompleted: summary.tasksCompleted,
    streak: context.streak,
    level: context.level,
    title: truncateForCard(context.title),
    dayDate: context.dayDate,
    milestone: milestoneStreak(context.streak),
  };
}

export function shareCardSearchParams(params: ShareCardParams): URLSearchParams {
  const qs = new URLSearchParams();
  qs.set("username", params.username);
  qs.set("heroId", params.heroId);
  qs.set("bossId", params.bossId);
  qs.set("outcome", params.outcome);
  qs.set("damageDealt", String(params.damageDealt));
  qs.set("xpEarned", String(params.xpEarned));
  qs.set("tasksCompleted", String(params.tasksCompleted));
  qs.set("streak", String(params.streak));
  qs.set("level", String(params.level));
  qs.set("title", params.title);
  qs.set("dayDate", params.dayDate);
  qs.set("milestone", params.milestone === null ? "" : String(params.milestone));
  return qs;
}

const DAY_OUTCOMES = ["victory", "retreat", "defeat"] as const;

function isDayOutcome(value: string | null): value is DaySummary["outcome"] {
  return value !== null && (DAY_OUTCOMES as readonly string[]).includes(value);
}

function parseNonNegativeInt(value: string | null): number | null {
  if (value === null || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

// US-20 : reconstruit et re-valide les paramètres reçus par la route de
// génération. Retourne null si un champ requis est absent ou mal formé (→ 400
// côté route). Re-tronque les champs texte par défense en profondeur, même si
// shareCardSearchParams les a déjà tronqués côté client (paramètres forgeables).
export function parseShareCardParams(searchParams: URLSearchParams): ShareCardParams | null {
  const username = searchParams.get("username");
  const heroId = searchParams.get("heroId");
  const bossId = searchParams.get("bossId");
  const outcome = searchParams.get("outcome");
  const title = searchParams.get("title") ?? "";
  const dayDate = searchParams.get("dayDate");
  const damageDealt = parseNonNegativeInt(searchParams.get("damageDealt"));
  const xpEarned = parseNonNegativeInt(searchParams.get("xpEarned"));
  const tasksCompleted = parseNonNegativeInt(searchParams.get("tasksCompleted"));
  const streak = parseNonNegativeInt(searchParams.get("streak"));
  const level = parseNonNegativeInt(searchParams.get("level"));
  const milestoneRaw = searchParams.get("milestone");

  if (
    !username ||
    !heroId ||
    !bossId ||
    !dayDate ||
    !isDayOutcome(outcome) ||
    damageDealt === null ||
    xpEarned === null ||
    tasksCompleted === null ||
    streak === null ||
    level === null
  ) {
    return null;
  }

  const milestone =
    milestoneRaw === null || milestoneRaw === "" ? null : parseNonNegativeInt(milestoneRaw);

  return {
    username: truncateForCard(username),
    heroId,
    bossId,
    outcome,
    damageDealt,
    xpEarned,
    tasksCompleted,
    streak,
    level,
    title: truncateForCard(title),
    dayDate,
    milestone,
  };
}
