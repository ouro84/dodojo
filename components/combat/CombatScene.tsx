import Image from "next/image";

interface CombatSceneProps {
  dimmed?: boolean;
}

// Décor : assets/Backgrounds/free-steampunk-cityscape-pixel-backgrounds (CraftPix, cf. ASSETS.md)
// Boss : assets/Boss/Frost_Guardian_FREE_v1.0 (licence non documentée localement, à vérifier avant prod — cf. ASSETS.md)
export default function CombatScene({ dimmed = false }: CombatSceneProps) {
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
      <Image
        src="/sprites/bosses/frost-guardian/idle-1.png"
        alt="Le Boss du jour : le Gardien de Glace"
        width={192}
        height={128}
        className="absolute bottom-1 left-1/2 h-24 w-auto -translate-x-1/2 [image-rendering:pixelated] drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)]"
      />
    </div>
  );
}
