import type { SupabaseClient } from "@supabase/supabase-js";
import { currentStreak } from "@/lib/game-engine";
import type { DayResult } from "@/types";

export interface StreakRead {
  length: number;
  jokersUsedThisWeek: number;
  atRisk: boolean;
}

// Lecture seule. La serie est DERIVEE de day_results (source unique, US-12) —
// jamais lue depuis les caches profiles.streak_days/best_streak.
export async function readStreak(
  supabase: SupabaseClient,
  userId: string,
  today: string,
): Promise<StreakRead> {
  const { data } = await supabase
    .from("day_results")
    .select("day_date, outcome")
    .eq("user_id", userId);

  const rows = (data ?? []) as Array<Pick<DayResult, "day_date" | "outcome">>;
  return currentStreak(rows, today);
}
