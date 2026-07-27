"use client";

import { useRef, useState } from "react";
import type { AggressivityLevel, DayOutcome } from "@/types";
import type { ShareCardParams } from "@/lib/share-card";
import { crepusculeHeader, crepusculeLine } from "@/lib/copy/rituals";
import { randomSeed } from "@/lib/copy/variant";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import ShareButton from "./ShareButton";

interface CrepusculeRecapProps {
  outcome: DayOutcome;
  bossName: string;
  aggressivityLevel: AggressivityLevel;
  username: string;
  damageDealt: number;
  tasksCompleted: number;
  tasksAbandoned: number;
  xpEarned: number;
  remainingMonsters: number;
  streak: number;
  // US-20 : paramètres pré-calculés de la carte partageable pour ce récap.
  shareCardParams: ShareCardParams;
  onDismiss: () => void;
}

// US-07 : récap figé du Dernier Round, dessiné comme une carte de score
// arcade self-contained (prête pour l'export PNG d'US-20, sans refonte).
// Victoire = ton exalté ; retraite = ton apaisé, jamais culpabilisant.
export default function CrepusculeRecap({
  outcome,
  bossName,
  aggressivityLevel,
  username,
  damageDealt,
  tasksCompleted,
  tasksAbandoned,
  xpEarned,
  remainingMonsters,
  streak,
  shareCardParams,
  onDismiss,
}: CrepusculeRecapProps) {
  const victory = outcome === "victory";
  // Seed figé au montage : voir PerfectOverlay pour la raison.
  const [seed] = useState(randomSeed);
  const overlayRef = useRef<HTMLDivElement>(null);
  useFocusTrap(overlayRef, { active: true, onEscape: onDismiss });

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label="Terminer la journée"
      data-outcome={outcome}
      className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-[oklch(0.08_0_0_/_88%)] px-4 text-center"
    >
      <p
        className={`font-hud text-3xl font-semibold uppercase tracking-wide ${
          victory ? "text-hp" : "text-ink"
        }`}
      >
        {crepusculeHeader(aggressivityLevel, victory)}
      </p>
      <p className="max-w-[30ch] text-sm text-muted">
        {crepusculeLine(aggressivityLevel, { victory, username, bossName }, seed)}
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
        <dd className="text-right text-xp-text">+{xpEarned}</dd>
      </dl>

      {!victory && remainingMonsters > 0 && (
        <p className="text-xs text-muted">
          Il te reste {remainingMonsters} monstre{remainingMonsters > 1 ? "s" : ""} — ils
          t&apos;attendront demain.
        </p>
      )}
      {streak > 0 && (
        <p
          className={`font-hud text-xs font-semibold uppercase tracking-wide text-hp-text ${
            victory ? "streak-flames" : ""
          }`}
        >
          {streak}ᵉ victoire d&apos;affilée
        </p>
      )}

      <ShareButton params={shareCardParams} source="crepuscule" />

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
