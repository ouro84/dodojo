import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { dayKey } from "@/lib/game-engine";
import { generateRecurringInstances } from "@/app/actions/recurring";
import { resolveDailyBoss } from "@/app/actions/boss";
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

  // US-17 : génère (idempotent) les instances de routines dues aujourd'hui avant
  // de lire la liste du jour — couvre les jours sans reste (le Rituel du Réveil
  // bloquant ne se monte que s'il y a des restes).
  await generateRecurringInstances();

  // Roster : boss + décor du jour (tiré une fois puis figé, exclut les 2 derniers jours).
  const daily = await resolveDailyBoss();

  const { data: tasks, error: tasksError } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", user.id)
    .eq("day_date", today)
    .order("position", { ascending: true });

  if (tasksError) {
    return <ArenaError aggressivityLevel={profile.aggressivity_level} />;
  }

  const { data: overdueTasks, error: overdueError } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", user.id)
    .lt("day_date", today)
    .eq("is_completed", false)
    .eq("is_abandoned", false);

  if (overdueError) {
    return <ArenaError aggressivityLevel={profile.aggressivity_level} />;
  }

  const { data: dayResults } = await supabase
    .from("day_results")
    .select("day_date, outcome")
    .eq("user_id", user.id)
    .order("day_date", { ascending: false })
    .limit(60);

  return (
    <Arena
      initialProfile={profile}
      initialTasks={tasks ?? []}
      overdueTasks={overdueTasks ?? []}
      dayResults={dayResults ?? []}
      today={today}
      bossId={daily.bossId}
      backgroundId={daily.backgroundId}
      hasSeenTutorial={profile.has_seen_tutorial}
    />
  );
}
