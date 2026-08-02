"use client";

import { useEffect, useState } from "react";
import SpriteAnimator from "./SpriteAnimator";
import type { CharacterSpriteMeta } from "@/lib/sprite-metadata";
import {
  ATTACK_DURATION_MS,
  DEATH_DURATION_MS,
  HURT_DURATION_MS,
  IDLE_FRAME_MS,
  SP_ATTACK_DURATION_MS,
} from "@/lib/combat-animation";

export type CharacterAnimState = "idle" | "attack" | "hurt" | "death";

interface CharacterSpriteProps {
  spriteBase: string;
  meta: CharacterSpriteMeta;
  /** Hauteur historique du site de rendu (88 Arène héros, 96 boss, 112 boutique). */
  baseHeight: number;
  state: CharacterAnimState;
  /** Nom de feuille pour state="attack" : atk1/atk2/atk3/sp_atk côté héros, attack côté boss. */
  attackAnim?: string;
  stateKey?: number;
  alt: string;
  flip?: boolean;
  frozen?: boolean;
  extraDelayMs?: number;
  danger?: boolean;
  /** Écran de calage (RosterPreview) : ralentit l'anim sans changer impactFrame. */
  speedMultiplier?: number;
  reducedMotion?: boolean;
  onImpact?: () => void;
  onStateEnd?: () => void;
  className?: string;
}

function animNameFor(state: CharacterAnimState, attackAnim: string | undefined): string {
  if (state === "attack") return attackAnim ?? "attack";
  return state;
}

function durationFor(animName: string, frames: number): number {
  if (animName === "idle") return frames * IDLE_FRAME_MS;
  if (animName === "sp_atk") return SP_ATTACK_DURATION_MS;
  if (animName === "hurt" || animName === "take_hit") return HURT_DURATION_MS;
  if (animName === "death") return DEATH_DURATION_MS;
  return ATTACK_DURATION_MS;
}

export default function CharacterSprite({
  spriteBase,
  meta,
  baseHeight,
  state,
  attackAnim,
  stateKey = 0,
  alt,
  flip = false,
  frozen = false,
  extraDelayMs = 0,
  danger = false,
  speedMultiplier = 1,
  reducedMotion = false,
  onImpact,
  onStateEnd,
  className,
}: CharacterSpriteProps) {
  // État réellement rendu : `state` demandé, ramené à "idle" quand une anim
  // non bouclée s'achève. `death` ne revient jamais à idle de lui-même.
  // Ajustement pendant le rendu (patron React officiel pour dériver un state
  // d'un changement de props) plutôt qu'un useEffect : évite un aller-retour
  // de rendu supplémentaire et satisfait react-hooks/set-state-in-effect.
  const [rendered, setRendered] = useState<CharacterAnimState>(state);
  const [prevState, setPrevState] = useState(state);
  const [prevStateKey, setPrevStateKey] = useState(stateKey);
  if (state !== prevState || stateKey !== prevStateKey) {
    setPrevState(state);
    setPrevStateKey(stateKey);
    setRendered(state);
  }

  const requested = animNameFor(rendered, attackAnim);
  // Alias "hurt" -> "take_hit" : les héros nomment leur anim d'encaissement
  // "take_hit" (cf. HERO_ANIM_PATTERNS, scripts/build-sprite-sheets.mjs), les
  // boss "hurt". Sans cet alias, state="hurt" sur un héros ne trouverait
  // jamais son anim et retomberait silencieusement sur l'idle.
  const resolvedRequested =
    meta.anims[requested] !== undefined
      ? requested
      : requested === "hurt" && meta.anims.take_hit !== undefined
        ? "take_hit"
        : requested;
  const available = meta.anims[resolvedRequested] !== undefined;
  const animName = available ? resolvedRequested : "idle";
  const anim = meta.anims[animName];

  // Fallback (minotaur) : l'anim demandée n'existe pas, on joue l'idle bouclé,
  // donc `onEnd` de SpriteAnimator ne se déclenchera jamais. Sans ce retour
  // programmé, l'état resterait bloqué sur "hurt" indéfiniment.
  useEffect(() => {
    if (available || rendered === "idle" || rendered === "death") return;
    const timer = setTimeout(() => setRendered("idle"), HURT_DURATION_MS);
    return () => clearTimeout(timer);
  }, [available, rendered, stateKey]);

  const renderedHeight = baseHeight * meta.renderScale;
  const loop = animName === "idle";
  const duration =
    durationFor(animName, anim.frames) * (danger && loop ? 1.3 : 1) * (1 / speedMultiplier);
  // Arrondi à 2 décimales : l'arithmétique flottante brute (ex. 0.1 * 132)
  // produit des valeurs comme 13.200000000000001, imperceptible à l'écran
  // mais qui casse toute comparaison de style exacte (tests, snapshots).
  const groundOffsetPx = Math.round(meta.groundOffset * renderedHeight * 100) / 100;

  return (
    <div
      data-testid="character-sprite"
      data-anim-state={rendered}
      data-anim-fallback={available ? undefined : "true"}
      // `relative` obligatoire : le flash de fallback est en absolute inset-0.
      className={`relative ${className ?? ""}`}
      style={{
        transform: `translateY(${groundOffsetPx}px)`,
        filter: danger ? "saturate(1.15) brightness(0.92)" : undefined,
      }}
    >
      {/* Issue #156 : nœud dédié au flash blanc, dérivé de `rendered` (l'état
          interne auto-corrigé) et non de la prop `state` reçue du parent —
          celle-ci (heroAnim/bossAnim côté Arena) ne repasse pas forcément à
          "idle" toute seule (cf. issue #149/#156, corrigé côté Arena par
          nextAnimStateAfterEnd), alors que `rendered` s'y remet toujours via
          `onEnd` ci-dessous. Il ne peut pas vivre sur le parent, qui porte
          déjà un `filter` inline conditionnel (danger) — l'animation CSS
          l'écraserait silencieusement. */}
      <div
        data-testid="character-flash"
        className={rendered === "hurt" && !reducedMotion ? "white-flash" : ""}
        key={stateKey}
      >
        <SpriteAnimator
          sheetSrc={`${spriteBase}/anim/${animName}.png`}
          frames={anim.frames}
          tileW={meta.tileW}
          tileH={meta.tileH}
          renderedHeight={renderedHeight}
          durationMs={duration}
          loop={loop}
          animKey={`${animName}-${stateKey}`}
          flip={flip}
          frozen={frozen}
          extraDelayMs={extraDelayMs}
          impactFrame={anim.impactFrame}
          ariaLabel={alt}
          staticFrame={
            reducedMotion ? (rendered === "death" ? "last" : "first") : undefined
          }
          onImpact={onImpact}
          onEnd={() => {
            if (rendered !== "death") setRendered("idle");
            onStateEnd?.();
          }}
        />
      </div>
    </div>
  );
}
