"use client";

import SpriteAnimator from "./SpriteAnimator";
import { heroVfxVariants, vfxMeta } from "@/lib/sprite-metadata";

const VFX_DURATION_MS = 320;

export function pickVfxVariant(heroSlug: string, rng: () => number = Math.random): string {
  const variants = heroVfxVariants(heroSlug);
  if (variants.length === 0) throw new Error(`Aucun VFX pour le héros ${heroSlug}`);
  return variants[Math.min(variants.length - 1, Math.floor(rng() * variants.length))];
}

interface HeroVfxProps {
  heroSlug: string;
  variant: string;
  /** Hauteur rendue du Boss : le VFX se joue sur la cible, pas au centre. */
  bossHeight: number;
  reducedMotion?: boolean;
}

export default function HeroVfx({
  heroSlug,
  variant,
  bossHeight,
  reducedMotion = false,
}: HeroVfxProps) {
  if (reducedMotion) return null;
  const meta = vfxMeta(heroSlug, variant);
  return (
    <SpriteAnimator
      sheetSrc={`/vfx/hero/${heroSlug}/${variant}.png`}
      frames={meta.frames}
      tileW={meta.tileW}
      tileH={meta.tileH}
      renderedHeight={bossHeight * 1.2}
      durationMs={VFX_DURATION_MS}
      loop={false}
      animKey={variant}
      className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2"
    />
  );
}
