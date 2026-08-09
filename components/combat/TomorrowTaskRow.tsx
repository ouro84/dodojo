"use client";

import type { Task } from "@/types";
import { isNestableParent, isOptimisticTask } from "@/lib/game-engine";
import SubtaskForm from "./SubtaskForm";
import DeadlineControl from "./DeadlineControl";
import RecurringIcon from "@/components/ui/RecurringIcon";

interface TomorrowTaskRowProps {
  task: Task;
  timezone: string;
  onAddSubtask: (parentId: string, title: string) => void;
  onSetDeadline: (
    id: string,
    deadlineAt: string | null,
    reminderOffsetMinutes: number | null,
    reminderEnabled: boolean,
  ) => void;
  // Issue #114 : défaut de rappel du profil, affiché dans le select "Me
  // notifier" du popover deadline (option "Par défaut (X min)").
  profileDefaultOffsetMinutes: number;
  onAnnihilate: (id: string) => void;
  onBringToToday: (id: string) => void;
  isAddingSubtask: boolean;
  isMutating?: boolean;
}

// Issue #116 : ligne de la section "Demain" — volontairement plus simple que
// TaskRow (pas de checkbox : rien n'est "complétable" avant que le jour
// n'arrive ; pas de drag & drop : YAGNI pour une première version). L'abandon
// est toujours une annihilation directe (jamais de Rage Quit — pas de combat
// en cours sur une tâche pas encore "aujourd'hui").
export default function TomorrowTaskRow({
  task,
  timezone,
  onAddSubtask,
  onSetDeadline,
  profileDefaultOffsetMinutes,
  onAnnihilate,
  onBringToToday,
  isAddingSubtask,
  isMutating = false,
}: TomorrowTaskRowProps) {
  // Fix #95 (même classe de bug) : tant que la tâche est encore optimistic
  // (id `optimistic-tomorrow-N`, création non confirmée par le serveur), les
  // actions serveur (Ramener/Annihiler) doivent rester désactivées — sinon un
  // clic trop rapide envoie cet id non-UUID à une server action, qui le
  // rejette avec un message d'erreur confus pour l'utilisateur.
  const isLocked = isOptimisticTask(task) || isMutating;

  return (
    <div
      className={`flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm ${
        task.parent_id ? "ml-6" : ""
      }`}
    >
      <span className="min-w-0 flex-1 break-words text-ink">
        {task.is_recurring && (
          <span
            aria-label="Quête récurrente"
            title="Quête récurrente"
            className="mr-1 inline-flex items-center"
          >
            <RecurringIcon className="h-3.5 w-3.5" />
          </span>
        )}
        {task.title}
      </span>
      {isNestableParent(task) && (
        <SubtaskForm
          onAdd={(title) => onAddSubtask(task.id, title)}
          pending={isAddingSubtask}
          disabled={isLocked}
        />
      )}
      <DeadlineControl
        taskId={task.id}
        taskTitle={task.title}
        deadlineAt={task.deadline_at}
        dayDate={task.day_date}
        timezone={timezone}
        disabled={isLocked}
        reminderOffsetMinutes={task.reminder_offset_minutes}
        reminderEnabled={task.reminder_enabled}
        profileDefaultOffsetMinutes={profileDefaultOffsetMinutes}
        onSave={(deadlineAt, reminderOffsetMinutes, reminderEnabled) =>
          onSetDeadline(task.id, deadlineAt, reminderOffsetMinutes, reminderEnabled)
        }
      />
      <button
        type="button"
        onClick={() => onBringToToday(task.id)}
        disabled={isLocked}
        aria-label={`Ramener "${task.title}" à aujourd'hui`}
        className="shrink-0 rounded px-2 py-2.5 text-xs text-faint hover:text-ink focus-visible:text-ink disabled:cursor-wait disabled:opacity-40"
      >
        ← Aujourd&apos;hui
      </button>
      <button
        type="button"
        onClick={() => onAnnihilate(task.id)}
        disabled={isLocked}
        aria-label={`Annihiler "${task.title}"`}
        className="shrink-0 rounded px-2.5 py-2.5 text-xs text-faint hover:text-alert focus-visible:text-alert disabled:cursor-wait disabled:opacity-40"
      >
        ×
      </button>
    </div>
  );
}
