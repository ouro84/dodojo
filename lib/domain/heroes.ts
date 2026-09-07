import type { SupabaseClient } from "@supabase/supabase-js";
import { HEROES, isHeroOwned } from "@/lib/heroes";

export interface HeroRead {
  id: string;
  name: string;
  owned: boolean;
  equipped: boolean;
}

// Lecture seule : catalogue statique (lib/heroes.ts) croise avec la
// possession reelle en base. La possession est STRICTEMENT en base depuis
// US-29 — aucun heros n'est possede d'office.
export async function readHeroRoster(
  supabase: SupabaseClient,
  userId: string,
): Promise<HeroRead[]> {
  const [{ data: profile }, { data: owned }] = await Promise.all([
    supabase.from("profiles").select("equipped_hero_id").eq("id", userId).maybeSingle(),
    supabase.from("unlocked_heroes").select("hero_id").eq("user_id", userId),
  ]);

  const equippedId = (profile as { equipped_hero_id: string | null } | null)?.equipped_hero_id ?? null;
  const ownedIds = ((owned ?? []) as Array<{ hero_id: string }>).map((r) => r.hero_id);

  return HEROES.map((hero) => ({
    id: hero.id,
    name: hero.name,
    owned: isHeroOwned(hero.id, ownedIds),
    equipped: hero.id === equippedId,
  }));
}
