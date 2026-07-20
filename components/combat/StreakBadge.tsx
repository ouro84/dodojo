import type { StreakState } from "@/lib/game-engine";

// US-12 : compteur de série + alerte « en danger » (jokers de la semaine épuisés).
export default function StreakBadge({ state }: { state: StreakState }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="font-display text-sm text-gold">
        🔥 Série : {state.length}
      </span>
      {state.atRisk && state.length > 0 && (
        <span className="text-xs text-alert" role="status">
          ⚠️ En danger — jokers de la semaine épuisés
        </span>
      )}
    </div>
  );
}
