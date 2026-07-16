import type { Task } from "@/types";
import { taskHpValue } from "@/lib/game-engine";

interface TaskListProps {
  tasks: Task[];
  onComplete: (id: string) => void;
}

export default function TaskList({ tasks, onComplete }: TaskListProps) {
  return (
    <ul className="flex flex-1 flex-col gap-1.5 overflow-y-auto">
      {tasks.map((task) => (
        <li
          key={task.id}
          className={`flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm ${
            task.parent_id ? "ml-6" : ""
          }`}
        >
          <input
            type="checkbox"
            checked={task.is_completed}
            disabled={task.is_completed}
            onChange={() => onComplete(task.id)}
            aria-label={`Marquer "${task.title}" comme accomplie`}
            className="h-4 w-4 shrink-0 accent-hp"
          />
          <span
            className={`flex-1 ${
              task.is_completed ? "text-faint line-through" : "text-ink"
            }`}
          >
            {task.title}
          </span>
          <span className="shrink-0 rounded border border-hp-dim px-1.5 py-0.5 text-xs text-hp">
            {taskHpValue(task)} HP
          </span>
        </li>
      ))}
    </ul>
  );
}
