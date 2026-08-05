"use client";

import { useState, useTransition } from "react";
import { updateReminderOffsetDefault } from "@/app/actions/profile";

interface ReminderOffsetDefaultSectionProps {
  initialMinutes: number;
}

const OPTIONS = [0, 5, 10, 15, 30, 60, 120, 240];

function label(minutes: number): string {
  if (minutes === 0) return "À l'heure";
  if (minutes < 60) return `${minutes} min avant`;
  return `${minutes / 60}h avant`;
}

// Issue #114 : délai par défaut appliqué à toute tâche sans override
// (tasks.reminder_offset_minutes = null hérite de cette valeur).
export default function ReminderOffsetDefaultSection({
  initialMinutes,
}: ReminderOffsetDefaultSectionProps) {
  const [minutes, setMinutes] = useState(initialMinutes);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function select(next: number) {
    const previous = minutes;
    setMinutes(next);
    setError(null);
    startTransition(async () => {
      const result = await updateReminderOffsetDefault(next);
      if (result.error) {
        setMinutes(previous);
        setError(result.error);
      }
    });
  }

  return (
    <section className="flex w-full max-w-sm flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <p className="font-display text-xs uppercase tracking-wide text-muted">Rappel de deadline</p>
      <label htmlFor="reminder-offset-default" className="text-xs text-muted">
        Délai par défaut avant une deadline
      </label>
      <select
        id="reminder-offset-default"
        value={minutes}
        disabled={isPending}
        onChange={(event) => select(Number(event.target.value))}
        className="rounded border border-border bg-transparent px-2 py-1 text-sm text-ink disabled:opacity-50"
      >
        {OPTIONS.map((option) => (
          <option key={option} value={option}>
            {label(option)}
          </option>
        ))}
      </select>
      {error && (
        <p role="alert" className="text-xs text-alert">
          {error}
        </p>
      )}
    </section>
  );
}
