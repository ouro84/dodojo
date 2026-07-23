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
  heroAlarm?: boolean;
  bossName: string;
  bossFramePrefix: string;
  bossFrameCount: number;
  bossFlip: boolean;
  backgroundPath: string;
  currentHp: number;
  maxHp: number;
  upcomingDeadlineCount?: number;
  dimmed?: boolean;
}

// Décor + Boss dynamiques : le boss du jour et son décor cohérent sont tirés par
// resolveDailyBoss (cf. lib/bosses.ts, lib/backgrounds.ts, ASSETS.md).
// Héros : assets/MC/Elementals_* (licence non documentée localement, cf. ASSETS.md)
export default function VersusScene({
  heroName,
  heroFramePrefix,
  heroFrameCount,
  heroHp,
  heroMaxHp,
  heroAlarm = false,
  bossName,
  bossFramePrefix,
  bossFrameCount,
  bossFlip,
  backgroundPath,
  currentHp,
  maxHp,
  upcomingDeadlineCount = 0,
  dimmed = false,
}: VersusSceneProps) {
  return (
    <div
      className="relative h-48 w-full overflow-hidden rounded-lg border border-border"
      style={dimmed ? { filter: "saturate(0.5) brightness(0.7)" } : undefined}
    >
      <Image
        src={backgroundPath}
        alt=""
        fill
        sizes="336px"
        priority
        className="object-cover [image-rendering:pixelated]"
      />
      <div className="absolute inset-x-0 top-0 z-[5] h-24 bg-gradient-to-b from-black/70 via-black/35 to-transparent" />
      <div className="absolute inset-x-0 top-0 z-10 flex items-start gap-2 p-2">
        <div className="flex-1">
          <HeroBar heroName={heroName} currentHp={heroHp} maxHp={heroMaxHp} alarm={heroAlarm} />
        </div>
        <div className="flex flex-col items-center pt-1">
          <MidnightTimer />
        </div>
        <div className="flex-1">
          <BossBar bossName={bossName} currentHp={currentHp} maxHp={maxHp} />
          {upcomingDeadlineCount > 0 && (
            <p
              className="mt-0.5 text-right text-[0.65rem] uppercase tracking-wide text-alert drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
              aria-label={`${upcomingDeadlineCount} deadline${upcomingDeadlineCount > 1 ? "s" : ""} à venir aujourd'hui`}
            >
              ⏰ {upcomingDeadlineCount} à venir
            </p>
          )}
        </div>
      </div>
      <IdleSprite
        framePrefix={heroFramePrefix}
        frameCount={heroFrameCount}
        alt={`Ton héros : ${heroName}`}
        className="absolute bottom-2 left-4 h-28 w-auto [image-rendering:pixelated] drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)]"
      />
      <IdleSprite
        framePrefix={bossFramePrefix}
        frameCount={bossFrameCount}
        flip={bossFlip}
        alt={`Le Boss du jour : ${bossName}`}
        className="absolute bottom-2 right-4 h-28 w-auto [image-rendering:pixelated] drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)]"
      />
    </div>
  );
}
