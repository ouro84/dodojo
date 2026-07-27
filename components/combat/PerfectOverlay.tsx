"use client";

import { useRef, useState } from "react";
import type { KoTier } from "@/lib/game-engine";
import type { ShareCardParams } from "@/lib/share-card";
import type { AggressivityLevel } from "@/types";
import { koHeader, koLine, milestoneLine } from "@/lib/copy/combat";
import { randomSeed } from "@/lib/copy/variant";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import ShareButton from "./ShareButton";

interface PerfectOverlayProps {
  tier: Exclude<KoTier, null>;
  bossName: string;
  aggressivityLevel: AggressivityLevel;
  username: string;
  damageDealt: number;
  monstersDefeated: number;
  // Palier de série franchi par ce KO (7/30/100), sinon null → super-variante.
  milestone?: number | null;
  // US-29 (A3) : ce KO est la toute première victoire (coach actif) → punchline dédiée.
  firstVictory?: boolean;
  // US-20 : paramètres pré-calculés de la carte partageable (snapshot live,
  // avant clôture du jour — cf. lib/share-card.ts).
  shareCardParams: ShareCardParams;
  onCrepuscule: () => void;
  onContinue: () => void;
}

// US-16 : célébration en direct quand le Boss tombe à 0. PERFECT (Héro intact)
// vs K.O. (Héro entamé). CTA proéminent vers « Terminer la journée » (clôture
// manuelle, non-bloquante) + option "continuer". Super-variante si ce KO franchit
// un palier de série (US-12). Variante douce sous prefers-reduced-motion.
export default function PerfectOverlay({
  tier,
  bossName,
  aggressivityLevel,
  username,
  damageDealt,
  monstersDefeated,
  milestone = null,
  firstVictory = false,
  shareCardParams,
  onCrepuscule,
  onContinue,
}: PerfectOverlayProps) {
  const isPerfect = tier === "perfect";
  // Seed figé au montage : le pool de punchlines ne doit pas retirer à chaque
  // re-rendu (ex. Arena re-render pendant le poll deadline ~45s) tant que ce
  // KO reste affiché — un nouveau KO = un nouveau montage = un nouveau seed.
  const [seed] = useState(randomSeed);
  const overlayRef = useRef<HTMLDivElement>(null);
  useFocusTrap(overlayRef, { active: true, onEscape: onContinue });

  return (
    <div
      ref={overlayRef}
      role="alertdialog"
      aria-modal="true"
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
        {koHeader(aggressivityLevel, isPerfect)}
      </p>

      <p className="max-w-[28ch] text-sm text-ink">
        {koLine(aggressivityLevel, { isPerfect, firstVictory, username, bossName }, seed)}
      </p>

      {milestone !== null && (
        <p className="font-display text-xs uppercase tracking-wide text-gold">
          {milestoneLine(aggressivityLevel, milestone, seed)}
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
          🌙 Terminer la journée
        </button>
        <ShareButton params={shareCardParams} source="perfect_overlay" />
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
