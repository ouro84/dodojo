"use client";

import { usePopoverDismiss } from "@/hooks/usePopoverDismiss";

interface PenaltiesBreakdown {
  overdueCount: number;
  overdueHpPerItem: number;
  missedCount: number;
  missedHpPerItem: number;
}

interface HeroBarProps {
  heroName: string;
  // Issue #139 : titre équipé (lib/achievements.ts), affiché "Pseudo - Titre".
  // Absent/vide = rien après le pseudo (aucun titre débloqué).
  title?: string;
  currentHp: number;
  maxHp: number;
  alarm?: boolean;
  // A2 : breakdown optionnel des pénalités en cours. Si absent, le
  // comportement de HeroBar est inchangé (pas de popover, pas de bouton).
  // Si fourni (cas Arena), la jauge devient tappable et ouvre un popover
  // de transparence du calcul (issue #101, Axe A).
  penaltiesBreakdown?: PenaltiesBreakdown | null;
  /** Issue #159 : XP restant avant le niveau suivant, affiché dans le dialog. */
  xpToNextLevel?: number;
}

export default function HeroBar({
  heroName,
  title,
  currentHp,
  maxHp,
  alarm = false,
  penaltiesBreakdown,
  xpToNextLevel,
}: HeroBarProps) {
  const pct = maxHp > 0 ? Math.max(0, Math.min(100, (currentHp / maxHp) * 100)) : 0;
  const hasPopover = penaltiesBreakdown !== undefined && penaltiesBreakdown !== null;
  const { isOpen, setIsOpen, containerRef } = usePopoverDismiss();

  const bar = (
    <div
      role="progressbar"
      aria-valuenow={currentHp}
      aria-valuemin={0}
      aria-valuemax={maxHp}
      aria-label={`Vie du héros : ${currentHp} sur ${maxHp}`}
      className={`relative h-3.5 overflow-hidden rounded-sm bg-hp-dim ${alarm ? "hero-alarm" : ""}`}
    >
      {/* Chip damage : voir BossBar pour l'explication. Ancré à droite (comme
          la barre elle-même, cf. ml-auto ci-dessous) : le héros se lit de
          droite à gauche dans l'Arène. */}
      <div
        aria-hidden="true"
        className="absolute inset-y-0 right-0 bg-white/40 transition-[width] delay-200 duration-500 ease-out motion-reduce:transition-none"
        style={{ width: `${pct}%` }}
      />
      <div
        className="absolute inset-y-0 right-0 bg-hp transition-[width] duration-100 ease-out motion-reduce:transition-none"
        style={{ width: `${pct}%` }}
      />
    </div>
  );

  const footer = (
    <div className="flex items-center justify-between gap-2 font-display text-sm uppercase tracking-wide text-ink drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
      <span
        className="min-w-0 truncate"
        title={title ? `${heroName} - ${title}` : undefined}
      >
        {heroName}
        {title && <span className="text-muted"> - {title}</span>}
      </span>
      <span className="shrink-0 font-hud text-xs tabular-nums text-muted">
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

          {title && (
            <p className="pt-1 text-muted">
              Titre équipé : <span className="text-ink">{title}</span>
            </p>
          )}
          {xpToNextLevel !== undefined && (
            <p className="py-0.5 text-muted">
              XP jusqu&apos;au niveau suivant :{" "}
              <span className="font-hud tabular-nums text-ink">{xpToNextLevel}</span>
            </p>
          )}

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
        className="flex flex-col gap-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hp"
      >
        {bar}
        {footer}
      </button>
    </div>
  );
}
