"use client";

import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import type { EmblaCarouselType } from "embla-carousel";
import type { Hero } from "@/types";
import { getSkinsForHero, defaultSkinIdFor, isSkinOwned } from "@/lib/hero-skins";
import { carousel3DTransform, skinCtaState } from "@/lib/carousel-3d";
import HeroIdle from "@/components/combat/HeroIdle";

// Issue #75 : remplace la bande de pastilles de couleur par un carrousel 3D
// (chaque tenue rendue avec son vrai sprite, pas une couleur). Fusionne
// l'ancien "Stage" (gros héros statique) et la sélection de tenue en un seul
// widget. Navigation = preview seule (jamais d'équipement/achat déclenché par
// le swipe/les flèches/le clavier) ; le CTA en dessous committe l'action.
export default function SkinCarousel({
  hero,
  heroOwned,
  isHeroEquipped,
  equippedSkinId,
  ownedSkinIds,
  balance,
  pending,
  onEquip,
  onRequestPurchase,
}: {
  hero: Hero;
  heroOwned: boolean;
  isHeroEquipped: boolean;
  equippedSkinId: string | null;
  ownedSkinIds: string[];
  balance: number;
  pending: boolean;
  onEquip: (skinId: string) => void;
  onRequestPurchase: (skinId: string) => void;
}) {
  const skins = getSkinsForHero(hero.id);
  const initialSkinId = isHeroEquipped
    ? (equippedSkinId ?? defaultSkinIdFor(hero.id))
    : defaultSkinIdFor(hero.id);
  const initialIndex = Math.max(
    0,
    skins.findIndex((s) => s.id === initialSkinId),
  );

  // Cas dégénéré à 2 tenues (issue #75, Q18) : la seule autre tenue n'a nulle
  // part où aller sur les côtés, donc swiper dans un sens ou l'autre doit
  // basculer vers elle — `loop` d'embla gère ça nativement.
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: skins.length === 2,
    align: "center",
    startIndex: initialIndex,
    watchDrag: skins.length > 1,
  });

  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const [offsets, setOffsets] = useState<number[]>(() =>
    skins.map((_, i) => i - initialIndex),
  );

  const recomputeOffsets = useCallback((api: EmblaCarouselType) => {
    const snapList = api.scrollSnapList();
    const progress = api.scrollProgress();
    const step = snapList.length > 1 ? snapList[1] - snapList[0] : 1;
    setOffsets(snapList.map((snap) => (snap - progress) / (step || 1)));
  }, []);

  useEffect(() => {
    if (!emblaApi) return;
    // Les states `offsets`/`selectedIndex` sont déjà initialisés correctement
    // (cf. useState ci-dessus, calculés depuis `initialIndex`) — l'effet ne
    // fait que s'abonner aux évènements futurs d'embla, jamais de setState
    // synchrone dans le corps de l'effet (react-hooks/set-state-in-effect).
    // `init`/`reInit` recalent sur la géométrie réelle une fois mesurée.
    const onScroll = () => recomputeOffsets(emblaApi);
    const onSelect = () => setSelectedIndex(emblaApi.selectedScrollSnap());
    emblaApi.on("init", onScroll);
    emblaApi.on("scroll", onScroll);
    emblaApi.on("reInit", onScroll);
    emblaApi.on("select", onSelect);
    return () => {
      emblaApi.off("init", onScroll);
      emblaApi.off("scroll", onScroll);
      emblaApi.off("reInit", onScroll);
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi, recomputeOffsets]);

  const centeredSkin = skins[selectedIndex] ?? skins[0];
  const centeredOwned = isSkinOwned(centeredSkin.id, hero.id, ownedSkinIds);
  const centeredEquipped =
    isHeroEquipped && (equippedSkinId ?? defaultSkinIdFor(hero.id)) === centeredSkin.id;
  const cta = skinCtaState({
    equipped: centeredEquipped,
    owned: centeredOwned,
    price: centeredSkin.price,
    balance,
  });

  function handleCtaClick() {
    if (cta.variant === "equip") onEquip(centeredSkin.id);
    else if (cta.variant === "unlock") onRequestPurchase(centeredSkin.id);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      emblaApi?.scrollNext();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      emblaApi?.scrollPrev();
    }
  }

  return (
    <div
      className="flex flex-col items-center gap-2 rounded-lg border border-border bg-black/40 p-4"
      data-testid="skin-carousel"
      data-hero={hero.id}
    >
      <div
        ref={emblaRef}
        className="w-full overflow-hidden"
        style={{ perspective: "800px" }}
        tabIndex={0}
        role="group"
        aria-label={`Tenues de ${hero.name}`}
        aria-roledescription="carrousel"
        onKeyDown={handleKeyDown}
      >
        <div className="flex touch-pan-y">
          {skins.map((skin, i) => {
            const owned = isSkinOwned(skin.id, hero.id, ownedSkinIds);
            const equippedHere =
              isHeroEquipped && (equippedSkinId ?? defaultSkinIdFor(hero.id)) === skin.id;
            const { transform, opacity, zIndex } = carousel3DTransform(offsets[i] ?? i - selectedIndex);
            return (
              <div
                key={skin.id}
                // flex-[0_0_60%] (pas 100%) : laisse les tenues voisines
                // dépasser sur les côtés (effet "peek" du coverflow) — un
                // slide plein-largeur les rendrait entièrement hors-champ.
                className="relative flex min-w-0 flex-[0_0_60%] items-center justify-center"
                data-skin-slide={skin.id}
              >
                <div
                  className="relative flex flex-col items-center"
                  style={{
                    transform,
                    opacity,
                    zIndex,
                    transformStyle: "preserve-3d",
                    filter:
                      !heroOwned
                        ? "grayscale(1) brightness(0.4)"
                        : !owned
                          ? "saturate(0.4) brightness(0.6)"
                          : undefined,
                  }}
                >
                  <HeroIdle hero={hero} skinId={skin.id} />
                  {equippedHere && (
                    <span
                      data-testid="skin-equipped-badge"
                      aria-hidden="true"
                      className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded bg-xp text-[10px] text-ink"
                    >
                      ✓
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Tenue précédente"
          onClick={() => emblaApi?.scrollPrev()}
          disabled={skins.length <= 1}
          className="rounded border border-border px-2 py-1 text-xs text-ink disabled:opacity-30"
        >
          ◀
        </button>
        <div className="flex flex-col items-center">
          <span className="font-display text-sm uppercase tracking-wide text-ink">
            {centeredSkin.name}
          </span>
          <span data-testid="skin-position" className="text-[10px] text-faint">
            {selectedIndex + 1}/{skins.length}
          </span>
        </div>
        <button
          type="button"
          aria-label="Tenue suivante"
          onClick={() => emblaApi?.scrollNext()}
          disabled={skins.length <= 1}
          className="rounded border border-border px-2 py-1 text-xs text-ink disabled:opacity-30"
        >
          ▶
        </button>
      </div>

      {/* Annonce lecteur d'écran : rien d'autre ne signale le changement de
          tenue (le carrousel ne navigue jamais de page). */}
      <p aria-live="polite" className="sr-only">
        {centeredSkin.name}. {centeredSkin.lore}
      </p>
      <p className="max-w-xs text-center text-xs text-muted">{centeredSkin.lore}</p>

      {heroOwned ? (
        <button
          type="button"
          onClick={handleCtaClick}
          disabled={pending || cta.disabled}
          data-testid="skin-cta"
          className="rounded border border-border px-4 py-2 font-display text-xs uppercase tracking-wide text-ink disabled:opacity-50"
        >
          {cta.label}
        </button>
      ) : (
        <p className="text-xs text-muted">{"Débloque le héros d'abord"}</p>
      )}
    </div>
  );
}
