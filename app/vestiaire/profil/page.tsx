import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BottomNav from "@/components/ui/BottomNav";
import BackLink from "@/components/ui/BackLink";
import UsernameSection from "@/components/qg/UsernameSection";
import EquippedTitlePreview from "@/components/qg/EquippedTitlePreview";
import TimezoneSection from "@/components/qg/TimezoneSection";
import PasswordSection from "@/components/qg/PasswordSection";
import EmailSection from "@/components/qg/EmailSection";
import AggressivityLevelSection from "@/components/qg/AggressivityLevelSection";
import PlanTomorrowSection from "@/components/qg/PlanTomorrowSection";
import ReminderOffsetDefaultSection from "@/components/qg/ReminderOffsetDefaultSection";
import IntegrationsSection from "@/components/qg/IntegrationsSection";
import PushReminderToggle from "@/components/qg/PushReminderToggle";
import WebhookTokenSection from "@/components/qg/WebhookTokenSection";
import GeminiConnectionSection from "@/components/qg/GeminiConnectionSection";
import LogoutSection from "@/components/qg/LogoutSection";
import ExportDataSection from "@/components/qg/ExportDataSection";
import DeleteAccountSection from "@/components/qg/DeleteAccountSection";
import { isGeminiConnected } from "@/lib/oauth-gemini";
import { resolveAggressivityLevel } from "@/lib/aggressivity";

export const metadata: Metadata = { title: "Profil — Dodojo" };

// Issue #69 : hub centralisé des réglages de compte. Regroupe des sections
// jusqu'ici éparpillées (Le Vestiaire) + 5 nouveaux réglages (pseudo, titre,
// timezone, mot de passe, email) + déconnexion (gap comblé, aucune n'existait).
export default async function ProfilPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: profile, error: profileError },
    geminiConnected,
    { count: subscriptionCount, error: subscriptionError },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "username, timezone, aggressivity_level, plan_tomorrow_after_hour, equipped_title_code, webhook_token_hash, webhook_token_last_used_at, reminder_offset_minutes",
      )
      .eq("id", user.id)
      .maybeSingle(),
    isGeminiConnected(supabase, user.id),
    supabase
      .from("push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
  ]);

  if (profileError || subscriptionError) {
    throw profileError ?? subscriptionError;
  }
  if (!profile) {
    redirect("/onboarding");
  }

  return (
    <main className="screen-main h-dvh gap-3 overflow-hidden px-4 py-4">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-2">
        <BackLink href="/vestiaire" label="Retour au Vestiaire" />
        <h1 className="text-center font-display text-lg uppercase tracking-wide text-ink">
          Profil
        </h1>

        <section className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-border bg-surface p-4">
          <p className="font-display text-xs uppercase tracking-wide text-muted">Identité</p>
          <UsernameSection initialUsername={profile.username} />
          <EquippedTitlePreview titleCode={profile.equipped_title_code} />
          <TimezoneSection initialTimezone={profile.timezone} />
        </section>

        <PasswordSection />
        <EmailSection />

        <AggressivityLevelSection
          initialLevel={resolveAggressivityLevel(profile.aggressivity_level)}
        />
        <PlanTomorrowSection initialHour={profile.plan_tomorrow_after_hour ?? 18} />
        <ReminderOffsetDefaultSection initialMinutes={profile.reminder_offset_minutes} />

        <IntegrationsSection>
          <PushReminderToggle hasSubscription={(subscriptionCount ?? 0) > 0} />
          <WebhookTokenSection
            hasToken={Boolean(profile.webhook_token_hash)}
            lastUsedAt={profile.webhook_token_last_used_at ?? null}
          />
          <GeminiConnectionSection isConnected={geminiConnected} />
        </IntegrationsSection>

        <ExportDataSection />
        <DeleteAccountSection />

        <LogoutSection />
      </div>

      <BottomNav active="vestiaire" />
    </main>
  );
}
