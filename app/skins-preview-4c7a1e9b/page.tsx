import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { HEROES } from "@/lib/heroes";
import SkinsPreview from "@/components/shop/SkinsPreview";

// Écran de test INTERNE des tenues de héros (US-53).
// - Chemin volontairement obscur et non listé dans la navigation.
// - Login requis (redirige sinon) → inaccessible à un visiteur anonyme.
// - Ne doit jamais être lié depuis l'UI utilisateur final.
export const metadata = { robots: { index: false, follow: false } };

export default async function SkinsPreviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-6">
      <h1 className="text-center font-display text-lg uppercase tracking-wide text-ink">
        Tenues — test interne
      </h1>
      <SkinsPreview heroes={HEROES} />
    </main>
  );
}
