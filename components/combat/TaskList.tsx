import type { Task } from "@/types";
import { sortTasksHierarchically } from "@/lib/game-engine";
import TaskRow, { type DragOverInfo } from "./TaskRow";

interface TaskListProps {
  tasks: Task[];
  onToggle: (id: string, isCompleted: boolean) => void;
  onAbandon: (id: string) => void;
  onAddSubtask: (parentId: string, title: string) => void;
  addingSubtaskParentId?: string | null;
  dragOverInfo?: DragOverInfo | null;
}

export default function TaskList({
  tasks,
  onToggle,
  onAbandon,
  onAddSubtask,
  addingSubtaskParentId = null,
  dragOverInfo = null,
}: TaskListProps) {
  const orderedTasks = sortTasksHierarchically(tasks);

  return (
    <ul className="flex flex-1 flex-col gap-1.5 overflow-y-auto">
      {orderedTasks.map((task) => (
        <li key={task.id}>
          <TaskRow
            task={task}
            onToggle={onToggle}
            onAbandon={onAbandon}
            onAddSubtask={onAddSubtask}
            isAddingSubtask={addingSubtaskParentId === task.id}
            dropIndicator={dragOverInfo?.overTaskId === task.id ? dragOverInfo : null}
          />
        </li>
      ))}
    </ul>
  );
}
