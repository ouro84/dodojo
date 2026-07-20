"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { goldBalance } from "@/lib/game-engine";
import { getHero, isHeroOwned } from "@/lib/heroes";

interface ShopActionResult {
  error: string | null;
}

// US-18 : achat autoritaire côté serveur. Idempotent (re-achat = no-op),
// refus si solde insuffisant. Jamais de DELETE (RG-04).
export async function purchaseHero(heroId: string): Promise<ShopActionResult> {
  const hero = getHero(heroId);
  if (!hero) return { error: "Ce combattant n'existe pas." };
  if (hero.isDefault) return { error: null };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const { data: owned } = await supabase
    .from("unlocked_heroes")
    .select("hero_id, price_paid")
    .eq("user_id", user.id);
  const ownedIds = (owned ?? []).map((r) => r.hero_id);

  if (isHeroOwned(heroId, ownedIds)) return { error: null };

  const { data: results } = await supabase
    .from("day_results")
    .select("gold_earned")
    .eq("user_id", user.id);

  const balance = goldBalance(results ?? [], owned ?? []);
  if (balance < hero.price) {
    return { error: "Pas assez d'or, champion. Va terrasser des Boss." };
  }

  const { error } = await supabase.from("unlocked_heroes").insert({
    user_id: user.id,
    hero_id: hero.id,
    price_paid: hero.price,
  });
  // Contrainte unique (user_id, hero_id) protège du double achat concurrent :
  // un conflit d'unicité (23505) est traité comme no-op idempotent.
  if (error && error.code !== "23505") {
    return { error: "L'achat a échoué. Réessaie." };
  }

  // Rafraîchit le cache profiles.gold (source = solde dérivé).
  await supabase
    .from("profiles")
    .update({ gold: balance - hero.price })
    .eq("id", user.id);

  revalidatePath("/echoppe");
  revalidatePath("/");
  return { error: null };
}

// US-18 : équipe un héros possédé (sinon refus). Swap live du sprite Arène.
export async function equipHero(heroId: string): Promise<ShopActionResult> {
  const hero = getHero(heroId);
  if (!hero) return { error: "Ce combattant n'existe pas." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const { data: owned } = await supabase
    .from("unlocked_heroes")
    .select("hero_id")
    .eq("user_id", user.id);
  const ownedIds = (owned ?? []).map((r) => r.hero_id);

  if (!isHeroOwned(heroId, ownedIds)) {
    return { error: "Débloque ce combattant avant de l'équiper." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ equipped_hero_id: heroId })
    .eq("id", user.id);
  if (error) return { error: "Impossible d'équiper ce combattant. Réessaie." };

  revalidatePath("/echoppe");
  revalidatePath("/");
  return { error: null };
}
