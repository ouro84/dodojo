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
