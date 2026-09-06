import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateBossCurrentHp, calculateBossMaxHp, type HpTask } from "@/lib/game-engine";
import { getBoss } from "@/lib/bosses";

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

export interface BossStatusRead {
  bossId: string;
  name: string;
  lore: string;
  currentHp: number;
  maxHp: number;
  tasksRemaining: number;
}

// Lecture seule, D6.1 : s'appuie sur readDailyBoss (qui n'ecrit jamais) et
// recalcule les HP depuis les taches du jour, exactement comme l'Arene.
// null = le boss du jour n'a pas encore ete tire (l'utilisateur n'a pas
// ouvert l'app aujourd'hui) — surtout ne pas le tirer ici.
export async function readBossStatus(
  supabase: SupabaseClient,
  userId: string,
  dayDate: string,
): Promise<BossStatusRead | null> {
  const daily = await readDailyBoss(supabase, userId, dayDate);
  if (!daily) return null;

  const { data } = await supabase
    .from("tasks")
    .select("parent_id, is_completed, is_abandoned")
    .eq("user_id", userId)
    .eq("day_date", dayDate);

  const rows = (data ?? []) as HpTask[];
  const boss = getBoss(daily.bossId);

  return {
    bossId: daily.bossId,
    name: boss?.name ?? daily.bossId,
    lore: boss?.lore ?? "",
    currentHp: calculateBossCurrentHp(rows),
    maxHp: calculateBossMaxHp(rows),
    tasksRemaining: rows.filter((t) => !t.is_abandoned && !t.is_completed).length,
  };
}
