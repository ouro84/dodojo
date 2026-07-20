import IdleSprite from "./IdleSprite";
import type { Hero } from "@/types";

// US-18 : rend l'idle d'un héros en réutilisant IdleSprite (qui gère déjà
// prefers-reduced-motion). Verrouillé = filtre grayscale sur le wrapper.
export default function HeroIdle({
  hero,
  locked = false,
  className,
}: {
  hero: Hero;
  locked?: boolean;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={locked ? { filter: "grayscale(1) brightness(0.4)" } : undefined}
      data-hero={hero.id}
      data-locked={locked}
    >
      <IdleSprite
        framePrefix={hero.idleFramePrefix}
        frameCount={hero.idleFrameCount}
        alt={locked ? `${hero.name} (verrouillé)` : hero.name}
        className="h-full w-auto [image-rendering:pixelated]"
      />
    </div>
  );
}
