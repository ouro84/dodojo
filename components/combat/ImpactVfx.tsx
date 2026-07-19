"use client";

import { useEffect, useState } from "react";

// VFX d'impact (slash) : recolorisé depuis Super Pixel Effects Gigapack — Will Tice / unTied Games
// (attribution obligatoire, cf. public/vfx/impact/GIGAPACK-LICENSE.txt)
export const IMPACT_VARIANTS = [
  { id: "slash-red", frameCount: 7 },
  { id: "slash-gold", frameCount: 7 },
  { id: "slash-indigo", frameCount: 7 },
  { id: "slash-white", frameCount: 7 },
] as const;

export type ImpactVariantId = (typeof IMPACT_VARIANTS)[number]["id"];

export function pickImpactVariant(): ImpactVariantId {
  const variant =
    IMPACT_VARIANTS[Math.floor(Math.random() * IMPACT_VARIANTS.length)];
  return variant.id;
}

const FRAME_MS = 45;
const FADE_MS = 1000;

interface ImpactVfxProps {
  variant: ImpactVariantId;
}

export default function ImpactVfx({ variant }: ImpactVfxProps) {
  const [reducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [frame, setFrame] = useState(0);
  const [fading, setFading] = useState(reducedMotion);
  const frameCount =
    IMPACT_VARIANTS.find((entry) => entry.id === variant)?.frameCount ?? 1;

  useEffect(() => {
    if (reducedMotion || frame >= frameCount - 1) return;

    const timer = setTimeout(() => {
      const next = frame + 1;
      setFrame(next);
      if (next >= frameCount - 1) setFading(true);
    }, FRAME_MS);

    return () => clearTimeout(timer);
  }, [frame, frameCount, reducedMotion]);

  const paddedFrame = String(frame).padStart(4, "0");

  return (
    // eslint-disable-next-line @next/next/no-img-element -- flipbook rapide, next/image inutile ici
    <img
      src={`/vfx/impact/${variant}/frame${paddedFrame}.png`}
      alt=""
      aria-hidden="true"
      style={{
        opacity: fading ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease-out`,
      }}
      className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-20 w-20 -translate-x-1/2 -translate-y-1/2 [image-rendering:pixelated]"
    />
  );
}
