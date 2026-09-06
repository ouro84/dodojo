import { describe, expect, test } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FakeSupabaseClient } from "./fake-supabase";
import { readStreak } from "./streak";

describe("readStreak", () => {
  test("renvoie une serie a zero sans aucun jour enregistre", async () => {
    const c = new FakeSupabaseClient({ day_results: [] });
    const res = await readStreak(c as unknown as SupabaseClient, "u1", "2026-09-06");
    expect(res).toEqual({ length: 0, jokersUsedThisWeek: 0, atRisk: false });
  });

  test("ne compte que les jours de l'utilisateur demande", async () => {
    const c = new FakeSupabaseClient({
      day_results: [
        { user_id: "autre", day_date: "2026-09-05", outcome: "victory" },
        { user_id: "autre", day_date: "2026-09-04", outcome: "victory" },
      ],
    });
    const res = await readStreak(c as unknown as SupabaseClient, "u1", "2026-09-06");
    expect(res.length).toBe(0);
  });
});
