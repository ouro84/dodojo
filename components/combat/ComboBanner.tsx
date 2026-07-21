"use client";

// Bannière de combo façon jeu de combat arcade. Purement visuelle. L'intensité
// (0..4) grossit le texte au fil de la série. Animation gérée par la classe
// `combo-pop` (globals.css), neutralisée sous prefers-reduced-motion.
interface ComboBannerProps {
  label: string;
  intensity: number;
}

const SIZE_BY_INTENSITY = [
  "text-sm",
  "text-base",
  "text-lg",
  "text-xl",
  "text-2xl",
];

export default function ComboBanner({ label, intensity }: ComboBannerProps) {
  const size = SIZE_BY_INTENSITY[Math.min(intensity, SIZE_BY_INTENSITY.length - 1)];
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute left-1/2 top-2 z-30 -translate-x-1/2"
    >
      <span
        className={`combo-pop font-display uppercase tracking-widest text-gold ${size}`}
      >
        {label}
      </span>
    </div>
  );
}
