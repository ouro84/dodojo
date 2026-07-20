import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentStreak, dayKey } from "@/lib/game-engine";
import StreakBadge from "@/components/combat/StreakBadge";

// US-12 : le QG affiche la série courante (dérivée de day_results) + le record.
export default async function QgPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("best_streak, timezone")
    .eq("id", user.id)
    .maybeSingle();
  const { data: dayResults } = await supabase
    .from("day_results")
    .select("day_date, outcome")
    .eq("user_id", user.id);

  const today = dayKey(new Date(), profile?.timezone ?? "UTC");
  const streak = currentStreak(dayResults ?? [], today);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center">
      <h1 className="font-display text-lg uppercase tracking-wide text-ink">Le QG</h1>
      <StreakBadge state={streak} />
      <p className="text-xs text-muted">Record : {profile?.best_streak ?? 0} jours</p>
      <Link href="/echoppe" className="text-sm text-gold underline underline-offset-4">
        🛒 L&apos;Échoppe
      </Link>
      <Link href="/" className="text-sm text-xp underline underline-offset-4">
        Retour à l&apos;Arène
      </Link>
    </main>
  );
}
