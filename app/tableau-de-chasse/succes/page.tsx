import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  ALL_ACHIEVEMENT_DEFS,
  TOTAL_ACHIEVEMENTS_COUNT,
  achievementProgressFor,
  rarityCounts,
  type AchievementContext,
  type AchievementRarity,
} from "@/lib/achievements";
import BottomNav from "@/components/ui/BottomNav";
import BackLink from "@/components/ui/BackLink";
import TitleSelector from "@/components/pantheon/TitleSelector";

export const metadata: Metadata = { title: "Succès — Dodojo" };

const RARITY_ICON: Record<AchievementRarity, string> = {
  bronze: "🥉",
  argent: "🥈",
  or: "🥇",
  platine: "💎",
};

const CATEGORY_LABELS: Record<string, string> = {
  hero: "Héros",
  collection: "Collection",
  progression: "Progression",
  streak: "Séries",
  exploration: "Exploration",
  level: "Niveau",
  meta: "Méta",
};

// Issue #72 : catalogue lecture seule + sélecteur de titre. Succès "mystère"
// masqués (titre/description) tant que non débloqués ; succès à compteur
// affichent une barre de progression toujours visible (D12/D13 du spec).
export default async function AchievementsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: profile, error: profileError },
    { data: unlockedRows, error: unlockedError },
    { data: unlockedHeroes },
    { data: dailyBoss },
    { data: victoryRow },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("level, best_streak, equipped_title_code")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("unlocked_achievements").select("code, unlocked_at").eq("user_id", user.id),
    supabase.from("unlocked_heroes").select("hero_id").eq("user_id", user.id),
    supabase.from("daily_boss").select("boss_id, background_id").eq("user_id", user.id),
    supabase
      .from("day_results")
      .select("id")
      .eq("user_id", user.id)
      .eq("outcome", "victory")
      .limit(1)
      .maybeSingle(),
  ]);

  // État Error (règle projet n°3).
  if (profileError || unlockedError || !profile) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center">
        <p className="font-hud text-sm font-semibold uppercase tracking-wide text-alert">
          Le catalogue est scellé
        </p>
        <p className="max-w-[28ch] text-xs text-muted">
          Impossible de charger tes succès. Réessaie dans un instant.
        </p>
        <BottomNav active="vestiaire" />
      </main>
    );
  }

  const unlockedCodes = new Set((unlockedRows ?? []).map((r) => r.code));
  const ctx: AchievementContext = {
    level: profile.level,
    bestStreak: profile.best_streak,
    hasVictory: victoryRow !== null,
    unlockedHeroIds: (unlockedHeroes ?? []).map((r) => r.hero_id),
    seenBossIds: [...new Set((dailyBoss ?? []).map((r) => r.boss_id))],
    seenBackgroundIds: [...new Set((dailyBoss ?? []).map((r) => r.background_id))],
  };

  // État Empty (règle projet n°3) : 0 succès débloqué — le catalogue reste
  // affiché, entièrement grisé (pas un état séparé, cf. spec §7).

  const counts = rarityCounts(unlockedCodes);

  return (
    <main className="screen-main gap-3 px-4 py-6">
      <BackLink href="/tableau-de-chasse" label="Retour au Tableau de Chasse" />
      <h1 className="text-center font-hud text-lg font-semibold uppercase tracking-wide text-ink">
        Succès
      </h1>
      <p className="text-center text-xs text-muted">
        {unlockedCodes.size} / {TOTAL_ACHIEVEMENTS_COUNT} succès débloqués
      </p>

      {/* Issue #142 : KPI par rareté — bronze/argent/or inline, platine séparé. */}
      <section
        aria-label="Avancée par rareté"
        className="flex flex-col gap-1 text-center text-xs text-muted"
      >
        <div className="flex justify-center gap-4">
          <span>
            <span aria-hidden="true">🥉</span> {counts.bronze.unlocked}/{counts.bronze.total}
          </span>
          <span>
            <span aria-hidden="true">🥈</span> {counts.argent.unlocked}/{counts.argent.total}
          </span>
          <span>
            <span aria-hidden="true">🥇</span> {counts.or.unlocked}/{counts.or.total}
          </span>
        </div>
        <div>
          <span>
            <span aria-hidden="true">💎</span> {counts.platine.unlocked}/{counts.platine.total}
          </span>
        </div>
      </section>

      <TitleSelector
        unlockedCodes={[...unlockedCodes]}
        equippedCode={profile.equipped_title_code}
      />

      {Object.entries(CATEGORY_LABELS).map(([category, label]) => {
        const defs = ALL_ACHIEVEMENT_DEFS.filter((d) => d.category === category);
        if (defs.length === 0) return null;
        return (
          <section
            key={category}
            className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4"
          >
            <p className="font-display text-xs uppercase tracking-wide text-muted">{label}</p>
            <ul className="flex flex-col gap-2 text-xs">
              {defs.map((def) => {
                const unlocked = unlockedCodes.has(def.code);
                const progress = achievementProgressFor(def.code, ctx, unlockedCodes);
                const row = (unlockedRows ?? []).find((r) => r.code === def.code);
                return (
                  <li
                    key={def.code}
                    className={`rounded-md border border-border p-2 ${unlocked ? "" : "opacity-60"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span>
                        <span aria-hidden="true">{RARITY_ICON[def.rarity]}</span>{" "}
                        {def.displayMode === "mystery" && !unlocked ? "???" : def.title}
                      </span>
                      {unlocked && row && (
                        <span className="text-faint">{row.unlocked_at.slice(0, 10)}</span>
                      )}
                    </div>
                    {(def.displayMode === "progress" || unlocked) && (
                      <p className="mt-1 text-[11px] text-muted">{def.description}</p>
                    )}
                    {progress && (
                      <>
                        <div
                          role="progressbar"
                          aria-valuenow={progress.current}
                          aria-valuemin={0}
                          aria-valuemax={progress.total}
                          aria-label={def.title}
                          className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-border"
                        >
                          <div
                            className="h-full rounded-full bg-xp transition-[width] duration-300 ease-out motion-reduce:transition-none"
                            style={{
                              width: `${Math.min(100, Math.round((progress.current / progress.total) * 100))}%`,
                            }}
                          />
                        </div>
                        <p className="mt-0.5 text-right text-[10px] text-faint">
                          {progress.current} / {progress.total}
                        </p>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <BottomNav active="vestiaire" />
    </main>
  );
}
