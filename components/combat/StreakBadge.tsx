import Link from "next/link";
import type { StreakState } from "@/lib/game-engine";
import GameIcon from "@/components/ui/GameIcon";

// US-12 : compteur de série + alerte « en danger » (jokers de la semaine épuisés).
// Renvoie vers l'article « Séries & jokers » du Guide (issue #68).
export default function StreakBadge({ state }: { state: StreakState }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <Link
        href="/guide/streak"
        className="inline-flex items-center gap-1.5 font-display text-sm text-gold underline-offset-4 hover:underline"
        aria-label="Série — voir le Guide"
      >
        <GameIcon name="streak" className="h-4 w-4" /> Série : {state.length}
      </Link>
      {state.atRisk && state.length > 0 && (
        <span className="inline-flex items-center gap-1.5 text-xs text-alert" role="status">
          <GameIcon name="warning" className="h-3.5 w-3.5" /> En danger — jokers de la semaine
          épuisés
        </span>
      )}
    </div>
  );
}
