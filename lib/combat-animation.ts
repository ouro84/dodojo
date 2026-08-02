// Fonctions pures d'animation de combat (issue #48). Testable sans rendu UI
// (règle projet n°2). Complété en Task 3.1 avec les fonctions de gating,
// hit-stop et coalescing des rafales.

export const IDLE_FRAME_MS = 120;
export const ATTACK_DURATION_MS = 600;
export const SP_ATTACK_DURATION_MS = 800;
export const HURT_DURATION_MS = 350;
export const DEATH_DURATION_MS = 1000;

export const COALESCE_MAX_WAIT_MS = 1200;
export const KNOCKBACK_MS = 220;
export const KO_FADE_MS = 400;
export const COMBO_SPECIAL_THRESHOLD = 3;

// Issue #146 : marge supplémentaire entre la fin visuelle de l'anim de mort
// du Boss (+ le slam K.O.) et l'ouverture de PerfectOverlay — sans cette
// marge, l'overlay pouvait s'ouvrir avant que l'animation n'ait fini de se
// jouer à l'écran.
export const KO_OVERLAY_EXTRA_DELAY_MS = 1000;

export type HeroAttackAnim = "atk1" | "atk2" | "atk3" | "sp_atk";

const BASE_ATTACKS: HeroAttackAnim[] = ["atk1", "atk2", "atk3"];

/**
 * Anim de personnage du coup de héros. L'attaque spéciale est réservée aux
 * moments qui comptent (coup fatal, combo installé) ; le reste tire au hasard
 * parmi les trois attaques de base pour éviter la répétition du geste le plus
 * souvent vu dans l'app.
 */
export function pickAttackAnim(
  comboCount: number,
  isFatal: boolean,
  rng: () => number = Math.random,
): HeroAttackAnim {
  if (isFatal || comboCount >= COMBO_SPECIAL_THRESHOLD) return "sp_atk";
  return BASE_ATTACKS[Math.min(BASE_ATTACKS.length - 1, Math.floor(rng() * BASE_ATTACKS.length))];
}

export function impactDelayMs(
  frames: number,
  impactFrame: number | null,
  durationMs: number,
): number {
  if (impactFrame === null || frames <= 0) return 0;
  return (impactFrame / frames) * durationMs;
}

/**
 * Hit-stop : figer brièvement les deux sprites à l'impact est ce qui donne du
 * poids au coup (juice arcade, cf. PRODUCT.md). Plus le coup est important,
 * plus le gel est long.
 */
export function hitStopMs(input: {
  isFatal: boolean;
  comboCount: number;
  hits: number;
}): number {
  if (input.isFatal) return 200;
  if (input.comboCount >= COMBO_SPECIAL_THRESHOLD || input.hits > 1) return 120;
  return 50;
}

export interface PendingHits {
  damage: number;
  xp: number;
  hits: number;
  /** Instant du premier coup en attente, pour le flush forcé. */
  firstAt: number;
}

export function addPendingHit(
  prev: PendingHits | null,
  damage: number,
  xp: number,
  now: number,
): PendingHits {
  if (!prev) return { damage, xp, hits: 1, firstAt: now };
  return {
    damage: prev.damage + damage,
    xp: prev.xp + xp,
    hits: prev.hits + 1,
    firstAt: prev.firstAt,
  };
}

/**
 * Garde-fou anti-spam : sans lui, chaque nouveau clic relançant l'anim,
 * un utilisateur qui coche en continu ne verrait jamais l'impact tomber.
 */
export function shouldForceFlush(pending: PendingHits | null, now: number): boolean {
  if (!pending) return false;
  return now - pending.firstAt >= COALESCE_MAX_WAIT_MS;
}

/** État d'animation piloté par l'Arène (distinct de l'état interne du sprite). */
export interface AnimState {
  state: "idle" | "attack" | "hurt" | "death";
  key: number;
  anim?: string;
}

/**
 * Issue #156 : état suivant à la fin d'une animation non bouclée, quel que soit
 * l'état qui vient de s'achever.
 *
 * L'issue #149 n'avait traité que le cas « fin d'attaque du héros ». Après un
 * `hurt`, l'état restait figé pour le reste de la session, et les gardes
 * anti-chevauchement (qui lisent `heroAnimRef` / `bossAnimRef`) raisonnaient
 * sur une valeur périmée.
 *
 * Attention : `data-anim-state` du DOM expose l'état INTERNE de
 * CharacterSprite, qui revient bien à l'idle tout seul. C'est l'état côté
 * Arène — celui-ci — qui restait bloqué, et qu'aucun test e2e ne voyait.
 *
 * `death` est traité comme `idle` : le Boss mort ne se relève pas de
 * lui-même, seule la renaissance le remet debout (cf. `koOutcome`).
 *
 * Retourne l'objet d'origine (identité préservée) si rien ne change, pour
 * qu'un appelant puisse éviter un re-render inutile.
 */
export function nextAnimStateAfterEnd(current: AnimState): AnimState {
  if (current.state === "idle" || current.state === "death") return current;
  return { state: "idle", key: current.key + 1 };
}
