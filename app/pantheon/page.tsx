import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  goldBalance,
  pantheonStats,
  titleForStreak,
  xpThresholdForLevel,
} from "@/lib/game-engine";
import DamageSparkline from "@/components/pantheon/DamageSparkline";
import WinRateRing from "@/components/pantheon/WinRateRing";
import CombatJournal from "@/components/pantheon/CombatJournal";

// US-10 : le Panthéon — écran lecture seule, dérivé de day_results + profiles.
// Aucune écriture (B1). Accessible via le QG (D3).
export default async function PantheonPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("username, level, xp, current_title, best_streak")
    .eq("id", user.id)
    .maybeSingle();

  const { data: dayResults, error: dayError } = await supabase
    .from("day_results")
    .select("day_date, outcome, damage_dealt, gold_earned")
    .eq("user_id", user.id)
    .order("day_date", { ascending: false })
    .limit(90);

  const { data: unlockedHeroes } = await supabase
    .from("unlocked_heroes")
    .select("price_paid")
    .eq("user_id", user.id);

  const { data: unlockedSkins } = await supabase
    .from("unlocked_skins")
    .select("price_paid")
    .eq("user_id", user.id);

  // État Error (règle projet n°3).
  if (profileError || dayError || !profile) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center">
        <p className="font-display text-sm uppercase tracking-wide text-alert">
          Le Panthéon est scellé
        </p>
        <p className="max-w-[28ch] text-xs text-muted">
          Impossible de charger tes faits d&apos;armes. Réessaie dans un instant.
        </p>
        <Link href="/pantheon" className="text-xs text-xp underline underline-offset-4">
          Réessayer
        </Link>
        <Link href="/qg" className="text-xs text-muted underline underline-offset-4">
          Retour au QG
        </Link>
      </main>
    );
  }

  const results = dayResults ?? [];
  const stats = pantheonStats(results);
  const balance = goldBalance(results, unlockedHeroes ?? [], unlockedSkins ?? []);
  const xpThreshold = xpThresholdForLevel(profile.level);
  const xpPct = Math.min(100, Math.round((profile.xp / xpThreshold) * 100));

  const TITLE_TIERS = [
    { streak: 7, name: "Ceinture Jaune" },
    { streak: 30, name: "Ceinture Noire" },
    { streak: 100, name: "Sensei" },
  ];
  const nextLocked = TITLE_TIERS.find((t) => profile.best_streak < t.streak);
  const activeTitle = titleForStreak(profile.best_streak) ?? profile.current_title;

  // État Empty (règle projet n°3) : aucun combat au palmarès.
  if (results.length === 0) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center">
        <h1 className="font-display text-lg uppercase tracking-wide text-ink">
          Le Panthéon
        </h1>
        <p className="max-w-[30ch] text-sm text-muted">
          Aucun combat à ton palmarès, {profile.username}. Va terrasser ton
          premier Boss.
        </p>
        <Link href="/" className="text-sm text-hp underline underline-offset-4">
          Rejoindre l&apos;Arène
        </Link>
        <Link href="/qg" className="text-xs text-muted underline underline-offset-4">
          Retour au QG
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-3 px-4 py-6">
      <h1 className="text-center font-display text-lg uppercase tracking-wide text-ink">
        Le Panthéon
      </h1>

      {/* Bloc Héros */}
      <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
        <p className="font-display text-xs uppercase tracking-wide text-muted">Héros</p>
        <div className="flex items-baseline justify-between">
          <span className="font-display text-base text-ink">{profile.username}</span>
          <span className="text-xs text-xp">Niveau {profile.level}</span>
        </div>
        <p className="text-xs text-gold">{activeTitle}</p>
        <div className="h-2 w-full overflow-hidden rounded-full bg-border">
          <div className="h-full rounded-full bg-xp" style={{ width: `${xpPct}%` }} />
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
            <span className="text-hp">{stats.bestDay.damage} dégâts</span> le{" "}
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

      <Link
        href="/qg"
        className="self-center text-xs text-muted underline underline-offset-4"
      >
        Retour au QG
      </Link>
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
