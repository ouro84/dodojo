"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  applyXpDelta,
  canNestTask,
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

// US-19 : reparente une tâche par drag & drop. `parentId: null` = replacer en racine.
export async function nestTask(
  taskId: string,
  parentId: string | null,
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
    .select("id, parent_id, is_abandoned, position")
    .eq("user_id", user.id);

  if (fetchError || !allTasks) {
    return { error: "Impossible de reparenter cette tâche. Réessaie." };
  }

  const taskToNest = allTasks.find((task) => task.id === taskId);
  if (!taskToNest || taskToNest.is_abandoned) {
    return { error: "Cette tâche est introuvable." };
  }

  if (parentId !== null) {
    const targetParent = allTasks.find((task) => task.id === parentId);
    if (!targetParent || targetParent.is_abandoned) {
      return { error: "Cette tâche est introuvable." };
    }

    const check = canNestTask(taskToNest, targetParent, allTasks);
    if (!check.allowed) {
      return { error: check.reason ?? "Imbrication impossible." };
    }
  }

  const siblings = allTasks.filter((task) => task.parent_id === parentId);
  const position = nextSiblingPosition(siblings);

  const { error } = await supabase
    .from("tasks")
    .update({ parent_id: parentId, position })
    .eq("id", taskId)
    .eq("user_id", user.id);

  if (error) {
    return { error: "Impossible de reparenter cette tâche. Réessaie." };
  }

  revalidatePath("/");
  return { error: null };
}
