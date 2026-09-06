import { describe, expect, test } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FakeSupabaseClient } from "./fake-supabase";
import { completeTaskForUser } from "./tasks";
import { readProgression } from "./progression";
import { readDailyBoss } from "./boss";

// Ces tests sont la raison d'etre du correctif des filtres du faux client
// (lot 3, Task 1). Avant lui, ils auraient tous passe meme sans le moindre
// .eq("user_id", ...) dans le code de production. Le serveur MCP appelle le
// domaine avec un client service-role qui CONTOURNE RLS : ces filtres
// applicatifs sont la seule frontiere de tenant qui reste.
describe("isolation de tenant — le domaine ne voit jamais les lignes d'autrui", () => {
  test("completeTaskForUser refuse une tache appartenant a un autre utilisateur", async () => {
    const c = new FakeSupabaseClient({
      profiles: [{ id: "u1", level: 1, xp: 0, combo_count: 0, last_combo_completed_at: null, timezone: "UTC" }],
      tasks: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          user_id: "victime",
          is_completed: false,
          is_abandoned: false,
          xp_awarded: null,
          deadline_at: null,
          deferred_at: null,
        },
      ],
      unlocked_achievements: [],
    });

    const res = await completeTaskForUser(
      c as unknown as SupabaseClient,
      "u1",
      "11111111-1111-1111-1111-111111111111",
      true,
    );

    expect(res.error).not.toBeNull();
  });

  test("readProgression ne lit pas le profil d'un autre utilisateur", async () => {
    const c = new FakeSupabaseClient({
      profiles: [{ id: "victime", level: 99, xp: 5000, equipped_hero_id: "x", equipped_skin_id: null }],
      day_results: [],
      unlocked_heroes: [],
      unlocked_skins: [],
    });

    const res = await readProgression(c as unknown as SupabaseClient, "u1");
    expect(res).toBeNull();
  });

  test("readDailyBoss ne lit pas le boss d'un autre utilisateur", async () => {
    const c = new FakeSupabaseClient({
      daily_boss: [
        { user_id: "victime", day_date: "2026-09-06", boss_id: "minotaur", background_id: "forest-1" },
      ],
    });

    const res = await readDailyBoss(c as unknown as SupabaseClient, "u1", "2026-09-06");
    expect(res).toBeNull();
  });
});
