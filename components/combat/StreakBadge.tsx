import Link from "next/link";
import type { StreakState } from "@/lib/game-engine";

// US-12 : compteur de série + alerte « en danger » (jokers de la semaine épuisés).
// Renvoie vers l'article « Séries & jokers » du Guide (issue #68).
export default function StreakBadge({ state }: { state: StreakState }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <Link
        href="/guide/streak"
        className="font-display text-sm text-gold underline-offset-4 hover:underline"
        aria-label="Série — voir le Manuel"
      >
        🔥 Série : {state.length}
      </Link>
      {state.atRisk && state.length > 0 && (
        <span className="text-xs text-alert" role="status">
          ⚠️ En danger — jokers de la semaine épuisés
        </span>
      )}
    </div>
  );
}
