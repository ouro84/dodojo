import type { DayOutcome, DayResult, Task, UnlockedHero } from "../types";

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

export type ReorderableTask = Pick<Task, "id" | "parent_id" | "position" | "is_abandoned">;

export interface DropTarget {
  overTaskId: string;
  isTopHalf: boolean;
}

export interface ReorderPlan {
  parentId: string | null;
  orderedTaskIds: string[];
}

// US-19 : décide, à partir d'un drop, si le geste réordonne (moitié haute
// d'une ligne — même niveau que la cible, y compris repromouvoir une
// sous-tâche en tâche racine) ou imbrique (moitié basse d'une tâche racine
// nestable). Moitié basse d'une sous-tâche = réordonne après elle (une
// sous-tâche ne peut jamais recevoir d'enfant, RG-01).
export function planReorder(
  draggedId: string,
  target: DropTarget,
  allTasks: ReorderableTask[],
): ReorderPlan | null {
  const dragged = allTasks.find((task) => task.id === draggedId);
  const overTask = allTasks.find((task) => task.id === target.overTaskId);
  if (!dragged || !overTask || dragged.id === overTask.id) return null;

  let parentId: string | null;
  let anchorId: string | null;
  let insertMode: "before" | "append" | "after";

  if (target.isTopHalf) {
    parentId = overTask.parent_id;
    anchorId = overTask.id;
    insertMode = "before";
  } else if (isNestableParent(overTask)) {
    parentId = overTask.id;
    anchorId = null;
    insertMode = "append";
  } else {
    parentId = overTask.parent_id;
    anchorId = overTask.id;
    insertMode = "after";
  }

  const draggedHasChildren = allTasks.some((task) => task.parent_id === dragged.id);
  if (parentId !== null && draggedHasChildren) return null;

  const siblings = allTasks
    .filter(
      (task) => task.parent_id === parentId && task.id !== dragged.id && !task.is_abandoned,
    )
    .sort((a, b) => a.position - b.position)
    .map((task) => task.id);

  if (insertMode === "append") {
    return { parentId, orderedTaskIds: [...siblings, dragged.id] };
  }

  const anchorIndex = siblings.indexOf(anchorId as string);
  const insertAt = insertMode === "before" ? anchorIndex : anchorIndex + 1;
  return {
    parentId,
    orderedTaskIds: [
      ...siblings.slice(0, insertAt),
      dragged.id,
      ...siblings.slice(insertAt),
    ],
  };
}

export interface ToggleCascadeEntry {
  taskId: string;
  isCompleted: boolean;
}

export type CascadeTask = Pick<Task, "id" | "parent_id" | "is_completed" | "is_abandoned">;

// Coche/décoche une tâche et propage la conséquence sur la hiérarchie
// parent/sous-tâches (2 niveaux, RG-01) :
// - Cocher/décocher une tâche racine coche/décoche toutes ses sous-tâches
//   actives.
// - Cocher/décocher une sous-tâche recalcule si le parent doit suivre :
//   auto-coché quand toutes ses sous-tâches actives sont cochées, auto-décoché
//   dès qu'une ne l'est plus — pour ne jamais laisser un parent "terminé" avec
//   une sous-tâche encore active.
// Ne retourne que les tâches dont l'état change réellement.
export function computeToggleCascade(
  targetId: string,
  isCompleted: boolean,
  tasks: CascadeTask[],
): ToggleCascadeEntry[] {
  const target = tasks.find((task) => task.id === targetId);
  if (!target || target.is_completed === isCompleted) return [];

  const changes = new Map<string, boolean>([[targetId, isCompleted]]);

  if (target.parent_id === null) {
    const children = tasks.filter(
      (task) => task.parent_id === targetId && !task.is_abandoned,
    );
    for (const child of children) {
      if (child.is_completed !== isCompleted) {
        changes.set(child.id, isCompleted);
      }
    }
  } else {
    const siblings = tasks.filter(
      (task) => task.parent_id === target.parent_id && !task.is_abandoned,
    );
    const allCompleteAfter = siblings.every((task) =>
      task.id === targetId ? isCompleted : task.is_completed,
    );
    const parent = tasks.find((task) => task.id === target.parent_id);
    if (parent && parent.is_completed !== allCompleteAfter) {
      changes.set(parent.id, allCompleteAfter);
    }
  }

  return Array.from(changes, ([taskId, completed]) => ({
    taskId,
    isCompleted: completed,
  }));
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

export type KoTier = "perfect" | "ko" | null;

// US-16 : décide, de façon pure, si terrasser le Boss déclenche une célébration
// et à quel palier. Piloté par la transition des HP du Boss (avant → après) et
// les HP du Héro. `null` si pas de transition→0 valide ; `perfect` si le Boss
// tombe à 0 avec un Héro intact (100 HP, aucun reste non résolu ayant entamé la
// jauge) ; `ko` sinon (victoire, mais le Héro a encaissé). La garde
// `prevBossHp === 0` empêche le re-déclenchement sans renaissance (D4/B2).
export function koOutcome(
  prevBossHp: number,
  nextBossHp: number,
  bossMaxHp: number,
  heroHp: number,
): KoTier {
  if (nextBossHp !== 0) return null; // le Boss n'est pas terrassé
  if (bossMaxHp === 0) return null; // jour vide, jamais un KO (D5)
  if (prevBossHp === 0) return null; // déjà à 0, pas de nouvelle transition (D4)
  return heroHp === HERO_MAX_HP ? "perfect" : "ko";
}

export const XP_PER_TASK = 30;
export const XP_THRESHOLD_PER_LEVEL = 100;

// US-18 : barème d'or (tunable). Gagné à la clôture du jour.
export const GOLD_BASE: Record<DayOutcome, number> = {
  victory: 50,
  retreat: 10,
  defeat: 0,
};
export const GOLD_PER_DAMAGE_UNIT = 1; // par tranche de 20 dégâts (≈ 1 tâche)
export const GOLD_STREAK_BONUS_PER_DAY = 5;
export const GOLD_STREAK_BONUS_CAP = 50;

// US-18 : or gagné pour un jour. Pur & idempotent. `streakOnThatDay` = longueur
// de streak au jour concerné, fournie par l'action appelante (qui lit day_results).
export function computeGoldEarned(
  outcome: DayOutcome,
  damageDealt: number,
  streakOnThatDay: number,
): number {
  const damageBonus = Math.floor(damageDealt / 20) * GOLD_PER_DAMAGE_UNIT;
  const streakBonus = Math.min(
    streakOnThatDay * GOLD_STREAK_BONUS_PER_DAY,
    GOLD_STREAK_BONUS_CAP,
  );
  return GOLD_BASE[outcome] + damageBonus + streakBonus;
}

// US-18 : solde d'or dérivé (source de vérité). Jamais accumulé.
export function goldBalance(
  dayResults: Pick<DayResult, "gold_earned">[],
  unlockedHeroes: Pick<UnlockedHero, "price_paid">[],
): number {
  const earned = dayResults.reduce((sum, r) => sum + r.gold_earned, 0);
  const spent = unlockedHeroes.reduce((sum, h) => sum + h.price_paid, 0);
  return earned - spent;
}

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

// Jour calendaire local (YYYY-MM-DD) dans le fuseau donné. Corrige le piège
// UTC : à 01h à Paris on est déjà "demain" alors que toISOString() dirait
// encore "hier". en-CA formate en ISO (2026-07-20).
export function dayKey(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export type DayContext = "manual" | "backfill";

export type SummaryTask = Pick<Task, "parent_id" | "is_completed" | "is_abandoned">;

export interface DaySummary {
  outcome: DayOutcome;
  damageDealt: number;
  bossMaxHp: number;
  tasksCompleted: number;
  tasksAbandoned: number;
  xpEarned: number;
}

// Résume un jour à partir de ses tâches. L'issue dépend du contexte : à la
// clôture manuelle (Crépuscule) un Boss vivant = "retreat" ; au backfill d'un
// jour raté = "defeat". Victoire uniquement si le Boss est tombé à 0.
export function summarizeDay(tasks: SummaryTask[], context: DayContext): DaySummary {
  const bossMaxHp = calculateBossMaxHp(tasks);
  const currentHp = calculateBossCurrentHp(tasks);
  const damageDealt = bossMaxHp - currentHp;
  const tasksCompleted = tasks.filter((t) => !t.is_abandoned && t.is_completed).length;
  const tasksAbandoned = tasks.filter((t) => t.is_abandoned).length;

  const outcome: DayOutcome =
    currentHp === 0 && bossMaxHp > 0
      ? "victory"
      : context === "manual"
        ? "retreat"
        : "defeat";

  return {
    outcome,
    damageDealt,
    bossMaxHp,
    tasksCompleted,
    tasksAbandoned,
    xpEarned: tasksCompleted * XP_PER_TASK,
  };
}

export type WakeUpTask = Pick<
  Task,
  "id" | "parent_id" | "title" | "day_date" | "position" | "is_completed" | "is_abandoned"
>;

export interface WakeUpRoot {
  task: WakeUpTask;
  children: WakeUpTask[];
}

export interface WakeUpDayGroup {
  dayDate: string;
  roots: WakeUpRoot[];
}

// US-08 : structure les restes (tâches non finies et non abandonnées d'un jour
// passé) pour l'overlay du Réveil. Groupe par jour (plus ancien d'abord),
// niche les sous-tâches restes sous leur parent reste ; une sous-tâche dont le
// parent n'est pas lui-même un reste devient une racine standalone.
export function planWakeUp(overdueTasks: WakeUpTask[]): WakeUpDayGroup[] {
  const leftovers = overdueTasks.filter((t) => !t.is_completed && !t.is_abandoned);
  const idsInSet = new Set(leftovers.map((t) => t.id));
  const byDay = new Map<string, WakeUpTask[]>();

  for (const task of leftovers) {
    const bucket = byDay.get(task.day_date) ?? [];
    bucket.push(task);
    byDay.set(task.day_date, bucket);
  }

  const sortedDays = Array.from(byDay.keys()).sort();

  return sortedDays.map((dayDate) => {
    const dayTasks = byDay.get(dayDate) as WakeUpTask[];
    const childrenByParent = new Map<string, WakeUpTask[]>();
    const roots: WakeUpTask[] = [];

    for (const task of dayTasks) {
      const nestable = task.parent_id !== null && idsInSet.has(task.parent_id);
      if (nestable) {
        const siblings = childrenByParent.get(task.parent_id as string) ?? [];
        siblings.push(task);
        childrenByParent.set(task.parent_id as string, siblings);
      } else {
        roots.push(task);
      }
    }

    const byPosition = (a: WakeUpTask, b: WakeUpTask) => a.position - b.position;
    return {
      dayDate,
      roots: roots.sort(byPosition).map((task) => ({
        task,
        children: (childrenByParent.get(task.id) ?? []).sort(byPosition),
      })),
    };
  });
}

export const WEEKLY_JOKER_BUDGET = 2;

export interface StreakState {
  length: number; // jours de victoire dans la chaîne
  jokersUsedThisWeek: number;
  atRisk: boolean;
}

// Semaine ISO 8601 (lundi→dimanche) à partir d'une date locale YYYY-MM-DD.
// Le day_date est déjà une date calendaire locale → aucun fuseau à ré-appliquer.
export function weekKey(dayDate: string): string {
  const date = new Date(`${dayDate}T00:00:00Z`);
  const dayNum = (date.getUTCDay() + 6) % 7; // lundi=0 … dimanche=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // jeudi de la semaine ISO
  const isoYear = date.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

// US-12 : série = victoires consécutives, avec un budget de 2 non-victoires
// (retreat/defeat/trou) tolérées par semaine ISO ; la 3e casse. Les jours
// tolérés bridgent la chaîne mais n'incrémentent pas `length`.
export function currentStreak(
  dayResults: Array<Pick<DayResult, "day_date" | "outcome">>,
  today: string,
): StreakState {
  if (dayResults.length === 0) {
    return { length: 0, jokersUsedThisWeek: 0, atRisk: false };
  }

  const outcomeByDate = new Map(dayResults.map((r) => [r.day_date, r.outcome]));
  const earliest = dayResults
    .map((r) => r.day_date)
    .reduce((min, d) => (d < min ? d : min));

  const jokersByWeek = new Map<string, number>();
  let length = 0;

  const cursor = new Date(`${today}T00:00:00Z`);
  // Aujourd'hui sans résultat : ni compté ni pénalisé, on part de la veille.
  if (!outcomeByDate.has(today)) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  while (true) {
    const ds = cursor.toISOString().slice(0, 10);
    if (ds < earliest) break; // plus d'historique

    if (outcomeByDate.get(ds) === "victory") {
      length += 1;
    } else {
      // non-victoire (retreat / defeat / trou) → consomme un joker de sa semaine
      const wk = weekKey(ds);
      const used = (jokersByWeek.get(wk) ?? 0) + 1;
      jokersByWeek.set(wk, used);
      if (used > WEEKLY_JOKER_BUDGET) break; // 3e non-victoire de la semaine → rupture
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  const jokersUsedThisWeek = jokersByWeek.get(weekKey(today)) ?? 0;
  return {
    length,
    jokersUsedThisWeek,
    atRisk: jokersUsedThisWeek >= WEEKLY_JOKER_BUDGET,
  };
}

// US-12 : titre débloqué selon le record de série (provisoire — vocabulaire dojo,
// pourra fusionner avec d'éventuels titres de niveau plus tard).
export function titleForStreak(bestStreak: number): string | null {
  if (bestStreak >= 100) return "Sensei";
  if (bestStreak >= 30) return "Ceinture Noire";
  if (bestStreak >= 7) return "Ceinture Jaune";
  return null;
}
