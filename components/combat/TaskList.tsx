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
  dragOverInfo = null,
}: TaskListProps) {
  const orderedTasks = sortTasksHierarchically(tasks);

  return (
    <ul className="flex flex-1 flex-col gap-1.5 overflow-y-auto">
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
            dropIndicator={dragOverInfo?.overTaskId === task.id ? dragOverInfo : null}
          />
        </li>
      ))}
    </ul>
  );
}
