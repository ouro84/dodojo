import IdleSprite from "./IdleSprite";
import type { Hero } from "@/types";
import { getHeroSpritePrefix } from "@/lib/hero-skins";

// US-18/US-53 : rend l'idle d'un héros (et éventuellement d'une tenue) en
// réutilisant IdleSprite. Verrouillé = filtre grayscale sur le wrapper.
export default function HeroIdle({
  hero,
  skinId = null,
  locked = false,
  className,
}: {
  hero: Hero;
  skinId?: string | null;
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
        framePrefix={getHeroSpritePrefix(hero.id, skinId)}
        frameCount={hero.idleFrameCount}
        alt={locked ? `${hero.name} (verrouillé)` : hero.name}
        className="h-full w-auto [image-rendering:pixelated]"
      />
    </div>
  );
}
