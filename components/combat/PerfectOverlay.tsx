"use client";

import type { KoTier } from "@/lib/game-engine";

interface PerfectOverlayProps {
  tier: Exclude<KoTier, null>;
  bossName: string;
  username: string;
  damageDealt: number;
  monstersDefeated: number;
  // Palier de série franchi par ce KO (7/30/100), sinon null → super-variante.
  milestone?: number | null;
  // US-29 (A3) : ce KO est la toute première victoire (coach actif) → punchline dédiée.
  firstVictory?: boolean;
  onCrepuscule: () => void;
  onContinue: () => void;
}

// US-16 : célébration en direct quand le Boss tombe à 0. PERFECT (Héro intact)
// vs K.O. (Héro entamé). CTA proéminent vers le Rituel du Crépuscule (clôture
// manuelle, non-bloquante) + option "continuer". Super-variante si ce KO franchit
// un palier de série (US-12). Variante douce sous prefers-reduced-motion.
export default function PerfectOverlay({
  tier,
  bossName,
  username,
  damageDealt,
  monstersDefeated,
  milestone = null,
  firstVictory = false,
  onCrepuscule,
  onContinue,
}: PerfectOverlayProps) {
  const isPerfect = tier === "perfect";

  return (
    <div
      role="alertdialog"
      aria-label={isPerfect ? "Perfect — Boss vaincu" : "K.O. — Boss vaincu"}
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-lg bg-[oklch(0.08_0_0_/_78%)] px-4 text-center"
    >
      {milestone !== null && (
        <span
          aria-hidden
          className="streak-flames text-2xl"
          title={`Série de ${milestone}`}
        >
          🔥🔥🔥
        </span>
      )}

      <p
        className={`ko-burst font-display uppercase tracking-widest ${
          isPerfect ? "text-4xl text-gold" : "text-3xl text-hp"
        }`}
      >
        {isPerfect ? "Perfect !" : "K.O. !"}
      </p>

      <p className="max-w-[28ch] text-sm text-ink">
        {firstVictory
          ? `Premier sang, ${username} ! ${bossName} est au tapis. Bienvenue dans l'Arène.`
          : isPerfect
            ? `Sans une égratignure, ${username}. ${bossName} est au tapis.`
            : `${bossName} a mordu la poussière. Tu l'as eu, ${username}.`}
      </p>

      {milestone !== null && (
        <p className="font-display text-xs uppercase tracking-wide text-gold">
          Série de {milestone} ! Le dojo se souviendra.
        </p>
      )}

      <p className="text-xs text-muted">
        {damageDealt} dégâts · {monstersDefeated}{" "}
        {monstersDefeated > 1 ? "monstres abattus" : "monstre abattu"}
      </p>

      <div className="mt-1 flex flex-col items-stretch gap-2">
        <button
          type="button"
          onClick={onCrepuscule}
          className="rounded-md border border-gold bg-surface px-5 py-2 font-display text-xs uppercase tracking-wide text-gold"
        >
          🌙 Rituel du Crépuscule
        </button>
        <button
          type="button"
          onClick={onContinue}
          className="rounded-md px-4 py-1.5 text-xs text-muted underline underline-offset-4 hover:text-ink"
        >
          Continuer le combat
        </button>
      </div>
    </div>
  );
}
