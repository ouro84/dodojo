"use client";

import type { DayOutcome } from "@/types";

interface CrepusculeRecapProps {
  outcome: DayOutcome;
  bossName: string;
  username: string;
  damageDealt: number;
  tasksCompleted: number;
  tasksAbandoned: number;
  xpEarned: number;
  remainingMonsters: number;
  streak: number;
  onDismiss: () => void;
}

// US-07 : récap figé du Rituel du Crépuscule, dessiné comme une carte de score
// arcade self-contained (prête pour l'export PNG d'US-20, sans refonte).
// Victoire = ton exalté ; retraite = ton apaisé, jamais culpabilisant.
export default function CrepusculeRecap({
  outcome,
  bossName,
  username,
  damageDealt,
  tasksCompleted,
  tasksAbandoned,
  xpEarned,
  remainingMonsters,
  streak,
  onDismiss,
}: CrepusculeRecapProps) {
  const victory = outcome === "victory";

  return (
    <div
      role="dialog"
      aria-label="Rituel du Crépuscule"
      data-outcome={outcome}
      className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-[oklch(0.08_0_0_/_88%)] px-4 text-center"
    >
      <p
        className={`font-display text-3xl uppercase tracking-wide ${
          victory ? "text-hp" : "text-ink"
        }`}
      >
        {victory ? "Perfect !" : "Crépuscule"}
      </p>
      <p className="max-w-[30ch] text-sm text-muted">
        {victory
          ? `${username}, tu as terrassé ${bossName}. La rue est calme pour ce soir.`
          : `${username}, tu poses les armes. Pas de honte — demain est un autre combat.`}
      </p>

      {/* Carte de score arcade — self-contained (prête export PNG US-20). */}
      <dl className="grid w-full max-w-xs grid-cols-2 gap-2 rounded-md border border-border bg-surface p-3 text-left text-xs">
        <dt className="text-faint">Dégâts</dt>
        <dd className="text-right text-ink">{damageDealt} HP</dd>
        <dt className="text-faint">Monstres vaincus</dt>
        <dd className="text-right text-ink">{tasksCompleted}</dd>
        <dt className="text-faint">Abandons</dt>
        <dd className="text-right text-ink">{tasksAbandoned}</dd>
        <dt className="text-faint">XP gagnée</dt>
        <dd className="text-right text-xp">+{xpEarned}</dd>
      </dl>

      {!victory && remainingMonsters > 0 && (
        <p className="text-xs text-muted">
          Il te reste {remainingMonsters} monstre{remainingMonsters > 1 ? "s" : ""} — ils
          t&apos;attendront demain.
        </p>
      )}
      {streak > 0 && (
        <p
          className={`font-display text-xs uppercase tracking-wide text-hp ${
            victory ? "streak-flames" : ""
          }`}
        >
          {streak}ᵉ victoire d&apos;affilée
        </p>
      )}

      <button
        type="button"
        onClick={onDismiss}
        className="rounded-md border border-border px-4 py-2 font-display text-xs uppercase tracking-wide text-ink"
      >
        Continuer
      </button>
    </div>
  );
}
