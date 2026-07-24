"use client";

import { useEffect, useState } from "react";

interface IdleSpriteProps {
  framePrefix: string;
  frameCount: number;
  alt: string;
  className?: string;
  // Miroir horizontal : utile pour retourner un sprite qui regarde à droite
  // alors qu'il doit faire face au héros (boss placé à droite de l'Arène).
  flip?: boolean;
}

const FRAME_MS = 120;

export default function IdleSprite({
  framePrefix,
  frameCount,
  alt,
  className,
  flip = false,
}: IdleSpriteProps) {
  const [reducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [frame, setFrame] = useState(0);

  // Audit #67, PR4 : sans préchargement, chaque frame n'est demandée au
  // réseau qu'au moment exact où `src` change — sur une connexion lente,
  // ça peut se voir (flash/frame manquante). Précharge les frameCount
  // images une fois au montage ; le swap suivant tape le cache navigateur.
  useEffect(() => {
    for (let i = 0; i < frameCount; i++) {
      const img = new window.Image();
      img.src = `${framePrefix}${String(i).padStart(4, "0")}.png`;
    }
  }, [framePrefix, frameCount]);

  useEffect(() => {
    if (reducedMotion) return;

    const timer = setTimeout(() => {
      setFrame((current) => (current + 1) % frameCount);
    }, FRAME_MS);

    return () => clearTimeout(timer);
  }, [frame, frameCount, reducedMotion]);

  const paddedFrame = String(frame).padStart(4, "0");

  return (
    // eslint-disable-next-line @next/next/no-img-element -- flipbook rapide, next/image inutile ici
    <img
      src={`${framePrefix}${paddedFrame}.png`}
      alt={alt}
      className={className}
      style={flip ? { transform: "scaleX(-1)" } : undefined}
    />
  );
}
