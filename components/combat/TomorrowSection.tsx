"use client";

import type { Task } from "@/types";
import type { AggressivityLevel } from "@/types";
import { sortTasksHierarchically } from "@/lib/game-engine";
import { planningUnlockedLine } from "@/lib/copy/planning";
import TomorrowTaskRow from "./TomorrowTaskRow";
import AddTaskForm from "./AddTaskForm";

export interface TomorrowSectionProps {
  tasks: Task[];
  timezone: string;
  aggressivityLevel: AggressivityLevel;
  voiceSeed: number;
  onAdd: (title: string) => void;
  onAddSubtask: (parentId: string, title: string) => void;
  onSetDeadline: (id: string, deadlineAt: string | null) => void;
  onAnnihilate: (id: string) => void;
  onBringToToday: (id: string) => void;
  addingSubtaskParentId: string | null;
  isAdding: boolean;
  pendingMutationIds: Set<string>;
}

// Issue #116 : section "Demain", visible après l'heure seuil réglable
// (profiles.plan_tomorrow_after_hour). Pas de fetch propre à ce composant
// (les données arrivent déjà chargées via Arena/app/page.tsx) — pas d'état
// Loading/Error dédié nécessaire ici, seul l'état Empty a du sens localement.
export default function TomorrowSection({
  tasks,
  timezone,
  aggressivityLevel,
  voiceSeed,
  onAdd,
  onAddSubtask,
  onSetDeadline,
  onAnnihilate,
  onBringToToday,
  addingSubtaskParentId,
  isAdding,
  pendingMutationIds,
}: TomorrowSectionProps) {
  const orderedTasks = sortTasksHierarchically(tasks);

  return (
    <section
      aria-label="Demain"
      className="flex flex-col gap-2 rounded-lg border border-border bg-surface/50 p-3"
    >
      <p className="font-display text-xs uppercase tracking-wide text-muted">Demain</p>
      <p className="text-xs text-faint">{planningUnlockedLine(aggressivityLevel, voiceSeed)}</p>

      {orderedTasks.length === 0 ? (
        <p className="text-xs text-faint">Rien de prévu encore pour demain.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {orderedTasks.map((task) => (
            <li key={task.id}>
              <TomorrowTaskRow
                task={task}
                timezone={timezone}
                onAddSubtask={onAddSubtask}
                onSetDeadline={onSetDeadline}
                onAnnihilate={onAnnihilate}
                onBringToToday={onBringToToday}
                isAddingSubtask={addingSubtaskParentId === task.id}
                isMutating={pendingMutationIds.has(task.id)}
              />
            </li>
          ))}
        </ul>
      )}

      <AddTaskForm
        onAdd={onAdd}
        pending={isAdding}
        inputId="new-task-tomorrow"
        label="Prévoir une tâche pour demain"
        submitLabel="Planifier"
        micLabel="Dicter la tâche de demain"
      />
    </section>
  );
}
