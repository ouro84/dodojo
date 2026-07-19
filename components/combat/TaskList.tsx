import type { Task } from "@/types";

interface TaskListProps {
  tasks: Task[];
  onToggle: (id: string, isCompleted: boolean) => void;
  onAbandon: (id: string) => void;
}

export default function TaskList({ tasks, onToggle, onAbandon }: TaskListProps) {
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
            onChange={(event) => onToggle(task.id, event.target.checked)}
            aria-label={`Marquer "${task.title}" comme ${
              task.is_completed ? "non accomplie" : "accomplie"
            }`}
            className="h-4 w-4 shrink-0 accent-hp"
          />
          <span
            className={`flex-1 ${
              task.is_completed ? "text-faint line-through" : "text-ink"
            }`}
          >
            {task.title}
          </span>
          <button
            type="button"
            onClick={() => onAbandon(task.id)}
            aria-label={`Abandonner "${task.title}"`}
            className="shrink-0 rounded px-1.5 py-0.5 text-xs text-faint hover:text-alert focus-visible:text-alert"
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}
