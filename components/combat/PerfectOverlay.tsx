interface PerfectOverlayProps {
  bossName: string;
  onDismiss: () => void;
}

export default function PerfectOverlay({ bossName, onDismiss }: PerfectOverlayProps) {
  return (
    <div
      role="alertdialog"
      aria-label="Boss vaincu"
      onClick={onDismiss}
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-lg bg-[oklch(0.08_0_0_/_72%)] px-4 text-center"
    >
      <p className="font-display text-2xl uppercase tracking-wide text-hp">
        Victory !
      </p>
      <p className="max-w-[26ch] text-sm text-muted">
        {bossName} a mordu la poussière. La rue est calme pour ce soir…
      </p>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onDismiss();
        }}
        className="rounded-md border border-border px-4 py-2 font-display text-xs uppercase tracking-wide text-ink"
      >
        Continuer
      </button>
    </div>
  );
}
