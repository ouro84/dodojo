import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { dayKey, nextDayKey } from "@/lib/game-engine";
import { generateRecurringInstances } from "@/app/actions/recurring";
import { resolveDailyBoss } from "@/app/actions/boss";
import { backfillMissedDaysDuringRender } from "@/app/actions/day";
import Arena from "@/components/combat/Arena";
import ArenaError from "@/components/combat/ArenaError";

export default async function ArenePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/welcome");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return <ArenaError />;
  }

  if (!profile) {
    redirect("/onboarding");
  }

  const today = dayKey(new Date(), profile.timezone ?? "UTC");
  const tomorrow = nextDayKey(today);

  // US-17 : génère (idempotent) les instances de routines dues aujourd'hui avant
  // de lire la liste du jour — couvre les jours sans reste (le Réveil
  // bloquant ne se monte que s'il y a des restes).
  await generateRecurringInstances();

  // Roster : boss + décor du jour (tiré une fois puis figé, exclut les 2 derniers jours).
  const daily = await resolveDailyBoss();

  // Issue #160 (bug #2) : filet supplémentaire au chargement — backfille tout
  // jour passé ayant des tâches mais aucune ligne day_results. Sans cet appel
  // eager, un compte qui n'a jamais de tâche en retard ne monte jamais Le
  // Réveil, seul déclencheur historique de ce backfill — un jour gagné mais
  // jamais clôturé manuellement restait alors un trou permanent, invisible du
  // Tableau de Chasse (winRate ne compte que les lignes existantes) mais
  // compté comme joker consommé par currentStreak. Appel lazy et idempotent
  // (no-op si aucun jour passé sans ligne), même patron que
  // resolveDailyBoss()/generateRecurringInstances() ci-dessus. Variante
  // "DuringRender" (pas revalidatePath, interdit pendant le render en Next 16)
  // — WakeUpRitual continue d'appeler backfillMissedDays() (avec revalidate)
  // après coup, nécessaire pour qu'un "Terminé" ait pu transformer un jour en
  // victory avant son backfill.
  await backfillMissedDaysDuringRender();

  // Indépendantes entre elles une fois generateRecurringInstances() terminé
  // (audit #67, PR4) — paralléliser avant casserait l'anti-doublon de routine.
  const [
    { data: tasks, error: tasksError },
    { data: overdueTasks, error: overdueError },
    { data: dayResults },
    { data: tomorrowTasks },
  ] = await Promise.all([
    supabase
      .from("tasks")
      .select("*")
      .eq("user_id", user.id)
      .eq("day_date", today)
      .order("position", { ascending: true }),
    supabase
      .from("tasks")
      .select("*")
      .eq("user_id", user.id)
      .lt("day_date", today)
      .eq("is_completed", false)
      .eq("is_abandoned", false),
    supabase
      .from("day_results")
      .select("day_date, outcome")
      .eq("user_id", user.id)
      .order("day_date", { ascending: false })
      // Aligné sur le palier de série le plus élevé (100 jours) + marge —
      // à 60, le palier 100 (titre Esprit Vide) ne pouvait structurellement
      // jamais se déclencher depuis l'Arène (audit #67, PR4).
      .limit(120),
    // Issue #116 : tâches déjà planifiées pour demain (section "Demain").
    supabase
      .from("tasks")
      .select("*")
      .eq("user_id", user.id)
      .eq("day_date", tomorrow)
      .order("position", { ascending: true }),
  ]);

  if (tasksError || overdueError) {
    return <ArenaError aggressivityLevel={profile.aggressivity_level} />;
  }

  return (
    <Arena
      initialProfile={profile}
      initialTasks={tasks ?? []}
      initialTomorrowTasks={tomorrowTasks ?? []}
      overdueTasks={overdueTasks ?? []}
      dayResults={dayResults ?? []}
      today={today}
      bossId={daily.bossId}
      backgroundId={daily.backgroundId}
      isFirstEncounter={daily.isFirstEncounter}
      hasSeenTutorial={profile.has_seen_tutorial}
      initialNewAchievements={daily.newAchievements}
    />
  );
}
