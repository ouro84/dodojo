"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface TaskActionResult {
  error: string | null;
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

export async function completeTask(id: string): Promise<TaskActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Session expirée. Reconnecte-toi." };
  }

  const { error } = await supabase
    .from("tasks")
    .update({ is_completed: true })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return { error: "Le coup n'est pas passé. Réessaie." };
  }

  revalidatePath("/");
  return { error: null };
}
