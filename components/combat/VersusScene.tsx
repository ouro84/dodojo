import Image from "next/image";
import IdleSprite from "./IdleSprite";
import HeroBar from "./HeroBar";
import BossBar from "./BossBar";
import MidnightTimer from "./MidnightTimer";

interface VersusSceneProps {
  heroName: string;
  heroFramePrefix: string;
  heroFrameCount: number;
  heroHp: number;
  heroMaxHp: number;
  bossName: string;
  currentHp: number;
  maxHp: number;
  dimmed?: boolean;
}

// Décor : assets/Backgrounds/free-steampunk-cityscape-pixel-backgrounds (CraftPix, cf. ASSETS.md)
// Héros : assets/MC/Elementals_fire_knight_FREE_v1.1 (licence non documentée localement, cf. ASSETS.md)
// Boss : assets/Boss/Frost_Guardian_FREE_v1.0 (licence non documentée localement, cf. ASSETS.md)
export default function VersusScene({
  heroName,
  heroFramePrefix,
  heroFrameCount,
  heroHp,
  heroMaxHp,
  bossName,
  currentHp,
  maxHp,
  dimmed = false,
}: VersusSceneProps) {
  return (
    <div
      className="relative h-48 w-full overflow-hidden rounded-lg border border-border"
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
      <div className="absolute inset-x-0 top-0 z-[5] h-24 bg-gradient-to-b from-black/70 via-black/35 to-transparent" />
      <div className="absolute inset-x-0 top-0 z-10 flex items-start gap-2 p-2">
        <div className="flex-1">
          <HeroBar heroName={heroName} currentHp={heroHp} maxHp={heroMaxHp} />
        </div>
        <div className="flex flex-col items-center pt-1">
          <MidnightTimer />
        </div>
        <div className="flex-1">
          <BossBar bossName={bossName} currentHp={currentHp} maxHp={maxHp} />
        </div>
      </div>
      <IdleSprite
        framePrefix={heroFramePrefix}
        frameCount={heroFrameCount}
        alt={`Ton héros : ${heroName}`}
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
