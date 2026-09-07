import { describe, expect, test } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FakeSupabaseClient } from "./fake-supabase";
import { readDailyBoss, readBossStatus } from "./boss";

describe("readDailyBoss", () => {
  test("renvoie null quand le boss du jour n'a pas encore ete tire", async () => {
    const c = new FakeSupabaseClient({ daily_boss: [] });
    const res = await readDailyBoss(c as unknown as SupabaseClient, "u1", "2026-09-05");
    expect(res).toBeNull();
  });

  test("n'ecrit JAMAIS dans daily_boss, meme quand la ligne est absente", async () => {
    const rows: Record<string, unknown>[] = [];
    const c = new FakeSupabaseClient({ daily_boss: rows });
    await readDailyBoss(c as unknown as SupabaseClient, "u1", "2026-09-05");
    expect(rows).toHaveLength(0);
  });

  test("renvoie le boss et le decor persistes", async () => {
    const c = new FakeSupabaseClient({
      daily_boss: [{ user_id: "u1", day_date: "2026-09-05", boss_id: "minotaur", background_id: "forest-1" }],
    });
    const res = await readDailyBoss(c as unknown as SupabaseClient, "u1", "2026-09-05");
    expect(res).toEqual({ bossId: "minotaur", backgroundId: "forest-1" });
  });
});

describe("readBossStatus", () => {
  test("renvoie null quand le boss du jour n'a pas ete tire", async () => {
    const c = new FakeSupabaseClient({ daily_boss: [], tasks: [] });
    const res = await readBossStatus(c as unknown as SupabaseClient, "u1", "2026-09-06");
    expect(res).toBeNull();
  });

  test("n'ecrit JAMAIS dans daily_boss", async () => {
    const rows: Record<string, unknown>[] = [];
    const c = new FakeSupabaseClient({ daily_boss: rows, tasks: [] });
    await readBossStatus(c as unknown as SupabaseClient, "u1", "2026-09-06");
    expect(rows).toHaveLength(0);
  });

  test("calcule les HP depuis les taches du jour", async () => {
    const c = new FakeSupabaseClient({
      daily_boss: [{ user_id: "u1", day_date: "2026-09-06", boss_id: "minotaur", background_id: "forest-1" }],
      tasks: [
        { id: "a", user_id: "u1", day_date: "2026-09-06", parent_id: null, is_completed: true, is_abandoned: false },
        { id: "b", user_id: "u1", day_date: "2026-09-06", parent_id: null, is_completed: false, is_abandoned: false },
      ],
    });
    const res = await readBossStatus(c as unknown as SupabaseClient, "u1", "2026-09-06");
    expect(res?.maxHp).toBe(40);
    expect(res?.currentHp).toBe(20);
    expect(res?.tasksRemaining).toBe(1);
    expect(res?.name).toBeTruthy();
  });
});
