"use client";

import { useEffect, useRef, useState } from "react";

interface PenaltiesBreakdown {
  overdueCount: number;
  overdueHpPerItem: number;
  missedCount: number;
  missedHpPerItem: number;
}

interface HeroBarProps {
  heroName: string;
  currentHp: number;
  maxHp: number;
  alarm?: boolean;
  // A2 : breakdown optionnel des pénalités en cours. Si absent, le
  // comportement de HeroBar est inchangé (pas de popover, pas de bouton).
  // Si fourni (cas Arena), la jauge devient tappable et ouvre un popover
  // de transparence du calcul (issue #101, Axe A).
  penaltiesBreakdown?: PenaltiesBreakdown | null;
}

export default function HeroBar({
  heroName,
  currentHp,
  maxHp,
  alarm = false,
  penaltiesBreakdown,
}: HeroBarProps) {
  const pct = maxHp > 0 ? Math.max(0, Math.min(100, (currentHp / maxHp) * 100)) : 0;
  const hasPopover = penaltiesBreakdown !== undefined && penaltiesBreakdown !== null;
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fermeture au clic extérieur et au clavier Echap. Pas modal : l'Arène
  // reste interactive (on détaille juste le calcul, on ne bloque pas).
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const bar = (
    <div
      role="progressbar"
      aria-valuenow={currentHp}
      aria-valuemin={0}
      aria-valuemax={maxHp}
      aria-label={`Vie du héros : ${currentHp} sur ${maxHp}`}
      className={`h-3.5 overflow-hidden rounded-sm bg-hp-dim ${alarm ? "hero-alarm" : ""}`}
    >
      <div
        className="ml-auto h-full bg-hp transition-[width] duration-300 ease-out motion-reduce:transition-none"
        style={{ width: `${pct}%` }}
      />
    </div>
  );

  const footer = (
    <div className="flex items-center justify-between font-display text-sm uppercase tracking-wide text-ink drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
      <span>{heroName}</span>
      <span className="font-hud text-xs tabular-nums text-muted">
        {currentHp}/{maxHp} HP
      </span>
    </div>
  );

  // Cas WakeUpRitual : pas de popover, rendu actuel inchangé.
  if (!hasPopover) {
    return (
      <div className="flex flex-col gap-1">
        {bar}
        {footer}
      </div>
    );
  }

  // Cas Arena : la jauge devient tappable, ouvre le popover de breakdown.
  const overdueCount = penaltiesBreakdown!.overdueCount;
  const overdueHpPerItem = penaltiesBreakdown!.overdueHpPerItem;
  const missedCount = penaltiesBreakdown!.missedCount;
  const missedHpPerItem = penaltiesBreakdown!.missedHpPerItem;
  const overdueTotal = overdueCount * overdueHpPerItem;
  const missedTotal = missedCount * missedHpPerItem;
  const noPenalty = overdueCount === 0 && missedCount === 0;
  const emptyHp = currentHp === 0;

  return (
    <div ref={containerRef} className="relative flex flex-col gap-1">
      {isOpen && (
        <div
          role="dialog"
          aria-label={`Détail des HP du héros ${heroName}`}
          className="absolute left-0 top-full z-20 mt-2 w-56 max-w-[calc(100vw-2rem)] rounded-md border border-border bg-surface px-3 py-2 text-xs"
        >
          <div className="flex items-center justify-between border-b border-border pb-1 text-ink">
            <span className="font-display uppercase tracking-wide">Tes HP</span>
            <span className="font-hud tabular-nums text-muted">
              {currentHp}/{maxHp}
            </span>
          </div>

          {noPenalty ? (
            <p className="py-2 text-center text-muted">
              Aucune pénalité — tu es prêt pour PERFECT
            </p>
          ) : (
            <dl className="py-1 text-muted">
              <div className="flex items-center justify-between py-0.5">
                <dt>Restes reportés</dt>
                <dd className="font-hud tabular-nums">
                  {overdueCount} × -{overdueHpPerItem}
                  <span className="ml-2 text-ink">-{overdueTotal}</span>
                </dd>
              </div>
              <div className="flex items-center justify-between py-0.5">
                <dt>Deadlines ratées</dt>
                <dd className="font-hud tabular-nums">
                  {missedCount} × -{missedHpPerItem}
                  <span className="ml-2 text-ink">-{missedTotal}</span>
                </dd>
              </div>
            </dl>
          )}

          <div className="mt-1 flex items-center justify-between border-t border-border pt-1">
            <span className="text-muted">Base</span>
            <span className="font-hud tabular-nums text-ink">+100</span>
          </div>
          <div className="flex items-center justify-between pt-0.5">
            <span className="font-display uppercase tracking-wide text-ink">Total</span>
            <span className="font-hud tabular-nums text-ink">
              {currentHp}/{maxHp}
            </span>
          </div>

          {emptyHp && (
            <p className="mt-1 rounded bg-alert/10 px-1.5 py-1 text-center text-alert">
              Ta jauge est vide — résous au moins une pénalité pour remonter
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className="flex flex-col gap-1 rounded text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-hp/20"
      >
        {bar}
        {footer}
      </button>
    </div>
  );
}
