import type { Task } from "../types";

const HP_PER_TASK = 20;
const HP_PER_SUBTASK = 10;

export function taskHpValue(task: Pick<Task, "parent_id">): number {
  return task.parent_id === null ? HP_PER_TASK : HP_PER_SUBTASK;
}

// Une tâche affichée de façon optimiste (id client provisoire, en attente de
// confirmation serveur) ne peut pas encore servir de cible à une autre action
// (sous-tâche, drag & drop) : le serveur ne connaît pas encore son vrai id.
export function isOptimisticTask(task: Pick<Task, "id">): boolean {
  return task.id.startsWith("optimistic-");
}

// RG-01 : 2 niveaux max — seule une tâche racine peut recevoir une sous-tâche.
export function isNestableParent(task: Pick<Task, "parent_id">): boolean {
  return task.parent_id === null;
}

export function nextSiblingPosition<T extends Pick<Task, "position">>(
  siblings: T[],
): number {
  return siblings.length === 0
    ? 0
    : Math.max(...siblings.map((task) => task.position)) + 1;
}

export type HierarchyTask = Pick<Task, "id" | "parent_id" | "position">;

export function sortTasksHierarchically<T extends HierarchyTask>(tasks: T[]): T[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const childrenByParent = new Map<string, T[]>();
  const roots: T[] = [];

  for (const task of tasks) {
    const hasKnownParent = task.parent_id !== null && byId.has(task.parent_id);
    if (!hasKnownParent) {
      roots.push(task);
      continue;
    }
    const siblings = childrenByParent.get(task.parent_id as string) ?? [];
    siblings.push(task);
    childrenByParent.set(task.parent_id as string, siblings);
  }

  const byPosition = (a: T, b: T) => a.position - b.position;
  roots.sort(byPosition);

  return roots.flatMap((root) => [
    root,
    ...(childrenByParent.get(root.id) ?? []).sort(byPosition),
  ]);
}

export interface NestingCheck {
  allowed: boolean;
  reason?: string;
}

const NESTING_REJECTED_SELF: NestingCheck = {
  allowed: false,
  reason: "Une tâche ne peut pas s'imbriquer sous elle-même.",
};
const NESTING_REJECTED_DEPTH: NestingCheck = {
  allowed: false,
  reason: "Deux niveaux, pas plus — cette tâche est déjà une sous-tâche.",
};
const NESTING_REJECTED_HAS_CHILDREN: NestingCheck = {
  allowed: false,
  reason: "Cette tâche a déjà des sous-tâches, elle ne peut pas devenir une sous-tâche.",
};
const NESTING_ALLOWED: NestingCheck = { allowed: true };

export function canNestTask(
  taskToNest: Pick<Task, "id" | "parent_id">,
  targetParent: Pick<Task, "id" | "parent_id">,
  allTasks: Pick<Task, "id" | "parent_id">[],
): NestingCheck {
  if (taskToNest.id === targetParent.id) return NESTING_REJECTED_SELF;
  if (!isNestableParent(targetParent)) return NESTING_REJECTED_DEPTH;
  const hasChildren = allTasks.some((task) => task.parent_id === taskToNest.id);
  if (hasChildren) return NESTING_REJECTED_HAS_CHILDREN;
  return NESTING_ALLOWED;
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
