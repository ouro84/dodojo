"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { goldBalance } from "@/lib/game-engine";
import { getHero, isHeroOwned } from "@/lib/heroes";
import { getSkin, isSkinOwned } from "@/lib/hero-skins";
import { applyNewAchievements, assembleAchievementContext } from "@/app/actions/achievements";

interface ShopActionResult {
  error: string | null;
  newAchievements?: string[];
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

  const [{ data: results }, { data: ownedSkins }] = await Promise.all([
    supabase.from("day_results").select("gold_earned").eq("user_id", user.id),
    supabase.from("unlocked_skins").select("price_paid").eq("user_id", user.id),
  ]);

  const balance = goldBalance(results ?? [], owned ?? [], ownedSkins ?? []);
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

  const ctx = await assembleAchievementContext(supabase, user.id);
  const newAchievements = await applyNewAchievements(supabase, user.id, ctx);

  revalidatePath("/marche-noir");
  revalidatePath("/");
  return { error: null, newAchievements };
}

// Issue #183 : équipe le héros ET la tenue sélectionnée en une seule action.
// Remplace l'ancien `equipHero` (bouton séparé, source de confusion — deux
// boutons "Équiper" sur le même écran, l'un pour le héros, l'autre pour la
// tenue, cf. issue). Le CTA du carrousel de tenues est désormais le seul
// point d'action une fois le héros possédé.
export async function equipHeroAndSkin(
  heroId: string,
  skinId: string,
): Promise<ShopActionResult> {
  const hero = getHero(heroId);
  if (!hero) return { error: "Ce combattant n'existe pas." };
  const skin = getSkin(skinId);
  if (!skin || skin.heroId !== heroId) return { error: "Cette tenue n'existe pas." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const [{ data: ownedHeroes }, { data: ownedSkins }] = await Promise.all([
    supabase.from("unlocked_heroes").select("hero_id").eq("user_id", user.id),
    supabase.from("unlocked_skins").select("skin_id").eq("user_id", user.id),
  ]);
  const ownedHeroIds = (ownedHeroes ?? []).map((r) => r.hero_id);
  if (!isHeroOwned(heroId, ownedHeroIds)) {
    return { error: "Débloque ce combattant avant de l'équiper." };
  }
  if (!skin.isDefault) {
    const ownedSkinIds = (ownedSkins ?? []).map((r) => r.skin_id);
    if (!isSkinOwned(skinId, heroId, ownedSkinIds)) {
      return { error: "Débloque cette tenue avant de l'équiper." };
    }
  }

  const equippedSkinId = skin.isDefault ? null : skinId;
  const { error } = await supabase
    .from("profiles")
    .update({ equipped_hero_id: heroId, equipped_skin_id: equippedSkinId })
    .eq("id", user.id);
  if (error) return { error: "Impossible d'équiper ce combattant. Réessaie." };

  revalidatePath("/marche-noir");
  revalidatePath("/");
  return { error: null };
}

// US-53 : achat autoritaire côté serveur. Idempotent, refus si solde
// insuffisant ou héros parent non possédé (D6 du spec). Jamais de DELETE.
export async function purchaseSkin(
  heroId: string,
  skinId: string,
): Promise<ShopActionResult> {
  const skin = getSkin(skinId);
  if (!skin || skin.heroId !== heroId) return { error: "Cette tenue n'existe pas." };
  if (skin.isDefault) return { error: null };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const [{ data: ownedHeroes }, { data: ownedSkins }] = await Promise.all([
    supabase.from("unlocked_heroes").select("hero_id, price_paid").eq("user_id", user.id),
    supabase.from("unlocked_skins").select("hero_id, skin_id, price_paid").eq("user_id", user.id),
  ]);
  const ownedHeroIds = (ownedHeroes ?? []).map((r) => r.hero_id);
  if (!isHeroOwned(heroId, ownedHeroIds)) {
    return { error: "Débloque ce combattant avant d'acheter une tenue." };
  }

  const ownedSkinIds = (ownedSkins ?? []).map((r) => r.skin_id);
  if (isSkinOwned(skinId, heroId, ownedSkinIds)) return { error: null };

  const { data: results } = await supabase
    .from("day_results")
    .select("gold_earned")
    .eq("user_id", user.id);

  const balance = goldBalance(results ?? [], ownedHeroes ?? [], ownedSkins ?? []);
  if (balance < skin.price) {
    return { error: "Pas assez d'or, champion. Va terrasser des Boss." };
  }

  const { error } = await supabase.from("unlocked_skins").insert({
    user_id: user.id,
    hero_id: heroId,
    skin_id: skinId,
    price_paid: skin.price,
  });
  if (error && error.code !== "23505") {
    return { error: "L'achat a échoué. Réessaie." };
  }

  await supabase
    .from("profiles")
    .update({ gold: balance - skin.price })
    .eq("id", user.id);

  revalidatePath("/marche-noir");
  revalidatePath("/");
  return { error: null };
}
