"use client";

import { useState } from "react";
import type { DayOutcome } from "@/types";

export interface JournalEntry {
  day_date: string;
  outcome: DayOutcome;
  damage_dealt: number;
  gold_earned: number;
}

interface CombatJournalProps {
  entries: JournalEntry[]; // déjà triées (plus récent d'abord)
  pageSize?: number;
}

const OUTCOME_LABEL: Record<DayOutcome, { icon: string; label: string; className: string }> = {
  victory: { icon: "✓", label: "Victoire", className: "text-hp" },
  retreat: { icon: "↩", label: "Retraite", className: "text-gold" },
  defeat: { icon: "✗", label: "Défaite", className: "text-alert" },
};

function formatDay(day: string): string {
  // day = YYYY-MM-DD (déjà local) → JJ/MM.
  const [, month, dd] = day.split("-");
  return `${dd}/${month}`;
}

// US-10 (D5/B3) : journal paginé côté client sur un lot borné déjà chargé.
export default function CombatJournal({ entries, pageSize = 10 }: CombatJournalProps) {
  const [visible, setVisible] = useState(pageSize);
  const shown = entries.slice(0, visible);
  const hasMore = visible < entries.length;

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1.5">
        {shown.map((entry) => {
          const o = OUTCOME_LABEL[entry.outcome];
          return (
            <li
              key={entry.day_date}
              className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs"
            >
              <span className="w-12 shrink-0 text-muted">{formatDay(entry.day_date)}</span>
              <span className={`shrink-0 font-display ${o.className}`} title={o.label}>
                {o.icon}
              </span>
              <span className="flex-1 text-right text-ink">{entry.damage_dealt} dégâts</span>
              <span className="w-14 shrink-0 text-right text-gold">+{entry.gold_earned} or</span>
            </li>
          );
        })}
      </ul>
      {hasMore && (
        <button
          type="button"
          onClick={() => setVisible((v) => v + pageSize)}
          className="self-center rounded-md border border-border px-4 py-1.5 text-xs text-muted hover:text-ink"
        >
          Charger plus
        </button>
      )}
    </div>
  );
}
