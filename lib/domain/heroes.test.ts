import { describe, expect, test } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FakeSupabaseClient } from "./fake-supabase";
import { readHeroRoster } from "./heroes";
import { HEROES } from "@/lib/heroes";

describe("readHeroRoster", () => {
  test("liste tout le catalogue avec le statut de possession", async () => {
    const c = new FakeSupabaseClient({
      profiles: [{ id: "u1", equipped_hero_id: "fire_knight" }],
      unlocked_heroes: [{ user_id: "u1", hero_id: "fire_knight" }],
    });
    const res = await readHeroRoster(c as unknown as SupabaseClient, "u1");
    expect(res).toHaveLength(HEROES.length);
    const fk = res.find((h) => h.id === "fire_knight");
    expect(fk?.owned).toBe(true);
    expect(fk?.equipped).toBe(true);
  });

  test("ne compte pas les possessions d'un autre utilisateur", async () => {
    const c = new FakeSupabaseClient({
      profiles: [{ id: "u1", equipped_hero_id: null }],
      unlocked_heroes: [{ user_id: "autre", hero_id: "fire_knight" }],
    });
    const res = await readHeroRoster(c as unknown as SupabaseClient, "u1");
    expect(res.every((h) => !h.owned)).toBe(true);
  });
});
