"use client";

import { useMemo, useState } from "react";
import type { AggressivityLevel, Task } from "@/types";
import {
  calculateHeroHp,
  dayKey,
  HERO_MAX_HP,
  overdueHpPenalties,
  planWakeUp,
} from "@/lib/game-engine";
import { wakeUpSubtitle } from "@/lib/copy/rituals";
import {
  annihilateOverdueOlderThan,
  annihilateOverdueTask,
  completeOverdueTask,
  deferAllOverdue,
  deferOverdueTask,
} from "@/app/actions/tasks";
import { backfillMissedDays } from "@/app/actions/day";

interface WakeUpRitualProps {
  overdueTasks: Task[];
  timezone: string;
  aggressivityLevel: AggressivityLevel;
  onResolved: () => void;
}

function daysAgo(dayDate: string, todayKey: string): number {
  return Math.round(
    (Date.parse(`${todayKey}T00:00:00Z`) - Date.parse(`${dayDate}T00:00:00Z`)) / 86400000,
  );
}

function dayLabel(dayDate: string, todayKey: string): string {
  const diff = daysAgo(dayDate, todayKey);
  if (diff <= 1) return "Hier";
  return `Il y a ${diff} jours`;
}

// US-08 : overlay bloquant du Rituel du Réveil. Confronte l'utilisateur aux
// restes de la veille avant toute action dans l'Arène. Ton non-punitif (B1) :
// on règle ses comptes, on ne se fait pas culpabiliser.
export default function WakeUpRitual({
  overdueTasks,
  timezone,
  aggressivityLevel,
  onResolved,
}: WakeUpRitualProps) {
  const [tasks, setTasks] = useState<Task[]>(overdueTasks);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groups = useMemo(() => planWakeUp(tasks), [tasks]);
  const heroHp = calculateHeroHp(overdueHpPenalties(tasks));
  const todayKey = dayKey(new Date(), timezone);

  async function run(
    action: () => Promise<{ error: string | null }>,
    affectedIds: string[],
  ) {
    setPending(true);
    setError(null);
    const result = await action();
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    const removed = new Set(affectedIds);
    const remaining = tasks.filter(
      (t) => !removed.has(t.id) && !removed.has(t.parent_id ?? ""),
    );
    setTasks(remaining);
    if (remaining.length === 0) {
      await backfillMissedDays();
      onResolved();
    }
  }

  function childIds(rootId: string): string[] {
    return tasks.filter((t) => t.parent_id === rootId).map((t) => t.id);
  }

  return (
    <div
      role="alertdialog"
      aria-label="Rituel du Réveil"
      className="fixed inset-0 z-50 flex flex-col gap-4 overflow-y-auto bg-[oklch(0.08_0_0_/_92%)] px-4 py-6"
    >
      <header className="flex flex-col gap-1">
        <p className="font-display text-xl uppercase tracking-wide text-hp">
          Rituel du Réveil
        </p>
        <p className="text-sm text-muted">{wakeUpSubtitle(aggressivityLevel)}</p>
      </header>

      {/* A5 : jauge Héro, animée en motion-safe uniquement (A7). */}
      <div className="rounded-md border border-border bg-surface px-3 py-2">
        <div className="h-3 w-full overflow-hidden rounded bg-[oklch(0.2_0_0)]">
          <div
            className="h-full bg-hp transition-[width] motion-reduce:transition-none"
            style={{ width: `${(heroHp / HERO_MAX_HP) * 100}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-muted">
          Toi : {heroHp}/{HERO_MAX_HP} HP
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-alert bg-surface px-3 py-2 text-xs text-alert"
        >
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(deferAllOverdue, tasks.map((t) => t.id))}
          className="rounded-md border border-border px-3 py-1.5 text-xs uppercase tracking-wide text-ink disabled:opacity-50"
        >
          Tout reporter
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(
              () => annihilateOverdueOlderThan(2),
              tasks.filter((t) => daysAgo(t.day_date, todayKey) > 2).map((t) => t.id),
            )
          }
          className="rounded-md border border-border px-3 py-1.5 text-xs uppercase tracking-wide text-muted disabled:opacity-50"
        >
          Annihiler les jours &gt; 2j
        </button>
      </div>

      {groups.map((group) => (
        <section key={group.dayDate} className="flex flex-col gap-2">
          <h2 className="font-display text-xs uppercase tracking-wide text-faint">
            {dayLabel(group.dayDate, todayKey)}
          </h2>
          {group.roots.map(({ task, children }) => (
            <div
              key={task.id}
              className="rounded-md border border-border bg-surface px-3 py-2"
            >
              <p className="text-sm text-ink">{task.title}</p>
              {children.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-xs text-muted">
                  {children.map((c) => (
                    <li key={c.id}>{c.title}</li>
                  ))}
                </ul>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={pending}
                  aria-label={`Terminé "${task.title}"`}
                  onClick={() =>
                    run(() => completeOverdueTask(task.id), [task.id, ...childIds(task.id)])
                  }
                  className="rounded border border-xp px-2 py-1 text-xs text-xp disabled:opacity-50"
                >
                  Terminé
                </button>
                <button
                  type="button"
                  disabled={pending}
                  aria-label={`Reporter "${task.title}"`}
                  onClick={() =>
                    run(() => deferOverdueTask(task.id), [task.id, ...childIds(task.id)])
                  }
                  className="rounded border border-border px-2 py-1 text-xs text-ink disabled:opacity-50"
                >
                  Reporter
                </button>
                <button
                  type="button"
                  disabled={pending}
                  aria-label={`Annihiler "${task.title}"`}
                  onClick={() =>
                    run(() => annihilateOverdueTask(task.id), [task.id, ...childIds(task.id)])
                  }
                  className="rounded border border-border px-2 py-1 text-xs text-muted disabled:opacity-50"
                >
                  Annihiler
                </button>
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
