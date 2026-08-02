"use client";

import type { CSSProperties } from "react";
import Image from "next/image";
import CharacterSprite, { type CharacterAnimState } from "./CharacterSprite";
import HeroBar from "./HeroBar";
import BossBar from "./BossBar";
import MidnightTimer from "./MidnightTimer";
import HeroVfx from "./HeroVfx";
import { heroSpriteMeta, bossSpriteMeta } from "@/lib/sprite-metadata";
import { isBossInDanger } from "@/lib/game-engine";

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
  // Issue #139 : titre équipé (lib/achievements.ts), affiché à côté du pseudo.
  heroTitle?: string;
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
  /** Frame de contact de l'attaque du Boss (deadline ratée / rage quit). */
  onBossImpact?: () => void;
  /** Fin de l'anim d'attaque du Héros : rejoue une attaque Boss en attente. */
  onHeroAttackEnd?: () => void;
}

// Décor + Boss dynamiques : le boss du jour et son décor cohérent sont tirés par
// resolveDailyBoss (cf. lib/bosses.ts, lib/backgrounds.ts, ASSETS.md).
// Héros : assets/MC/Elementals_* (licence non documentée localement, cf. ASSETS.md)
export default function VersusScene({
  heroName,
  heroLabel,
  heroTitle,
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
  onBossImpact,
  onHeroAttackEnd,
}: VersusSceneProps) {
  const heroMeta = heroSpriteMeta(heroSlug);
  const bossMeta = bossSpriteMeta(bossSlug);
  const bossDanger = isBossInDanger(currentHp, maxHp);

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
      {/* Issue #156 : grille explicite plutôt qu'un flex à trois `flex-1`.
          Les deux `1fr` DÉCLARENT l'égalité de largeur au lieu de la laisser
          émerger d'un calcul d'espace libre — et surtout, `min-w-0` ramène à 0
          le `min-width:auto` des colonnes latérales. Sans lui, le `truncate`
          (donc `white-space: nowrap`) du pseudo+titre de HeroBar fait remonter
          le plancher de la colonne héros à la largeur du texte ENTIER non
          tronqué, qui affame alors la colonne Boss. C'est la régression
          introduite par l'ajout du titre équipé (#139, PR #152). */}
      <div className="absolute inset-x-0 top-0 z-10 grid grid-cols-[1fr_auto_1fr] items-start gap-2 p-2">
        <div className="min-w-0">
          <HeroBar
            heroName={heroLabel ?? heroName}
            title={heroTitle}
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
        <div className="min-w-0">
          <BossBar bossName={bossName} currentHp={currentHp} maxHp={maxHp} danger={bossDanger} />
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
      {/* Issue #145 : héros/boss chacun de son côté, cohérent mobile/desktop
          — un conteneur flex à deux zones de 50 % plutôt que deux `absolute
          left-4`/`right-4` indépendants, dont la marge fixe occupait une
          fraction bien plus grande de l'espace disponible sur un conteneur
          étroit (mobile), "aspirant" les deux personnages vers le centre.
          Deux zones `flex-1 min-w-0` (pas un simple `justify-between`) :
          la boîte de recadrage d'un personnage (union alpha de toutes ses
          anims, cf. CLAUDE.md § Sprites de combat) est bien plus large que
          sa silhouette visible (marge transparente pour les anims d'attaque)
          — avec `justify-between` seul, cette boîte surdimensionnée du héros
          pousse littéralement le Boss hors du conteneur sur mobile. Chaque
          zone à 50 % fixe (indépendante du contenu grâce à `min-w-0`) laisse
          le débordement rester local à son propre côté, sans déplacer
          l'autre personnage — même comportement que l'ancien positionnement
          absolu, réparti proportionnellement au lieu d'une marge fixe. */}
      <div className="absolute inset-x-0 bottom-2 z-[6] flex items-end px-4">
        {/* Recul à l'impact : `key` sur le stateKey pour rejouer l'animation à
            chaque coup encaissé. Le recul est sur ce wrapper, distinct du
            `transform: translateY(...)` propre à CharacterSprite (sinon les
            deux transforms se remplaceraient). */}
        <div className="flex min-w-0 flex-1 justify-start">
          <div
            key={`hero-wrap-${heroStateKey}`}
            className={heroState === "hurt" ? "is-knockback" : ""}
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
              onStateEnd={onHeroAttackEnd}
              alt={`Ton héros : ${heroName}`}
              className="[image-rendering:pixelated] drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)]"
            />
          </div>
        </div>
        <div className="flex min-w-0 flex-1 justify-end">
          <div
            key={`boss-wrap-${bossStateKey}`}
            className={bossState === "hurt" ? "is-knockback" : ""}
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
              danger={bossDanger}
              flip={bossFlip}
              onImpact={onBossImpact}
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
      </div>
    </div>
  );
}
