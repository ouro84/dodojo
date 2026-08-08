import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentStreak, dayKey } from "@/lib/game-engine";
import StreakBadge from "@/components/combat/StreakBadge";
import InstallCta from "@/components/pwa/InstallCta";
import BottomNav from "@/components/ui/BottomNav";

export const metadata: Metadata = { title: "Le Vestiaire — Dodojo" };

// Issue #69 : redevient un pur hub de navigation — les réglages de compte
// (Volume Intérieur, Planifier Demain, Intégrations, pseudo, mdp, email...)
// ont déménagé vers /vestiaire/profil.
const SECTIONS: Array<{ href: string; icon: string; label: string }> = [
  { href: "/vestiaire/profil", icon: "👤", label: "Profil" },
  { href: "/tableau-de-chasse", icon: "🏆", label: "Tableau de Chasse" },
  { href: "/vestiaire/entrainement", icon: "🔁", label: "Mes Routines" },
  { href: "/marche-noir", icon: "🛒", label: "Le Marché Noir" },
  { href: "/guide", icon: "📖", label: "Le Guide" },
];

export default async function QgPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile, error: profileError }, { data: dayResults, error: dayError }] =
    await Promise.all([
      supabase.from("profiles").select("best_streak, timezone").eq("id", user.id).maybeSingle(),
      supabase.from("day_results").select("day_date, outcome").eq("user_id", user.id),
    ]);

  if (profileError || dayError) {
    throw profileError ?? dayError;
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

      <BottomNav active="vestiaire" />
    </main>
  );
}
