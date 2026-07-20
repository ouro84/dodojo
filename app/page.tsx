import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { dayKey } from "@/lib/game-engine";
import Arena from "@/components/combat/Arena";
import ArenaError from "@/components/combat/ArenaError";

export default async function ArenePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
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

  const { data: tasks, error: tasksError } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", user.id)
    .eq("day_date", today)
    .order("position", { ascending: true });

  if (tasksError) {
    return <ArenaError />;
  }

  const { data: overdueTasks, error: overdueError } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", user.id)
    .lt("day_date", today)
    .eq("is_completed", false)
    .eq("is_abandoned", false);

  if (overdueError) {
    return <ArenaError />;
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
    />
  );
}
