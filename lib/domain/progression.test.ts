import { describe, expect, test } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FakeSupabaseClient } from "./fake-supabase";
import { readProgression } from "./progression";

describe("readProgression", () => {
  test("calcule l'XP restante avant le niveau suivant", async () => {
    const c = new FakeSupabaseClient({
      profiles: [{ id: "u1", level: 3, xp: 120, equipped_hero_id: "fire_knight", equipped_skin_id: null }],
      day_results: [],
      unlocked_heroes: [],
      unlocked_skins: [],
    });
    const res = await readProgression(c as unknown as SupabaseClient, "u1");
    // xpThresholdForLevel(3) = 300 ; il reste 180 XP.
    expect(res?.xpToNextLevel).toBe(180);
  });
});
