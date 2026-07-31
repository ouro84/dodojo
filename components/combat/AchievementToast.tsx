"use client";

import { useEffect } from "react";
import { getAchievement, type AchievementRarity } from "@/lib/achievements";

interface AchievementToastProps {
  codes: string[];
  onDismissAll: () => void;
}

const RARITY_ICON: Record<AchievementRarity, string> = {
  bronze: "🥉",
  argent: "🥈",
  or: "🥇",
  platine: "💎",
};

// Issue #72 (D9) : non-bloquant, empilable, disparaît seul — contrairement
// à LevelUpOverlay/PerfectOverlay (bloquants, focus trap), pas d'interaction
// requise pour continuer à jouer.
export default function AchievementToast({ codes, onDismissAll }: AchievementToastProps) {
  useEffect(() => {
    if (codes.length === 0) return;
    const timer = setTimeout(onDismissAll, 4000 + codes.length * 1000);
    return () => clearTimeout(timer);
  }, [codes, onDismissAll]);

  if (codes.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-2 z-40 flex flex-col items-center gap-2 px-4"
    >
      {codes.map((code) => {
        const def = getAchievement(code);
        if (!def) return null;
        return (
          <div
            key={code}
            className="achievement-toast pointer-events-auto flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-left shadow-lg motion-reduce:animate-none"
          >
            <span className="text-lg" aria-hidden="true">
              {RARITY_ICON[def.rarity]}
            </span>
            <div>
              <p className="font-display text-xs uppercase tracking-wide text-gold">
                Succès débloqué : {def.title}
              </p>
              <p className="text-[11px] text-muted">{def.description}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
