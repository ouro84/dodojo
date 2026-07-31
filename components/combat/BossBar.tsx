interface BossBarProps {
  bossName: string;
  currentHp: number;
  maxHp: number;
}

export default function BossBar({ bossName, currentHp, maxHp }: BossBarProps) {
  const pct = maxHp > 0 ? Math.max(0, Math.min(100, (currentHp / maxHp) * 100)) : 0;

  return (
    <div className="flex flex-col gap-1">
      <div
        role="progressbar"
        aria-valuenow={currentHp}
        aria-valuemin={0}
        aria-valuemax={maxHp}
        aria-label={`Vie du Boss : ${currentHp} sur ${maxHp}`}
        className="relative h-3.5 overflow-hidden rounded-sm bg-hp-dim"
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
      <div className="flex items-center justify-between font-display text-sm uppercase tracking-wide text-ink drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
        <span className="font-hud text-xs tabular-nums text-muted">
          {currentHp}/{maxHp} HP
        </span>
        <span>{bossName}</span>
      </div>
    </div>
  );
}
