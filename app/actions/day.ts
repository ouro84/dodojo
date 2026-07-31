"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  computeGoldEarned,
  currentStreak,
  dayKey,
  summarizeDay,
  type SummaryTask,
} from "@/lib/game-engine";
import { applyNewAchievements, assembleAchievementContext } from "@/app/actions/achievements";
import type { DayOutcome } from "@/types";

interface CloseDayResult {
  error: string | null;
  outcome?: DayOutcome;
  newAchievements?: string[];
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

// US-07 : clôture manuelle (« Terminer la journée »). Résume le jour local courant
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

  // US-18 : streak au jour courant (série incluant l'issue du jour, depuis les
  // day_results passés) → bonus d'or. Or recalculé, jamais accumulé (B3).
  const { data: priorResults } = await supabase
    .from("day_results")
    .select("day_date, outcome")
    .eq("user_id", user.id)
    .lt("day_date", today);

  const streakToday = currentStreak(
    [...(priorResults ?? []), { day_date: today, outcome: summary.outcome }],
    today,
  ).length;
  const goldEarned = computeGoldEarned(
    summary.outcome,
    summary.damageDealt,
    streakToday,
  );

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
      gold_earned: goldEarned,
      closed_manually: true,
    },
    { onConflict: "user_id,day_date" },
  );

  if (upsertError) return { error: "Impossible de clôturer la journée. Réessaie." };

  // US-12 : rafraîchit les caches de série (source = day_results).
  const { data: prof } = await supabase
    .from("profiles")
    .select("best_streak")
    .eq("id", user.id)
    .maybeSingle();
  const bestStreak = Math.max(prof?.best_streak ?? 0, streakToday);
  await supabase
    .from("profiles")
    .update({ streak_days: streakToday, best_streak: bestStreak })
    .eq("id", user.id);

  // Issue #72 : après le rafraîchissement du cache streak (bestStreak à jour),
  // évalue les succès (streak, première victoire...).
  const ctx = await assembleAchievementContext(supabase, user.id);
  const newAchievements = await applyNewAchievements(supabase, user.id, ctx);

  revalidatePath("/");
  return { error: null, outcome: summary.outcome, newAchievements };
}

// US-08 (D8) : à la fin du traitement du Réveil, enregistre rétroactivement un
// day_result pour chaque jour passé sans résultat (issue calculée après que
// "Terminé" a pu transformer un jour en victoire tardive). Historique sans
// trous pour le Tableau de Chasse / streak.
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

  // US-18 : base connue des issues (day_results existants) + jours backfillés
  // ajoutés dans l'ordre chronologique, pour que le bonus streak de chaque jour
  // lise correctement les jours antérieurs.
  const { data: knownResults } = await supabase
    .from("day_results")
    .select("day_date, outcome")
    .eq("user_id", user.id);

  const timeline: { day_date: string; outcome: DayOutcome }[] = [
    ...(knownResults ?? []),
  ];

  const rows = Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day_date, tasks]) => {
      const s = summarizeDay(tasks, "backfill");
      timeline.push({ day_date, outcome: s.outcome });
      const streakThatDay = currentStreak(timeline, day_date).length;
      return {
        user_id: user.id,
        day_date,
        outcome: s.outcome,
        damage_dealt: s.damageDealt,
        boss_max_hp: s.bossMaxHp,
        tasks_completed: s.tasksCompleted,
        tasks_abandoned: s.tasksAbandoned,
        xp_earned: s.xpEarned,
        gold_earned: computeGoldEarned(s.outcome, s.damageDealt, streakThatDay),
        closed_manually: false,
      };
    });

  if (rows.length === 0) return { error: null };

  const { error } = await supabase
    .from("day_results")
    .upsert(rows, { onConflict: "user_id,day_date" });

  if (error) return { error: "Impossible d'enregistrer l'historique. Réessaie." };

  // US-12 : recharge l'historique complet post-backfill pour un streak exact,
  // puis rafraîchit les caches de série du profil.
  const { data: allResults } = await supabase
    .from("day_results")
    .select("day_date, outcome")
    .eq("user_id", user.id);
  const streakNow = currentStreak(allResults ?? [], today).length;

  const { data: prof } = await supabase
    .from("profiles")
    .select("best_streak")
    .eq("id", user.id)
    .maybeSingle();
  const bestStreak = Math.max(prof?.best_streak ?? 0, streakNow);
  await supabase
    .from("profiles")
    .update({ streak_days: streakNow, best_streak: bestStreak })
    .eq("id", user.id);

  const ctx = await assembleAchievementContext(supabase, user.id);
  await applyNewAchievements(supabase, user.id, ctx);

  revalidatePath("/");
  return { error: null };
}
