import type { Task } from "../types";

const HP_PER_TASK = 20;
const HP_PER_SUBTASK = 10;

export function taskHpValue(task: Pick<Task, "parent_id">): number {
  return task.parent_id === null ? HP_PER_TASK : HP_PER_SUBTASK;
}

export type HpTask = Pick<Task, "parent_id" | "is_abandoned" | "is_completed">;

export function calculateBossMaxHp(tasks: HpTask[]): number {
  return tasks
    .filter((task) => !task.is_abandoned)
    .reduce((total, task) => total + taskHpValue(task), 0);
}

export function calculateBossCurrentHp(tasks: HpTask[]): number {
  const damageDealt = tasks
    .filter((task) => !task.is_abandoned && task.is_completed)
    .reduce((total, task) => total + taskHpValue(task), 0);

  return calculateBossMaxHp(tasks) - damageDealt;
}
