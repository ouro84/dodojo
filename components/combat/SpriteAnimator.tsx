"use client";

import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";

interface SpriteAnimatorProps {
  sheetSrc: string;
  frames: number;
  tileW: number;
  tileH: number;
  /** Hauteur de rendu en px, déjà multipliée par renderScale par l'appelant. */
  renderedHeight: number;
  durationMs: number;
  loop: boolean;
  /** Change de valeur pour relancer l'animation à la frame 0. */
  animKey: string;
  flip?: boolean;
  /** Hit-stop : met l'animation CSS en pause sans la réinitialiser. */
  frozen?: boolean;
  impactFrame?: number | null;
  /** Durée de hit-stop à ajouter au timer de fin (l'anim CSS étant gelée). */
  extraDelayMs?: number;
  onImpact?: () => void;
  onEnd?: () => void;
  /** Rend une tuile fixe au lieu d'animer (reduced-motion, boss déjà mort). */
  staticFrame?: "first" | "last";
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
}

export default function SpriteAnimator({
  sheetSrc,
  frames,
  tileW,
  tileH,
  renderedHeight,
  durationMs,
  loop,
  animKey,
  flip = false,
  frozen = false,
  impactFrame = null,
  extraDelayMs = 0,
  onImpact,
  onEnd,
  staticFrame,
  className,
  style,
  ariaLabel,
}: SpriteAnimatorProps) {
  const onImpactRef = useRef(onImpact);
  const onEndRef = useRef(onEnd);
  // Toujours la dernière callback sans retrigger l'effet de timers ci-dessous
  // (qui ne doit rejouer que sur changement d'animKey/durée/etc.) — mutation
  // en effet, jamais pendant le rendu (react-hooks/refs).
  useEffect(() => {
    onImpactRef.current = onImpact;
    onEndRef.current = onEnd;
  });

  const renderedWidth = (renderedHeight * tileW) / tileH;
  const stripWidth = renderedWidth * frames;

  useEffect(() => {
    if (staticFrame) {
      // Pas d'animation : l'impact et la fin sont immédiats pour ne jamais
      // faire attendre un utilisateur en reduced-motion (cf. spec §9). Mêmes
      // gardes que la branche animée ci-dessous (impactFrame !== null / !loop)
      // — sans elles, n'importe quel remount d'un sprite idle (boucle, donc
      // sans impactFrame) rappelait onImpact/onEnd à tort. Pour le Boss, ça
      // rappelait onBossImpact hors de toute vraie attaque, remettant le
      // héros en "hurt" en boucle, sans jamais revenir à "idle" côté Arena
      // (issue #146 : anim "jouée en double").
      if (impactFrame !== null) onImpactRef.current?.();
      if (!loop) onEndRef.current?.();
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (impactFrame !== null && onImpactRef.current) {
      timers.push(
        setTimeout(() => onImpactRef.current?.(), (impactFrame / frames) * durationMs),
      );
    }
    if (!loop && onEndRef.current) {
      timers.push(setTimeout(() => onEndRef.current?.(), durationMs + extraDelayMs));
    }
    return () => timers.forEach(clearTimeout);
  }, [animKey, durationMs, extraDelayMs, frames, impactFrame, loop, staticFrame]);

  const staticX =
    staticFrame === "last" ? -(renderedWidth * (frames - 1)) : 0;

  return (
    <div
      // `animKey` en `key` React (pas seulement en dépendance d'effet) :
      // changer animation-duration/iteration-count sur un élément qui a déjà
      // une animation CSS en cours NE LA RELANCE PAS à 0 (animation-name reste
      // "sprite-run" à l'identique) — le navigateur continue avec le temps
      // écoulé actuel appliqué aux nouvelles valeurs, ce qui peut sauter
      // directement à la fin (frame invisible/transparente selon la feuille).
      // Un `key` différent force un nouveau nœud DOM, donc une animation
      // fraîche. Bug reproduit : idle -> attack restait invisible tant que
      // l'idle avait tourné assez longtemps avant le déclenchement.
      key={animKey}
      role="img"
      aria-label={ariaLabel}
      data-frames={frames}
      className={`${staticFrame ? "" : "sprite-run"} ${className ?? ""}`}
      style={{
        width: `${renderedWidth}px`,
        height: `${renderedHeight}px`,
        backgroundImage: `url(${sheetSrc})`,
        backgroundSize: `${stripWidth}px ${renderedHeight}px`,
        backgroundRepeat: "no-repeat",
        imageRendering: "pixelated",
        transform: flip ? "scaleX(-1)" : "scaleX(1)",
        ...(staticFrame
          ? { backgroundPositionX: `${staticX}px` }
          : {
              ["--sprite-end" as string]: `-${stripWidth}px`,
              animationName: "sprite-run",
              animationDuration: `${durationMs}ms`,
              animationTimingFunction: `steps(${frames})`,
              animationIterationCount: loop ? "infinite" : 1,
              animationFillMode: loop ? "none" : "forwards",
              animationPlayState: frozen ? "paused" : "running",
            }),
        ...style,
      }}
    />
  );
}
