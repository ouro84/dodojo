"use client";

import { HEROES, getHero, DEFAULT_HERO_ID } from "@/lib/heroes";
import HeroIdle from "@/components/combat/HeroIdle";

// US-29 : Character Select gratuit pour l'onboarding (pas d'or, pas d'achat).
// Stage (idle du sélectionné) + matrice des 7. Le parent tient la valeur.
export default function OnboardingAvatarPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const selected = getHero(value) ?? getHero(DEFAULT_HERO_ID)!;
  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-black/40 p-4">
        <HeroIdle hero={selected} className="h-28" />
        <div className="font-display text-sm uppercase tracking-wide text-ink">
          {selected.name}
        </div>
        <div className="text-xs text-muted">Élément : {selected.element}</div>
      </div>
      <div className="mx-auto flex max-w-[240px] flex-wrap justify-center gap-1.5">
        {HEROES.map((h) => (
          <button
            key={h.id}
            type="button"
            aria-label={h.name}
            aria-pressed={h.id === selected.id}
            onClick={() => onChange(h.id)}
            className={`h-11 w-11 overflow-hidden rounded border-2 bg-black/40 ${
              h.id === selected.id ? "border-gold" : "border-border"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- mini-portrait pixel */}
            <img
              src={`/sprites/mc/${h.slug}/portrait.png`}
              alt=""
              className="h-full w-full object-contain p-0.5 [image-rendering:pixelated]"
            />
          </button>
        ))}
      </div>
    </div>
  );
}
