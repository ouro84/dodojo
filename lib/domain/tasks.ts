import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyRageQuitPenalty,
  applyXpDelta,
  collectAbandonCascade,
  dayKey,
  HERO_DAMAGE_PER_OVERDUE_TASK,
  hpPenaltyToLock,
  isNestableParent,
  nextComboState,
  nextLockedHpDamage,
  nextSiblingPosition,
  RAGE_QUIT_XP_PENALTY,
  xpForCompletion,
  XP_PER_TASK,
} from "@/lib/game-engine";
import type { CascadeTask } from "@/lib/game-engine";
import { assembleAchievementContext, applyNewAchievements } from "@/app/actions/achievements";
import { cancelDeadlineReminder, scheduleDeadlineReminder } from "@/lib/inngest/deadline-reminder";
import { insertTaskForUser } from "@/lib/task-insertion";
import { validateTaskTitle } from "@/lib/task-title";
import type { Task } from "@/types";
import type { DomainErrorCode, DomainResult } from "./errors";

// Audit #67, PR5 : `id` alimente un filtre PostgREST construit par
// interpolation de chaine. Valider le format avant construction. La garde vit
// ici (et non plus seulement dans la server action) parce que le serveur MCP
// appelle le domaine directement, sans passer par app/actions/.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CompleteTaskOutcome {
  error: DomainErrorCode | null;
  level?: number;
  xp?: number;
  leveledUp?: boolean;
  comboCount?: number;
  newAchievements?: string[];
}

export async function completeTaskForUser(
  supabase: SupabaseClient,
  userId: string,
  taskId: string,
  isCompleted: boolean,
): Promise<CompleteTaskOutcome> {
  // Fix #95 : un id `optimistic-*` arrive ici si l'utilisateur toggle une
  // tâche dont la création n'est pas encore confirmée par le serveur (tap
  // rapide avant résolution de `addTask`). Sans cette garde, l'id forgé
  // remonte jusqu'à PostgREST `.eq("id", "optimistic-N")` → 0 ligne ou erreur
  // uuid incompréhensible côté client ("Le coup n'est pas passé"). Message
  // métier dédié plutôt que l'erreur générique UUID.
  if (!UUID_RE.test(taskId)) {
    return { error: "invalid_task_id" };
  }

  const { data: existingTask, error: fetchError } = await supabase
    .from("tasks")
    .select("is_completed, is_abandoned, xp_awarded, deadline_at, deferred_at")
    .eq("id", taskId)
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchError || !existingTask) {
    return { error: "task_not_found" };
  }

  // Suppression du heal Héros : si la tâche portait déjà une pénalité active
  // (deadline dépassée, reste reporté) au moment où elle est cochée, son
  // poids est verrouillé sur `hp_penalty` — sinon elle sortirait des pools
  // live (missedDeadlineTasks/deferredRestHpPenalties) et les HP remonteraient.
  // Lu avant l'update ci-dessous, qui efface `deferred_at`.
  const hpPenaltyLock = isCompleted
    ? hpPenaltyToLock(existingTask, new Date())
    : null;

  const { error: updateError } = await supabase
    .from("tasks")
    .update({
      is_completed: isCompleted,
      deferred_at: null,
      ...(hpPenaltyLock !== null ? { hp_penalty: hpPenaltyLock } : {}),
    })
    .eq("id", taskId)
    .eq("user_id", userId);

  if (updateError) {
    return { error: "update_failed" };
  }

  // Issue #114 : une tâche complétée n'a plus besoin de son rappel de
  // deadline — un décochage ne reschedule rien (l'utilisateur peut re-cocher
  // avant la deadline, cf. setTaskDeadline pour la logique de (re)programmation).
  if (isCompleted) {
    await cancelDeadlineReminder(taskId);
  }

  const isRealTransition = existingTask.is_completed !== isCompleted;
  let level: number | undefined;
  let xp: number | undefined;
  let leveledUp = false;
  let comboCount: number | undefined;
  let newAchievements: string[] = [];

  // Le profil n'est jamais absent en usage normal (onboarding le garantit) ;
  // si le fetch échoue quand même, on ne bloque pas la validation de la
  // tâche pour autant — seul le gain d'XP est perdu pour ce coup.
  if (isRealTransition && !existingTask.is_abandoned) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("level, xp, combo_count, last_combo_completed_at")
      .eq("id", userId)
      .maybeSingle();

    if (!profileError && profile) {
      if (isCompleted) {
        // Issue #115 : combo server-authoritative — série de coups à moins de
        // 15 min d'intervalle, module l'XP réellement accordée à ce coup.
        const nextCombo = nextComboState(
          {
            comboCount: profile.combo_count,
            lastCompletedAt: profile.last_combo_completed_at,
          },
          new Date(),
        );
        const xpDelta = xpForCompletion(nextCombo.comboCount);
        const nextXp = applyXpDelta(profile, xpDelta);
        leveledUp = nextXp.level > profile.level;
        level = nextXp.level;
        xp = nextXp.xp;
        comboCount = nextCombo.comboCount;

        await supabase
          .from("profiles")
          .update({
            level: nextXp.level,
            xp: nextXp.xp,
            combo_count: nextCombo.comboCount,
            last_combo_completed_at: nextCombo.lastCompletedAt,
          })
          .eq("id", userId);

        await supabase
          .from("tasks")
          .update({ xp_awarded: xpDelta })
          .eq("id", taskId)
          .eq("user_id", userId);

        const ctx = await assembleAchievementContext(supabase, userId);
        newAchievements = await applyNewAchievements(supabase, userId, ctx);
      } else {
        // Décocher : rembourse exactement ce qui avait été accordé (fallback
        // flat XP_PER_TASK pour une tâche complétée avant cette migration,
        // donc sans xp_awarded stocké) et casse la série, comme un abandon.
        const refund = existingTask.xp_awarded ?? XP_PER_TASK;
        const nextXp = applyXpDelta(profile, -refund);
        leveledUp = nextXp.level > profile.level;
        level = nextXp.level;
        xp = nextXp.xp;
        comboCount = 0;

        await supabase
          .from("profiles")
          .update({
            level: nextXp.level,
            xp: nextXp.xp,
            combo_count: 0,
            last_combo_completed_at: null,
          })
          .eq("id", userId);

        await supabase
          .from("tasks")
          .update({ xp_awarded: null })
          .eq("id", taskId)
          .eq("user_id", userId);
      }
    }
  }

  return { error: null, level, xp, leveledUp, comboCount, newAchievements };
}

// US-15 : Rage Quit — abandonner une tâche active du jour en cours de combat.
// Punitif (≠ « Annihiler » serein du Réveil) : malus −5 XP clampé sans de-level,
// Boss rétréci (la tâche sort du calcul HP), cascade sur les sous-tâches actives.
// RG-04 : jamais de DELETE, on pose is_abandoned=true + abandon_reason='rage_quit'.
// Le malus est appliqué UNE fois par action (pas par tâche cascadée).
export async function rageQuitTaskForUser(
  supabase: SupabaseClient,
  userId: string,
  taskId: string,
): Promise<CompleteTaskOutcome> {
  // Fix #95 : id `optimistic-*` envoyable si l'utilisateur déclenche un Rage
  // Quit (clic sur × puis confirm) sur une tâche fraîchement créée avant la
  // résolution de `addTask`. La cascade `collectAbandonCascade` trouverait 0
  // id renvoyant un no-op idempotent, mais on court-circuite plutôt ici pour
  // ne même pas requêter la base.
  if (!UUID_RE.test(taskId)) {
    return { error: "invalid_task_id" };
  }

  // Charge la tâche + sa fratrie potentielle (mêmes racine/enfants) pour la cascade pure.
  const { data: siblings, error: fetchError } = await supabase
    .from("tasks")
    .select("id, parent_id, is_completed, is_abandoned, deadline_at, deferred_at")
    .eq("user_id", userId);

  if (fetchError || !siblings) {
    return { error: "update_failed" };
  }

  const cascadeIds = collectAbandonCascade(taskId, siblings as CascadeTask[]);
  if (cascadeIds.length === 0) {
    // Déjà abandonnée / complétée / introuvable → no-op idempotent (B2).
    return { error: null };
  }

  const { error } = await supabase
    .from("tasks")
    .update({
      is_abandoned: true,
      abandon_reason: "rage_quit",
      deferred_at: null,
    })
    .in("id", cascadeIds)
    .eq("user_id", userId);

  if (error) {
    return { error: "update_failed" };
  }

  // Suppression du heal Héros : verrouille le poids de chaque tâche cascadée
  // qui portait déjà une pénalité active (lu depuis `siblings`, capturé avant
  // l'update ci-dessus qui efface `deferred_at`). Groupé par montant (10 ou
  // 20) pour éviter un update par tâche.
  const now = new Date();
  const idsByLockAmount = new Map<number, string[]>();
  for (const cascadeId of cascadeIds) {
    const row = siblings.find((s) => s.id === cascadeId);
    const amount = row ? hpPenaltyToLock(row, now) : null;
    if (amount !== null) {
      idsByLockAmount.set(amount, [...(idsByLockAmount.get(amount) ?? []), cascadeId]);
    }
  }
  for (const [amount, ids] of idsByLockAmount) {
    await supabase
      .from("tasks")
      .update({ hp_penalty: amount })
      .in("id", ids)
      .eq("user_id", userId);
  }

  // Issue #114 : la cascade entière (racine + sous-tâches actives) n'a plus
  // besoin de son rappel de deadline une fois abandonnée.
  await Promise.allSettled(cascadeIds.map((cascadeId) => cancelDeadlineReminder(cascadeId)));

  // Malus XP unique, clampé, sans de-level (D3).
  let level: number | undefined;
  let xp: number | undefined;
  const { data: profile } = await supabase
    .from("profiles")
    .select("level, xp")
    .eq("id", userId)
    .maybeSingle();
  if (profile) {
    const next = applyRageQuitPenalty(profile);
    level = next.level;
    xp = next.xp;
    // Issue #115 : abandonner brise la série, comme décocher — le combo n'a
    // plus de raison d'être client-only "purement visuel" une fois qu'il
    // module l'XP réelle, il doit rester cohérent avec le serveur en toutes
    // circonstances.
    await supabase
      .from("profiles")
      .update({
        level: next.level,
        xp: next.xp,
        combo_count: 0,
        last_combo_completed_at: null,
      })
      .eq("id", userId);
  }

  return { error: null, level, xp };
}

// US-15 : annuler un Rage Quit (même jour). Restaure is_abandoned=false, efface
// abandon_reason, rembourse +5 XP (clampé). Ne remonte que les tâches réellement
// rage-quit (garde par abandon_reason) — un « Annihiler » n'est pas annulable ici.
export async function undoRageQuitForUser(
  supabase: SupabaseClient,
  userId: string,
  taskId: string,
): Promise<CompleteTaskOutcome> {
  if (!UUID_RE.test(taskId)) {
    return { error: "invalid_task_id" };
  }

  const { data: restored, error } = await supabase
    .from("tasks")
    .update({ is_abandoned: false, abandon_reason: null })
    .or(`id.eq.${taskId},parent_id.eq.${taskId}`)
    .eq("user_id", userId)
    .eq("abandon_reason", "rage_quit")
    .select("id");

  if (error) {
    return { error: "update_failed" };
  }
  if (!restored || restored.length === 0) {
    return { error: null }; // rien à restaurer (déjà annulé / pas un rage quit)
  }

  // Remboursement +5 XP (clampé via applyXpDelta pour garder un profil valide).
  let level: number | undefined;
  let xp: number | undefined;
  const { data: profile } = await supabase
    .from("profiles")
    .select("level, xp")
    .eq("id", userId)
    .maybeSingle();
  if (profile) {
    const next = applyXpDelta(profile, RAGE_QUIT_XP_PENALTY);
    level = next.level;
    xp = next.xp;
    await supabase
      .from("profiles")
      .update({ level: next.level, xp: next.xp })
      .eq("id", userId);
  }

  return { error: null, level, xp };
}

// US-19 : reparente et/ou réordonne un groupe de tâches (drag & drop). Le
// client a déjà décidé le plan (lib/game-engine.ts, planReorder) ; le
// serveur revalide juste les invariants (RG-01) avant de persister position
// et parent_id pour chaque id de la liste, dans l'ordre donné.
export async function reorderSiblingsForUser(
  supabase: SupabaseClient,
  userId: string,
  parentId: string | null,
  orderedTaskIds: string[],
): Promise<DomainResult> {
  // Fix #96 : un drag & drop enchaîné pendant que `addTask` n'est pas encore
  // résolu peut passer des ids `optimistic-*` (la tâche fraîchement créée, ou
  // sa voisine lors d'un réordonnancement). Le serveur ne persiste que des
  // UUID valides ; rejeter tôt plutôt que de "réussir" partiellement (certaines
  // lignes à jour, d'autres inexistantes) → liste désynchronisée côté base.
  if (parentId !== null && !UUID_RE.test(parentId)) {
    return { error: "invalid_task_id" };
  }
  for (const id of orderedTaskIds) {
    if (!UUID_RE.test(id)) {
      return { error: "invalid_task_id" };
    }
  }

  const { data: allTasks, error: fetchError } = await supabase
    .from("tasks")
    .select("id, parent_id, is_abandoned")
    .eq("user_id", userId);

  if (fetchError || !allTasks) {
    return { error: "update_failed" };
  }

  const byId = new Map(allTasks.map((task) => [task.id, task]));

  if (parentId !== null) {
    const targetParent = byId.get(parentId);
    if (!targetParent || targetParent.is_abandoned || !isNestableParent(targetParent)) {
      return { error: "task_not_found" };
    }
  }

  for (const id of orderedTaskIds) {
    const task = byId.get(id);
    if (!task || task.is_abandoned) {
      return { error: "task_not_found" };
    }

    const isChangingParent = task.parent_id !== parentId;
    if (isChangingParent && parentId !== null) {
      const hasChildren = allTasks.some((other) => other.parent_id === id);
      if (hasChildren) {
        return { error: "depth_limit" };
      }
    }
  }

  for (let i = 0; i < orderedTaskIds.length; i += 1) {
    const { error } = await supabase
      .from("tasks")
      .update({ parent_id: parentId, position: i })
      .eq("id", orderedTaskIds[i])
      .eq("user_id", userId);

    if (error) {
      return { error: "update_failed" };
    }
  }

  return { error: null };
}

export interface AddTaskOutcome {
  error: DomainErrorCode | null;
  id?: string;
}

// US-03 : délègue à insertTaskForUser (lib/task-insertion.ts), PARTAGÉE avec
// la route webhook Siri (app/api/webhook/add-task) et le futur serveur MCP —
// un seul endroit calcule position/day_date/HP (RG-01/RG-02), jamais deux fois.
// Issue #201 (lot 4) : `dayDate` optionnel prépare le tool `add_task` avec
// `day: "tomorrow"` — passé tel quel à insertTaskForUser, qui l'accepte déjà.
export async function addTaskForUser(
  supabase: SupabaseClient,
  userId: string,
  title: string,
  dayDate?: string,
): Promise<AddTaskOutcome> {
  const validation = validateTaskTitle(title);
  if ("error" in validation) {
    return { error: "invalid_title" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", userId)
    .maybeSingle();

  let outcome;
  try {
    outcome = await insertTaskForUser(supabase, {
      userId,
      title: validation.title,
      timezone: profile?.timezone ?? "UTC",
      dayDate,
    });
  } catch {
    return { error: "insert_failed" };
  }

  return { error: null, id: outcome.taskId };
}

export async function addSubtaskForUser(
  supabase: SupabaseClient,
  userId: string,
  parentId: string,
  title: string,
): Promise<AddTaskOutcome> {
  const validation = validateTaskTitle(title);
  if ("error" in validation) {
    return { error: "invalid_title" };
  }
  const trimmed = validation.title;

  const { data: parent, error: parentError } = await supabase
    .from("tasks")
    // Issue #116 : `day_date` du parent lu ici pour que la sous-tâche hérite
    // du bon jour (une sous-tâche de la section "Demain" doit rester "demain",
    // pas retomber sur "aujourd'hui" comme avant ce correctif).
    .select("id, parent_id, is_abandoned, day_date")
    .eq("id", parentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (parentError || !parent) {
    return { error: "task_not_found" };
  }

  if (parent.is_abandoned) {
    return { error: "task_abandoned" };
  }

  if (!isNestableParent(parent)) {
    return { error: "depth_limit" };
  }

  const { data: siblings, error: siblingsError } = await supabase
    .from("tasks")
    .select("position")
    .eq("parent_id", parentId);

  if (siblingsError) {
    return { error: "insert_failed" };
  }

  const { data: inserted, error } = await supabase
    .from("tasks")
    .insert({
      user_id: userId,
      parent_id: parentId,
      title: trimmed,
      day_date: parent.day_date,
      position: nextSiblingPosition(siblings ?? []),
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return { error: "insert_failed" };
  }

  return { error: null, id: inserted.id };
}

// US-05 : fixe/modifie/efface l'heure limite d'une tâche (popover ⏰ sur
// TaskRow, ou le bouton "Repousser +1h" de l'Attaque Surprise). `deadlineAt` =
// ISO complet (UTC) ou null pour effacer.
// Fix #95 : id `optimistic-*` envoyable si l'utilisateur pose une deadline
// sur une tâche fraîchement créée avant la résolution de `addTask`.
// Issue #114 : reminderOffsetMinutes/reminderEnabled optionnels — undefined =
// ne touche pas la colonne correspondante (ex. "Repousser +1h" ne change que
// l'heure, les réglages de rappel existants sont conservés).
export async function setTaskDeadlineForUser(
  supabase: SupabaseClient,
  userId: string,
  taskId: string,
  deadlineAt: string | null,
  reminderOffsetMinutes?: number | null,
  reminderEnabled?: boolean,
): Promise<DomainResult> {
  if (!UUID_RE.test(taskId)) {
    return { error: "invalid_task_id" };
  }

  const updates: Record<string, unknown> = { deadline_at: deadlineAt };
  if (reminderOffsetMinutes !== undefined) updates.reminder_offset_minutes = reminderOffsetMinutes;
  if (reminderEnabled !== undefined) updates.reminder_enabled = reminderEnabled;

  const { error } = await supabase.from("tasks").update(updates).eq("id", taskId).eq("user_id", userId);

  if (error) {
    return { error: "update_failed" };
  }

  if (deadlineAt === null) {
    await cancelDeadlineReminder(taskId);
  } else {
    const { data: resolved } = await supabase
      .from("tasks")
      .select("reminder_enabled, reminder_offset_minutes")
      .eq("id", taskId)
      .maybeSingle();

    if (resolved?.reminder_enabled) {
      const { data: profileRow } = await supabase
        .from("profiles")
        .select("reminder_offset_minutes")
        .eq("id", userId)
        .maybeSingle();
      const offset = resolved.reminder_offset_minutes ?? profileRow?.reminder_offset_minutes ?? 30;
      await cancelDeadlineReminder(taskId);
      await scheduleDeadlineReminder({ taskId, userId, deadlineAt, offsetMinutes: offset });
    } else {
      await cancelDeadlineReminder(taskId);
    }
  }

  return { error: null };
}

// Le "jour" du jeu est le jour local de l'utilisateur (RG-03), pas l'UTC.
// On lit le fuseau stocké sur le profil (renseigné à l'onboarding).
export async function userToday(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", userId)
    .maybeSingle();
  return dayKey(new Date(), data?.timezone ?? "UTC");
}

// Suppression du heal Héros : verrouille `count` pénalités -20 (poids fixe du
// pool "overdue", cf. HERO_DAMAGE_PER_OVERDUE_TASK) sur le profil pour le
// jour local courant. Utilisé par completeOverdueTaskForUser / annihilateOverdueTaskForUser
// / annihilateOverdueOlderThanForUser — ces actions résolvent des tâches dont le
// day_date reste dans le passé (ou sortent de toute requête "aujourd'hui"),
// leur dégât ne peut donc pas être porté par une ligne de tâche comme le fait
// `tasks.hp_penalty` pour le reste du jour courant (completeTaskForUser/rageQuitTask).
// Reste PRIVÉE au module : aucun appelant hors de cette famille.
async function lockOverdueDamage(
  supabase: SupabaseClient,
  userId: string,
  count: number,
): Promise<{ hp_damage_locked: number; hp_damage_locked_day: string } | undefined> {
  if (count <= 0) return undefined;
  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone, hp_damage_locked, hp_damage_locked_day")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) return undefined;
  const today = dayKey(new Date(), profile.timezone ?? "UTC");
  const next = nextLockedHpDamage(profile, today, count * HERO_DAMAGE_PER_OVERDUE_TASK);
  await supabase.from("profiles").update(next).eq("id", userId);
  return next;
}

export interface OverdueOutcome {
  error: DomainErrorCode | null;
  deferredTasks?: Task[];
  hpDamageLocked?: { hp_damage_locked: number; hp_damage_locked_day: string };
}

// US-08 (A1) : la tâche a été faite hors app — on la valide rétroactivement
// sur son jour d'origine (elle inflige ses dégâts au Boss de ce jour-là).
// Cascade sur les sous-tâches restes.
export async function completeOverdueTaskForUser(
  supabase: SupabaseClient,
  userId: string,
  taskId: string,
): Promise<OverdueOutcome> {
  if (!UUID_RE.test(taskId)) {
    return { error: "invalid_task_id" };
  }

  const { data: updated, error } = await supabase
    .from("tasks")
    .update({ is_completed: true, deferred_at: null })
    .or(`id.eq.${taskId},parent_id.eq.${taskId}`)
    .eq("user_id", userId)
    .eq("is_abandoned", false)
    .select("id");

  if (error) return { error: "update_failed" };
  // Issue #114 : la tâche (et sa cascade) validées n'ont plus besoin de leur
  // rappel de deadline.
  await Promise.allSettled((updated ?? []).map((row) => cancelDeadlineReminder(row.id as string)));
  // Suppression du heal Héros : chaque tâche validée ici portait -20 HP
  // (pool "overdue") — le dégât est verrouillé sur le profil, sinon la
  // tâche validée sortirait de `overdueTasks` au prochain chargement et les
  // HP remonteraient tout seuls.
  const hpDamageLocked = await lockOverdueDamage(supabase, userId, (updated ?? []).length);
  return { error: null, hpDamageLocked };
}

// US-08 (D5) : reporte au jour local courant — la tâche revient dans la liste
// du jour et re-soigne le Boss (RG-02). La tâche et ses sous-tâches restes
// changent de day_date ; position recalculée en tête de la fratrie du jour.
export async function deferOverdueTaskForUser(
  supabase: SupabaseClient,
  userId: string,
  taskId: string,
): Promise<OverdueOutcome> {
  if (!UUID_RE.test(taskId)) {
    return { error: "invalid_task_id" };
  }

  const today = await userToday(supabase, userId);

  const { data: roots } = await supabase
    .from("tasks")
    .select("position")
    .eq("user_id", userId)
    .eq("day_date", today)
    .is("parent_id", null);

  // US-05 : la deadline (déjà passée la veille) est effacée au report pour ne
  // pas cumuler le malus "deadline ratée" (-10) avec le malus "retard reporté"
  // (-20) déjà appliqué par le mécanisme existant sur la même tâche.
  const { data: updated, error } = await supabase
    .from("tasks")
    .update({
      day_date: today,
      position: nextSiblingPosition(roots ?? []),
      deadline_at: null,
      // Issue #101 (Axe A, by-pass A4-overdue) : le flag `deferred_at` persiste
      // jusqu'à résolution (coche/rage quit). La pénalité -20 "reste reporté"
      // reste active sur la HeroBar après Report, jusqu'à ce que l'utilisateur
      // résolve la tâche.
      deferred_at: new Date().toISOString(),
    })
    .or(`id.eq.${taskId},parent_id.eq.${taskId}`)
    .eq("user_id", userId)
    .eq("is_abandoned", false)
    .select();

  if (error) return { error: "update_failed" };
  // Issue #114 : la deadline vient d'être effacée (deadline_at: null
  // ci-dessus) — le rappel programmé n'a plus de raison d'exister.
  await Promise.allSettled((updated ?? []).map((row) => cancelDeadlineReminder(row.id as string)));
  // Bug #70 : les lignes mises à jour sont renvoyées explicitement — Le
  // Réveil est un overlay client qui ne re-fetch jamais l'Arène en se
  // fermant, donc sans ça la tâche reportée reste invisible côté client
  // (day_date correct en base, mais jamais montrée) jusqu'au prochain rechargement.
  return { error: null, deferredTasks: (updated ?? []) as Task[] };
}

// US-08 (D6) : annihiler = is_abandoned (RG-04, jamais DELETE). Ton non-punitif
// côté UI ("on tourne la page").
export async function annihilateOverdueTaskForUser(
  supabase: SupabaseClient,
  userId: string,
  taskId: string,
): Promise<OverdueOutcome> {
  if (!UUID_RE.test(taskId)) {
    return { error: "invalid_task_id" };
  }

  const { data: updated, error } = await supabase
    .from("tasks")
    .update({ is_abandoned: true, abandon_reason: "annihilated" })
    .or(`id.eq.${taskId},parent_id.eq.${taskId}`)
    .eq("user_id", userId)
    // Suppression du heal Héros : sans ce garde, ré-annihiler une tâche déjà
    // annihilée (clic redondant) reverrouillerait -20 une 2e fois pour rien —
    // idempotence déjà assurée pour completeOverdueTaskForUser (eq is_abandoned false).
    .eq("is_abandoned", false)
    .select("id");

  if (error) return { error: "update_failed" };
  // Issue #114 : reste annihilé (et sa cascade) — plus de rappel à envoyer.
  await Promise.allSettled((updated ?? []).map((row) => cancelDeadlineReminder(row.id as string)));
  // Suppression du heal Héros : même raison que completeOverdueTaskForUser.
  const hpDamageLocked = await lockOverdueDamage(supabase, userId, (updated ?? []).length);
  return { error: null, hpDamageLocked };
}

// US-08 (A4) : action groupée anti "mur de la honte" — reporte tous les restes
// au jour local courant.
export async function deferAllOverdueForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<OverdueOutcome> {
  const today = await userToday(supabase, userId);
  const { data: updated, error } = await supabase
    .from("tasks")
    .update({
      day_date: today,
      deadline_at: null,
      // Issue #101 (Axe A, by-pass A4-overdue) : même logique que
      // deferOverdueTaskForUser — `deferred_at` persiste jusqu'à résolution.
      deferred_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .lt("day_date", today)
    .eq("is_completed", false)
    .eq("is_abandoned", false)
    .select();

  if (error) return { error: "update_failed" };
  // Issue #114 : même raison que deferOverdueTaskForUser — deadline effacée,
  // rappel programmé obsolète.
  await Promise.allSettled((updated ?? []).map((row) => cancelDeadlineReminder(row.id as string)));
  // Bug #70 : voir deferOverdueTaskForUser ci-dessus — même besoin de renvoyer
  // les lignes reportées pour que le Réveil les remonte à l'Arène.
  return { error: null, deferredTasks: (updated ?? []) as Task[] };
}

// US-08 (A4) : action groupée — annihile les restes plus vieux que `days` jours.
export async function annihilateOverdueOlderThanForUser(
  supabase: SupabaseClient,
  userId: string,
  days: number,
): Promise<OverdueOutcome> {
  const today = await userToday(supabase, userId);
  const cutoff = dayKey(
    new Date(Date.parse(`${today}T00:00:00Z`) - days * 86400000),
    "UTC",
  );

  const { data: updated, error } = await supabase
    .from("tasks")
    .update({ is_abandoned: true, abandon_reason: "annihilated" })
    .eq("user_id", userId)
    .lt("day_date", cutoff)
    .eq("is_completed", false)
    .eq("is_abandoned", false)
    .select("id");

  if (error) return { error: "update_failed" };
  // Issue #114 : tous les vieux restes annihilés perdent leur rappel.
  await Promise.allSettled((updated ?? []).map((row) => cancelDeadlineReminder(row.id as string)));
  // Suppression du heal Héros : même raison que completeOverdueTaskForUser/annihilateOverdueTaskForUser.
  const hpDamageLocked = await lockOverdueDamage(supabase, userId, (updated ?? []).length);
  return { error: null, hpDamageLocked };
}
