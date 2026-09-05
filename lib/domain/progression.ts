import type { SupabaseClient } from "@supabase/supabase-js";
import { goldBalance, xpThresholdForLevel } from "@/lib/game-engine";

export interface ProgressionRead {
  level: number;
  xp: number;
  xpToNextLevel: number;
  gold: number;
  equippedHeroId: string | null;
  equippedSkinId: string | null;
}

// Lecture seule : niveau/XP/or/equipement courants. `gold` est recalcule via
// `goldBalance` (source de verite derivee, US-18/issue #199) plutot que lu
// depuis le cache `profiles.gold`.
export async function readProgression(
  supabase: SupabaseClient,
  userId: string,
): Promise<ProgressionRead | null> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("level, xp, equipped_hero_id, equipped_skin_id")
    .eq("id", userId)
    .maybeSingle();

  if (!profile) return null;
  const row = profile as {
    level: number;
    xp: number;
    equipped_hero_id: string | null;
    equipped_skin_id: string | null;
  };

  const [{ data: dayResults }, { data: unlockedHeroes }, { data: unlockedSkins }] = await Promise.all([
    supabase.from("day_results").select("gold_earned").eq("user_id", userId),
    supabase.from("unlocked_heroes").select("price_paid").eq("user_id", userId),
    supabase.from("unlocked_skins").select("price_paid").eq("user_id", userId),
  ]);

  const gold = goldBalance(dayResults ?? [], unlockedHeroes ?? [], unlockedSkins ?? []);

  return {
    level: row.level,
    xp: row.xp,
    xpToNextLevel: xpThresholdForLevel(row.level) - row.xp,
    gold,
    equippedHeroId: row.equipped_hero_id,
    equippedSkinId: row.equipped_skin_id,
  };
}
