"use client";

import { useEffect, useRef, useState } from "react";

type VsPhase = "portraits" | "vs" | "fight";

interface VsIntroOverlayProps {
  heroBustSrc: string;
  bossBustSrc: string;
  bossName: string;
  isFirstEncounter: boolean;
  stakesLine: string | null;
  onDone: () => void;
}

// Issue #135 : séquence purement décorative, jamais bloquante (cf. spec).
// Ne connaît rien de la persistance/gating (localStorage, prefers-reduced-motion,
// Le Réveil) — Arena.tsx décide seul quand monter ce composant.
export default function VsIntroOverlay({
  heroBustSrc,
  bossBustSrc,
  bossName,
  isFirstEncounter,
  stakesLine,
  onDone,
}: VsIntroOverlayProps) {
  const [phase, setPhase] = useState<VsPhase>("portraits");
  const [fading, setFading] = useState(false);
  const [flash, setFlash] = useState(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const firedRef = useRef(false);

  function finish() {
    if (firedRef.current) return;
    firedRef.current = true;
    doneRef.current();
  }

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase("vs"), 450),
      setTimeout(() => setPhase("fight"), 1600),
      setTimeout(() => setFading(true), 2500),
      setTimeout(finish, 3000),
      // Garde-fou : démontage forcé à 5s même si le déroulé scripté a été
      // perturbé (`firedRef` empêche un double appel si les deux tirent).
      setTimeout(finish, 5000),
    ];
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function dismissEarly() {
      if (firedRef.current) return;
      setFading(true);
      setFlash(true);
      setTimeout(finish, 200);
    }
    window.addEventListener("pointerdown", dismissEarly, { capture: true });
    window.addEventListener("keydown", dismissEarly, { capture: true });
    window.addEventListener("focusin", dismissEarly, { capture: true });
    return () => {
      window.removeEventListener("pointerdown", dismissEarly, { capture: true });
      window.removeEventListener("keydown", dismissEarly, { capture: true });
      window.removeEventListener("focusin", dismissEarly, { capture: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      data-testid="vs-intro-overlay"
      className={`pointer-events-none fixed inset-0 z-50 flex items-center justify-center transition-opacity ${
        fading ? "opacity-0" : "opacity-100"
      } ${flash ? "white-flash" : ""}`}
      style={{ transitionDuration: flash ? "200ms" : "500ms" }}
    >
      {phase !== "fight" && (
        <>
          <img
            src={heroBustSrc}
            alt=""
            className="vs-slide-in-left absolute left-4 w-[38vw] max-w-[220px] [image-rendering:pixelated]"
          />
          <img
            src={bossBustSrc}
            alt=""
            className="vs-slide-in-right absolute right-4 w-[38vw] max-w-[220px] [image-rendering:pixelated]"
          />
        </>
      )}
      {phase === "vs" && (
        <div className="flex flex-col items-center gap-1 text-center">
          <span className="ko-burst font-display text-5xl uppercase text-ink">VS</span>
          {isFirstEncounter && (
            <span className="text-xs uppercase tracking-wide text-muted">
              PREMIÈRE RENCONTRE
            </span>
          )}
          {stakesLine && (
            <span className="max-w-[24ch] text-xs text-muted">{stakesLine}</span>
          )}
        </div>
      )}
      {phase === "fight" && (
        <span className="ko-burst font-display text-6xl uppercase text-ink">FIGHT!</span>
      )}
      <span className="sr-only">Combat contre {bossName}</span>
    </div>
  );
}
