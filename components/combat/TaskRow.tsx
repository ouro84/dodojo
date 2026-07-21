"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { Task } from "@/types";
import { isNestableParent, isOptimisticTask } from "@/lib/game-engine";
import SubtaskForm from "./SubtaskForm";

export interface DragOverInfo {
  overTaskId: string;
  isTopHalf: boolean;
}

interface TaskRowProps {
  task: Task;
  onToggle: (id: string, isCompleted: boolean) => void;
  onAbandon: (id: string) => void;
  onAddSubtask: (parentId: string, title: string) => void;
  isAddingSubtask: boolean;
  dropIndicator?: DragOverInfo | null;
}

export default function TaskRow({
  task,
  onToggle,
  onAbandon,
  onAddSubtask,
  isAddingSubtask,
  dropIndicator = null,
}: TaskRowProps) {
  const isPending = isOptimisticTask(task);
  const draggable = useDraggable({ id: task.id, disabled: isPending });
  const droppable = useDroppable({ id: task.id, disabled: isPending });

  const style = draggable.transform
    ? {
        transform: CSS.Translate.toString(draggable.transform),
        zIndex: 10,
      }
    : undefined;

  // Moitié haute survolée : insertion avant cette ligne (réordonne, ou
  // repromeut une sous-tâche en tâche si la cible est une tâche racine).
  // Moitié basse d'une tâche racine : imbrication. Moitié basse d'une
  // sous-tâche : insertion après elle (jamais d'imbrication à 3 niveaux).
  let dropZoneClassName = "border-border bg-surface";
  if (dropIndicator) {
    if (dropIndicator.isTopHalf) {
      dropZoneClassName = "border-border border-t-2 border-t-hp bg-surface";
    } else if (isNestableParent(task)) {
      dropZoneClassName = "border-dashed border-hp bg-surface";
    } else {
      dropZoneClassName = "border-border border-b-2 border-b-hp bg-surface";
    }
  }

  return (
    <div
      ref={(node) => {
        draggable.setNodeRef(node);
        droppable.setNodeRef(node);
      }}
      style={style}
      className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
        task.parent_id ? "ml-6" : ""
      } ${dropZoneClassName} ${draggable.isDragging ? "opacity-40" : ""}`}
    >
      <button
        type="button"
        disabled={isPending}
        aria-label={`Déplacer "${task.title}"`}
        className="shrink-0 cursor-grab touch-none px-1 text-faint hover:text-ink focus-visible:text-ink active:cursor-grabbing disabled:cursor-wait disabled:opacity-40"
        {...draggable.listeners}
        {...draggable.attributes}
      >
        ⠿
      </button>
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
          disabled={isPending}
        />
      )}
      <button
        type="button"
        onClick={() => onAbandon(task.id)}
        aria-label={`Abandonner "${task.title}"`}
        className="shrink-0 rounded px-1.5 py-0.5 text-xs text-faint hover:text-alert focus-visible:text-alert"
      >
        ×
      </button>
    </div>
  );
}
