import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentStreak, dayKey } from "@/lib/game-engine";
import StreakBadge from "@/components/combat/StreakBadge";
import InstallCta from "@/components/pwa/InstallCta";
import IntegrationsSection from "@/components/qg/IntegrationsSection";
import PushReminderToggle from "@/components/qg/PushReminderToggle";
import WebhookTokenSection from "@/components/qg/WebhookTokenSection";
import GeminiConnectionSection from "@/components/qg/GeminiConnectionSection";
import AggressivityLevelSection from "@/components/qg/AggressivityLevelSection";
import { isGeminiConnected } from "@/lib/oauth-gemini";
import { resolveAggressivityLevel } from "@/lib/aggressivity";

// US-12 : le QG affiche la série courante (dérivée de day_results) + le record.
export default async function QgPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("best_streak, timezone, webhook_token_hash, webhook_token_last_used_at, aggressivity_level")
    .eq("id", user.id)
    .maybeSingle();

  const geminiConnected = await isGeminiConnected(supabase, user.id);
  const { data: dayResults } = await supabase
    .from("day_results")
    .select("day_date, outcome")
    .eq("user_id", user.id);
  // US-11 : état initial du toggle (affiné côté client par Notification.permission).
  const { count: subscriptionCount } = await supabase
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  const today = dayKey(new Date(), profile?.timezone ?? "UTC");
  const streak = currentStreak(dayResults ?? [], today);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center">
      <h1 className="font-display text-lg uppercase tracking-wide text-ink">Le QG</h1>
      <StreakBadge state={streak} />
      <InstallCta />
      <AggressivityLevelSection initialLevel={resolveAggressivityLevel(profile?.aggressivity_level)} />
      <IntegrationsSection>
        <PushReminderToggle hasSubscription={(subscriptionCount ?? 0) > 0} />
        <WebhookTokenSection
          hasToken={Boolean(profile?.webhook_token_hash)}
          lastUsedAt={profile?.webhook_token_last_used_at ?? null}
        />
        <GeminiConnectionSection isConnected={geminiConnected} />
      </IntegrationsSection>
      <p className="text-xs text-muted">Record : {profile?.best_streak ?? 0} jours</p>
      <Link href="/pantheon" className="text-sm text-hp underline underline-offset-4">
        🏆 Le Panthéon
      </Link>
      <Link href="/qg/entrainement" className="text-sm text-xp underline underline-offset-4">
        🔁 Mode Entraînement
      </Link>
      <Link href="/echoppe" className="text-sm text-gold underline underline-offset-4">
        🛒 L&apos;Échoppe
      </Link>
      <Link href="/guide/or" className="text-xs text-faint underline underline-offset-4">
        Comment gagner de l&apos;or ?
      </Link>
      <Link href="/guide" className="text-sm text-ink underline underline-offset-4">
        📖 Manuel du Dojo
      </Link>
      <Link href="/" className="text-sm text-xp underline underline-offset-4">
        Retour à l&apos;Arène
      </Link>
    </main>
  );
}
