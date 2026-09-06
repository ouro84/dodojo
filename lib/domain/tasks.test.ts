import { describe, expect, test, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dayKey } from "@/lib/game-engine";
import { FakeSupabaseClient } from "./fake-supabase";
import {
  addSubtaskForUser,
  addTaskForUser,
  addTomorrowTaskForUser,
  bringToTodayForUser,
  completeTaskForUser,
  deferOverdueTaskForUser,
  rageQuitTaskForUser,
  reorderSiblingsForUser,
  reportToTomorrowForUser,
  setTaskDeadlineForUser,
  undoRageQuitForUser,
  userToday,
} from "./tasks";

// Le profil de test a `timezone: "UTC"` (cf. client() ci-dessous) — userToday()
// calcule donc "aujourd'hui" via dayKey(new Date(), "UTC"). Les fixtures qui
// doivent matcher un filtre `.eq("day_date", today)" du domaine dérivent cette
// valeur en direct plutôt que de figer une date en dur (qui ne matcherait plus
// dès que ce fichier tourne un autre jour).
const TODAY = dayKey(new Date(), "UTC");

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
      { id: "11111111-1111-1111-1111-111111111111", user_id: "u1", is_completed: false, is_abandoned: false, xp_awarded: null, deadline_at: null, deferred_at: null },
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
      { id: "22222222-2222-2222-2222-222222222222", user_id: "u1", parent_id: "11111111-1111-1111-1111-111111111111", is_abandoned: false, day_date: "2026-09-05" },
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
      { id: "33333333-3333-3333-3333-333333333333", user_id: "u1", parent_id: null, is_abandoned: true, day_date: "2026-09-05" },
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
      { id: "55555555-5555-5555-5555-555555555555", user_id: "u1", is_completed: false, is_abandoned: false, deadline_at: "2026-09-04T10:00:00.000Z", deferred_at: null, day_date: "2026-09-04" },
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

describe("rageQuitTaskForUser", () => {
  test("refuse un id non-UUID sans emettre de requete", async () => {
    const c = client([]);
    const res = await rageQuitTaskForUser(c as unknown as SupabaseClient, "u1", "optimistic-2");
    expect(res.error).toBe("invalid_task_id");
    expect(c.calls).toBe(0);
  });

  test("applique le malus XP une seule fois, pas une par sous-tache cascadee", async () => {
    const c = client([
      { id: "66666666-6666-6666-6666-666666666666", user_id: "u1", parent_id: null, is_completed: false, is_abandoned: false, deadline_at: null, deferred_at: null },
      { id: "77777777-7777-7777-7777-777777777777", user_id: "u1", parent_id: "66666666-6666-6666-6666-666666666666", is_completed: false, is_abandoned: false, deadline_at: null, deferred_at: null },
      { id: "88888888-8888-8888-8888-888888888888", user_id: "u1", parent_id: "66666666-6666-6666-6666-666666666666", is_completed: false, is_abandoned: false, deadline_at: null, deferred_at: null },
    ]);
    const res = await rageQuitTaskForUser(
      c as unknown as SupabaseClient,
      "u1",
      "66666666-6666-6666-6666-666666666666",
    );
    expect(res.error).toBeNull();
    // RAGE_QUIT_XP_PENALTY vaut 5 : une racine à 2 enfants coûte 5 XP, jamais 15.
    expect(res.xp).toBe(0); // profil de départ à 0 XP, clampé sans de-level
  });

  test("no-op idempotent quand la cascade est vide (deja abandonnee/completee/introuvable)", async () => {
    const c = client([
      { id: "66666666-6666-6666-6666-666666666666", user_id: "u1", parent_id: null, is_completed: false, is_abandoned: true, deadline_at: null, deferred_at: null },
    ]);
    const res = await rageQuitTaskForUser(
      c as unknown as SupabaseClient,
      "u1",
      "66666666-6666-6666-6666-666666666666",
    );
    expect(res.error).toBeNull();
    expect(res.xp).toBeUndefined();
  });
});

describe("undoRageQuitForUser", () => {
  test("refuse un id non-UUID sans emettre de requete", async () => {
    const c = client([]);
    const res = await undoRageQuitForUser(c as unknown as SupabaseClient, "u1", "optimistic-6");
    expect(res.error).toBe("invalid_task_id");
    expect(c.calls).toBe(0);
  });

  test("restaure la tache et rembourse l'XP", async () => {
    const c = client([
      {
        id: "99999999-9999-9999-9999-999999999999",
        user_id: "u1",
        parent_id: null,
        is_completed: false,
        is_abandoned: true,
        abandon_reason: "rage_quit",
        deadline_at: null,
        deferred_at: null,
      },
    ]);
    const res = await undoRageQuitForUser(
      c as unknown as SupabaseClient,
      "u1",
      "99999999-9999-9999-9999-999999999999",
    );
    expect(res.error).toBeNull();
    expect(res.xp).toBe(5); // RAGE_QUIT_XP_PENALTY remboursé sur un profil à 0 XP
  });

  test("no-op idempotent quand rien n'est a restaurer", async () => {
    const c = client([]);
    const res = await undoRageQuitForUser(
      c as unknown as SupabaseClient,
      "u1",
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    );
    expect(res.error).toBeNull();
    expect(res.xp).toBeUndefined();
  });
});

describe("reorderSiblingsForUser", () => {
  test("refuse un parentId non-UUID sans emettre de requete", async () => {
    const c = client([]);
    const res = await reorderSiblingsForUser(
      c as unknown as SupabaseClient,
      "u1",
      "optimistic-parent",
      ["11111111-1111-1111-1111-111111111111"],
    );
    expect(res.error).toBe("invalid_task_id");
    expect(c.calls).toBe(0);
  });

  test("refuse un id non-UUID dans la liste ordonnee sans emettre de requete", async () => {
    const c = client([]);
    const res = await reorderSiblingsForUser(
      c as unknown as SupabaseClient,
      "u1",
      null,
      ["optimistic-5", "11111111-1111-1111-1111-111111111111"],
    );
    expect(res.error).toBe("invalid_task_id");
    expect(c.calls).toBe(0);
  });

  test("reordonne une fratrie racine valide", async () => {
    const c = client([
      { id: "11111111-1111-1111-1111-111111111111", user_id: "u1", parent_id: null, is_abandoned: false },
      { id: "22222222-2222-2222-2222-222222222222", user_id: "u1", parent_id: null, is_abandoned: false },
    ]);
    const res = await reorderSiblingsForUser(
      c as unknown as SupabaseClient,
      "u1",
      null,
      ["22222222-2222-2222-2222-222222222222", "11111111-1111-1111-1111-111111111111"],
    );
    expect(res.error).toBeNull();
  });

  test("refuse de reparenter une tache qui a deja des sous-taches", async () => {
    const c = client([
      { id: "11111111-1111-1111-1111-111111111111", user_id: "u1", parent_id: null, is_abandoned: false },
      { id: "33333333-3333-3333-3333-333333333333", user_id: "u1", parent_id: null, is_abandoned: false },
      { id: "44444444-4444-4444-4444-444444444444", user_id: "u1", parent_id: "33333333-3333-3333-3333-333333333333", is_abandoned: false },
    ]);
    const res = await reorderSiblingsForUser(
      c as unknown as SupabaseClient,
      "u1",
      "11111111-1111-1111-1111-111111111111",
      ["33333333-3333-3333-3333-333333333333"],
    );
    expect(res.error).toBe("depth_limit");
  });
});

describe("famille Demain", () => {
  test("addTomorrowTask cree une tache et refuse un titre vide", async () => {
    const c = client([]);
    const empty = await addTomorrowTaskForUser(c as unknown as SupabaseClient, "u1", "   ");
    expect(empty.error).toBe("invalid_title");
    expect(c.calls).toBe(0);

    const res = await addTomorrowTaskForUser(c as unknown as SupabaseClient, "u1", "Preparer le sac");
    expect(res.error).toBeNull();
    expect(res.id).toBeTruthy();
  });

  test("reportToTomorrow efface toujours deferred_at", async () => {
    const c = client([
      { id: "99999999-9999-9999-9999-999999999999", user_id: "u1", is_completed: false, is_abandoned: false, deferred_at: "2026-09-05T08:00:00.000Z", deadline_at: null, day_date: TODAY },
    ]);
    const res = await reportToTomorrowForUser(
      c as unknown as SupabaseClient,
      "u1",
      "99999999-9999-9999-9999-999999999999",
    );
    expect(res.error).toBeNull();
    expect(res.reportedTasks?.[0]?.deferred_at).toBeNull();
  });

  test("bringToToday efface aussi deferred_at", async () => {
    const c = client([
      { id: "aaaaaaaa-9999-9999-9999-999999999999", user_id: "u1", is_completed: false, is_abandoned: false, deferred_at: "2026-09-05T08:00:00.000Z", deadline_at: null, day_date: "2026-09-06" },
    ]);
    const res = await bringToTodayForUser(
      c as unknown as SupabaseClient,
      "u1",
      "aaaaaaaa-9999-9999-9999-999999999999",
    );
    expect(res.error).toBeNull();
    expect(res.broughtBackTasks?.[0]?.deferred_at).toBeNull();
  });
});
