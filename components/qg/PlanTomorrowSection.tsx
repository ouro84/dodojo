"use client";

import { useState, useTransition } from "react";
import { updatePlanTomorrowAfterHour } from "@/app/actions/profile";

interface PlanTomorrowSectionProps {
  initialHour: number;
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 12); // 12..23

// Issue #116 : heure locale à partir de laquelle l'Arène propose de
// planifier/reporter des tâches vers demain. Bornée 12-23 (cf. spec) pour
// éviter un réglage qui rendrait la section "Demain" quasi permanente.
export default function PlanTomorrowSection({ initialHour }: PlanTomorrowSectionProps) {
  const [hour, setHour] = useState(initialHour);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function select(next: number) {
    const previous = hour;
    setHour(next);
    setError(null);
    startTransition(async () => {
      const result = await updatePlanTomorrowAfterHour(next);
      if (result.error) {
        setHour(previous);
        setError(result.error);
      }
    });
  }

  return (
    <section className="flex w-full max-w-sm flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <p className="font-display text-xs uppercase tracking-wide text-muted">Planifier demain</p>
      <label htmlFor="plan-tomorrow-hour" className="text-xs text-muted">
        À partir de quelle heure proposer de préparer demain ?
      </label>
      <select
        id="plan-tomorrow-hour"
        value={hour}
        disabled={isPending}
        onChange={(event) => select(Number(event.target.value))}
        className="rounded border border-border bg-transparent px-2 py-1 text-sm text-ink disabled:opacity-50"
      >
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {String(h).padStart(2, "0")}h00
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
