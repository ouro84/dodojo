import type { DayOutcome, DayResult, Task, UnlockedHero, UnlockedSkin } from "../types";

const HP_PER_TASK = 20;
const HP_PER_SUBTASK = 10;

export function taskHpValue(task: Pick<Task, "parent_id">): number {
  return task.parent_id === null ? HP_PER_TASK : HP_PER_SUBTASK;
}

// Une tâche affichée de façon optimiste (id client provisoire, en attente de
// confirmation serveur) ne peut pas encore servir de cible à une autre action
// (sous-tâche, drag & drop) : le serveur ne connaît pas encore son vrai id.
export function isOptimisticTask(task: Pick<Task, "id">): boolean {
  return isOptimisticId(task.id);
}

// Variante par id nu, sans avoir à construire un objet Task. Pratique pour
// filtrer tôt dans les handlers (Arena) et les server actions (tasks.ts).
export function isOptimisticId(id: string): boolean {
  return id.startsWith("optimistic-");
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

// Issue #111 : déplace UNE SEULE tâche (celle qui vient de changer d'état)
// dans la liste ordonnée de sa fratrie, sans toucher à l'ordre relatif des
// autres — y compris un réordonnancement manuel préexistant (drag & drop),
// qui reste donc toujours prioritaire sur cette règle automatique. Cocher =
// va en toute dernière position. Décocher = revient juste après la dernière
// tâche encore active (pas juste "avant la première complétée" : si une
// tâche complétée a été draguée manuellement au-dessus d'une active, elle
// doit rester au-dessus — l'insertion se fait après la dernière active
// rencontrée, jamais avant une complétée qui précède déjà des actives).
function insertAfterLastActive(
  ids: string[],
  insertId: string,
  completedIds: Set<string>,
): string[] {
  let insertAt = 0;
  for (let i = 0; i < ids.length; i += 1) {
    if (!completedIds.has(ids[i])) insertAt = i + 1;
  }
  return [...ids.slice(0, insertAt), insertId, ...ids.slice(insertAt)];
}

export function reorderAfterCompletionToggle(
  orderedIds: string[],
  toggledId: string,
  isCompleted: boolean,
  completedIds: Set<string>,
): string[] {
  const withoutToggled = orderedIds.filter((id) => id !== toggledId);
  if (isCompleted) {
    return [...withoutToggled, toggledId];
  }
  return insertAfterLastActive(withoutToggled, toggledId, completedIds);
}

// Issue #111 : position d'une tâche nouvellement créée — dernière position
// parmi les non-cochées (juste après la dernière tâche active). Identique au
// comportement existant (ajout en toute fin) quand la fratrie n'a aucune
// tâche complétée.
export function insertNewActiveTaskId(
  orderedIds: string[],
  newId: string,
  completedIds: Set<string>,
): string[] {
  return insertAfterLastActive(orderedIds, newId, completedIds);
}

export type ReorderableCompletionTask = Pick<
  Task,
  "id" | "parent_id" | "position" | "is_completed" | "is_abandoned"
>;

export interface CompletionReorderPlan {
  parentId: string | null;
  orderedTaskIds: string[];
}

// Issue #111 : à partir d'une cascade de complétion (`computeToggleCascade`),
// calcule le nouvel ordre de chaque fratrie touchée (le groupe racine et/ou
// le groupe des sous-tâches d'un parent précis — une cascade ne peut toucher
// que ces deux groupes au maximum, RG-01). Chaque tâche de la cascade est
// déplacée une à une (dans l'ordre de la cascade) via
// `reorderAfterCompletionToggle`, ce qui préserve l'ordre relatif de tout le
// reste de la fratrie.
export function planCompletionReorder(
  allTasks: ReorderableCompletionTask[],
  cascade: ToggleCascadeEntry[],
): CompletionReorderPlan[] {
  if (cascade.length === 0) return [];

  const byId = new Map(allTasks.map((task) => [task.id, task]));
  const nextCompletedById = new Map(cascade.map((c) => [c.taskId, c.isCompleted]));
  const isCompletedAfter = (task: ReorderableCompletionTask) =>
    nextCompletedById.get(task.id) ?? task.is_completed;

  const groupsTouched = new Set<string | null>();
  for (const change of cascade) {
    const task = byId.get(change.taskId);
    if (task) groupsTouched.add(task.parent_id);
  }

  const plans: CompletionReorderPlan[] = [];
  for (const parentId of groupsTouched) {
    const groupTasks = allTasks.filter(
      (task) => task.parent_id === parentId && !task.is_abandoned,
    );
    let orderedIds = [...groupTasks]
      .sort((a, b) => a.position - b.position)
      .map((task) => task.id);

    const completedIds = new Set(
      groupTasks.filter(isCompletedAfter).map((task) => task.id),
    );

    for (const change of cascade) {
      const task = byId.get(change.taskId);
      if (!task || task.parent_id !== parentId) continue;
      orderedIds = reorderAfterCompletionToggle(
        orderedIds,
        change.taskId,
        change.isCompleted,
        completedIds,
      );
    }

    plans.push({ parentId, orderedTaskIds: orderedIds });
  }

  return plans;
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
export const HERO_DAMAGE_PER_MISSED_DEADLINE = 10;

export type OverdueTask = Pick<Task, "is_abandoned" | "is_completed">;

// Issue #101 (Axe A, by-pass spec A4-overdue) : tâche reportée depuis Le
// Réveil. La pénalité -20 "reste reporté" persiste jusqu'à résolution via
// le flag `deferred_at`. Champs Pick minimaux pour rester testable
// sans dépendance au rendu UI.
export type DeferredRestTask = Pick<
  Task,
  "id" | "deferred_at" | "is_completed" | "is_abandoned"
>;

// US-05 : le pool HP Héros accepte un poids par tâche (overdue reporté = -20,
// deadline horaire ratée = -10) plutôt qu'un poids fixe pour toute la liste.
export type HeroHpPenaltyTask = Pick<Task, "is_abandoned" | "is_completed"> & {
  weight: number;
};

export function calculateHeroHp(penaltyTasks: HeroHpPenaltyTask[]): number {
  const damage = penaltyTasks
    .filter((task) => !task.is_abandoned && !task.is_completed)
    .reduce((total, task) => total + task.weight, 0);

  return Math.max(0, HERO_MAX_HP - damage);
}

// Construit les entrées pondérées du pool HP Héros pour des tâches en retard
// (reportées d'un jour précédent, poids -20). Utilisé par le Réveil
// et l'Arène.
export function overdueHpPenalties(tasks: OverdueTask[]): HeroHpPenaltyTask[] {
  return tasks.map((task) => ({ ...task, weight: HERO_DAMAGE_PER_OVERDUE_TASK }));
}

// Issue #101 (Axe A, by-pass spec A4-overdue) : construit les entrées pondérées
// du pool HP Héros pour des tâches reportées depuis Le Réveil (poids -20 par
// reste). Contrairement à `overdueHpPenalties`, ce pool inclut des tâches dont
// `deferred_at` est non nul — la pénalité -20 "reste reporté" persiste après
// le Report (qui changeait uniquement `day_date` à `today`) jusqu'à résolution
// (coche/rage quit). Utilisé par l'Arène via `tasks` (state local qui contient
// déjà les tâches déferrées rapportées par `onResolved`).
//
// Robustesse : on utilise `!= null` (loose equality) plutôt que `!== null`
// (strict) pour tolérer le cas où la colonne `deferred_at` n'existe pas encore
// en base — Supabase retourne alors `undefined` au lieu de `null`. Sans ça,
// `undefined !== null` est `true` et on traiterait faussement toutes les
// tâches comme "déferrées". Une fois la migration poussée, le select retourne
// `null` et le filtre reste correct.
export function deferredRestHpPenalties(
  tasks: DeferredRestTask[],
): HeroHpPenaltyTask[] {
  return tasks
    .filter(
      (task) =>
        task.deferred_at != null && !task.is_completed && !task.is_abandoned,
    )
    .map((task) => ({ ...task, weight: HERO_DAMAGE_PER_OVERDUE_TASK }));
}

export type DeadlineTask = Pick<
  Task,
  "id" | "title" | "deadline_at" | "is_completed" | "is_abandoned"
>;

// US-05 : tâches dont la deadline est dépassée et qui ne sont ni complétées ni
// abandonnées. Alimente le pool HP Héros (poids -10, cf. deadlineHpPenalties)
// et déclenche l'animation "Attaque Surprise" au polling (Arena.tsx). `now`
// explicite pour rester testable sans horloge système réelle.
export function missedDeadlineTasks(tasks: DeadlineTask[], now: Date): DeadlineTask[] {
  const nowMs = now.getTime();
  return tasks.filter(
    (task) =>
      task.deadline_at !== null &&
      !task.is_completed &&
      !task.is_abandoned &&
      new Date(task.deadline_at).getTime() <= nowMs,
  );
}

// US-05 : badge agrégé "N deadlines à venir aujourd'hui" — tâches actives à
// deadline non nulle et pas encore dépassée.
export function upcomingDeadlineCount(tasks: DeadlineTask[], now: Date): number {
  const nowMs = now.getTime();
  return tasks.filter(
    (task) =>
      task.deadline_at !== null &&
      !task.is_completed &&
      !task.is_abandoned &&
      new Date(task.deadline_at).getTime() > nowMs,
  ).length;
}

// Construit les entrées pondérées du pool HP Héros pour des deadlines ratées du
// jour courant (poids -10, cf. spec US-05).
export function deadlineHpPenalties(tasks: DeadlineTask[]): HeroHpPenaltyTask[] {
  return tasks.map((task) => ({ ...task, weight: HERO_DAMAGE_PER_MISSED_DEADLINE }));
}

// US-05 : construit l'ISO UTC d'une deadline "aujourd'hui à HH:MM" dans le
// fuseau donné (valeur brute d'un <input type="time">). Jamais de date à
// choisir — la deadline est toujours bornée au day_date de la tâche.
// L'offset du fuseau est recalculé par itération à point fixe : on le
// calcule d'abord à l'instant "naïf" (HH:MM interprété comme UTC), on
// obtient un premier candidat, puis on recalcule l'offset à cet instant
// candidat (pas au point de départ) — s'il a changé (transition DST entre
// les deux instants), on réajuste une seconde fois. Deux itérations
// suffisent pour tout delta DST réel (1h ou 2h). Nécessaire car un offset
// calculé uniquement à l'instant naïf peut être celui d'après la
// transition alors que l'heure locale demandée est valide avant celle-ci
// (ex. 01:30 Europe/Paris le 2026-03-29, jour de passage à l'heure d'été).
export function deadlineIso(dayDate: string, timeHHMM: string, timezone: string): string {
  const [year, month, day] = dayDate.split("-").map(Number);
  const [hours, minutes] = timeHHMM.split(":").map(Number);
  const naiveUtc = Date.UTC(year, month - 1, day, hours, minutes);

  const offsetAt = (instantMs: number): number => {
    const instant = new Date(instantMs);
    const tzString = instant.toLocaleString("en-US", { timeZone: timezone });
    const utcString = instant.toLocaleString("en-US", { timeZone: "UTC" });
    return new Date(tzString).getTime() - new Date(utcString).getTime();
  };

  const initialOffset = offsetAt(naiveUtc);
  let candidate = naiveUtc - initialOffset;
  const refinedOffset = offsetAt(candidate);
  if (refinedOffset !== initialOffset) {
    candidate = naiveUtc - refinedOffset;
  }
  return new Date(candidate).toISOString();
}

// US-05 : heure locale HH:MM (fuseau donné) d'un horodatage ISO, pour
// pré-remplir le <input type="time"> du popover ⏰.
export function localTimeFromIso(iso: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
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
  unlockedSkins: Pick<UnlockedSkin, "price_paid">[],
): number {
  const earned = dayResults.reduce((sum, r) => sum + r.gold_earned, 0);
  const spentHeroes = unlockedHeroes.reduce((sum, h) => sum + h.price_paid, 0);
  const spentSkins = unlockedSkins.reduce((sum, s) => sum + s.price_paid, 0);
  return earned - spentHeroes - spentSkins;
}

export const RAGE_QUIT_XP_PENALTY = 5;

// US-15 : malus de Rage Quit — clampé à 0, **sans** de-level (≠ applyXpDelta qui,
// lui, peut faire redescendre de niveau sur XP négatif). Le niveau est intouché ;
// seul l'XP courant est amputé. Le refund de l'undo réapplique +5 (même clamp).
export function applyRageQuitPenalty(state: XpState): XpState {
  return { level: state.level, xp: Math.max(0, state.xp - RAGE_QUIT_XP_PENALTY) };
}

// US-15 : liste les tâches à abandonner pour un Rage Quit — la cible + (si c'est
// une racine) ses sous-tâches actives. Une sous-tâche seule ne cascade pas.
// Exclut les tâches déjà complétées ou abandonnées (pas de double effet, B2).
export function collectAbandonCascade(
  targetId: string,
  tasks: CascadeTask[],
): string[] {
  const target = tasks.find((task) => task.id === targetId);
  if (!target || target.is_completed || target.is_abandoned) return [];

  const ids = [target.id];
  if (target.parent_id === null) {
    for (const task of tasks) {
      if (
        task.parent_id === targetId &&
        !task.is_completed &&
        !task.is_abandoned
      ) {
        ids.push(task.id);
      }
    }
  }
  return ids;
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
// clôture manuelle (fin de journée) un Boss vivant = "retreat" ; au backfill d'un
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

export interface TableauChasseStats {
  totalVictories: number;
  totalDays: number;
  winRate: number; // ratio 0..1 (Boss vaincus / jours joués)
  totalDamage: number;
  goldAllTime: number;
  bestDay: { day_date: string; damage: number } | null;
  damageSeries: number[]; // dégâts des N derniers jours, chronologique
}

export type TableauChasseDay = Pick<
  DayResult,
  "day_date" | "outcome" | "damage_dealt" | "gold_earned"
>;

// US-10 : agrégats purs du Tableau de Chasse, dérivés de day_results. Aucune écriture.
// winRate garde la division par zéro (0 jour → 0). bestDay départage les égalités
// par la date la plus récente (déterministe). damageSeries = N derniers jours
// (chronologique) pour la sparkline.
export function tableauChasseStats(
  dayResults: TableauChasseDay[],
  seriesLength = 14,
): TableauChasseStats {
  const totalDays = dayResults.length;
  const totalVictories = dayResults.filter((r) => r.outcome === "victory").length;
  const totalDamage = dayResults.reduce((sum, r) => sum + r.damage_dealt, 0);
  const goldAllTime = dayResults.reduce((sum, r) => sum + r.gold_earned, 0);

  let bestDay: { day_date: string; damage: number } | null = null;
  for (const r of dayResults) {
    if (
      bestDay === null ||
      r.damage_dealt > bestDay.damage ||
      (r.damage_dealt === bestDay.damage && r.day_date > bestDay.day_date)
    ) {
      bestDay = { day_date: r.day_date, damage: r.damage_dealt };
    }
  }
  // Un « meilleur jour » à 0 dégât n'a pas de valeur de trophée.
  if (bestDay && bestDay.damage === 0) bestDay = null;

  const damageSeries = [...dayResults]
    .sort((a, b) => a.day_date.localeCompare(b.day_date))
    .slice(-seriesLength)
    .map((r) => r.damage_dealt);

  return {
    totalVictories,
    totalDays,
    winRate: totalDays === 0 ? 0 : totalVictories / totalDays,
    totalDamage,
    goldAllTime,
    bestDay,
    damageSeries,
  };
}

// US-12 : titre débloqué selon le record de série — progression de clarté
// mentale croissante (issue #51, "Démon Intérieur").
export function titleForStreak(bestStreak: number): string | null {
  if (bestStreak >= 100) return "Esprit Vide";
  if (bestStreak >= 30) return "Silence";
  if (bestStreak >= 7) return "Calme";
  return null;
}

// Combo / série de coups (juice arcade, esprit Street Fighter). Purement visuel :
// n'affecte NI l'XP NI l'or (économie dérivée intacte). Le compteur monte à chaque
// tâche terminée à la chaîne et retombe dès qu'on décoche ou qu'on abandonne.
export function comboLabel(count: number): string | null {
  if (count >= 10) return `M-M-MONSTER COMBO ×${count} !!`;
  if (count >= 7) return `COMBO DÉVASTATEUR ×${count}`;
  if (count >= 5) return `SÉRIE BRUTALE ×${count}`;
  if (count >= 3) return `COMBO ×${count}`;
  if (count === 2) return "DOUBLE COUP !";
  return null;
}

// Niveau d'intensité visuelle (0..4) pour dimensionner l'animation du combo.
export function comboIntensity(count: number): number {
  if (count >= 10) return 4;
  if (count >= 7) return 3;
  if (count >= 5) return 2;
  if (count >= 3) return 1;
  return 0;
}

// US-17 : jour de la semaine (lundi=0 … dimanche=6) d'une date calendaire locale
// YYYY-MM-DD. Comme `weekKey`, le day_date est déjà local → aucun fuseau à
// ré-appliquer (une date calendaire a un jour de semaine fixe).
export function weekdayOf(dayDate: string): number {
  const date = new Date(`${dayDate}T00:00:00Z`);
  return (date.getUTCDay() + 6) % 7; // getUTCDay: 0=dimanche → lundi=0
}

export type RecurringTemplateRule = {
  id: string;
  weekdays: number[];
  is_active: boolean;
};

// US-17 (D1/A2) : ce template doit-il générer une instance ce jour ? Actif, jour
// de semaine inclus dans la règle, et pas marqué en jour de repos.
export function shouldGenerate(
  template: RecurringTemplateRule,
  dayDate: string,
  restDayTemplateIds: Set<string> = new Set(),
): boolean {
  if (!template.is_active) return false;
  if (restDayTemplateIds.has(template.id)) return false;
  return template.weekdays.includes(weekdayOf(dayDate));
}

// US-17 : décide, en pur (sans I/O), quels templates instancier pour `today`.
// Applique l'anti-doublon (D5 : une instance déjà présente — fraîche OU reste
// reporté de cette routine — fait sauter la génération) et le no-rétroactif (D6 :
// seul `today` génère, jamais un jour passé). `existingTemplateIdsToday` = set des
// template_id ayant déjà une tâche sur `today`.
export function planRecurringGeneration(
  templates: RecurringTemplateRule[],
  today: string,
  existingTemplateIdsToday: Set<string>,
  restDayTemplateIds: Set<string> = new Set(),
): string[] {
  return templates
    .filter(
      (t) =>
        shouldGenerate(t, today, restDayTemplateIds) &&
        !existingTemplateIdsToday.has(t.id),
    )
    .map((t) => t.id);
}
