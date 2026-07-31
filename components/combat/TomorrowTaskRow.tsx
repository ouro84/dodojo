"use client";

import type { Task } from "@/types";
import { isNestableParent } from "@/lib/game-engine";
import SubtaskForm from "./SubtaskForm";
import DeadlineControl from "./DeadlineControl";

interface TomorrowTaskRowProps {
  task: Task;
  timezone: string;
  onAddSubtask: (parentId: string, title: string) => void;
  onSetDeadline: (id: string, deadlineAt: string | null) => void;
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
  onAnnihilate,
  onBringToToday,
  isAddingSubtask,
  isMutating = false,
}: TomorrowTaskRowProps) {
  return (
    <div
      className={`flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm ${
        task.parent_id ? "ml-6" : ""
      }`}
    >
      <span className="min-w-0 flex-1 break-words text-ink">
        {task.is_recurring && (
          <span aria-label="Quête récurrente" title="Quête récurrente" className="mr-1">
            🔁
          </span>
        )}
        {task.title}
      </span>
      {isNestableParent(task) && (
        <SubtaskForm
          onAdd={(title) => onAddSubtask(task.id, title)}
          pending={isAddingSubtask}
          disabled={isMutating}
        />
      )}
      <DeadlineControl
        taskId={task.id}
        taskTitle={task.title}
        deadlineAt={task.deadline_at}
        dayDate={task.day_date}
        timezone={timezone}
        disabled={isMutating}
        onSave={(deadlineAt) => onSetDeadline(task.id, deadlineAt)}
      />
      <button
        type="button"
        onClick={() => onBringToToday(task.id)}
        disabled={isMutating}
        aria-label={`Ramener "${task.title}" à aujourd'hui`}
        className="shrink-0 rounded px-2 py-2.5 text-xs text-faint hover:text-ink focus-visible:text-ink disabled:cursor-wait disabled:opacity-40"
      >
        ← Aujourd'hui
      </button>
      <button
        type="button"
        onClick={() => onAnnihilate(task.id)}
        disabled={isMutating}
        aria-label={`Annihiler "${task.title}"`}
        className="shrink-0 rounded px-2.5 py-2.5 text-xs text-faint hover:text-alert focus-visible:text-alert disabled:cursor-wait disabled:opacity-40"
      >
        ×
      </button>
    </div>
  );
}
