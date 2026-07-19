interface HeroBarProps {
  heroName: string;
  currentHp: number;
  maxHp: number;
}

export default function HeroBar({ heroName, currentHp, maxHp }: HeroBarProps) {
  const pct = maxHp > 0 ? Math.max(0, Math.min(100, (currentHp / maxHp) * 100)) : 0;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between font-display text-sm uppercase tracking-wide text-ink">
        <span className="font-hud text-xs tabular-nums text-muted">
          {currentHp}/{maxHp} HP
        </span>
        <span>{heroName}</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={currentHp}
        aria-valuemin={0}
        aria-valuemax={maxHp}
        aria-label={`Vie du héros : ${currentHp} sur ${maxHp}`}
        className="h-3.5 overflow-hidden rounded-sm bg-hp-dim"
      >
        <div
          className="ml-auto h-full bg-hp transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
