import type { SupabaseClient } from "@supabase/supabase-js";
import { getHero, isHeroOwned } from "@/lib/heroes";
import { getSkin, isSkinOwned } from "@/lib/hero-skins";
import type { DomainResult } from "./errors";

// Issue #183 : equipe le heros ET la tenue selectionnee en une seule action.
// Deplace depuis app/actions/shop.ts (`equipHeroAndSkin`) — le wrapper serveur
// fait ses propres verifications de catalogue (getHero/getSkin) AVANT
// d'appeler cette fonction, mais on les refait ici en defense-in-depth pour
// un futur appelant direct (ex. un tool MCP) qui ne passerait pas par lui.
export async function equipHeroForUser(
  supabase: SupabaseClient,
  userId: string,
  heroId: string,
  skinId: string,
): Promise<DomainResult> {
  const hero = getHero(heroId);
  if (!hero) return { error: "hero_not_found" };
  const skin = getSkin(skinId);
  if (!skin || skin.heroId !== heroId) return { error: "skin_not_found" };

  const [{ data: ownedHeroes }, { data: ownedSkins }] = await Promise.all([
    supabase.from("unlocked_heroes").select("hero_id").eq("user_id", userId),
    supabase.from("unlocked_skins").select("skin_id").eq("user_id", userId),
  ]);
  const ownedHeroIds = (ownedHeroes ?? []).map((r) => r.hero_id);
  if (!isHeroOwned(heroId, ownedHeroIds)) {
    return { error: "hero_not_owned" };
  }
  if (!skin.isDefault) {
    const ownedSkinIds = (ownedSkins ?? []).map((r) => r.skin_id);
    if (!isSkinOwned(skinId, heroId, ownedSkinIds)) {
      return { error: "skin_not_owned" };
    }
  }

  const equippedSkinId = skin.isDefault ? null : skinId;
  const { error } = await supabase
    .from("profiles")
    .update({ equipped_hero_id: heroId, equipped_skin_id: equippedSkinId })
    .eq("id", userId);
  if (error) return { error: "update_failed" };

  return { error: null };
}
