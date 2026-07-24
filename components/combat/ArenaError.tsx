import Link from "next/link";
import type { AggressivityLevel } from "@/types";
import { technicalErrorLine } from "@/lib/copy/errors";

interface ArenaErrorProps {
  aggressivityLevel?: AggressivityLevel;
}

// Niveau `direct` par défaut : utilisé quand le profil lui-même n'a pas pu
// être chargé (aucun aggressivity_level disponible à ce stade).
export default function ArenaError({ aggressivityLevel = "direct" }: ArenaErrorProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center">
      <div
        role="alert"
        className="w-full max-w-xs rounded-md border border-alert bg-surface px-3 py-2 text-sm text-alert"
      >
        {technicalErrorLine(aggressivityLevel)}
      </div>
      <Link
        href="/"
        className="rounded-md bg-alert px-4 py-2 font-display text-xs uppercase tracking-wide text-alert-ink"
      >
        Réessayer
      </Link>
    </div>
  );
}
