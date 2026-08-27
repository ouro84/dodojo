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

export type HierarchyTask = Pick<Task, "id" | "parent_id" | "position" | "is_completed">;

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

  // Issue #195 : ordre d'affichage dérivé (complétées en bas) — cf.
  // `compareForDisplay`. Le même comparateur sert à `planReorder`, sinon un
  // drag & drop raisonnerait sur un ordre différent de celui affiché.
  roots.sort(compareForDisplay);

  return roots.flatMap((root) => [
    root,
    ...(childrenByParent.get(root.id) ?? []).sort(compareForDisplay),
  ]);
}

export type OrderableTask = Pick<Task, "id" | "position" | "is_completed">;

// Issue #195 : l'ordre d'affichage d'une fratrie est DÉRIVÉ de son contenu —
// les tâches complétées passent en bas, point. Rien n'est écrit en base pour
// l'obtenir, donc il n'y a plus aucun ordre à transporter, à périmer, ni à
// renuméroter.
//
// Ce que ça remplace : l'ordre était calculé côté client au moment du clic
// (`planCompletionReorder`) puis envoyé à `reorderSiblings` APRÈS l'aller-retour
// de la mutation. Toute mutation concurrente pendant la fenêtre réseau périmait
// ce payload — cocher deux tâches d'affilée et le plan de la première, appliqué
// en dernier, remettait la seconde en TÊTE de liste (reproduit sous latence).
// Le serveur rejetait en plus le payload entier si un seul id était devenu
// `is_abandoned` entre-temps (silencieusement, l'appel étant best-effort), ou
// ne renumérotait que les ids reçus, laissant des positions dupliquées que le
// tri sur `position` seule départageait arbitrairement côté Postgres.
//
// Une première version du correctif renumérotait le groupe côté serveur à
// chaque toggle/ajout : correcte, mais **mesurée trop coûteuse** — cocher la
// première tâche d'une liste de 20 décale les 20 lignes, soit 20 UPDATE
// séquentiels, et une boucle qui coche tout devient quadratique (+50 % sur
// `e2e/ko-overlay-viewport.spec.ts`, suite e2e complète × 2). Dériver au rendu
// coûte zéro écriture.
//
// Le départage sur l'id à position égale n'est pas cosmétique : des positions
// dupliquées existent réellement en base (payloads partiels de l'ancien
// mécanisme), et sans lui l'ordre affiché dépendrait de l'ordre de retour de
// Postgres, donc changerait d'un chargement à l'autre.
export function compareForDisplay(a: OrderableTask, b: OrderableTask): number {
  return (
    Number(a.is_completed) - Number(b.is_completed) ||
    a.position - b.position ||
    a.id.localeCompare(b.id)
  );
}

// `is_completed` : `planReorder` doit trier la fratrie dans l'ordre RÉELLEMENT
// affiché (issue #195), sinon un drop calcule sa cible sur un ordre que
// l'utilisateur ne voit pas dès qu'une complétée garde une position basse.
export type ReorderableTask = Pick<
  Task,
  "id" | "parent_id" | "position" | "is_abandoned" | "is_completed"
>;

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
    .sort(compareForDisplay)
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
// Plus de filtre par état de résolution ici (suppression du heal) : chaque
// pool builder (overdueHpPenalties, deadlineHpPenalties,
// deferredRestHpPenalties, lockedHpPenalties) décide lui-même si une tâche
// doit compter — calculateHeroHp se contente de sommer ce qu'on lui donne.
export type HeroHpPenaltyTask = { weight: number };

export function calculateHeroHp(
  penaltyTasks: HeroHpPenaltyTask[],
  lockedDamage: number = 0,
): number {
  const damage =
    penaltyTasks.reduce((total, task) => total + task.weight, 0) + lockedDamage;

  return Math.max(0, HERO_MAX_HP - damage);
}

// Construit les entrées pondérées du pool HP Héros pour des tâches en retard
// (reportées d'un jour précédent, poids -20). Utilisé par le Réveil
// et l'Arène. N'est appelé qu'avec des tâches déjà non résolues (la requête
// "overdueTasks" filtre is_completed=false/is_abandoned=false) — une fois
// résolue via Le Réveil, la tâche sort de ce pool et son dégât est repris
// par profiles.hp_damage_locked (cf. currentLockedHpDamage) pour ne pas healer.
export function overdueHpPenalties(tasks: OverdueTask[]): HeroHpPenaltyTask[] {
  return tasks.map(() => ({ weight: HERO_DAMAGE_PER_OVERDUE_TASK }));
}

// Issue #101 (Axe A, by-pass spec A4-overdue) : construit les entrées pondérées
// du pool HP Héros pour des tâches reportées depuis Le Réveil (poids -20 par
// reste). Contrairement à `overdueHpPenalties`, ce pool inclut des tâches dont
// `deferred_at` est non nul — la pénalité -20 "reste reporté" reste active sur
// la HeroBar tant que la tâche n'est pas résolue. Une fois résolue (coche/rage
// quit), elle sort de ce pool live ; son dégât est repris définitivement par
// `tasks.hp_penalty` (verrouillé côté serveur à la résolution, cf.
// hpPenaltyToLock) pour ne pas healer — voir `lockedHpPenalties`.
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
    .map(() => ({ weight: HERO_DAMAGE_PER_OVERDUE_TASK }));
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
// jour courant (poids -10, cf. spec US-05). N'est appelé qu'avec le résultat
// de `missedDeadlineTasks` (déjà non résolues) — une fois la tâche résolue,
// son dégât est repris par `tasks.hp_penalty` (cf. lockedHpPenalties).
export function deadlineHpPenalties(tasks: DeadlineTask[]): HeroHpPenaltyTask[] {
  return tasks.map(() => ({ weight: HERO_DAMAGE_PER_MISSED_DEADLINE }));
}

// Suppression du heal Héros : au moment où une tâche est résolue (coche,
// rage quit) alors qu'elle portait déjà une pénalité active, le poids doit
// être verrouillé plutôt que simplement recalculé en direct (sinon résoudre
// la tâche la fait sortir des pools live ci-dessus → HP remonte → heal).
// Une tâche déférée prime sur une deadline (mutuellement exclusives en
// pratique : deferOverdueTask efface toujours deadline_at au report).
export function hpPenaltyToLock(
  task: Pick<Task, "deadline_at" | "deferred_at">,
  now: Date,
): number | null {
  if (task.deferred_at !== null) {
    return HERO_DAMAGE_PER_OVERDUE_TASK;
  }
  if (task.deadline_at !== null && new Date(task.deadline_at).getTime() <= now.getTime()) {
    return HERO_DAMAGE_PER_MISSED_DEADLINE;
  }
  return null;
}

export type LockedHpPenaltyTask = Pick<Task, "is_completed" | "is_abandoned" | "hp_penalty">;

// Pool HP Héros pour les tâches du jour courant déjà résolues mais dont le
// poids a été verrouillé à la résolution (`hp_penalty`, cf. hpPenaltyToLock).
// Le garde `is_completed || is_abandoned` évite un double-comptage si la
// tâche redevient active puis se re-résout plus tard dans la même journée :
// tant qu'elle est active, son dégât est déjà porté par le pool live
// (missedDeadlineTasks/deferredRestHpPenalties) ; `hp_penalty` reste posé en
// mémoire mais n'est lu ici que quand la tâche est de nouveau résolue.
export function lockedHpPenalties(tasks: LockedHpPenaltyTask[]): HeroHpPenaltyTask[] {
  return tasks
    .filter((task) => (task.is_completed || task.is_abandoned) && task.hp_penalty !== null)
    .map((task) => ({ weight: task.hp_penalty as number }));
}

export type LockedHpDamageProfile = {
  hp_damage_locked: number;
  hp_damage_locked_day: string | null;
};

// Cache de saut day-scoped (même patron que last_recurring_gen_day) : la
// valeur stockée n'a de sens que si elle porte sur le jour local courant.
export function currentLockedHpDamage(
  profile: LockedHpDamageProfile,
  today: string,
): number {
  return profile.hp_damage_locked_day === today ? profile.hp_damage_locked : 0;
}

// Additionne `amount` au dégât verrouillé du jour courant, en repartant de 0
// si la valeur stockée portait sur un jour différent (nouveau jour local).
export function nextLockedHpDamage(
  profile: LockedHpDamageProfile,
  today: string,
  amount: number,
): { hp_damage_locked: number; hp_damage_locked_day: string } {
  return {
    hp_damage_locked: currentLockedHpDamage(profile, today) + amount,
    hp_damage_locked_day: today,
  };
}

export type ReminderTask = Pick<
  Task,
  "id" | "title" | "deadline_at" | "is_completed" | "is_abandoned" | "reminder_enabled" | "reminder_offset_minutes"
>;

// Issue #114 (amélioration A) : tâches actuellement dans leur fenêtre de
// rappel (deadline − offset effectif ≤ now < deadline), non complétées/
// abandonnées, rappel activé. Alimente le filet in-app (toast, Arena.tsx)
// quand l'app est ouverte — fonctionne indépendamment de push. `now` explicite
// pour rester testable sans horloge système réelle (même patron que
// missedDeadlineTasks).
export function upcomingReminderTasks(
  tasks: ReminderTask[],
  now: Date,
  profileDefaultOffsetMinutes: number,
): ReminderTask[] {
  const nowMs = now.getTime();
  return tasks.filter((task) => {
    if (task.deadline_at === null || task.is_completed || task.is_abandoned || !task.reminder_enabled) {
      return false;
    }
    const deadlineMs = new Date(task.deadline_at).getTime();
    const offsetMinutes = task.reminder_offset_minutes ?? profileDefaultOffsetMinutes;
    const windowStart = deadlineMs - offsetMinutes * 60_000;
    return nowMs >= windowStart && nowMs < deadlineMs;
  });
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

/** Sous ce ratio, le Boss entre en « danger » : jauge clignotante et idle
 *  ralenti. C'est ce qui fait monter la tension sur la fin d'un combat. */
export const BOSS_DANGER_HP_RATIO = 0.25;

export function isBossInDanger(currentHp: number, maxHp: number): boolean {
  if (maxHp <= 0 || currentHp <= 0) return false;
  return currentHp / maxHp < BOSS_DANGER_HP_RATIO;
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

// Issue #159 : stats du jour affichées dans le dialog HP du Boss.
export type CombatStatsTask = Pick<Task, "is_completed" | "is_abandoned" | "xp_awarded">;

export function todayCombatStats(
  tasks: CombatStatsTask[],
): { completedCount: number; xpEarned: number } {
  const completed = tasks.filter((t) => t.is_completed && !t.is_abandoned);
  return {
    completedCount: completed.length,
    xpEarned: completed.reduce((sum, t) => sum + (t.xp_awarded ?? XP_PER_TASK), 0),
  };
}

// Issue #159 : XP restant avant le niveau suivant, affiché dans le dialog HP du Héros.
export function xpToNextLevel(level: number, xp: number): number {
  return xpThresholdForLevel(level) - xp;
}

export const COMBO_WINDOW_MS = 15 * 60 * 1000;
export const COMBO_XP_BONUS_PER_TIER = 5;

// Issue #115 : bonus d'XP lié au palier de combo courant. 0 tant que le combo
// n'affiche rien (cohérent avec comboLabel, qui ne s'affiche qu'à partir de
// x2). +5 par palier au-delà : x2=+5, x3=+10, x4=+15, non cappé.
export function comboXpBonus(comboCount: number): number {
  return comboCount >= 2 ? COMBO_XP_BONUS_PER_TIER * (comboCount - 1) : 0;
}

export function xpForCompletion(comboCount: number): number {
  return XP_PER_TASK + comboXpBonus(comboCount);
}

export interface ComboState {
  comboCount: number;
  lastCompletedAt: string | null; // ISO
}

// Issue #115 : prochain état du combo après une complétion, à l'instant
// `now`. Fenêtre glissante de 15 min : si le dernier coup date de 15 min ou
// moins, la série continue (+1) ; sinon elle repart de 1 (ce coup compte
// comme le premier d'une nouvelle série, pas comme une rupture silencieuse).
export function nextComboState(current: ComboState, now: Date): ComboState {
  const withinWindow =
    current.lastCompletedAt !== null &&
    now.getTime() - new Date(current.lastCompletedAt).getTime() <= COMBO_WINDOW_MS;
  const comboCount = withinWindow ? current.comboCount + 1 : 1;
  return { comboCount, lastCompletedAt: now.toISOString() };
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

// Issue #116 : jour calendaire suivant `dayDate` (format YYYY-MM-DD). Arithmétique
// ancrée en UTC sur la date elle-même (pas sur un instant local) — un day_date
// est une étiquette calendaire, pas un horodatage ; ajouter 24h en UTC et
// reformater en UTC donne toujours "le jour d'après", indépendamment de toute
// transition DST qui se produirait ce jour-là dans le fuseau de l'utilisateur
// (même piège que documenté pour deadlineIso, évité ici en ne touchant jamais
// à un fuseau non-UTC).
export function nextDayKey(dayDate: string): string {
  return dayKey(new Date(Date.parse(`${dayDate}T00:00:00Z`) + 86_400_000), "UTC");
}

// Issue #116 : la section "Demain" (et l'icône de report) ne se débloquent
// qu'à partir de `thresholdHour` (heure LOCALE, cf. profiles.plan_tomorrow_after_hour,
// borné 12-23). Recalculée à chaque rendu depuis le `now` déjà existant du
// polling deadline (~45s, US-05) — pas de timer dédié.
export function isPlanningUnlocked(
  now: Date,
  timezone: string,
  thresholdHour: number,
): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const localHour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  return localHour >= thresholdHour;
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
//
// Issue #156 (chemin P2) : `overdueTemplateIds` = templates ayant un reste
// ACTIF sur un jour antérieur. On ne génère pas pour eux — Le Réveil va les
// traiter, et « Reporter » ramènerait le reste sur `today` en doublon de
// l'instance fraîche. La génération est relancée en fin de Réveil : si le
// reste a été coché ou annihilé (son `day_date` restant au jour passé),
// l'instance du jour est alors créée normalement.
export function planRecurringGeneration(
  templates: RecurringTemplateRule[],
  today: string,
  existingTemplateIdsToday: Set<string>,
  restDayTemplateIds: Set<string> = new Set(),
  overdueTemplateIds: Set<string> = new Set(),
): string[] {
  return templates
    .filter(
      (t) =>
        shouldGenerate(t, today, restDayTemplateIds) &&
        !existingTemplateIdsToday.has(t.id) &&
        !overdueTemplateIds.has(t.id),
    )
    .map((t) => t.id);
}
