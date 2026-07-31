import CharacterSprite from "./CharacterSprite";
import type { Hero } from "@/types";
import { getHeroSpriteBase } from "@/lib/hero-skins";
import { heroSpriteMeta } from "@/lib/sprite-metadata";

// US-18/US-53 : rend l'idle d'un héros (et éventuellement d'une tenue) via
// CharacterSprite (issue #48). Verrouillé = filtre grayscale sur le wrapper.
export default function HeroIdle({
  hero,
  skinId = null,
  locked = false,
  baseHeight = 112,
  className,
}: {
  hero: Hero;
  skinId?: string | null;
  locked?: boolean;
  baseHeight?: number;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={locked ? { filter: "grayscale(1) brightness(0.4)" } : undefined}
      data-hero={hero.id}
      data-locked={locked}
    >
      <CharacterSprite
        spriteBase={getHeroSpriteBase(hero.id, skinId)}
        meta={heroSpriteMeta(hero.slug)}
        baseHeight={baseHeight}
        state="idle"
        alt={locked ? `${hero.name} (verrouillé)` : hero.name}
        className="[image-rendering:pixelated]"
      />
    </div>
  );
}
