"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createRecurringTemplate,
  deactivateRecurringTemplate,
  toggleRestDay,
} from "@/app/actions/recurring";

export interface ManagedTemplate {
  id: string;
  title: string;
  weekdays: number[];
  isRestToday: boolean;
}

// lundi=0 … dimanche=6 (semaine locale).
const DAYS = [
  { i: 0, short: "L", label: "lundi" },
  { i: 1, short: "M", label: "mardi" },
  { i: 2, short: "M", label: "mercredi" },
  { i: 3, short: "J", label: "jeudi" },
  { i: 4, short: "V", label: "vendredi" },
  { i: 5, short: "S", label: "samedi" },
  { i: 6, short: "D", label: "dimanche" },
];

interface RecurringManagerProps {
  templates: ManagedTemplate[];
}

export default function RecurringManager({ templates }: RecurringManagerProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [selectedDays, setSelectedDays] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  function toggleDay(i: number) {
    setSelectedDays((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function handleCreate() {
    setError(null);
    const result = createRecurringTemplate(title.trim(), [...selectedDays]);
    startTransition(async () => {
      const r = await result;
      if (r.error) {
        setError(r.error);
        return;
      }
      setTitle("");
      setSelectedDays(new Set());
      router.refresh();
    });
  }

  function runAction(fn: () => Promise<{ error: string | null }>) {
    startTransition(async () => {
      const r = await fn();
      if (r.error) setError(r.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex w-full flex-col gap-4">
      {/* Création */}
      <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
        <p className="font-display text-xs uppercase tracking-wide text-muted">
          Nouvelle quête récurrente
        </p>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex. 30 min de sport"
          className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-ink placeholder:text-faint"
        />
        <div className="flex justify-between gap-1">
          {DAYS.map((d) => {
            const on = selectedDays.has(d.i);
            return (
              <button
                key={d.i}
                type="button"
                onClick={() => toggleDay(d.i)}
                aria-pressed={on}
                aria-label={d.label}
                className={`h-8 flex-1 rounded font-display text-xs uppercase ${
                  on ? "bg-hp text-bg" : "border border-border text-muted"
                }`}
              >
                {d.short}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={handleCreate}
          disabled={pending || !title.trim() || selectedDays.size === 0}
          className="rounded-md border border-hp px-4 py-2 font-display text-xs uppercase tracking-wide text-hp disabled:opacity-40"
        >
          {pending ? "…" : "Créer la routine"}
        </button>
        {error && <p className="text-xs text-alert">{error}</p>}
      </section>

      {/* Liste */}
      <section className="flex flex-col gap-2">
        <p className="font-display text-xs uppercase tracking-wide text-muted">
          Tes routines actives
        </p>
        {templates.length === 0 ? (
          <p className="text-xs text-faint">
            Aucune routine. Crée ta première quête d&apos;entraînement.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {templates.map((t) => (
              <li
                key={t.id}
                className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-ink">🔁 {t.title}</span>
                  <div className="flex gap-1">
                    {DAYS.map((d) => (
                      <span
                        key={d.i}
                        className={`text-[10px] font-display uppercase ${
                          t.weekdays.includes(d.i) ? "text-hp" : "text-faint"
                        }`}
                      >
                        {d.short}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => runAction(() => toggleRestDay(t.id))}
                    disabled={pending}
                    className="rounded border border-border px-2 py-1 text-[11px] text-muted hover:text-ink disabled:opacity-40"
                  >
                    {t.isRestToday ? "🛌 Repos aujourd'hui (activé)" : "🛌 Repos aujourd'hui"}
                  </button>
                  <button
                    type="button"
                    onClick={() => runAction(() => deactivateRecurringTemplate(t.id))}
                    disabled={pending}
                    className="rounded border border-border px-2 py-1 text-[11px] text-faint hover:text-alert disabled:opacity-40"
                  >
                    Désactiver
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
