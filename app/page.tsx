import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Arena from "@/components/combat/Arena";
import ArenaError from "@/components/combat/ArenaError";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

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

  const { data: tasks, error: tasksError } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", user.id)
    .eq("day_date", todayIso())
    .order("position", { ascending: true });

  if (tasksError) {
    return <ArenaError />;
  }

  return <Arena profile={profile} initialTasks={tasks ?? []} />;
}
