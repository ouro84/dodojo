import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { goldBalance } from "@/lib/game-engine";
import { CharacterSelect } from "@/components/shop/CharacterSelect";
import BottomNav from "@/components/ui/BottomNav";

export const metadata: Metadata = { title: "Échoppe — Dodojo" };

// US-18/US-53 : l'Échoppe (Character Select + tenues). Solde d'or dérivé,
// possession lue depuis unlocked_heroes/unlocked_skins, équipé depuis profiles.
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
    { data: ownedSkins, error: sErr },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("equipped_hero_id, equipped_skin_id")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("day_results").select("gold_earned").eq("user_id", user.id),
    supabase.from("unlocked_heroes").select("hero_id, price_paid").eq("user_id", user.id),
    supabase.from("unlocked_skins").select("hero_id, skin_id, price_paid").eq("user_id", user.id),
  ]);

  if (pErr || rErr || oErr || sErr || !profile) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <p role="alert" className="max-w-[32ch] text-sm text-hp-text">
          L&apos;Échoppe est fermée un instant. Réessaie.
        </p>
        <Link href="/echoppe" className="text-sm text-xp-text underline underline-offset-4">
          Réessayer
        </Link>
        <BottomNav active="echoppe" />
      </main>
    );
  }

  const balance = goldBalance(results ?? [], owned ?? [], ownedSkins ?? []);
  const ownedIds = (owned ?? []).map((r) => r.hero_id);
  const ownedSkinIds = (ownedSkins ?? []).map((r) => r.skin_id);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center gap-4 px-6 py-8">
      <CharacterSelect
        ownedIds={ownedIds}
        equippedId={profile.equipped_hero_id}
        ownedSkinIds={ownedSkinIds}
        equippedSkinId={profile.equipped_skin_id}
        balance={balance}
      />
      <BottomNav active="echoppe" />
    </main>
  );
}
