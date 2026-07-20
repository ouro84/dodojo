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

export const HERO_MAX_HP = 100;
export const HERO_DAMAGE_PER_OVERDUE_TASK = 20;

export type OverdueTask = Pick<Task, "is_abandoned" | "is_completed">;

export function calculateHeroHp(overdueTasks: OverdueTask[]): number {
  const unresolvedCount = overdueTasks.filter(
    (task) => !task.is_abandoned && !task.is_completed,
  ).length;

  return Math.max(0, HERO_MAX_HP - unresolvedCount * HERO_DAMAGE_PER_OVERDUE_TASK);
}

export const XP_PER_TASK = 30;
export const XP_THRESHOLD_PER_LEVEL = 100;

export function xpThresholdForLevel(level: number): number {
  return level * XP_THRESHOLD_PER_LEVEL;
}

export interface XpState {
  level: number;
  xp: number;
}

export function applyXpDelta(state: XpState, delta: number): XpState {
  let level = state.level;
  let xp = state.xp + delta;

  while (xp >= xpThresholdForLevel(level)) {
    xp -= xpThresholdForLevel(level);
    level += 1;
  }

  while (xp < 0) {
    if (level <= 1) {
      level = 1;
      xp = 0;
      break;
    }
    level -= 1;
    xp += xpThresholdForLevel(level);
  }

  return { level, xp };
}
