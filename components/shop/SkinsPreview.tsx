"use client";

import type { Hero } from "@/types";
import { getSkinsForHero, getHeroSpritePrefix } from "@/lib/hero-skins";
import IdleSprite from "@/components/combat/IdleSprite";

// Écran de test interne (chemin obscur, login requis, non listé). Affiche
// toutes les tenues de tous les héros côte à côte pour valider (ou recalibrer)
// scripts/generate-hero-skins.mjs avant de merger. Même patron que RosterPreview.
export default function SkinsPreview({ heroes }: { heroes: Hero[] }) {
  return (
    <div className="flex flex-col gap-8">
      {heroes.map((hero) => {
        const skins = getSkinsForHero(hero.id);
        return (
          <section key={hero.id} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-display text-sm text-ink">{hero.name}</span>
              <span className="text-[10px] text-faint">
                {hero.id} · {skins.length} tenues
              </span>
            </div>
            <div className="flex flex-wrap gap-3">
              {skins.map((skin) => (
                <div
                  key={skin.id}
                  className="flex flex-col items-center gap-1 rounded border border-border bg-black/40 p-2"
                >
                  <IdleSprite
                    framePrefix={getHeroSpritePrefix(hero.id, skin.id)}
                    frameCount={hero.idleFrameCount}
                    alt={`${hero.name} — ${skin.name}`}
                    className="h-24 w-auto [image-rendering:pixelated]"
                  />
                  <span className="text-[10px] text-muted">{skin.name}</span>
                  <span className="text-[9px] text-faint">
                    {skin.id} · 🪙 {skin.price}
                  </span>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
