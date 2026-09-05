"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validateTaskTitle } from "@/lib/task-title";
import {
  addSubtaskForUser,
  addTaskForUser,
  addTomorrowTaskForUser,
  annihilateOverdueOlderThanForUser,
  annihilateOverdueTaskForUser,
  bringToTodayForUser,
  completeOverdueTaskForUser,
  completeTaskForUser,
  deferAllOverdueForUser,
  deferOverdueTaskForUser,
  rageQuitTaskForUser,
  reorderSiblingsForUser,
  reportToTomorrowForUser,
  setTaskDeadlineForUser,
  undoRageQuitForUser,
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
// Issue #201 (lot 1) : wrapper mince autour de rageQuitTaskForUser (lib/domain/tasks.ts).
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

  const outcome = await rageQuitTaskForUser(supabase, user.id, id);
  if (outcome.error !== null) {
    return { error: "Impossible d'abandonner cette tâche. Réessaie." };
  }

  revalidatePath("/");
  return { error: null, level: outcome.level, xp: outcome.xp };
}

// US-15 : annuler un Rage Quit (même jour). Restaure is_abandoned=false, efface
// abandon_reason, rembourse +5 XP (clampé). Ne remonte que les tâches réellement
// rage-quit (garde par abandon_reason) — un « Annihiler » n'est pas annulable ici.
// Issue #201 (lot 1) : wrapper mince autour de undoRageQuitForUser (lib/domain/tasks.ts).
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

  const outcome = await undoRageQuitForUser(supabase, user.id, id);
  if (outcome.error !== null) {
    return { error: "Impossible d'annuler l'abandon. Réessaie." };
  }

  revalidatePath("/");
  return { error: null, level: outcome.level, xp: outcome.xp };
}

// US-19 : reparente et/ou réordonne un groupe de tâches (drag & drop). Le
// client a déjà décidé le plan (lib/game-engine.ts, planReorder) ; le
// serveur revalide juste les invariants (RG-01) avant de persister position
// et parent_id pour chaque id de la liste, dans l'ordre donné.
// Issue #201 (lot 1) : wrapper mince autour de reorderSiblingsForUser (lib/domain/tasks.ts).
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

  const outcome = await reorderSiblingsForUser(supabase, user.id, parentId, orderedTaskIds);
  if (outcome.error !== null) {
    return { error: reorderErrorMessage(outcome.error) };
  }

  revalidatePath("/");
  return { error: null };
}

function reorderErrorMessage(code: DomainErrorCode): string {
  if (code === "task_not_found") return "Cette tâche est introuvable.";
  if (code === "depth_limit") {
    return "Cette tâche a déjà des sous-tâches, elle ne peut pas devenir une sous-tâche.";
  }
  return "Impossible de réorganiser ces tâches. Réessaie.";
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
// Issue #201 (lot 1) : wrapper mince autour de addTomorrowTaskForUser (lib/domain/tasks.ts).
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

  const outcome = await addTomorrowTaskForUser(supabase, user.id, validation.title);
  if (outcome.error !== null) {
    return { error: "Le monstre a résisté à l'invocation. Réessaie." };
  }

  revalidatePath("/");
  return { error: null, id: outcome.id };
}

// Issue #116 : reporte une tâche active du jour (+ sous-tâches actives) vers
// demain — sens inverse de deferOverdueTask (US-08). Jamais de malus Hero HP :
// contrairement à un reste (procrastination avérée), c'est une planification
// proactive avant la fin du jour courant. `deferred_at` est explicitement remis
// à null (jamais posé), y compris si la tâche le portait déjà (ex. reste
// reporté par Le Réveil plus tôt aujourd'hui, repoussé encore par cette
// action) — sinon le malus -20 HP réapparaîtrait à tort demain matin alors que
// la tâche ne serait plus "en retard" (son day_date == le "aujourd'hui" de demain).
// Issue #201 (lot 1) : wrapper mince autour de reportToTomorrowForUser (lib/domain/tasks.ts).
export async function reportToTomorrow(id: string): Promise<TaskActionResult> {
  if (!UUID_RE.test(id)) {
    return { error: "Cette tâche n'est pas encore prête, réessaie dans un instant." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const outcome = await reportToTomorrowForUser(supabase, user.id, id);
  if (outcome.error !== null) {
    return { error: "Impossible de reporter cette tâche à demain. Réessaie." };
  }

  revalidatePath("/");
  // Bug #70 : voir deferOverdueTask — même besoin de renvoyer les lignes
  // reportées pour que l'Arène les fusionne explicitement côté client.
  return { error: null, reportedTasks: outcome.reportedTasks };
}

// Issue #116 : ramène une tâche de la section "Demain" à aujourd'hui —
// changement d'avis, OU annulation (~5s) juste après un reportToTomorrow (une
// seule action sert les deux usages, cf. plan d'implémentation).
// Simplification assumée : pas de restauration exacte de la position/deadline
// d'origine, la tâche revient en fin de fratrie du jour, deadline effacée.
// Issue #201 (lot 1) : wrapper mince autour de bringToTodayForUser (lib/domain/tasks.ts).
export async function bringToToday(id: string): Promise<TaskActionResult> {
  if (!UUID_RE.test(id)) {
    return { error: "Cette tâche n'est pas encore prête, réessaie dans un instant." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const outcome = await bringToTodayForUser(supabase, user.id, id);
  if (outcome.error !== null) {
    return { error: "Impossible de ramener cette tâche à aujourd'hui. Réessaie." };
  }

  revalidatePath("/");
  // Bug #70 : même besoin que reportToTomorrow ci-dessus.
  return { error: null, broughtBackTasks: outcome.broughtBackTasks };
}
