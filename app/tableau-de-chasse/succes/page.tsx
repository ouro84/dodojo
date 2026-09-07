import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  ALL_ACHIEVEMENT_DEFS,
  TOTAL_ACHIEVEMENTS_COUNT,
  RARITY_ICON_NAME,
  achievementProgressFor,
  rarityCounts,
  CATEGORY_LABELS,
} from "@/lib/achievements";
import { assembleAchievementContext } from "@/lib/domain/achievements";
import BottomNav from "@/components/ui/BottomNav";
import BackLink from "@/components/ui/BackLink";
import GameIcon from "@/components/ui/GameIcon";
import TitleSelector from "@/components/pantheon/TitleSelector";

export const metadata: Metadata = { title: "Succès — Dodojo" };

// Issue #72 : catalogue lecture seule + sélecteur de titre. Succès "mystère"
// masqués (titre/description) tant que non débloqués ; succès à compteur
// affichent une barre de progression toujours visible (D12/D13 du spec).
export default async function AchievementsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Issue #199 : le contexte vient de assembleAchievementContext, jamais d'une
  // seconde construction locale. La version dupliquée ici avait déjà sa propre
  // liste de champs à maintenir — elle aurait silencieusement affiché des
  // barres de progression fausses au premier succès ajouté ailleurs.
  const [{ data: profile, error: profileError }, { data: unlockedRows, error: unlockedError }, ctx] =
    await Promise.all([
      supabase.from("profiles").select("equipped_title_code").eq("id", user.id).maybeSingle(),
      supabase.from("unlocked_achievements").select("code, unlocked_at").eq("user_id", user.id),
      assembleAchievementContext(supabase, user.id),
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

  // État Empty (règle projet n°3) : 0 succès débloqué — le catalogue reste
  // affiché, entièrement grisé (pas un état séparé, cf. spec §7).

  const counts = rarityCounts(unlockedCodes);

  return (
    <main className="screen-main h-dvh gap-3 overflow-hidden px-4 py-4">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto py-2">
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
          <span data-testid="rarity-bronze" className="inline-flex items-center gap-1">
            <GameIcon name={RARITY_ICON_NAME.bronze} className="h-4 w-4" /> {counts.bronze.unlocked}/
            {counts.bronze.total}
          </span>
          <span data-testid="rarity-argent" className="inline-flex items-center gap-1">
            <GameIcon name={RARITY_ICON_NAME.argent} className="h-4 w-4" /> {counts.argent.unlocked}/
            {counts.argent.total}
          </span>
          <span data-testid="rarity-or" className="inline-flex items-center gap-1">
            <GameIcon name={RARITY_ICON_NAME.or} className="h-4 w-4" /> {counts.or.unlocked}/
            {counts.or.total}
          </span>
        </div>
        <div>
          <span data-testid="rarity-platine" className="inline-flex items-center gap-1">
            <GameIcon name={RARITY_ICON_NAME.platine} className="h-4 w-4" /> {counts.platine.unlocked}/
            {counts.platine.total}
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
                      <span className="inline-flex items-center gap-1.5">
                        <GameIcon name={RARITY_ICON_NAME[def.rarity]} className="h-4 w-4 shrink-0" />
                        {def.displayMode === "mystery" && !unlocked ? "???" : def.title}
                      </span>
                      {unlocked && row && (
                        <span className="text-faint">{row.unlocked_at.slice(0, 10)}</span>
                      )}
                    </div>
                    {(def.displayMode === "progress" || unlocked) && (
                      <p className="mt-1 text-micro text-muted">{def.description}</p>
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
                        <p className="mt-0.5 text-right text-micro text-faint">
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
      </div>

      <BottomNav active="vestiaire" />
    </main>
  );
}
