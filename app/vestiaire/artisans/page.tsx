import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { assembleAchievementContext } from "@/app/actions/achievements";
import ArtisansCarousel from "@/components/vestiaire/ArtisansCarousel";
import BackLink from "@/components/ui/BackLink";
import BottomNav from "@/components/ui/BottomNav";

export const metadata: Metadata = { title: "Les Artisans — Dodojo" };

// Issue #134 : crédite les créateurs des assets réellement livrés. Réutilise
// assembleAchievementContext (déjà appelée par 4 autres checkpoints) plutôt
// que d'écrire une requête dédiée — seuls unlockedHeroIds/seenBossIds/
// seenBackgroundIds sont consommés ici, level/bestStreak/hasVictory sont
// ignorés sans risque.
export default async function ArtisansPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const ctx = await assembleAchievementContext(supabase, user.id);

  return (
    <main className="screen-main h-dvh gap-3 overflow-hidden px-4 py-4">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-2">
        <BackLink href="/vestiaire" label="Retour au Vestiaire" />
        <h1 className="text-center font-display text-lg uppercase tracking-wide text-ink">
          Les Artisans
        </h1>
        <p className="text-center text-xs text-muted">
          Chaque héros, chaque Boss, chaque décor a été façonné par quelqu&apos;un avant de finir
          dans ton Arène.
        </p>
        <ArtisansCarousel
          seenContext={{
            unlockedHeroIds: ctx.unlockedHeroIds,
            seenBossIds: ctx.seenBossIds,
            seenBackgroundIds: ctx.seenBackgroundIds,
          }}
        />
      </div>
      <BottomNav active="vestiaire" />
    </main>
  );
}
