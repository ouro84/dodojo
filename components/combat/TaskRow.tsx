"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { Task } from "@/types";
import { isNestableParent, isOptimisticTask } from "@/lib/game-engine";
import SubtaskForm from "./SubtaskForm";
import DeadlineControl from "./DeadlineControl";

export interface DragOverInfo {
  overTaskId: string;
  isTopHalf: boolean;
}

interface TaskRowProps {
  task: Task;
  timezone: string;
  onToggle: (id: string, isCompleted: boolean) => void;
  onAbandon: (id: string) => void;
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
  // Issue #116 : report proactif vers demain, gated par l'heure seuil
  // (profiles.plan_tomorrow_after_hour) — calculé côté Arena.
  onReportTomorrow: (id: string) => void;
  showReportTomorrow?: boolean;
  isAddingSubtask: boolean;
  // True pendant qu'une mutation de cette tâche est en vol côté serveur
  // (toggle, abandon, deadline). Distinct de `isOptimisticTask` qui ne couvre
  // que la phase "création non confirmée". Les deux désactivent les
  // interactions mais le `isMutating` survient sur une tâche déjà persistée.
  isMutating?: boolean;
  // A4 (issue #101) : true si cette tâche est une pénalité active pour la
  // jauge Héros. Les chips ne sont pas animés (motion-reduce friendly) et
  // disparaissent dès résolution (coche/abandon/report) car le calcul des
  // Sets est reroulé par Arena à chaque rendu.
  isMissedDeadline?: boolean;
  isOverdueRest?: boolean;
  dropIndicator?: DragOverInfo | null;
}

export default function TaskRow({
  task,
  timezone,
  onToggle,
  onAbandon,
  onAddSubtask,
  onSetDeadline,
  profileDefaultOffsetMinutes,
  onReportTomorrow,
  showReportTomorrow = false,
  isAddingSubtask,
  isMutating = false,
  isMissedDeadline = false,
  isOverdueRest = false,
  dropIndicator = null,
}: TaskRowProps) {
  const isPending = isOptimisticTask(task);
  // Toute interaction qui déclencherait une mutation serveur est désactivée
  // tant que la ligne est en phase optimistic (création non confirmée) OU en
  // vol (toggle/abandon/deadline déjà lancé sur cette tâche).
  const isLocked = isPending || isMutating;
  const draggable = useDraggable({ id: task.id, disabled: isLocked });
  const droppable = useDroppable({ id: task.id, disabled: isLocked });

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
        disabled={isLocked}
        aria-label={`Déplacer "${task.title}"`}
        className="shrink-0 cursor-grab touch-none px-2.5 py-2.5 text-faint hover:text-ink focus-visible:text-ink active:cursor-grabbing disabled:cursor-wait disabled:opacity-40"
        {...draggable.listeners}
        {...draggable.attributes}
      >
        ⠿
      </button>
      <label className="flex shrink-0 items-center justify-center p-2.5">
        <input
          type="checkbox"
          checked={task.is_completed}
          onChange={(event) => onToggle(task.id, event.target.checked)}
          disabled={isLocked}
          aria-label={`Marquer "${task.title}" comme ${
            task.is_completed ? "non accomplie" : "accomplie"
          }`}
          className="h-4 w-4 accent-hp disabled:cursor-wait disabled:opacity-40"
        />
      </label>
      <span
        className={`min-w-0 flex-1 break-words ${
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
      {isMissedDeadline && (
        <span
          aria-label="Pénalité -10 HP : deadline ratée"
          className="shrink-0 rounded bg-alert/10 px-1.5 py-0.5 text-[0.65rem] font-display uppercase tracking-wide text-alert"
        >
          -10 HP
        </span>
      )}
      {isOverdueRest && (
        <span
          aria-label="Pénalité -20 HP : reste reporté"
          className="shrink-0 rounded bg-alert/5 px-1.5 py-0.5 text-[0.65rem] font-display uppercase tracking-wide text-alert"
        >
          -20 HP
        </span>
      )}
      {showReportTomorrow && (
        <button
          type="button"
          onClick={() => onReportTomorrow(task.id)}
          disabled={isLocked}
          aria-label={`Reporter "${task.title}" à demain`}
          className="shrink-0 rounded px-2 py-2.5 text-xs text-faint hover:text-ink focus-visible:text-ink disabled:cursor-wait disabled:opacity-40"
        >
          →
        </button>
      )}
      <button
        type="button"
        onClick={() => onAbandon(task.id)}
        disabled={isLocked}
        aria-label={`Abandonner "${task.title}"`}
        className="shrink-0 rounded px-2.5 py-2.5 text-xs text-faint hover:text-alert focus-visible:text-alert disabled:cursor-wait disabled:opacity-40"
      >
        ×
      </button>
    </div>
  );
}
