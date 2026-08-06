"use client";

import { useState } from "react";
import { usePopoverDismiss } from "@/hooks/usePopoverDismiss";

interface BossBarProps {
  bossName: string;
  currentHp: number;
  maxHp: number;
  /** Sous 25% des HP (cf. isBossInDanger) : jauge clignotante, tension de fin de combat. */
  danger?: boolean;
  /** Issue #159 : contenu du dialog de détail. */
  completedCount: number;
  xpEarned: number;
}

export default function BossBar({
  bossName,
  currentHp,
  maxHp,
  danger = false,
  completedCount,
  xpEarned,
}: BossBarProps) {
  const pct = maxHp > 0 ? Math.max(0, Math.min(100, (currentHp / maxHp) * 100)) : 0;
  const { isOpen, setIsOpen, containerRef } = usePopoverDismiss();
  // Incrémenté à chaque ouverture : `key` sur le chiffre HP pour rejouer le
  // pulse CSS à chaque clic, même si le contenu affiché n'a pas changé.
  const [openSeq, setOpenSeq] = useState(0);

  const bar = (
    <div
      role="progressbar"
      aria-valuenow={currentHp}
      aria-valuemin={0}
      aria-valuemax={maxHp}
      aria-label={`Vie du Boss : ${currentHp} sur ${maxHp}`}
      className={`relative h-3.5 overflow-hidden rounded-sm bg-hp-dim ${danger ? "boss-danger-blink" : ""}`}
    >
      {/* Chip damage : la couche fantôme descend en retard sur la barre réelle.
          L'écart entre les deux donne l'ampleur du coup — signature visuelle des
          jeux de combat. Décorative : aria-hidden, la valeur reste sur le parent. */}
      <div
        aria-hidden="true"
        className="absolute inset-y-0 left-0 bg-white/40 transition-[width] delay-200 duration-500 ease-out motion-reduce:transition-none"
        style={{ width: `${pct}%` }}
      />
      <div
        className="absolute inset-y-0 left-0 bg-hp transition-[width] duration-100 ease-out motion-reduce:transition-none"
        style={{ width: `${pct}%` }}
      />
    </div>
  );

  const footer = (
    <div className="flex items-center justify-between gap-2 font-display text-sm uppercase tracking-wide text-ink drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
      <span className="shrink-0 font-hud text-xs tabular-nums text-muted">
        {currentHp}/{maxHp} HP
      </span>
      {/* Issue #156 : sans truncate, « MINOTAURE ANCESTRAL » revenait à la
          ligne puis se faisait couper net au bord du conteneur. */}
      <span className="min-w-0 truncate" title={bossName}>
        {bossName}
      </span>
    </div>
  );

  return (
    <div ref={containerRef} className="relative flex flex-col gap-1">
      {isOpen && (
        <div
          role="dialog"
          aria-label={`Détail du Boss ${bossName}`}
          // Ancrage à droite (miroir de HeroBar, ancré à gauche) : BossBar vit
          // dans la colonne droite de VersusScene, un ancrage left-0 déborderait
          // hors du viewport sur mobile.
          className="absolute right-0 top-full z-20 mt-2 w-56 max-w-[calc(100vw-2rem)] rounded-md border border-border bg-surface px-3 py-2 text-xs"
        >
          <div className="flex items-center justify-between border-b border-border pb-1 text-ink">
            <span className="font-display uppercase tracking-wide">{bossName}</span>
            <span key={openSeq} className="hp-scan-pulse font-hud tabular-nums text-muted">
              {currentHp}/{maxHp}
            </span>
          </div>

          <dl className="py-1 text-muted">
            <div className="flex items-center justify-between py-0.5">
              <dt>Tâches validées aujourd&apos;hui</dt>
              <dd className="font-hud tabular-nums text-ink">{completedCount}</dd>
            </div>
            <div className="flex items-center justify-between py-0.5">
              <dt>XP gagnée aujourd&apos;hui</dt>
              <dd className="font-hud tabular-nums text-ink">+{xpEarned}</dd>
            </div>
          </dl>
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          setIsOpen((v) => !v);
          setOpenSeq((n) => n + 1);
        }}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={bossName}
        className="flex flex-col gap-1 rounded text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-hp/20"
      >
        {bar}
        {footer}
      </button>
    </div>
  );
}
