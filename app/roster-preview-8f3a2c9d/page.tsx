import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BOSSES } from "@/lib/bosses";
import { BACKGROUNDS } from "@/lib/backgrounds";
import { HEROES } from "@/lib/heroes";
import RosterPreview from "@/components/combat/RosterPreview";

// Écran de test INTERNE du roster de boss / décors.
// - Chemin volontairement obscur et non listé dans la navigation.
// - Login requis (redirige sinon) → inaccessible à un visiteur anonyme.
// - Ne doit jamais être lié depuis l'UI utilisateur final.
// Sert à vérifier manuellement chaque boss (extraction sprite + cohérence décor)
// avant/après ajout au roster.
export const metadata = { robots: { index: false, follow: false } };

export default async function RosterPreviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="screen-main gap-4 px-4 py-6">
      <h1 className="text-center font-display text-lg uppercase tracking-wide text-ink">
        Roster — test interne
      </h1>
      <RosterPreview bosses={BOSSES} backgrounds={BACKGROUNDS} heroes={HEROES} />
    </main>
  );
}
