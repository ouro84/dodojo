import { describe, expect, test, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FakeSupabaseClient } from "./fake-supabase";
import { addSubtaskForUser, addTaskForUser, completeTaskForUser } from "./tasks";

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

describe("addTaskForUser", () => {
  test("refuse un titre vide", async () => {
    const c = client([]);
    const res = await addTaskForUser(c as unknown as SupabaseClient, "u1", "   ");
    expect(res.error).toBe("invalid_title");
    expect(c.calls).toBe(0);
  });

  test("cree la tache et renvoie son id", async () => {
    const c = client([]);
    const res = await addTaskForUser(c as unknown as SupabaseClient, "u1", "Ranger le bureau");
    expect(res.error).toBeNull();
    expect(res.id).toBeTruthy();
  });
});

describe("addSubtaskForUser", () => {
  test("refuse un parent qui est deja une sous-tache (RG-01, deux niveaux max)", async () => {
    const c = client([
      { id: "22222222-2222-2222-2222-222222222222", parent_id: "11111111-1111-1111-1111-111111111111", is_abandoned: false, day_date: "2026-09-05" },
    ]);
    const res = await addSubtaskForUser(
      c as unknown as SupabaseClient,
      "u1",
      "22222222-2222-2222-2222-222222222222",
      "Sous-sous-tache",
    );
    expect(res.error).toBe("depth_limit");
  });

  test("refuse un parent abandonne", async () => {
    const c = client([
      { id: "33333333-3333-3333-3333-333333333333", parent_id: null, is_abandoned: true, day_date: "2026-09-05" },
    ]);
    const res = await addSubtaskForUser(
      c as unknown as SupabaseClient,
      "u1",
      "33333333-3333-3333-3333-333333333333",
      "Sous-tache",
    );
    expect(res.error).toBe("task_abandoned");
  });
});
