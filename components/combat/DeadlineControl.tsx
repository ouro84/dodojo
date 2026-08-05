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
  // Issue #114 : état actuel du réglage de rappel de cette tâche.
  reminderOffsetMinutes: number | null;
  reminderEnabled: boolean;
  profileDefaultOffsetMinutes: number;
  onSave: (
    deadlineAt: string | null,
    reminderOffsetMinutes: number | null,
    reminderEnabled: boolean,
  ) => void;
}

const OFFSET_OPTIONS = [0, 5, 10, 15, 30, 60, 120, 240];

function offsetLabel(minutes: number): string {
  if (minutes === 0) return "À l'heure";
  if (minutes < 60) return `${minutes} min avant`;
  return `${minutes / 60}h avant`;
}

function reminderSelectValue(reminderEnabled: boolean, reminderOffsetMinutes: number | null): string {
  if (!reminderEnabled) return "off";
  if (reminderOffsetMinutes === null) return "default";
  return String(reminderOffsetMinutes);
}

// US-05 : icône ⏰ sur TaskRow (racine et sous-tâche) — popover inline avec un
// sélecteur d'heure natif pour fixer/modifier/effacer la deadline du jour de
// la tâche. Issue #114 : ajoute un select "Me notifier" (délai avant deadline
// + option "Pas de notif").
export default function DeadlineControl({
  taskId,
  taskTitle,
  deadlineAt,
  dayDate,
  timezone,
  disabled = false,
  reminderOffsetMinutes,
  reminderEnabled,
  profileDefaultOffsetMinutes,
  onSave,
}: DeadlineControlProps) {
  const [open, setOpen] = useState(false);
  const [time, setTime] = useState(() =>
    deadlineAt ? localTimeFromIso(deadlineAt, timezone) : "",
  );
  const [reminderValue, setReminderValue] = useState(() =>
    reminderSelectValue(reminderEnabled, reminderOffsetMinutes),
  );

  function handleOpen() {
    setTime(deadlineAt ? localTimeFromIso(deadlineAt, timezone) : "");
    setReminderValue(reminderSelectValue(reminderEnabled, reminderOffsetMinutes));
    setOpen(true);
  }

  function resolveReminder(): { offsetMinutes: number | null; enabled: boolean } {
    if (reminderValue === "off") return { offsetMinutes: reminderOffsetMinutes, enabled: false };
    if (reminderValue === "default") return { offsetMinutes: null, enabled: true };
    return { offsetMinutes: Number(reminderValue), enabled: true };
  }

  function handleSave() {
    if (!time) return;
    const resolved = resolveReminder();
    onSave(deadlineIso(dayDate, time, timezone), resolved.offsetMinutes, resolved.enabled);
    setOpen(false);
  }

  function handleClear() {
    const resolved = resolveReminder();
    onSave(null, resolved.offsetMinutes, resolved.enabled);
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
          className="absolute right-0 top-full z-20 mt-1 flex flex-col gap-2 rounded-md border border-border bg-surface p-2"
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
          <label htmlFor={`reminder-${taskId}`} className="text-xs text-muted">
            Me notifier
          </label>
          <select
            id={`reminder-${taskId}`}
            value={reminderValue}
            onChange={(event) => setReminderValue(event.target.value)}
            className="rounded border border-border bg-transparent px-2 py-1 text-xs text-ink"
          >
            <option value="default">Par défaut ({profileDefaultOffsetMinutes} min)</option>
            {OFFSET_OPTIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {offsetLabel(minutes)}
              </option>
            ))}
            <option value="off">Pas de notif</option>
          </select>
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
