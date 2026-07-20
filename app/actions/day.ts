"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { dayKey, summarizeDay, type SummaryTask } from "@/lib/game-engine";
import type { DayOutcome } from "@/types";

interface CloseDayResult {
  error: string | null;
  outcome?: DayOutcome;
}

async function timezoneOf(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string> {
  const { data } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", userId)
    .maybeSingle();
  return data?.timezone ?? "UTC";
}

// US-07 : clôture manuelle (Rituel du Crépuscule). Résume le jour local courant
// et upsert le day_result (closed_manually=true). Idempotent — re-clôturer
// recalcule depuis les tâches (B3), ne s'accumule jamais.
export async function closeDay(): Promise<CloseDayResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const today = dayKey(new Date(), await timezoneOf(supabase, user.id));

  const { data: tasks, error: tasksError } = await supabase
    .from("tasks")
    .select("parent_id, is_completed, is_abandoned")
    .eq("user_id", user.id)
    .eq("day_date", today);

  if (tasksError) return { error: "Impossible de clôturer la journée. Réessaie." };

  const summary = summarizeDay((tasks ?? []) as SummaryTask[], "manual");

  const { error: upsertError } = await supabase.from("day_results").upsert(
    {
      user_id: user.id,
      day_date: today,
      outcome: summary.outcome,
      damage_dealt: summary.damageDealt,
      boss_max_hp: summary.bossMaxHp,
      tasks_completed: summary.tasksCompleted,
      tasks_abandoned: summary.tasksAbandoned,
      xp_earned: summary.xpEarned,
      closed_manually: true,
    },
    { onConflict: "user_id,day_date" },
  );

  if (upsertError) return { error: "Impossible de clôturer la journée. Réessaie." };
  revalidatePath("/");
  return { error: null, outcome: summary.outcome };
}

// US-08 (D8) : à la fin du traitement du Réveil, enregistre rétroactivement un
// day_result pour chaque jour passé sans résultat (issue calculée après que
// "Terminé" a pu transformer un jour en victoire tardive). Historique sans
// trous pour le Panthéon / streak.
export async function backfillMissedDays(): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const today = dayKey(new Date(), await timezoneOf(supabase, user.id));

  const { data: pastTasks, error: tasksError } = await supabase
    .from("tasks")
    .select("day_date, parent_id, is_completed, is_abandoned")
    .eq("user_id", user.id)
    .lt("day_date", today);

  if (tasksError) return { error: "Impossible d'enregistrer l'historique. Réessaie." };
  if (!pastTasks || pastTasks.length === 0) return { error: null };

  const { data: existing } = await supabase
    .from("day_results")
    .select("day_date")
    .eq("user_id", user.id)
    .lt("day_date", today);
  const alreadyRecorded = new Set((existing ?? []).map((r) => r.day_date));

  const byDay = new Map<string, SummaryTask[]>();
  for (const task of pastTasks) {
    if (alreadyRecorded.has(task.day_date)) continue;
    const bucket = byDay.get(task.day_date) ?? [];
    bucket.push(task as SummaryTask);
    byDay.set(task.day_date, bucket);
  }

  const rows = Array.from(byDay, ([day_date, tasks]) => {
    const s = summarizeDay(tasks, "backfill");
    return {
      user_id: user.id,
      day_date,
      outcome: s.outcome,
      damage_dealt: s.damageDealt,
      boss_max_hp: s.bossMaxHp,
      tasks_completed: s.tasksCompleted,
      tasks_abandoned: s.tasksAbandoned,
      xp_earned: s.xpEarned,
      closed_manually: false,
    };
  });

  if (rows.length === 0) return { error: null };

  const { error } = await supabase
    .from("day_results")
    .upsert(rows, { onConflict: "user_id,day_date" });

  if (error) return { error: "Impossible d'enregistrer l'historique. Réessaie." };
  revalidatePath("/");
  return { error: null };
}
