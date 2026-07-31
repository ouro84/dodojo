"use client";

import type { CSSProperties } from "react";
import Image from "next/image";
import CharacterSprite, { type CharacterAnimState } from "./CharacterSprite";
import HeroBar from "./HeroBar";
import BossBar from "./BossBar";
import MidnightTimer from "./MidnightTimer";
import HeroVfx from "./HeroVfx";
import { heroSpriteMeta, bossSpriteMeta } from "@/lib/sprite-metadata";

// A2 (issue #101) : breakdown des pénalités Héros propagé depuis Arena
// jusqu'à HeroBar. Type en miroir de HeroBar.tsx (garder les deux alignés).
interface HeroPenaltiesBreakdown {
  overdueCount: number;
  overdueHpPerItem: number;
  missedCount: number;
  missedHpPerItem: number;
}

interface VersusSceneProps {
  heroName: string;
  heroLabel?: string;
  heroSpriteBase: string;
  heroSlug: string;
  heroHp: number;
  heroMaxHp: number;
  heroAlarm?: boolean;
  heroPenaltiesBreakdown?: HeroPenaltiesBreakdown | null;
  bossName: string;
  bossSpriteBase: string;
  bossSlug: string;
  bossFlip: boolean;
  backgroundPath: string;
  currentHp: number;
  maxHp: number;
  upcomingDeadlineCount?: number;
  dimmed?: boolean;
  /** VFX d'impact du héros équipé, joué sur le Boss (issue #48). */
  vfxVariant?: string | null;
  reducedMotion?: boolean;
  heroState?: CharacterAnimState;
  heroAttackAnim?: string;
  heroStateKey?: number;
  bossState?: CharacterAnimState;
  bossStateKey?: number;
  /** Hit-stop : gèle les deux sprites sans réinitialiser l'anim CSS. */
  frozen?: boolean;
  /** minotaur : pack sans hurt ni death (cf. lib/bosses.ts). */
  bossFallbackHurtDeath?: boolean;
}

// Décor + Boss dynamiques : le boss du jour et son décor cohérent sont tirés par
// resolveDailyBoss (cf. lib/bosses.ts, lib/backgrounds.ts, ASSETS.md).
// Héros : assets/MC/Elementals_* (licence non documentée localement, cf. ASSETS.md)
export default function VersusScene({
  heroName,
  heroLabel,
  heroSpriteBase,
  heroSlug,
  heroHp,
  heroMaxHp,
  heroAlarm = false,
  heroPenaltiesBreakdown = undefined,
  bossName,
  bossSpriteBase,
  bossSlug,
  bossFlip,
  backgroundPath,
  currentHp,
  maxHp,
  upcomingDeadlineCount = 0,
  dimmed = false,
  vfxVariant = null,
  reducedMotion = false,
  heroState = "idle",
  heroAttackAnim,
  heroStateKey = 0,
  bossState = "idle",
  bossStateKey = 0,
  frozen = false,
  bossFallbackHurtDeath = false,
}: VersusSceneProps) {
  const heroMeta = heroSpriteMeta(heroSlug);
  const bossMeta = bossSpriteMeta(bossSlug);

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
          <HeroBar
            heroName={heroLabel ?? heroName}
            currentHp={heroHp}
            maxHp={heroMaxHp}
            alarm={heroAlarm}
            // A2 : passe le breakdown si fourni par Arena. undefined = pas
            // de popover (comportement WakeUpRitual, mais ici VersusScene
            // n'est jamais monté hors Arena). On normalise null→undefined
            // pour conserver l'absence de popover sur valeur null.
            penaltiesBreakdown={
              heroPenaltiesBreakdown === null ? undefined : heroPenaltiesBreakdown
            }
          />
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
      {/* Recul à l'impact : `key` sur le stateKey pour rejouer l'animation à
          chaque coup encaissé. Le recul est sur ce wrapper, distinct du
          `transform: translateY(...)` propre à CharacterSprite (sinon les
          deux transforms se remplaceraient). */}
      <div
        key={`hero-wrap-${heroStateKey}`}
        className={`absolute bottom-2 left-4 ${heroState === "hurt" ? "is-knockback" : ""}`}
        style={heroState === "hurt" ? ({ "--knockback-x": "-6px" } as CSSProperties) : undefined}
      >
        <CharacterSprite
          spriteBase={heroSpriteBase}
          meta={heroMeta}
          baseHeight={88}
          state={heroState}
          attackAnim={heroAttackAnim}
          stateKey={heroStateKey}
          frozen={frozen}
          reducedMotion={reducedMotion}
          alt={`Ton héros : ${heroName}`}
          className="[image-rendering:pixelated] drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)]"
        />
      </div>
      <div
        key={`boss-wrap-${bossStateKey}`}
        className={`absolute bottom-2 right-4 ${bossState === "hurt" ? "is-knockback" : ""}`}
        style={bossState === "hurt" ? ({ "--knockback-x": "6px" } as CSSProperties) : undefined}
      >
        <CharacterSprite
          spriteBase={bossSpriteBase}
          meta={bossMeta}
          baseHeight={96}
          state={bossState}
          stateKey={bossStateKey}
          frozen={frozen}
          fallbackHurtDeath={bossFallbackHurtDeath}
          reducedMotion={reducedMotion}
          flip={bossFlip}
          alt={`Le Boss du jour : ${bossName}`}
          className="[image-rendering:pixelated] drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)]"
        />
        {vfxVariant && (
          <HeroVfx
            heroSlug={heroSlug}
            variant={vfxVariant}
            bossHeight={96 * bossMeta.renderScale}
            reducedMotion={reducedMotion}
          />
        )}
      </div>
    </div>
  );
}
