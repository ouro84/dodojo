"use client";

import type { Hero } from "@/types";
import { getSkinsForHero } from "@/lib/hero-skins";
import SkinCarousel from "@/components/shop/SkinCarousel";

// Écran de test interne (chemin obscur, login requis, non listé). Affiche le
// carrousel réel (issue #75) pour chaque héros, toutes tenues possédées
// (validation visuelle pure, jamais de logique d'achat sur cet écran) — pour
// valider/recalibrer scripts/generate-hero-skins.mjs avant de merger, et
// rester un vrai miroir du rendu prod. Même patron que RosterPreview.
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
            <SkinCarousel
              hero={hero}
              heroOwned
              isHeroEquipped={false}
              equippedSkinId={null}
              ownedSkinIds={skins.map((s) => s.id)}
              balance={0}
              pending={false}
              onEquip={() => {}}
              onRequestPurchase={() => {}}
            />
          </section>
        );
      })}
    </div>
  );
}
