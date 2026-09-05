"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  applyRageQuitPenalty,
  applyXpDelta,
  collectAbandonCascade,
  dayKey,
  hpPenaltyToLock,
  isNestableParent,
  nextDayKey,
  nextSiblingPosition,
  RAGE_QUIT_XP_PENALTY,
} from "@/lib/game-engine";
import type { CascadeTask } from "@/lib/game-engine";
import { insertTaskForUser } from "@/lib/task-insertion";
import { validateTaskTitle } from "@/lib/task-title";
import { cancelDeadlineReminder } from "@/lib/inngest/deadline-reminder";
import {
  addSubtaskForUser,
  addTaskForUser,
  annihilateOverdueOlderThanForUser,
  annihilateOverdueTaskForUser,
  completeOverdueTaskForUser,
  completeTaskForUser,
  deferAllOverdueForUser,
  deferOverdueTaskForUser,
  setTaskDeadlineForUser,
  userToday,
} from "@/lib/domain/tasks";
import type { DomainErrorCode } from "@/lib/domain/errors";
import type { Task } from "@/types";

// Audit #67, PR5 : `id` alimente un filtre PostgREST `.or()` construit par
// interpolation de chaîne (undoRageQuit/completeOverdueTask/deferOverdueTask/
// annihilateOverdueTask) — un id forgé contenant une virgule/opérateur de
// filtre pourrait élargir la clause au-delà de la tâche visée (contenu par
// le .eq("user_id", ...) chaîné en AND, donc pas de fuite cross-tenant, mais
// un risque d'intégrité de données). Valider le format avant construction.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TaskActionResult {
  error: string | null;
  id?: string;
  level?: number;
  xp?: number;
  leveledUp?: boolean;
  deferredTasks?: Task[];
  comboCount?: number;
  newAchievements?: string[];
  // Issue #116 : lignes déplacées vers demain / ramenées à aujourd'hui, pour
  // fusion explicite côté client (même besoin que deferredTasks, cf. bug #70).
  reportedTasks?: Task[];
  broughtBackTasks?: Task[];
  // Suppression du heal Héros : total de dégât verrouillé sur le profil pour
  // le jour local courant, renvoyé par completeOverdueTask/annihilateOverdueTask/
  // annihilateOverdueOlderThan — la tâche résolue change de day_date ou sort
  // de toute requête "aujourd'hui", son dégât ne peut donc pas voyager sur une
  // ligne de tâche (fusion explicite côté client, même raison que ci-dessus).
  hpDamageLocked?: { hp_damage_locked: number; hp_damage_locked_day: string };
}

// US-03 : addTask délègue désormais à insertTaskForUser (lib/task-insertion.ts),
// PARTAGÉE avec la route webhook Siri (app/api/webhook/add-task) — un seul
// endroit calcule position/day_date/HP (RG-01/RG-02), jamais deux fois.
// Issue #201 (lot 1) : wrapper mince autour de addTaskForUser (lib/domain/tasks.ts).
// `validateTaskTitle` est rappelée ici (double validation volontaire, sans coût
// car pure) pour restituer le message précis (titre vide vs trop long) que le
// domaine ne porte pas — celui-ci ne renvoie qu'un code générique `invalid_title`.
export async function addTask(title: string): Promise<TaskActionResult> {
  const validation = validateTaskTitle(title);
  if ("error" in validation) {
    return { error: validation.error };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Session expirée. Reconnecte-toi." };
  }

  const outcome = await addTaskForUser(supabase, user.id, validation.title);
  if (outcome.error !== null) {
    return { error: "Le monstre a résisté à l'invocation. Réessaie." };
  }

  revalidatePath("/");
  return { error: null, id: outcome.id };
}

export async function addSubtask(parentId: string, title: string): Promise<TaskActionResult> {
  const validation = validateTaskTitle(title);
  if ("error" in validation) {
    return { error: validation.error };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Session expirée. Reconnecte-toi." };
  }

  const outcome = await addSubtaskForUser(supabase, user.id, parentId, validation.title);
  if (outcome.error !== null) {
    return { error: subtaskErrorMessage(outcome.error) };
  }

  revalidatePath("/");
  return { error: null, id: outcome.id };
}

function subtaskErrorMessage(code: DomainErrorCode): string {
  if (code === "task_not_found") return "Cette tâche est introuvable.";
  if (code === "task_abandoned") return "Cette tâche a été abandonnée, pas de sous-tâche possible.";
  if (code === "depth_limit") return "Deux niveaux, pas plus — cette tâche est déjà une sous-tâche.";
  return "La sous-tâche a résisté à l'invocation. Réessaie.";
}

export async function setTaskCompleted(
  id: string,
  isCompleted: boolean,
): Promise<TaskActionResult> {
  // Fix #95 : un id `optimistic-*` ne doit JAMAIS atteindre Supabase — cette
  // garde doit rester AVANT createClient()/getUser(), pas seulement dans la
  // garde interne de completeTaskForUser (défense en profondeur pour le futur
  // serveur MCP qui appelle le domaine directement) : sinon un tap optimiste
  // avec une session expirée renverrait "Session expirée" au lieu du message
  // dédié, et chaque tap rejeté coûterait un aller-retour réseau vers GoTrue.
  if (!UUID_RE.test(id)) {
    return {
      error: isCompleted
        ? "La tâche n'est pas encore prête, réessaie dans un instant."
        : "Impossible d'annuler pour l'instant, réessaie dans un instant.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Session expirée. Reconnecte-toi." };
  }

  const outcome = await completeTaskForUser(supabase, user.id, id, isCompleted);

  if (outcome.error !== null) {
    return { error: completionErrorMessage(outcome.error, isCompleted) };
  }

  revalidatePath("/");
  return {
    error: null,
    level: outcome.level,
    xp: outcome.xp,
    leveledUp: outcome.leveledUp,
    comboCount: outcome.comboCount,
    newAchievements: outcome.newAchievements,
  };
}

// Traduction code → copy « voix ». Les deux variantes par code existent parce
// que cocher et décocher n'ont jamais eu le même message (Fix #95 : ne pas
// afficher « Le coup n'est pas passé » quand la vraie cause est un tap trop
// rapide sur une tâche pas encore créée).
function completionErrorMessage(code: DomainErrorCode, isCompleted: boolean): string {
  if (code === "invalid_task_id") {
    return isCompleted
      ? "La tâche n'est pas encore prête, réessaie dans un instant."
      : "Impossible d'annuler pour l'instant, réessaie dans un instant.";
  }
  return isCompleted ? "Le coup n'est pas passé. Réessaie." : "Impossible d'annuler le coup. Réessaie.";
}

// US-15 : Rage Quit — abandonner une tâche active du jour en cours de combat.
// Punitif (≠ « Annihiler » serein du Réveil) : malus −5 XP clampé sans de-level,
// Boss rétréci (la tâche sort du calcul HP), cascade sur les sous-tâches actives.
// RG-04 : jamais de DELETE, on pose is_abandoned=true + abandon_reason='rage_quit'.
// Le malus est appliqué UNE fois par action (pas par tâche cascadée).
export async function rageQuitTask(id: string): Promise<TaskActionResult> {
  // Fix #95 : id `optimistic-*` envoyable si l'utilisateur déclenche un Rage
  // Quit (clic sur × puis confirm) sur une tâche fraîchement créée avant la
  // résolution de `addTask`. La cascade `collectAbandonCascade` trouverait 0
  // id renvoyant toast "Impossible d'abandonner cette tâche", mais on court-
  //-circuite plutôt ici pour ne même pas requêter la base.
  if (!UUID_RE.test(id)) {
    return { error: "Cette tâche n'est pas encore prête, réessaie dans un instant." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Session expirée. Reconnecte-toi." };
  }

  // Charge la tâche + sa fratrie potentielle (mêmes racine/enfants) pour la cascade pure.
  const { data: siblings, error: fetchError } = await supabase
    .from("tasks")
    .select("id, parent_id, is_completed, is_abandoned, deadline_at, deferred_at")
    .eq("user_id", user.id);

  if (fetchError || !siblings) {
    return { error: "Impossible d'abandonner cette tâche. Réessaie." };
  }

  const cascadeIds = collectAbandonCascade(id, siblings as CascadeTask[]);
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
    .eq("user_id", user.id);

  if (error) {
    return { error: "Impossible d'abandonner cette tâche. Réessaie." };
  }

  // Suppression du heal Héros : verrouille le poids de chaque tâche cascadée
  // qui portait déjà une pénalité active (lu depuis `siblings`, capturé avant
  // l'update ci-dessus qui efface `deferred_at`). Groupé par montant (10 ou
  // 20) pour éviter un update par tâche.
  const now = new Date();
  const idsByLockAmount = new Map<number, string[]>();
  for (const taskId of cascadeIds) {
    const row = siblings.find((s) => s.id === taskId);
    const amount = row ? hpPenaltyToLock(row, now) : null;
    if (amount !== null) {
      idsByLockAmount.set(amount, [...(idsByLockAmount.get(amount) ?? []), taskId]);
    }
  }
  for (const [amount, ids] of idsByLockAmount) {
    await supabase
      .from("tasks")
      .update({ hp_penalty: amount })
      .in("id", ids)
      .eq("user_id", user.id);
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
    .eq("id", user.id)
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
      .eq("id", user.id);
  }

  revalidatePath("/");
  return { error: null, level, xp };
}

// US-15 : annuler un Rage Quit (même jour). Restaure is_abandoned=false, efface
// abandon_reason, rembourse +5 XP (clampé). Ne remonte que les tâches réellement
// rage-quit (garde par abandon_reason) — un « Annihiler » n'est pas annulable ici.
export async function undoRageQuit(id: string): Promise<TaskActionResult> {
  if (!UUID_RE.test(id)) {
    return { error: "Identifiant de tâche invalide." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Session expirée. Reconnecte-toi." };
  }

  const { data: restored, error } = await supabase
    .from("tasks")
    .update({ is_abandoned: false, abandon_reason: null })
    .or(`id.eq.${id},parent_id.eq.${id}`)
    .eq("user_id", user.id)
    .eq("abandon_reason", "rage_quit")
    .select("id");

  if (error) {
    return { error: "Impossible d'annuler l'abandon. Réessaie." };
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
    .eq("id", user.id)
    .maybeSingle();
  if (profile) {
    const next = applyXpDelta(profile, RAGE_QUIT_XP_PENALTY);
    level = next.level;
    xp = next.xp;
    await supabase
      .from("profiles")
      .update({ level: next.level, xp: next.xp })
      .eq("id", user.id);
  }

  revalidatePath("/");
  return { error: null, level, xp };
}

// US-19 : reparente et/ou réordonne un groupe de tâches (drag & drop). Le
// client a déjà décidé le plan (lib/game-engine.ts, planReorder) ; le
// serveur revalide juste les invariants (RG-01) avant de persister position
// et parent_id pour chaque id de la liste, dans l'ordre donné.
export async function reorderSiblings(
  parentId: string | null,
  orderedTaskIds: string[],
): Promise<TaskActionResult> {
  // Fix #96 : un drag & drop enchaîné pendant que `addTask` n'est pas encore
  // résolu peut passer des ids `optimistic-*` (la tâche fraîchement créée, ou
  // sa voisine lors d'un réordonnancement). Le serveur ne persiste que des
  // UUID valides ; rejeter tôt plutôt que de "réussir" partiellement (certaines
  // lignes à jour, d'autres inexistantes) → liste désynchronisée côté base.
  if (parentId !== null && !UUID_RE.test(parentId)) {
    return { error: "Cette tâche n'est pas encore prête, réessaie dans un instant." };
  }
  for (const id of orderedTaskIds) {
    if (!UUID_RE.test(id)) {
      return { error: "Cette tâche n'est pas encore prête, réessaie dans un instant." };
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Session expirée. Reconnecte-toi." };
  }

  const { data: allTasks, error: fetchError } = await supabase
    .from("tasks")
    .select("id, parent_id, is_abandoned")
    .eq("user_id", user.id);

  if (fetchError || !allTasks) {
    return { error: "Impossible de réorganiser ces tâches. Réessaie." };
  }

  const byId = new Map(allTasks.map((task) => [task.id, task]));

  if (parentId !== null) {
    const targetParent = byId.get(parentId);
    if (!targetParent || targetParent.is_abandoned || !isNestableParent(targetParent)) {
      return { error: "Cette tâche est introuvable." };
    }
  }

  for (const id of orderedTaskIds) {
    const task = byId.get(id);
    if (!task || task.is_abandoned) {
      return { error: "Cette tâche est introuvable." };
    }

    const isChangingParent = task.parent_id !== parentId;
    if (isChangingParent && parentId !== null) {
      const hasChildren = allTasks.some((other) => other.parent_id === id);
      if (hasChildren) {
        return {
          error: "Cette tâche a déjà des sous-tâches, elle ne peut pas devenir une sous-tâche.",
        };
      }
    }
  }

  for (let i = 0; i < orderedTaskIds.length; i += 1) {
    const { error } = await supabase
      .from("tasks")
      .update({ parent_id: parentId, position: i })
      .eq("id", orderedTaskIds[i])
      .eq("user_id", user.id);

    if (error) {
      return { error: "Impossible de réorganiser ces tâches. Réessaie." };
    }
  }

  revalidatePath("/");
  return { error: null };
}

// US-08 (A1) : la tâche a été faite hors app — on la valide rétroactivement
// sur son jour d'origine (elle inflige ses dégâts au Boss de ce jour-là).
// Cascade sur les sous-tâches restes.
export async function completeOverdueTask(id: string): Promise<TaskActionResult> {
  if (!UUID_RE.test(id)) {
    return { error: "Identifiant de tâche invalide." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const outcome = await completeOverdueTaskForUser(supabase, user.id, id);
  if (outcome.error !== null) {
    return { error: "Impossible de valider ce reste. Réessaie." };
  }

  revalidatePath("/");
  return { error: null, hpDamageLocked: outcome.hpDamageLocked };
}

// US-08 (D5) : reporte au jour local courant — la tâche revient dans la liste
// du jour et re-soigne le Boss (RG-02). La tâche et ses sous-tâches restes
// changent de day_date ; position recalculée en tête de la fratrie du jour.
export async function deferOverdueTask(id: string): Promise<TaskActionResult> {
  if (!UUID_RE.test(id)) {
    return { error: "Identifiant de tâche invalide." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const outcome = await deferOverdueTaskForUser(supabase, user.id, id);
  if (outcome.error !== null) {
    return { error: "Impossible de reporter ce reste. Réessaie." };
  }

  revalidatePath("/");
  // Bug #70 : les lignes mises à jour sont renvoyées explicitement — le
  // Le Réveil est un overlay client qui ne re-fetch jamais l'Arène en
  // se fermant, donc sans ça la tâche reportée reste invisible côté client
  // (day_date correct en base, mais jamais montrée) jusqu'au prochain rechargement.
  return { error: null, deferredTasks: outcome.deferredTasks };
}

// US-08 (D6) : annihiler = is_abandoned (RG-04, jamais DELETE). Ton non-punitif
// côté UI ("on tourne la page").
export async function annihilateOverdueTask(id: string): Promise<TaskActionResult> {
  if (!UUID_RE.test(id)) {
    return { error: "Identifiant de tâche invalide." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const outcome = await annihilateOverdueTaskForUser(supabase, user.id, id);
  if (outcome.error !== null) {
    return { error: "Impossible d'annihiler ce reste. Réessaie." };
  }

  revalidatePath("/");
  return { error: null, hpDamageLocked: outcome.hpDamageLocked };
}

// US-08 (A4) : action groupée anti "mur de la honte" — reporte tous les restes
// au jour local courant.
export async function deferAllOverdue(): Promise<TaskActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const outcome = await deferAllOverdueForUser(supabase, user.id);
  if (outcome.error !== null) {
    return { error: "Impossible de tout reporter. Réessaie." };
  }

  revalidatePath("/");
  // Bug #70 : voir deferOverdueTask ci-dessus — même besoin de renvoyer les
  // lignes reportées pour que le Réveil les remonte à l'Arène.
  return { error: null, deferredTasks: outcome.deferredTasks };
}

// US-08 (A4) : action groupée — annihile les restes plus vieux que `days` jours.
export async function annihilateOverdueOlderThan(days: number): Promise<TaskActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const outcome = await annihilateOverdueOlderThanForUser(supabase, user.id, days);
  if (outcome.error !== null) {
    return { error: "Impossible d'annihiler les vieux restes. Réessaie." };
  }

  revalidatePath("/");
  return { error: null, hpDamageLocked: outcome.hpDamageLocked };
}

// US-05 : fixe/modifie/efface l'heure limite d'une tâche (popover ⏰ sur
// TaskRow, ou le bouton "Repousser +1h" de l'Attaque Surprise). `deadlineAt` =
// ISO complet (UTC) ou null pour effacer.
// Fix #95 : id `optimistic-*` envoyable si l'utilisateur pose une deadline
// sur une tâche fraîchement créée avant la résolution de `addTask`.
// Issue #114 : reminderOffsetMinutes/reminderEnabled optionnels — undefined =
// ne touche pas la colonne correspondante (ex. "Repousser +1h" ne change que
// l'heure, les réglages de rappel existants sont conservés).
export async function setTaskDeadline(
  id: string,
  deadlineAt: string | null,
  reminderOffsetMinutes?: number | null,
  reminderEnabled?: boolean,
): Promise<TaskActionResult> {
  // Fix #95 : un id `optimistic-*` ne doit JAMAIS atteindre Supabase — cette
  // garde doit rester AVANT createClient()/getUser(), pas seulement dans la
  // garde interne de setTaskDeadlineForUser (défense en profondeur pour le
  // futur serveur MCP qui appelle le domaine directement) : sinon un tap
  // optimiste avec une session expirée renverrait "Session expirée" au lieu
  // du message dédié, et chaque tap rejeté coûterait un aller-retour réseau
  // vers GoTrue.
  if (!UUID_RE.test(id)) {
    return { error: "Cette tâche n'est pas encore prête, réessaie dans un instant." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Session expirée. Reconnecte-toi." };
  }

  const outcome = await setTaskDeadlineForUser(
    supabase,
    user.id,
    id,
    deadlineAt,
    reminderOffsetMinutes,
    reminderEnabled,
  );

  if (outcome.error !== null) {
    return {
      error:
        outcome.error === "invalid_task_id"
          ? "Cette tâche n'est pas encore prête, réessaie dans un instant."
          : "Impossible de fixer cette deadline. Réessaie.",
    };
  }

  revalidatePath("/");
  return { error: null };
}

// Issue #116 : crée une tâche directement pour demain (section "Demain" de
// l'Arène, visible après l'heure seuil réglable). Ne soigne jamais le Boss
// d'aujourd'hui : calculateBossMaxHp/CurrentHp ne reçoivent que les tâches
// filtrées day_date == aujourd'hui côté client, l'exclusion est automatique.
export async function addTomorrowTask(title: string): Promise<TaskActionResult> {
  const validation = validateTaskTitle(title);
  if ("error" in validation) {
    return { error: validation.error };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Session expirée. Reconnecte-toi." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .maybeSingle();

  const timezone = profile?.timezone ?? "UTC";
  const today = dayKey(new Date(), timezone);
  const tomorrow = nextDayKey(today);

  let outcome;
  try {
    outcome = await insertTaskForUser(supabase, {
      userId: user.id,
      title: validation.title,
      timezone,
      dayDate: tomorrow,
    });
  } catch {
    return { error: "Le monstre a résisté à l'invocation. Réessaie." };
  }

  revalidatePath("/");
  return { error: null, id: outcome.taskId };
}

// Issue #116 : reporte une tâche active du jour (+ sous-tâches actives) vers
// demain — sens inverse de deferOverdueTask (US-08). Jamais de malus Hero HP :
// contrairement à un reste (procrastination avérée), c'est une planification
// proactive avant la fin du jour courant. `deferred_at` est explicitement remis
// à null (jamais posé), y compris si la tâche le portait déjà (ex. reste
// reporté par Le Réveil plus tôt aujourd'hui, repoussé encore par cette
// action) — sinon le malus -20 HP réapparaîtrait à tort demain matin alors que
// la tâche ne serait plus "en retard" (son day_date == le "aujourd'hui" de demain).
export async function reportToTomorrow(id: string): Promise<TaskActionResult> {
  if (!UUID_RE.test(id)) {
    return { error: "Cette tâche n'est pas encore prête, réessaie dans un instant." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const today = await userToday(supabase, user.id);
  const tomorrow = nextDayKey(today);

  const { data: tomorrowRoots } = await supabase
    .from("tasks")
    .select("position")
    .eq("user_id", user.id)
    .eq("day_date", tomorrow)
    .is("parent_id", null);

  const { data: updated, error } = await supabase
    .from("tasks")
    .update({
      day_date: tomorrow,
      position: nextSiblingPosition(tomorrowRoots ?? []),
      deadline_at: null,
      deferred_at: null,
    })
    .or(`id.eq.${id},parent_id.eq.${id}`)
    .eq("user_id", user.id)
    .eq("day_date", today)
    .eq("is_completed", false)
    .eq("is_abandoned", false)
    .select();

  if (error) return { error: "Impossible de reporter cette tâche à demain. Réessaie." };
  // Issue #114 : deadline effacée ci-dessus — rappel programmé obsolète.
  await Promise.allSettled((updated ?? []).map((row) => cancelDeadlineReminder(row.id as string)));
  revalidatePath("/");
  return { error: null, reportedTasks: (updated ?? []) as Task[] };
}

// Issue #116 : ramène une tâche de la section "Demain" à aujourd'hui —
// changement d'avis, OU annulation (~5s) juste après un reportToTomorrow (une
// seule action sert les deux usages, cf. plan d'implémentation).
// Simplification assumée : pas de restauration exacte de la position/deadline
// d'origine, la tâche revient en fin de fratrie du jour, deadline effacée.
export async function bringToToday(id: string): Promise<TaskActionResult> {
  if (!UUID_RE.test(id)) {
    return { error: "Cette tâche n'est pas encore prête, réessaie dans un instant." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const today = await userToday(supabase, user.id);

  const { data: todayRoots } = await supabase
    .from("tasks")
    .select("position")
    .eq("user_id", user.id)
    .eq("day_date", today)
    .is("parent_id", null);

  const { data: updated, error } = await supabase
    .from("tasks")
    .update({
      day_date: today,
      position: nextSiblingPosition(todayRoots ?? []),
      deadline_at: null,
      deferred_at: null,
    })
    .or(`id.eq.${id},parent_id.eq.${id}`)
    .eq("user_id", user.id)
    .eq("is_abandoned", false)
    .select();

  if (error) return { error: "Impossible de ramener cette tâche à aujourd'hui. Réessaie." };
  // Issue #114 : deadline effacée ci-dessus — rappel programmé obsolète.
  await Promise.allSettled((updated ?? []).map((row) => cancelDeadlineReminder(row.id as string)));
  revalidatePath("/");
  return { error: null, broughtBackTasks: (updated ?? []) as Task[] };
}
