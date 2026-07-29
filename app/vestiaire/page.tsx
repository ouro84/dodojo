import Link from "next/link";
import type { Metadata } from "next";
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
import BottomNav from "@/components/ui/BottomNav";

export const metadata: Metadata = { title: "Le Vestiaire — Dodojo" };

// Audit UX 2026-07-24 (P1) : Le Vestiaire est le hub obligé vers Tableau de Chasse/Marché Noir/
// Guide/Routines (aucun autre onglet n'y mène) - remplace la pile de
// liens soulignés multicolores par un vrai menu, affordance uniforme.
const SECTIONS: Array<{ href: string; icon: string; label: string }> = [
  { href: "/tableau-de-chasse", icon: "🏆", label: "Tableau de Chasse" },
  { href: "/vestiaire/entrainement", icon: "🔁", label: "Mes Routines" },
  { href: "/marche-noir", icon: "🛒", label: "Le Marché Noir" },
  { href: "/guide", icon: "📖", label: "Le Guide" },
];

// US-12 : Le Vestiaire affiche la série courante (dérivée de day_results) + le record.
export default async function QgPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Les 4 requêtes sont indépendantes entre elles (audit #67, PR4) — même
  // pattern que le Marché Noir (app/echoppe/page.tsx), seul écran à déjà paralléliser correctement.
  const [
    { data: profile, error: profileError },
    geminiConnected,
    { data: dayResults, error: dayError },
    { count: subscriptionCount, error: subscriptionError },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("best_streak, timezone, webhook_token_hash, webhook_token_last_used_at, aggressivity_level")
      .eq("id", user.id)
      .maybeSingle(),
    isGeminiConnected(supabase, user.id),
    supabase.from("day_results").select("day_date, outcome").eq("user_id", user.id),
    // US-11 : état initial du toggle (affiné côté client par Notification.permission).
    supabase
      .from("push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
  ]);

  // Audit #67, PR6 (règle projet n°3) : un échec ici dégradait silencieusement
  // (profile undefined traité comme "pas encore rempli") au lieu de montrer
  // un état d'erreur cohérent avec le reste de l'app.
  if (profileError || dayError || subscriptionError) {
    throw profileError ?? dayError ?? subscriptionError;
  }

  const today = dayKey(new Date(), profile?.timezone ?? "UTC");
  const streak = currentStreak(dayResults ?? [], today);

  return (
    <main className="screen-main gap-4 px-4 py-8">
      <h1 className="text-center font-display text-lg uppercase tracking-wide text-ink">
        Le Vestiaire
      </h1>
      <div className="flex flex-col items-center gap-4">
        <StreakBadge state={streak} />
        <InstallCta />
      </div>
      <AggressivityLevelSection initialLevel={resolveAggressivityLevel(profile?.aggressivity_level)} />
      <IntegrationsSection>
        <PushReminderToggle hasSubscription={(subscriptionCount ?? 0) > 0} />
        <WebhookTokenSection
          hasToken={Boolean(profile?.webhook_token_hash)}
          lastUsedAt={profile?.webhook_token_last_used_at ?? null}
        />
        <GeminiConnectionSection isConnected={geminiConnected} />
      </IntegrationsSection>

      <nav aria-label="Sections du Vestiaire" className="flex flex-col gap-2">
        <p className="text-center text-xs text-muted">Record : {profile?.best_streak ?? 0} jours</p>
        {SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-3 text-sm text-ink hover:border-ink"
          >
            <span className="flex items-center gap-2">
              <span aria-hidden="true">{section.icon}</span>
              {section.label}
            </span>
            <span aria-hidden="true" className="text-faint">
              ›
            </span>
          </Link>
        ))}
      </nav>

      <BottomNav active="qg" />
    </main>
  );
}
