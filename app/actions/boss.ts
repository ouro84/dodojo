"use server";

import { createClient } from "@/lib/supabase/server";
import { dayKey } from "@/lib/game-engine";
import {
  DEFAULT_BOSS_ID,
  getBoss,
  hasFacedBossBefore,
  pickBackgroundId,
  pickDailyBoss,
} from "@/lib/bosses";
import { DEFAULT_BACKGROUND_ID } from "@/lib/backgrounds";
import { applyNewAchievements, assembleAchievementContext } from "@/lib/domain/achievements";

export interface DailyBossSelection {
  bossId: string;
  backgroundId: string;
  newAchievements: string[];
  isFirstEncounter: boolean;
}

// Résout (et fige) le boss + décor du jour local courant. Lazy & idempotent :
// appelée au chargement de l'Arène. Si une ligne existe déjà pour aujourd'hui,
// on la renvoie ; sinon on tire un boss en excluant ceux des 2 derniers jours,
// un décor cohérent, et on persiste. En cas d'échec, fallback boss par défaut.
// Issue #72 : sert aussi de checkpoint d'évaluation des succès — assemble le
// contexte complet à chaque appel (pas seulement boss/décors).
export async function resolveDailyBoss(): Promise<DailyBossSelection> {
  const fallback: DailyBossSelection = {
    bossId: DEFAULT_BOSS_ID,
    backgroundId: DEFAULT_BACKGROUND_ID,
    newAchievements: [],
    isFirstEncounter: false,
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

  let selection: { bossId: string; backgroundId: string };

  // Déjà tiré aujourd'hui ?
  const { data: existing } = await supabase
    .from("daily_boss")
    .select("boss_id, background_id")
    .eq("user_id", user.id)
    .eq("day_date", today)
    .maybeSingle();

  // Log de diagnostic temporaire (issue #211 bis, "boss qui change à la
  // première visite du jour") : la relecture inconditionnelle post-upsert
  // (issue #160 bug #1) est mathématiquement race-safe, mais le symptôme a
  // été revu malgré ce correctif — trigger non identifié. Retirer une fois
  // une occurrence capturée avec ces logs (Vercel Hobby ne garde qu'1h de
  // logs, d'où l'instrumentation proactive plutôt qu'une relecture a
  // posteriori).
  console.log(
    `[resolveDailyBoss] user=${user.id.slice(0, 8)} today=${today} existing=${existing ? existing.boss_id : "none"}`,
  );

  if (existing) {
    selection = { bossId: existing.boss_id, backgroundId: existing.background_id };
  } else {
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

    // Upsert idempotent (conflit = no-op silencieux, jamais d'erreur 23505 à
    // intercepter) suivi d'une relecture SYSTÉMATIQUE : que cet appel ait
    // gagné ou perdu une course contre un autre chargement concurrent (ex.
    // le revalidatePath("/") d'addTask), la relecture renvoie toujours la
    // ligne réellement persistée — les deux appels convergent nécessairement
    // vers la même valeur. Jamais de pick local en fallback tant que la
    // relecture réussit (issue #160 bug #1).
    await supabase.from("daily_boss").upsert(
      { user_id: user.id, day_date: today, boss_id: boss.id, background_id: backgroundId },
      { onConflict: "user_id,day_date", ignoreDuplicates: true },
    );

    const { data: persisted } = await supabase
      .from("daily_boss")
      .select("boss_id, background_id")
      .eq("user_id", user.id)
      .eq("day_date", today)
      .maybeSingle();

    selection = persisted
      ? { bossId: persisted.boss_id, backgroundId: persisted.background_id }
      : getBoss(boss.id)
        ? { bossId: boss.id, backgroundId }
        : { bossId: fallback.bossId, backgroundId: fallback.backgroundId };

    console.log(
      `[resolveDailyBoss] user=${user.id.slice(0, 8)} today=${today} localPick=${boss.id} persisted=${persisted ? persisted.boss_id : "NULL_fallback_to_local_pick"} diverged=${persisted ? persisted.boss_id !== boss.id : "n/a"}`,
    );
  }

  // Issue #135 : historique complet (pas seulement les 2 derniers jours comme
  // `recentBossIds` plus haut) pour détecter une vraie première rencontre.
  // Requête stable indépendamment de l'ordre d'appel : `day_date < today`
  // exclut la ligne d'aujourd'hui, qu'elle existe déjà ou vienne d'être créée.
  const { data: pastBossRows } = await supabase
    .from("daily_boss")
    .select("boss_id")
    .eq("user_id", user.id)
    .lt("day_date", today);
  const isFirstEncounter = !hasFacedBossBefore(
    (pastBossRows ?? []).map((r) => r.boss_id),
    selection.bossId,
  );

  const ctx = await assembleAchievementContext(supabase, user.id);
  const newAchievements = await applyNewAchievements(supabase, user.id, ctx);

  return { ...selection, newAchievements, isFirstEncounter };
}
