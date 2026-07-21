"use server";

import { createClient } from "@/lib/supabase/server";
import { dayKey } from "@/lib/game-engine";
import {
  DEFAULT_BOSS_ID,
  getBoss,
  pickBackgroundId,
  pickDailyBoss,
} from "@/lib/bosses";
import { DEFAULT_BACKGROUND_ID } from "@/lib/backgrounds";

export interface DailyBossSelection {
  bossId: string;
  backgroundId: string;
}

// Résout (et fige) le boss + décor du jour local courant. Lazy & idempotent :
// appelée au chargement de l'Arène. Si une ligne existe déjà pour aujourd'hui,
// on la renvoie ; sinon on tire un boss en excluant ceux des 2 derniers jours,
// un décor cohérent, et on persiste. En cas d'échec, fallback boss par défaut.
export async function resolveDailyBoss(): Promise<DailyBossSelection> {
  const fallback: DailyBossSelection = {
    bossId: DEFAULT_BOSS_ID,
    backgroundId: DEFAULT_BACKGROUND_ID,
  };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fallback;

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .maybeSingle();
  const today = dayKey(new Date(), profile?.timezone ?? "UTC");

  // Déjà tiré aujourd'hui ?
  const { data: existing } = await supabase
    .from("daily_boss")
    .select("boss_id, background_id")
    .eq("user_id", user.id)
    .eq("day_date", today)
    .maybeSingle();
  if (existing) {
    return { bossId: existing.boss_id, backgroundId: existing.background_id };
  }

  // Boss des 2 derniers jours enregistrés (à exclure).
  const { data: recent } = await supabase
    .from("daily_boss")
    .select("boss_id, day_date")
    .eq("user_id", user.id)
    .lt("day_date", today)
    .order("day_date", { ascending: false })
    .limit(2);
  const recentBossIds = (recent ?? []).map((r) => r.boss_id);

  const boss = pickDailyBoss(recentBossIds);
  const backgroundId = pickBackgroundId(boss);

  const { error } = await supabase.from("daily_boss").insert({
    user_id: user.id,
    day_date: today,
    boss_id: boss.id,
    background_id: backgroundId,
  });

  // Course possible (double chargement) : si insert échoue, relire la ligne.
  if (error) {
    const { data: raced } = await supabase
      .from("daily_boss")
      .select("boss_id, background_id")
      .eq("user_id", user.id)
      .eq("day_date", today)
      .maybeSingle();
    if (raced) return { bossId: raced.boss_id, backgroundId: raced.background_id };
    // Boss inconnu (catalogue modifié) → fallback sûr.
    return getBoss(boss.id) ? { bossId: boss.id, backgroundId } : fallback;
  }

  return { bossId: boss.id, backgroundId };
}
