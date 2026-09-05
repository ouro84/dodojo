import { describe, expect, test, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FakeSupabaseClient } from "./fake-supabase";
import { addSubtaskForUser, addTaskForUser, completeTaskForUser, deferOverdueTaskForUser, setTaskDeadlineForUser, userToday } from "./tasks";

const cancelCalls: string[] = [];
const scheduleCalls: Array<{ taskId: string; offsetMinutes: number }> = [];

vi.mock("@/lib/inngest/deadline-reminder", () => ({
  cancelDeadlineReminder: async (taskId: string) => {
    cancelCalls.push(taskId);
  },
  scheduleDeadlineReminder: async (p: { taskId: string; offsetMinutes: number }) => {
    scheduleCalls.push(p);
  },
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

describe("setTaskDeadlineForUser", () => {
  test("effacer la deadline annule le rappel sans en reprogrammer", async () => {
    cancelCalls.length = 0;
    scheduleCalls.length = 0;
    const c = client([
      { id: "44444444-4444-4444-4444-444444444444", reminder_enabled: true, reminder_offset_minutes: null },
    ]);
    const res = await setTaskDeadlineForUser(
      c as unknown as SupabaseClient,
      "u1",
      "44444444-4444-4444-4444-444444444444",
      null,
    );
    expect(res.error).toBeNull();
    expect(cancelCalls).toContain("44444444-4444-4444-4444-444444444444");
    expect(scheduleCalls).toHaveLength(0);
  });

  test("refuse un id non-UUID sans emettre de requete", async () => {
    const c = client([]);
    const res = await setTaskDeadlineForUser(
      c as unknown as SupabaseClient,
      "u1",
      "optimistic-3",
      "2026-09-06T12:00:00.000Z",
    );
    expect(res.error).toBe("invalid_task_id");
    expect(c.calls).toBe(0);
  });
});

describe("userToday", () => {
  test("derive le jour local depuis le fuseau du profil", async () => {
    const c = new FakeSupabaseClient({ profiles: [{ id: "u1", timezone: "Europe/Paris" }] });
    const day = await userToday(c as unknown as SupabaseClient, "u1");
    expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("retombe sur UTC quand le profil n'a pas de fuseau", async () => {
    const c = new FakeSupabaseClient({ profiles: [{ id: "u1", timezone: null }] });
    const day = await userToday(c as unknown as SupabaseClient, "u1");
    expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("deferOverdueTaskForUser", () => {
  test("efface deadline_at en meme temps qu'il reporte", async () => {
    const c = client([
      { id: "55555555-5555-5555-5555-555555555555", is_completed: false, is_abandoned: false, deadline_at: "2026-09-04T10:00:00.000Z", deferred_at: null, day_date: "2026-09-04" },
    ]);
    const res = await deferOverdueTaskForUser(
      c as unknown as SupabaseClient,
      "u1",
      "55555555-5555-5555-5555-555555555555",
    );
    expect(res.error).toBeNull();
    expect(res.deferredTasks?.[0]?.deadline_at).toBeNull();
  });
});
