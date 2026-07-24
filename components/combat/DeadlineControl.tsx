"use client";

import { useRef, useState } from "react";
import { deadlineIso, localTimeFromIso } from "@/lib/game-engine";
import { useFocusTrap } from "@/hooks/useFocusTrap";

interface DeadlineControlProps {
  taskId: string;
  taskTitle: string;
  deadlineAt: string | null;
  dayDate: string;
  timezone: string;
  disabled?: boolean;
  onSave: (deadlineAt: string | null) => void;
}

// US-05 : icône ⏰ sur TaskRow (racine et sous-tâche) — popover inline avec un
// sélecteur d'heure natif pour fixer/modifier/effacer la deadline du jour de
// la tâche. Pas de date à choisir : la deadline est toujours bornée au
// day_date de la tâche (cf. design).
export default function DeadlineControl({
  taskId,
  taskTitle,
  deadlineAt,
  dayDate,
  timezone,
  disabled = false,
  onSave,
}: DeadlineControlProps) {
  const [open, setOpen] = useState(false);
  const [time, setTime] = useState(() =>
    deadlineAt ? localTimeFromIso(deadlineAt, timezone) : "",
  );

  function handleOpen() {
    setTime(deadlineAt ? localTimeFromIso(deadlineAt, timezone) : "");
    setOpen(true);
  }

  function handleSave() {
    if (!time) return;
    onSave(deadlineIso(dayDate, time, timezone));
    setOpen(false);
  }

  function handleClear() {
    onSave(null);
    setOpen(false);
  }

  const label = deadlineAt ? localTimeFromIso(deadlineAt, timezone) : null;
  const popoverRef = useRef<HTMLDivElement>(null);
  useFocusTrap(popoverRef, { active: open, onEscape: () => setOpen(false) });

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={handleOpen}
        aria-label={
          label
            ? `Modifier la deadline de "${taskTitle}" (${label})`
            : `Fixer une deadline pour "${taskTitle}"`
        }
        className={`rounded px-2 py-2.5 text-xs ${
          label ? "text-alert" : "text-faint hover:text-ink focus-visible:text-ink"
        } disabled:cursor-wait disabled:opacity-40`}
      >
        ⏰{label ? ` ${label}` : ""}
      </button>
      {open && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-modal="true"
          aria-label={`Deadline de "${taskTitle}"`}
          className="absolute right-0 top-full z-20 mt-1 flex flex-col gap-2 rounded-md border border-border bg-surface p-2 shadow-lg"
        >
          <label htmlFor={`deadline-${taskId}`} className="text-xs text-muted">
            Heure limite
          </label>
          <input
            id={`deadline-${taskId}`}
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
            className="rounded border border-border bg-transparent px-2 py-1 text-xs text-ink"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={!time}
              className="flex-1 rounded bg-hp px-2 py-1 text-xs uppercase tracking-wide text-ink disabled:opacity-40"
            >
              Enregistrer
            </button>
            {deadlineAt && (
              <button
                type="button"
                onClick={handleClear}
                className="rounded border border-border px-2 py-1 text-xs text-muted"
              >
                Effacer
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fermer"
              className="rounded px-1.5 py-1 text-xs text-faint hover:text-alert"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
