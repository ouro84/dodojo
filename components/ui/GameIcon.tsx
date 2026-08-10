import Image from "next/image";
import type { ReactNode } from "react";

// Issue #187 (chasse aux emojis) : icônes 16-bit du pack Raven Fantasy Icons
// (assets/Icons, cf. ASSETS.md § 8) pour les concepts couverts par du loot
// RPG, extraites une fois vers public/icons/ui/ par scripts/extract-ui-icons.mjs
// (jamais un import direct depuis assets/). Pour les concepts sans équivalent
// dans le pack (communication/temps/énergie/partage), un SVG dessiné à la
// main — même patron que RecurringIcon.tsx (trait) / MicButton.tsx (fill).
const PACK_ICONS = [
  "profil",
  "trophy",
  "artisans",
  "marche",
  "guide",
  "legal",
  "sword",
  "gold",
  "bronze",
  "silver",
  "platinum",
  "streak",
  "warning",
  "sleep",
] as const;
type PackIconName = (typeof PACK_ICONS)[number];

function isPackIcon(name: string): name is PackIconName {
  return (PACK_ICONS as readonly string[]).includes(name);
}

const HAND_DRAWN_ICONS: Record<"mic" | "bell" | "lightning" | "share", ReactNode> = {
  // Même tracé que MicButton.tsx, pour une seule silhouette de micro dans l'app.
  mic: (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-full w-full" aria-hidden="true">
      <rect x="6" y="1" width="4" height="8" rx="2" />
      <path d="M4 7v1a4 4 0 0 0 8 0V7h1v1a5 5 0 0 1-4.5 4.97V15h2v1H5.5v-1h2v-2.03A5 5 0 0 1 3 8V7h1z" />
    </svg>
  ),
  bell: (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-full w-full"
      aria-hidden="true"
    >
      <path d="M8 2a3 3 0 0 0-3 3v2c0 1.5-.6 2.5-1.5 3.5h9C11.6 9.5 11 8.5 11 7V5a3 3 0 0 0-3-3z" />
      <path d="M6.5 12.5a1.5 1.5 0 0 0 3 0" />
    </svg>
  ),
  lightning: (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-full w-full" aria-hidden="true">
      <path d="M9 1 3 9h4l-1 6 6-8H8z" />
    </svg>
  ),
  share: (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-full w-full"
      aria-hidden="true"
    >
      <path d="M8 1.5v8" />
      <path d="M5 4.5 8 1.5 11 4.5" />
      <path d="M3 8.5v4.5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V8.5" />
    </svg>
  ),
};

export type GameIconName = PackIconName | keyof typeof HAND_DRAWN_ICONS;

export default function GameIcon({ name, className }: { name: GameIconName; className?: string }) {
  if (isPackIcon(name)) {
    return (
      <span className={`relative inline-block ${className ?? ""}`} aria-hidden="true">
        <Image
          src={`/icons/ui/${name}.png`}
          alt=""
          fill
          sizes="32px"
          unoptimized
          className="object-contain [image-rendering:pixelated]"
        />
      </span>
    );
  }
  return (
    <span className={className} aria-hidden="true">
      {HAND_DRAWN_ICONS[name]}
    </span>
  );
}
