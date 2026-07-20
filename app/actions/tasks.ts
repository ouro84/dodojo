"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { applyXpDelta, XP_PER_TASK } from "@/lib/game-engine";

export interface TaskActionResult {
  error: string | null;
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

  const { error } = await supabase.from("tasks").insert({
    user_id: user.id,
    title: trimmed,
    day_date: todayIso(),
  });

  if (error) {
    return { error: "Le monstre a résisté à l'invocation. Réessaie." };
  }

  revalidatePath("/");
  return { error: null };
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
