import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  goldBalance,
  tableauChasseStats,
  titleForStreak,
  xpThresholdForLevel,
} from "@/lib/game-engine";
import DamageSparkline from "@/components/pantheon/DamageSparkline";
import WinRateRing from "@/components/pantheon/WinRateRing";
import CombatJournal from "@/components/pantheon/CombatJournal";
import BottomNav from "@/components/ui/BottomNav";
import BackLink from "@/components/ui/BackLink";

export const metadata: Metadata = { title: "Tableau de Chasse — Dodojo" };

// US-10 : le Tableau de Chasse — écran lecture seule, dérivé de day_results + profiles.
// Aucune écriture (B1). Accessible via Le Vestiaire (D3).
export default async function PantheonPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: profile, error: profileError },
    { data: dayResults, error: dayError },
    { data: goldHistory },
    { data: unlockedHeroes },
    { data: unlockedSkins },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("username, level, xp, current_title, best_streak")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("day_results")
      .select("day_date, outcome, damage_dealt, gold_earned")
      .eq("user_id", user.id)
      .order("day_date", { ascending: false })
      .limit(90),
    // Non borné (même pattern que app/echoppe/page.tsx) : goldBalance() a besoin
    // de TOUT l'historique, jamais du lot borné à 90 jours ci-dessus utilisé pour
    // le Journal/sparkline (audit #67, PR4 — le solde divergeait du Marché Noir
    // au-delà de 90 jours de compte).
    supabase.from("day_results").select("gold_earned").eq("user_id", user.id),
    supabase.from("unlocked_heroes").select("price_paid").eq("user_id", user.id),
    supabase.from("unlocked_skins").select("price_paid").eq("user_id", user.id),
  ]);

  // État Error (règle projet n°3).
  if (profileError || dayError || !profile) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center">
        <p className="font-hud text-sm font-semibold uppercase tracking-wide text-alert">
          Le Tableau de Chasse est scellé
        </p>
        <p className="max-w-[28ch] text-xs text-muted">
          Impossible de charger tes faits d&apos;armes. Réessaie dans un instant.
        </p>
        <Link href="/tableau-de-chasse" className="text-xs text-xp-text underline underline-offset-4">
          Réessayer
        </Link>
        <BottomNav active="qg" />
      </main>
    );
  }

  const results = dayResults ?? [];
  const stats = tableauChasseStats(results);
  const balance = goldBalance(goldHistory ?? [], unlockedHeroes ?? [], unlockedSkins ?? []);
  const xpThreshold = xpThresholdForLevel(profile.level);
  const xpPct = Math.min(100, Math.round((profile.xp / xpThreshold) * 100));

  const TITLE_TIERS = [
    { streak: 7, name: "Calme" },
    { streak: 30, name: "Silence" },
    { streak: 100, name: "Esprit Vide" },
  ];
  const nextLocked = TITLE_TIERS.find((t) => profile.best_streak < t.streak);
  const activeTitle = titleForStreak(profile.best_streak) ?? profile.current_title;

  // État Empty (règle projet n°3) : aucun combat au palmarès.
  if (results.length === 0) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center">
        <h1 className="font-hud text-lg font-semibold uppercase tracking-wide text-ink">
          Tableau de Chasse
        </h1>
        <p className="max-w-[30ch] text-sm text-muted">
          Aucun combat à ton palmarès, {profile.username}. Va terrasser ton
          premier Boss.
        </p>
        <Link href="/" className="text-sm text-hp-text underline underline-offset-4">
          Rejoindre l&apos;Arène
        </Link>
        <BottomNav active="qg" />
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-3 px-4 py-6">
      <BackLink href="/vestiaire" label="Retour au Vestiaire" />
      <h1 className="text-center font-hud text-lg font-semibold uppercase tracking-wide text-ink">
        Tableau de Chasse
      </h1>

      {/* Bloc Héros */}
      <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
        <p className="font-display text-xs uppercase tracking-wide text-muted">Héros</p>
        <div className="flex items-baseline justify-between">
          <span className="font-hud text-base font-semibold text-ink">{profile.username}</span>
          <span className="text-xs text-xp-text">Niveau {profile.level}</span>
        </div>
        <p className="text-xs text-gold">{activeTitle}</p>
        <div
          role="progressbar"
          aria-valuenow={xpPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Expérience"
          className="h-2 w-full overflow-hidden rounded-full bg-border"
        >
          <div
            className="h-full rounded-full bg-xp transition-[width] duration-300 ease-out motion-reduce:transition-none"
            style={{ width: `${xpPct}%` }}
          />
        </div>
        <p className="text-right text-[10px] text-faint">
          {profile.xp} / {xpThreshold} XP
        </p>
      </section>

      {/* Bloc Trophées */}
      <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
        <p className="font-display text-xs uppercase tracking-wide text-muted">Trophées</p>
        <div className="flex items-center gap-4">
          <WinRateRing ratio={stats.winRate} />
          <div className="grid flex-1 grid-cols-1 gap-1 text-xs">
            <Stat label="Record de série" value={`${profile.best_streak} j`} />
            <Stat label="Boss vaincus" value={String(stats.totalVictories)} />
            <Stat label="Dégâts all-time" value={String(stats.totalDamage)} />
          </div>
        </div>
        <DamageSparkline values={stats.damageSeries} />
        {stats.bestDay && (
          <p className="text-[11px] text-muted">
            Record :{" "}
            <span className="text-hp-text">{stats.bestDay.damage} dégâts</span> le{" "}
            {stats.bestDay.day_date.slice(8, 10)}/{stats.bestDay.day_date.slice(5, 7)}
          </p>
        )}
      </section>

      {/* Bloc Trésor */}
      <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
        <p className="font-display text-xs uppercase tracking-wide text-muted">Trésor</p>
        <div className="flex justify-between text-xs">
          <Stat label="Or en cours" value={`${balance} 🪙`} />
          <Stat label="Or all-time" value={`${stats.goldAllTime} 🪙`} align="right" />
        </div>
      </section>

      {/* Bloc Titres */}
      <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
        <p className="font-display text-xs uppercase tracking-wide text-muted">Titres</p>
        <ul className="flex flex-col gap-1 text-xs">
          {TITLE_TIERS.map((tier) => {
            const unlocked = profile.best_streak >= tier.streak;
            return (
              <li
                key={tier.streak}
                className={`flex justify-between ${unlocked ? "text-gold" : "text-faint"}`}
              >
                <span>
                  {unlocked ? "🏅" : "🔒"} {tier.name}
                </span>
                <span>série {tier.streak}</span>
              </li>
            );
          })}
        </ul>
        {nextLocked && (
          <p className="text-[11px] text-muted">
            Prochain palier : {nextLocked.name} à {nextLocked.streak} jours de série.
          </p>
        )}
      </section>

      {/* Bloc Journal de combat */}
      <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
        <p className="font-display text-xs uppercase tracking-wide text-muted">
          Journal de combat
        </p>
        <CombatJournal entries={results} />
      </section>

      <BottomNav active="qg" />
    </main>
  );
}

function Stat({
  label,
  value,
  align = "left",
}: {
  label: string;
  value: string;
  align?: "left" | "right";
}) {
  return (
    <div className={`flex flex-col ${align === "right" ? "items-end" : "items-start"}`}>
      <span className="text-[10px] uppercase tracking-wide text-faint">{label}</span>
      <span className="font-display text-sm text-ink">{value}</span>
    </div>
  );
}
