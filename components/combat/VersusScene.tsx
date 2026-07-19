import Image from "next/image";
import IdleSprite from "./IdleSprite";

interface VersusSceneProps {
  dimmed?: boolean;
}

// Décor : assets/Backgrounds/free-steampunk-cityscape-pixel-backgrounds (CraftPix, cf. ASSETS.md)
// Héros : assets/MC/Elementals_fire_knight_FREE_v1.1 (licence non documentée localement, cf. ASSETS.md)
// Boss : assets/Boss/Frost_Guardian_FREE_v1.0 (licence non documentée localement, cf. ASSETS.md)
export default function VersusScene({ dimmed = false }: VersusSceneProps) {
  return (
    <div
      className="relative h-40 w-full overflow-hidden rounded-lg border border-border"
      style={dimmed ? { filter: "saturate(0.5) brightness(0.7)" } : undefined}
    >
      <Image
        src="/backgrounds/steampunk-cityscape-1.png"
        alt=""
        fill
        sizes="336px"
        priority
        className="object-cover [image-rendering:pixelated]"
      />
      <IdleSprite
        framePrefix="/sprites/mc/fire-knight/idle/frame"
        frameCount={8}
        alt="Ton héros : le Chevalier de Feu"
        className="absolute bottom-2 left-4 h-28 w-auto [image-rendering:pixelated] drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)]"
      />
      <IdleSprite
        framePrefix="/sprites/bosses/frost-guardian/idle/frame"
        frameCount={6}
        alt="Le Boss du jour : le Gardien de Glace"
        className="absolute bottom-2 right-4 h-28 w-auto [image-rendering:pixelated] drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)]"
      />
    </div>
  );
}
