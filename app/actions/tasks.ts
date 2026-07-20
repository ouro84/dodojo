"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  applyXpDelta,
  isNestableParent,
  nextSiblingPosition,
  XP_PER_TASK,
} from "@/lib/game-engine";

export interface TaskActionResult {
  error: string | null;
  id?: string;
  level?: number;
  xp?: number;
  leveledUp?: boolean;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
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

  const today = todayIso();
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

  const { data: inserted, error } = await supabase
    .from("tasks")
    .insert({
      user_id: user.id,
      parent_id: parentId,
      title: trimmed,
      day_date: todayIso(),
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

// RG-04 : jamais de suppression destructive — on abandonne (Rage Quit), on ne DELETE jamais.
export async function abandonTask(id: string): Promise<TaskActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Session expirée. Reconnecte-toi." };
  }

  const { error } = await supabase
    .from("tasks")
    .update({ is_abandoned: true })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return { error: "Impossible d'abandonner cette tâche. Réessaie." };
  }

  revalidatePath("/");
  return { error: null };
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
