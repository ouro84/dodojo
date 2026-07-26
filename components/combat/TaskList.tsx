import type { Task } from "@/types";
import { sortTasksHierarchically } from "@/lib/game-engine";
import TaskRow, { type DragOverInfo } from "./TaskRow";

interface TaskListProps {
  tasks: Task[];
  timezone: string;
  onToggle: (id: string, isCompleted: boolean) => void;
  onAbandon: (id: string) => void;
  onAddSubtask: (parentId: string, title: string) => void;
  onSetDeadline: (id: string, deadlineAt: string | null) => void;
  addingSubtaskParentId?: string | null;
  // Fix #95/#96 (issues) : ids en cours de mutation (toggle, abandon,
  // deadline). Désactive le rendu interactif de la ligne correspondante tant
  // que le serveur n'a pas répondu — empêche le double-tap qui envoie un id
  // optimistic ou qui rollback un appel concurrent.
  pendingMutationIds?: Set<string>;
  dragOverInfo?: DragOverInfo | null;
}

export default function TaskList({
  tasks,
  timezone,
  onToggle,
  onAbandon,
  onAddSubtask,
  onSetDeadline,
  addingSubtaskParentId = null,
  pendingMutationIds,
  dragOverInfo = null,
}: TaskListProps) {
  const orderedTasks = sortTasksHierarchically(tasks);

  return (
    <ul className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
      {orderedTasks.map((task) => (
        <li key={task.id}>
          <TaskRow
            task={task}
            timezone={timezone}
            onToggle={onToggle}
            onAbandon={onAbandon}
            onAddSubtask={onAddSubtask}
            onSetDeadline={onSetDeadline}
            isAddingSubtask={addingSubtaskParentId === task.id}
            isMutating={pendingMutationIds?.has(task.id) ?? false}
            dropIndicator={dragOverInfo?.overTaskId === task.id ? dragOverInfo : null}
          />
        </li>
      ))}
    </ul>
  );
}
