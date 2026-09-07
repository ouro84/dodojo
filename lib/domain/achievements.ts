import type { SupabaseClient } from "@supabase/supabase-js";
import {
  bestTitleCode,
  evaluateAchievements,
  type AchievementContext,
} from "@/lib/achievements";

// Assemble le contexte complet depuis les tables sources. Aucune logique de
// condition ici (D2) — seulement de la lecture. Réutilisé par les 4
// checkpoints (tâche, jour, boss, héros) pour ne jamais dupliquer ces
// requêtes.
export async function assembleAchievementContext(
  supabase: SupabaseClient,
  userId: string,
): Promise<AchievementContext> {
  const [
    { data: prof },
    { data: unlockedHeroes },
    { data: unlockedSkins },
    { data: dailyBoss },
    { data: dayResults },
    { count: rageQuitCount },
    { count: routineCount },
    { count: shareSuccessCount },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("level, best_streak, aggressivity_level")
      .eq("id", userId)
      .maybeSingle(),
    supabase.from("unlocked_heroes").select("hero_id").eq("user_id", userId),
    supabase.from("unlocked_skins").select("skin_id").eq("user_id", userId),
    supabase.from("daily_boss").select("boss_id, background_id").eq("user_id", userId),
    // Issue #199 : fetch complet (~1 ligne par jour de jeu, sans trous grâce à
    // backfillMissedDays) au lieu de l'ancien `limit(1)` qui ne servait qu'à
    // répondre « a-t-il gagné une fois ? ». Même nombre de requêtes, tous les
    // compteurs cumulés du catalogue deviennent calculables.
    supabase
      .from("day_results")
      .select("outcome, tasks_completed, tasks_abandoned, gold_earned, boss_max_hp")
      .eq("user_id", userId),
    // `head: true` : le serveur renvoie le compte, jamais les lignes — la table
    // `tasks` ne se purge jamais (RG-04), on ne la transfère pas.
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("abandon_reason", "rage_quit"),
    supabase
      .from("recurring_templates")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    supabase
      .from("share_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("event", "share_succeeded"),
  ]);

  return {
    level: prof?.level ?? 1,
    bestStreak: prof?.best_streak ?? 0,
    aggressivityLevel: prof?.aggressivity_level ?? "direct",
    unlockedHeroIds: (unlockedHeroes ?? []).map((r) => r.hero_id),
    unlockedSkinIds: (unlockedSkins ?? []).map((r) => r.skin_id),
    seenBossIds: [...new Set((dailyBoss ?? []).map((r) => r.boss_id))],
    seenBackgroundIds: [...new Set((dailyBoss ?? []).map((r) => r.background_id))],
    dayResults: dayResults ?? [],
    rageQuitCount: rageQuitCount ?? 0,
    routineCount: routineCount ?? 0,
    shareSuccessCount: shareSuccessCount ?? 0,
  };
}

// Évalue, persiste (upsert idempotent) et ré-équipe le titre auto si le
// joueur n'a jamais choisi manuellement (D8). Renvoie les codes nouvellement
// débloqués — l'appelant les fait remonter au client pour AchievementToast.
export async function applyNewAchievements(
  supabase: SupabaseClient,
  userId: string,
  ctx: AchievementContext,
): Promise<string[]> {
  const { data: existing } = await supabase
    .from("unlocked_achievements")
    .select("code, unlocked_at")
    .eq("user_id", userId);
  const existingRows = existing ?? [];
  const alreadyUnlocked = new Set(existingRows.map((r) => r.code));

  const newCodes = evaluateAchievements(ctx, alreadyUnlocked);
  if (newCodes.length === 0) return [];

  const now = new Date().toISOString();
  await supabase
    .from("unlocked_achievements")
    .upsert(
      newCodes.map((code) => ({ user_id: userId, code, unlocked_at: now })),
      { onConflict: "user_id,code" },
    );

  const { data: prof } = await supabase
    .from("profiles")
    .select("title_manually_set")
    .eq("id", userId)
    .maybeSingle();

  if (!prof?.title_manually_set) {
    const allUnlocked = [
      ...existingRows.map((r) => ({ code: r.code, unlockedAt: r.unlocked_at })),
      ...newCodes.map((code) => ({ code, unlockedAt: now })),
    ];
    const best = bestTitleCode(allUnlocked);
    if (best) {
      await supabase.from("profiles").update({ equipped_title_code: best }).eq("id", userId);
    }
  }

  return newCodes;
}
