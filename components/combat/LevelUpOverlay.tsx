"use client";

import { useRef, useState } from "react";
import type { AggressivityLevel } from "@/types";
import { levelUpTitle, levelUpBody } from "@/lib/copy/combat";
import { randomSeed } from "@/lib/copy/variant";
import { useFocusTrap } from "@/hooks/useFocusTrap";

interface LevelUpOverlayProps {
  newLevel: number;
  aggressivityLevel: AggressivityLevel;
  onDismiss: () => void;
}

export default function LevelUpOverlay({ newLevel, aggressivityLevel, onDismiss }: LevelUpOverlayProps) {
  // Seed figé au montage : voir PerfectOverlay pour la raison (stabilité du
  // texte pendant que l'overlay reste affiché malgré les re-rendus du parent).
  const [seed] = useState(randomSeed);
  const overlayRef = useRef<HTMLDivElement>(null);
  useFocusTrap(overlayRef, { active: true, onEscape: onDismiss });

  return (
    <div
      ref={overlayRef}
      role="alertdialog"
      aria-modal="true"
      aria-label="Passage de niveau"
      onClick={onDismiss}
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-lg bg-[oklch(0.08_0_0_/_72%)] px-4 text-center"
    >
      <p className="font-display text-2xl uppercase tracking-wide text-xp">
        {levelUpTitle(aggressivityLevel)}
      </p>
      <p className="max-w-[26ch] text-sm text-muted">{levelUpBody(aggressivityLevel, newLevel, seed)}</p>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onDismiss();
        }}
        className="rounded-md border border-border px-4 py-2 font-display text-xs uppercase tracking-wide text-ink"
      >
        Continuer
      </button>
    </div>
  );
}
