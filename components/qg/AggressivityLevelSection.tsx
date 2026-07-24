"use client";

import { useState, useTransition } from "react";
import type { AggressivityLevel } from "@/types";
import { updateAggressivityLevel } from "@/app/actions/profile";

interface AggressivityLevelSectionProps {
  initialLevel: AggressivityLevel;
}

const LEVELS: Array<{ value: AggressivityLevel; name: string; description: string }> = [
  { value: "doux", name: "Doux", description: "Philosophe, zen." },
  { value: "direct", name: "Direct", description: "Franc-parler, équilibré." },
  { value: "brut", name: "Brut", description: "Arcade, sans filtre." },
];

// US-54 : jauge d'agressivité (Volume Intérieur), réglable à tout moment depuis le
// QG — même sélecteur à 3 cartes que l'onboarding.
export default function AggressivityLevelSection({ initialLevel }: AggressivityLevelSectionProps) {
  const [level, setLevel] = useState<AggressivityLevel>(initialLevel);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function select(next: AggressivityLevel) {
    const previous = level;
    setLevel(next);
    setError(null);
    startTransition(async () => {
      const result = await updateAggressivityLevel(next);
      if (result.error) {
        setLevel(previous);
        setError(result.error);
      }
    });
  }

  return (
    <section className="flex w-full max-w-sm flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <p className="font-display text-xs uppercase tracking-wide text-muted">Volume Intérieur</p>
      <div className="grid grid-cols-3 gap-2">
        {LEVELS.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={isPending}
            onClick={() => select(option.value)}
            aria-pressed={level === option.value}
            className={`flex flex-col gap-1 rounded-md border px-2 py-2 text-left text-xs disabled:opacity-50 ${
              level === option.value ? "border-hp text-ink" : "border-border text-muted"
            }`}
          >
            <span className="font-display uppercase tracking-wide">{option.name}</span>
            <span className="text-[0.65rem] text-faint">{option.description}</span>
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-xs text-alert">
          {error}
        </p>
      )}
    </section>
  );
}
