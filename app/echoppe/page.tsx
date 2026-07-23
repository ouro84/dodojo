import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { goldBalance } from "@/lib/game-engine";
import { CharacterSelect } from "@/components/shop/CharacterSelect";

// US-18 : l'Échoppe (Character Select). Solde d'or dérivé, possession lue depuis
// unlocked_heroes, héros équipé depuis profiles. 3 états UI (Loading via
// loading.tsx, Error ci-dessous, Empty naturel — catalogue toujours peuplé).
export default async function EchoppePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: profile, error: pErr },
    { data: results, error: rErr },
    { data: owned, error: oErr },
    { data: ownedSkinsForBalance, error: sErr },
  ] = await Promise.all([
    supabase.from("profiles").select("equipped_hero_id").eq("id", user.id).maybeSingle(),
    supabase.from("day_results").select("gold_earned").eq("user_id", user.id),
    supabase.from("unlocked_heroes").select("hero_id, price_paid").eq("user_id", user.id),
    supabase.from("unlocked_skins").select("price_paid").eq("user_id", user.id),
  ]);

  if (pErr || rErr || oErr || sErr || !profile) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <p role="alert" className="max-w-[32ch] text-sm text-hp">
          L&apos;Échoppe est fermée un instant. Réessaie.
        </p>
        <Link href="/qg" className="text-sm text-xp underline underline-offset-4">
          Retour au QG
        </Link>
      </main>
    );
  }

  const balance = goldBalance(results ?? [], owned ?? [], ownedSkinsForBalance ?? []);
  const ownedIds = (owned ?? []).map((r) => r.hero_id);

  return (
    <main className="flex flex-1 flex-col items-center gap-4 px-6 py-8">
      <Link
        href="/qg"
        className="self-start text-sm text-xp underline underline-offset-4"
      >
        ← Retour au QG
      </Link>
      <CharacterSelect
        ownedIds={ownedIds}
        equippedId={profile.equipped_hero_id}
        balance={balance}
      />
    </main>
  );
}
