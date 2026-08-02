import CharacterSprite from "./CharacterSprite";
import type { Hero } from "@/types";
import { getHeroSpriteBase } from "@/lib/hero-skins";
import { heroSpriteMeta } from "@/lib/sprite-metadata";

// Issue #156 : la tuile d'un héros est l'union alpha de toutes ses anims, donc
// large et de ratio très variable (633 px pour wind-hashashin contre 348 px
// pour ground-monk à baseHeight 112). Sans cadre fixe, chaque carte du Marché
// Noir avait une taille différente. Le cadre est dimensionné sur la plus large
// silhouette idle du roster, avec marge ; la silhouette y est ancrée au centre
// via idleAnchorX et alignée en bas, le débordement des anims étant coupé.
// Valeur relevée : `npm run generate:sprites` puis le one-liner du plan #156
// (fire-knight, silhouette idle 153 px à baseHeight 112) + 16 px de marge.
const FRAME_WIDTH_AT_112 = 170;

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
  const meta = heroSpriteMeta(hero.slug);
  const frameWidth = (FRAME_WIDTH_AT_112 * baseHeight) / 112;
  // La silhouette idle fait toujours `baseHeight` de haut par construction de
  // `renderScale` (cf. LEGACY_IDLE_HEIGHTS) : le cadre se cale dessus, pas sur
  // la hauteur rendue de la tuile (baseHeight × renderScale), qui varie par
  // héros selon l'espace occupé par les anims d'attaque au-dessus des pieds.
  const frameHeight = baseHeight;

  return (
    <div
      className={className}
      style={locked ? { filter: "grayscale(1) brightness(0.4)" } : undefined}
      data-hero={hero.id}
      data-locked={locked}
    >
      <div
        data-testid="hero-idle-frame"
        className="relative overflow-hidden"
        style={{ width: `${frameWidth}px`, height: `${frameHeight}px` }}
      >
        <div
          data-testid="hero-idle-anchor"
          className="absolute bottom-0"
          style={{
            left: "50%",
            transform: `translateX(-${meta.idleAnchorX * 100}%)`,
          }}
        >
          <CharacterSprite
            spriteBase={getHeroSpriteBase(hero.id, skinId)}
            meta={meta}
            baseHeight={baseHeight}
            state="idle"
            alt={locked ? `${hero.name} (verrouillé)` : hero.name}
            className="[image-rendering:pixelated]"
          />
        </div>
      </div>
    </div>
  );
}
