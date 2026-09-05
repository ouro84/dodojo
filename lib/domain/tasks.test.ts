import { describe, expect, test, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FakeSupabaseClient } from "./fake-supabase";
import { completeTaskForUser } from "./tasks";

vi.mock("@/lib/inngest/deadline-reminder", () => ({
  cancelDeadlineReminder: async () => {},
  scheduleDeadlineReminder: async () => {},
}));

function client(tasks: Record<string, unknown>[]): FakeSupabaseClient {
  return new FakeSupabaseClient({
    profiles: [{ id: "u1", level: 1, xp: 0, timezone: "UTC", combo_count: 0, last_combo_completed_at: null }],
    tasks,
    unlocked_achievements: [],
  });
}

describe("completeTaskForUser", () => {
  test("refuse un id non-UUID sans emettre la moindre requete", async () => {
    const c = client([]);
    const res = await completeTaskForUser(c as unknown as SupabaseClient, "u1", "optimistic-1", true);
    expect(res.error).toBe("invalid_task_id");
    expect(c.calls).toBe(0);
  });

  test("accorde de l'XP a la premiere completion", async () => {
    const c = client([
      { id: "11111111-1111-1111-1111-111111111111", is_completed: false, is_abandoned: false, xp_awarded: null, deadline_at: null, deferred_at: null },
    ]);
    const res = await completeTaskForUser(
      c as unknown as SupabaseClient,
      "u1",
      "11111111-1111-1111-1111-111111111111",
      true,
    );
    expect(res.error).toBeNull();
    expect(res.xp).toBeGreaterThan(0);
  });

  test("ne renvoie jamais un message francais, seulement un code", async () => {
    const c = client([]);
    const res = await completeTaskForUser(c as unknown as SupabaseClient, "u1", "optimistic-1", true);
    expect(res.error).not.toMatch(/[éèêàùç]/);
  });
});
