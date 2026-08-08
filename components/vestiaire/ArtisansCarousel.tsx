"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import useEmblaCarousel from "embla-carousel-react";
import type { EmblaCarouselType } from "embla-carousel";
import {
  ARTISANS,
  isArtisanSeen,
  type ArtisanCategory,
  type ArtisanEntry,
  type ArtisanSeenContext,
} from "@/lib/credits";
import { carousel3DTransform } from "@/lib/carousel-3d";
import { getHero } from "@/lib/heroes";
import { getBoss } from "@/lib/bosses";
import { getBackground } from "@/lib/backgrounds";
import { bossSpriteMeta } from "@/lib/sprite-metadata";
import HeroIdle from "@/components/combat/HeroIdle";
import CharacterSprite from "@/components/combat/CharacterSprite";

const CATEGORY_LABEL: Record<ArtisanCategory, string> = {
  heros: "Héros",
  boss: "Boss",
  decors: "Décors",
  police: "Police",
};

const CATEGORY_ORDER: ArtisanCategory[] = ["heros", "boss", "decors", "police"];

function ArtisanVisual({ entry }: { entry: ArtisanEntry }) {
  const ref = entry.spriteRef;
  if (ref.kind === "hero") {
    const hero = getHero(ref.heroId);
    if (!hero) return null;
    return <HeroIdle hero={hero} baseHeight={96} />;
  }
  if (ref.kind === "boss") {
    const boss = getBoss(ref.bossId);
    if (!boss) return null;
    return (
      <CharacterSprite
        spriteBase={boss.spriteBase}
        meta={bossSpriteMeta(boss.slug)}
        baseHeight={96}
        state="idle"
        flip={boss.flip}
        alt={boss.name}
        className="[image-rendering:pixelated]"
      />
    );
  }
  if (ref.kind === "background") {
    const background = getBackground(ref.backgroundId);
    if (!background) return null;
    return (
      <div className="relative h-28 w-40 overflow-hidden rounded border border-border">
        <Image
          src={background.publicPath}
          alt=""
          fill
          sizes="160px"
          className="object-cover [image-rendering:pixelated]"
        />
      </div>
    );
  }
  return (
    <p aria-hidden="true" className="font-display text-3xl text-ink">
      AaBbCc 0123
    </p>
  );
}

// Issue #134 : copie du patron coverflow de SkinCarousel.tsx (issue #75),
// sans logique d'équipement/achat — navigation + affichage seulement.
export default function ArtisansCarousel({
  seenContext,
}: {
  seenContext: ArtisanSeenContext;
}) {
  const categories = CATEGORY_ORDER.filter((cat) => ARTISANS.some((e) => e.category === cat));

  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: "center",
    loop: ARTISANS.length > 1,
    watchDrag: ARTISANS.length > 1,
  });

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [offsets, setOffsets] = useState<number[]>(() => ARTISANS.map((_, i) => i));

  const recomputeOffsets = useCallback((api: EmblaCarouselType) => {
    const snapList = api.scrollSnapList();
    const progress = api.scrollProgress();
    const step = snapList.length > 1 ? snapList[1] - snapList[0] : 1;
    setOffsets(snapList.map((snap) => (snap - progress) / (step || 1)));
  }, []);

  useEffect(() => {
    if (!emblaApi) return;
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

  function goToCategory(cat: ArtisanCategory) {
    const index = ARTISANS.findIndex((e) => e.category === cat);
    if (index >= 0) emblaApi?.scrollTo(index);
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

  const centered = ARTISANS[selectedIndex] ?? ARTISANS[0];
  const activeCategory = centered.category;
  const showSeenBadge = centered.spriteRef.kind !== "font" && isArtisanSeen(centered, seenContext);

  return (
    <div className="flex flex-col items-center gap-3" data-testid="artisans-carousel">
      <div className="flex gap-2" role="tablist" aria-label="Catégories d'artisans">
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            role="tab"
            aria-selected={activeCategory === cat}
            onClick={() => goToCategory(cat)}
            className={`rounded-full border px-3 py-1 text-xs uppercase tracking-wide ${
              activeCategory === cat ? "border-ink bg-surface text-ink" : "border-border text-faint"
            }`}
          >
            {CATEGORY_LABEL[cat]}
          </button>
        ))}
      </div>

      <div
        ref={emblaRef}
        className="w-full overflow-hidden"
        style={{ perspective: "800px" }}
        tabIndex={0}
        role="group"
        aria-label="Artisans de Dodojo"
        aria-roledescription="carrousel"
        onKeyDown={handleKeyDown}
      >
        <div className="flex touch-pan-y">
          {ARTISANS.map((entry, i) => {
            const { transform, opacity, zIndex } = carousel3DTransform(
              offsets[i] ?? i - selectedIndex,
            );
            return (
              <div
                key={entry.id}
                className="relative flex min-w-0 flex-[0_0_60%] items-center justify-center"
                data-artisan-slide={entry.id}
              >
                <div
                  className="flex h-28 items-center justify-center"
                  style={{ transform, opacity, zIndex, transformStyle: "preserve-3d" }}
                >
                  <ArtisanVisual entry={entry} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Artisan précédent"
          onClick={() => emblaApi?.scrollPrev()}
          disabled={ARTISANS.length <= 1}
          className="rounded border border-border px-2 py-1 text-xs text-ink disabled:opacity-30"
        >
          ◀
        </button>
        <span data-testid="artisan-position" className="text-[10px] text-faint">
          {selectedIndex + 1}/{ARTISANS.length}
        </span>
        <button
          type="button"
          aria-label="Artisan suivant"
          onClick={() => emblaApi?.scrollNext()}
          disabled={ARTISANS.length <= 1}
          className="rounded border border-border px-2 py-1 text-xs text-ink disabled:opacity-30"
        >
          ▶
        </button>
      </div>

      <div className="flex max-w-sm flex-col items-center gap-1 text-center">
        <p className="font-display text-sm uppercase tracking-wide text-ink">{centered.creator}</p>
        <p className="text-xs text-muted">{centered.packName}</p>
        {centered.license && <p className="text-[10px] text-faint">{centered.license}</p>}
        <p className="text-xs text-muted">{centered.lore}</p>
        {showSeenBadge && (
          <span data-testid="artisan-seen-badge" className="text-[10px] text-faint">
            Rencontré en combat
          </span>
        )}
        {centered.sourceUrl && (
          <a
            href={centered.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-muted underline underline-offset-4"
          >
            Voir la source
          </a>
        )}
      </div>

      <p aria-live="polite" className="sr-only">
        {centered.creator}. {centered.lore}
      </p>
    </div>
  );
}
