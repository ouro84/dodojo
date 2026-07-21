"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  applyRageQuitPenalty,
  applyXpDelta,
  collectAbandonCascade,
  dayKey,
  isNestableParent,
  nextSiblingPosition,
  RAGE_QUIT_XP_PENALTY,
  XP_PER_TASK,
} from "@/lib/game-engine";
import type { CascadeTask } from "@/lib/game-engine";

export interface TaskActionResult {
  error: string | null;
  id?: string;
  level?: number;
  xp?: number;
  leveledUp?: boolean;
}

// Le "jour" du jeu est le jour local de l'utilisateur (RG-03), pas l'UTC.
// On lit le fuseau stocké sur le profil (renseigné à l'onboarding).
async function userToday(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string> {
  const { data } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", userId)
    .maybeSingle();
  return dayKey(new Date(), data?.timezone ?? "UTC");
}

export async function addTask(title: string): Promise<TaskActionResult> {
  const trimmed = title.trim();

  if (!trimmed) {
    return { error: "Nomme ton monstre avant de l'invoquer." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Session expirée. Reconnecte-toi." };
  }

  const today = await userToday(supabase, user.id);
  const { data: roots, error: rootsError } = await supabase
    .from("tasks")
    .select("position")
    .eq("user_id", user.id)
    .eq("day_date", today)
    .is("parent_id", null);

  if (rootsError) {
    return { error: "Le monstre a résisté à l'invocation. Réessaie." };
  }

  const { data: inserted, error } = await supabase
    .from("tasks")
    .insert({
      user_id: user.id,
      title: trimmed,
      day_date: today,
      position: nextSiblingPosition(roots ?? []),
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return { error: "Le monstre a résisté à l'invocation. Réessaie." };
  }

  revalidatePath("/");
  return { error: null, id: inserted.id };
}

export async function addSubtask(
  parentId: string,
  title: string,
): Promise<TaskActionResult> {
  const trimmed = title.trim();

  if (!trimmed) {
    return { error: "Nomme ta sous-tâche avant de l'invoquer." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Session expirée. Reconnecte-toi." };
  }

  const { data: parent, error: parentError } = await supabase
    .from("tasks")
    .select("id, parent_id, is_abandoned")
    .eq("id", parentId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (parentError || !parent) {
    return { error: "Cette tâche est introuvable." };
  }

  if (parent.is_abandoned) {
    return { error: "Cette tâche a été abandonnée, pas de sous-tâche possible." };
  }

  if (!isNestableParent(parent)) {
    return { error: "Deux niveaux, pas plus — cette tâche est déjà une sous-tâche." };
  }

  const { data: siblings, error: siblingsError } = await supabase
    .from("tasks")
    .select("position")
    .eq("parent_id", parentId);

  if (siblingsError) {
    return { error: "La sous-tâche a résisté à l'invocation. Réessaie." };
  }

  const today = await userToday(supabase, user.id);
  const { data: inserted, error } = await supabase
    .from("tasks")
    .insert({
      user_id: user.id,
      parent_id: parentId,
      title: trimmed,
      day_date: today,
      position: nextSiblingPosition(siblings ?? []),
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return { error: "La sous-tâche a résisté à l'invocation. Réessaie." };
  }

  revalidatePath("/");
  return { error: null, id: inserted.id };
}

export async function setTaskCompleted(
  id: string,
  isCompleted: boolean,
): Promise<TaskActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Session expirée. Reconnecte-toi." };
  }

  const { data: existingTask, error: fetchError } = await supabase
    .from("tasks")
    .select("is_completed, is_abandoned")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchError || !existingTask) {
    return {
      error: isCompleted
        ? "Le coup n'est pas passé. Réessaie."
        : "Impossible d'annuler le coup. Réessaie.",
    };
  }

  const { error: updateError } = await supabase
    .from("tasks")
    .update({ is_completed: isCompleted })
    .eq("id", id)
    .eq("user_id", user.id);

  if (updateError) {
    return {
      error: isCompleted
        ? "Le coup n'est pas passé. Réessaie."
        : "Impossible d'annuler le coup. Réessaie.",
    };
  }

  const isRealTransition = existingTask.is_completed !== isCompleted;
  let level: number | undefined;
  let xp: number | undefined;
  let leveledUp = false;

  if (isRealTransition && !existingTask.is_abandoned) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("level, xp")
      .eq("id", user.id)
      .maybeSingle();

    // Le profil n'est jamais absent en usage normal (onboarding le garantit) ;
    // si le fetch échoue quand même, on ne bloque pas la validation de la
    // tâche pour autant — seul le gain d'XP est perdu pour ce coup.
    if (!profileError && profile) {
      const delta = isCompleted ? XP_PER_TASK : -XP_PER_TASK;
      const next = applyXpDelta(profile, delta);
      leveledUp = next.level > profile.level;
      level = next.level;
      xp = next.xp;

      await supabase
        .from("profiles")
        .update({ level: next.level, xp: next.xp })
        .eq("id", user.id);
    }
  }

  revalidatePath("/");
  return { error: null, level, xp, leveledUp };
}

// US-15 : Rage Quit — abandonner une tâche active du jour en cours de combat.
// Punitif (≠ « Annihiler » serein du Réveil) : malus −5 XP clampé sans de-level,
// Boss rétréci (la tâche sort du calcul HP), cascade sur les sous-tâches actives.
// RG-04 : jamais de DELETE, on pose is_abandoned=true + abandon_reason='rage_quit'.
// Le malus est appliqué UNE fois par action (pas par tâche cascadée).
export async function rageQuitTask(id: string): Promise<TaskActionResult> {
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
    .select("id, parent_id, is_completed, is_abandoned")
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
    .update({ is_abandoned: true, abandon_reason: "rage_quit" })
    .in("id", cascadeIds)
    .eq("user_id", user.id);

  if (error) {
    return { error: "Impossible d'abandonner cette tâche. Réessaie." };
  }

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
    await supabase
      .from("profiles")
      .update({ level: next.level, xp: next.xp })
      .eq("id", user.id);
  }

  revalidatePath("/");
  return { error: null, level, xp };
}

// US-15 : annuler un Rage Quit (même jour). Restaure is_abandoned=false, efface
// abandon_reason, rembourse +5 XP (clampé). Ne remonte que les tâches réellement
// rage-quit (garde par abandon_reason) — un « Annihiler » n'est pas annulable ici.
export async function undoRageQuit(id: string): Promise<TaskActionResult> {
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const { error } = await supabase
    .from("tasks")
    .update({ is_completed: true })
    .or(`id.eq.${id},parent_id.eq.${id}`)
    .eq("user_id", user.id)
    .eq("is_abandoned", false);

  if (error) return { error: "Impossible de valider ce reste. Réessaie." };
  revalidatePath("/");
  return { error: null };
}

// US-08 (D5) : reporte au jour local courant — la tâche revient dans la liste
// du jour et re-soigne le Boss (RG-02). La tâche et ses sous-tâches restes
// changent de day_date ; position recalculée en tête de la fratrie du jour.
export async function deferOverdueTask(id: string): Promise<TaskActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const today = await userToday(supabase, user.id);

  const { data: roots } = await supabase
    .from("tasks")
    .select("position")
    .eq("user_id", user.id)
    .eq("day_date", today)
    .is("parent_id", null);

  const { error } = await supabase
    .from("tasks")
    .update({ day_date: today, position: nextSiblingPosition(roots ?? []) })
    .or(`id.eq.${id},parent_id.eq.${id}`)
    .eq("user_id", user.id)
    .eq("is_abandoned", false);

  if (error) return { error: "Impossible de reporter ce reste. Réessaie." };
  revalidatePath("/");
  return { error: null };
}

// US-08 (D6) : annihiler = is_abandoned (RG-04, jamais DELETE). Ton non-punitif
// côté UI ("on tourne la page").
export async function annihilateOverdueTask(id: string): Promise<TaskActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const { error } = await supabase
    .from("tasks")
    .update({ is_abandoned: true, abandon_reason: "annihilated" })
    .or(`id.eq.${id},parent_id.eq.${id}`)
    .eq("user_id", user.id);

  if (error) return { error: "Impossible d'annihiler ce reste. Réessaie." };
  revalidatePath("/");
  return { error: null };
}

// US-08 (A4) : action groupée anti "mur de la honte" — reporte tous les restes
// au jour local courant.
export async function deferAllOverdue(): Promise<TaskActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const today = await userToday(supabase, user.id);
  const { error } = await supabase
    .from("tasks")
    .update({ day_date: today })
    .eq("user_id", user.id)
    .lt("day_date", today)
    .eq("is_completed", false)
    .eq("is_abandoned", false);

  if (error) return { error: "Impossible de tout reporter. Réessaie." };
  revalidatePath("/");
  return { error: null };
}

// US-08 (A4) : action groupée — annihile les restes plus vieux que `days` jours.
export async function annihilateOverdueOlderThan(days: number): Promise<TaskActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const today = await userToday(supabase, user.id);
  const cutoff = dayKey(
    new Date(Date.parse(`${today}T00:00:00Z`) - days * 86400000),
    "UTC",
  );

  const { error } = await supabase
    .from("tasks")
    .update({ is_abandoned: true, abandon_reason: "annihilated" })
    .eq("user_id", user.id)
    .lt("day_date", cutoff)
    .eq("is_completed", false)
    .eq("is_abandoned", false);

  if (error) return { error: "Impossible d'annihiler les vieux restes. Réessaie." };
  revalidatePath("/");
  return { error: null };
}
