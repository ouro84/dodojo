import type { SupabaseClient } from "@supabase/supabase-js";

export interface DailyBossRead {
  bossId: string;
  backgroundId: string;
}

// D6.1 du spec : LECTURE SEULE. resolveDailyBoss (app/actions/boss.ts) upsert
// daily_boss et evalue les succes ; l'appeler depuis le serveur MCP ferait
// figer le boss du jour et debloquer des succes sans que l'utilisateur ait
// ouvert l'app. Ne jamais fusionner ces deux fonctions.
export async function readDailyBoss(
  supabase: SupabaseClient,
  userId: string,
  dayDate: string,
): Promise<DailyBossRead | null> {
  const { data } = await supabase
    .from("daily_boss")
    .select("boss_id, background_id")
    .eq("user_id", userId)
    .eq("day_date", dayDate)
    .maybeSingle();

  if (!data) return null;
  const row = data as { boss_id: string; background_id: string };
  return { bossId: row.boss_id, backgroundId: row.background_id };
}
