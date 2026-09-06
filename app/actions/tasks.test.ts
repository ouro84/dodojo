import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { FakeSupabaseClient } from "@/lib/domain/fake-supabase";

type Row = Record<string, unknown>;

let fakeClient: FakeSupabaseClient;
let revalidateCalls = 0;
let cancelCalls: string[] = [];
let scheduleCalls: Array<{ taskId: string; userId: string; deadlineAt: string; offsetMinutes: number }> = [];

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => fakeClient,
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => {
    revalidateCalls += 1;
  },
}));

vi.mock("@/lib/inngest/deadline-reminder", () => ({
  cancelDeadlineReminder: async (taskId: string) => {
    cancelCalls.push(taskId);
  },
  scheduleDeadlineReminder: async (params: {
    taskId: string;
    userId: string;
    deadlineAt: string;
    offsetMinutes: number;
  }) => {
    scheduleCalls.push(params);
  },
}));

beforeEach(() => {
  fakeClient = new FakeSupabaseClient({
    profiles: [{ id: "u1", level: 1, xp: 0, timezone: "UTC" }],
    tasks: [],
  });
  revalidateCalls = 0;
  cancelCalls = [];
  scheduleCalls = [];
});

afterEach(() => {
  vi.clearAllMocks();
});

// Fix #95/#96 (issues GitHub) : un id client `optimistic-N` ne doit JAMAIS
// atteindre Supabase — les handlers UI sont censés le filtrer/désactiver,
// mais les server actions doivent aussi se défendre en profondeur (un appel
// direct, un bug UI non détecté, une future action Rust…). Chaque action
// rejette tôt avec un message métier, SANS appeler Supabase.
describe("Server actions — guards UUID (issues #95/#96)", () => {
  test("setTaskCompleted rejette un id optimistic sans appeler Supabase", async () => {
    const { setTaskCompleted } = await import("./tasks");
    const result = await setTaskCompleted("optimistic-1", true);
    expect(result.error).toMatch(/pas encore prête/);
    expect(fakeClient.calls).toBe(0);
    expect(revalidateCalls).toBe(0);
  });

  test("setTaskCompleted n'inflige pas de toast 'Le coup n'est pas passé' sur un id optimistic", async () => {
    const { setTaskCompleted } = await import("./tasks");
    const complete = await setTaskCompleted("optimistic-1", true);
    const uncomplete = await setTaskCompleted("optimistic-1", false);
    // Messages distincts pour ne pas afficher "Le coup n'est pas passé" à
    // l'utilisateur alors que la vraie cause est un tap trop rapide.
    expect(complete.error).toMatch(/pas encore prête/);
    expect(uncomplete.error).toMatch(/pas encore prête|annuler pour l'instant/);
  });

  test("rageQuitTask rejette un id optimistic sans appeler Supabase", async () => {
    const { rageQuitTask } = await import("./tasks");
    const result = await rageQuitTask("optimistic-2");
    expect(result.error).toMatch(/pas encore prête/);
    expect(fakeClient.calls).toBe(0);
    expect(revalidateCalls).toBe(0);
  });

  test("setTaskDeadline rejette un id optimistic sans appeler Supabase", async () => {
    const { setTaskDeadline } = await import("./tasks");
    const result = await setTaskDeadline("optimistic-3", "2026-07-26T12:00:00.000Z");
    expect(result.error).toMatch(/pas encore prête/);
    expect(fakeClient.calls).toBe(0);
    expect(revalidateCalls).toBe(0);
  });

  test("setTaskDeadline rejette un id optimistic même pour effacer (deadlineAt=null)", async () => {
    const { setTaskDeadline } = await import("./tasks");
    const result = await setTaskDeadline("optimistic-4", null);
    expect(result.error).toMatch(/pas encore prête/);
    expect(fakeClient.calls).toBe(0);
  });

  test("reorderSiblings rejette parentId optimistic (subtask placée sous racine optimistic)", async () => {
    const { reorderSiblings } = await import("./tasks");
    const result = await reorderSiblings("optimistic-parent", ["a".repeat(8)]);
    expect(result.error).toMatch(/pas encore prête/);
    expect(fakeClient.calls).toBe(0);
    expect(revalidateCalls).toBe(0);
  });

  test("reorderSiblings rejette tout id optimistic dans la liste ordonnée", async () => {
    const { reorderSiblings } = await import("./tasks");
    const realId = "9f6d9ad2-28a2-4e94-aa58-b73ca74641b5";
    const result = await reorderSiblings(null, ["optimistic-5", realId]);
    expect(result.error).toMatch(/pas encore prête/);
    expect(fakeClient.calls).toBe(0);
    expect(revalidateCalls).toBe(0);
  });

  test("reorderSiblings accepte parentId null avec une liste d'UUID valides (ne rejette pas)", async () => {
    const { reorderSiblings } = await import("./tasks");
    const realId = "9f6d9ad2-28a2-4e94-aa58-b73ca74641b5";
    // Ici le guard passe — on appelle Supabase (fetch initial). On ne valide
    // pas la suite (le fake renvoie des listes vides), juste que le guard UUID
    // ne bloque pas à tort des ids normaux.
    await reorderSiblings(null, [realId]);
    expect(fakeClient.calls).toBeGreaterThan(0);
  });

  test("reportToTomorrow rejette un id optimistic sans appeler Supabase", async () => {
    const { reportToTomorrow } = await import("./tasks");
    const result = await reportToTomorrow("optimistic-6");
    expect(result.error).toMatch(/pas encore prête/);
    expect(fakeClient.calls).toBe(0);
    expect(revalidateCalls).toBe(0);
  });

  test("bringToToday rejette un id optimistic sans appeler Supabase", async () => {
    const { bringToToday } = await import("./tasks");
    const result = await bringToToday("optimistic-7");
    expect(result.error).toMatch(/pas encore prête/);
    expect(fakeClient.calls).toBe(0);
    expect(revalidateCalls).toBe(0);
  });
});

describe("Annulation du rappel deadline sur transition (#114)", () => {
  test("setTaskCompleted(true) annule le rappel de la tâche", async () => {
    fakeClient = new FakeSupabaseClient({
      profiles: [{ id: "u1", level: 1, xp: 0, timezone: "UTC" }],
      tasks: [
        {
          id: "55555555-5555-5555-5555-555555555555",
          user_id: "u1",
          is_completed: false,
          is_abandoned: false,
          xp_awarded: null,
        },
      ],
    });
    const { setTaskCompleted } = await import("./tasks");
    await setTaskCompleted("55555555-5555-5555-5555-555555555555", true);
    expect(cancelCalls).toContain("55555555-5555-5555-5555-555555555555");
  });

  test("setTaskCompleted(false) n'annule rien (décochage, pas de reschedule)", async () => {
    fakeClient = new FakeSupabaseClient({
      profiles: [{ id: "u1", level: 1, xp: 0, timezone: "UTC" }],
      tasks: [
        {
          id: "66666666-6666-6666-6666-666666666666",
          user_id: "u1",
          is_completed: true,
          is_abandoned: false,
          xp_awarded: 10,
        },
      ],
    });
    const { setTaskCompleted } = await import("./tasks");
    await setTaskCompleted("66666666-6666-6666-6666-666666666666", false);
    expect(cancelCalls).toEqual([]);
  });

  test("rageQuitTask annule le rappel de toutes les tâches de la cascade", async () => {
    fakeClient = new FakeSupabaseClient({
      profiles: [{ id: "u1", level: 1, xp: 0 }],
      tasks: [
        {
          id: "77777777-7777-7777-7777-777777777777",
          user_id: "u1",
          parent_id: null,
          is_completed: false,
          is_abandoned: false,
        },
        {
          id: "88888888-8888-8888-8888-888888888888",
          user_id: "u1",
          parent_id: "77777777-7777-7777-7777-777777777777",
          is_completed: false,
          is_abandoned: false,
        },
      ],
    });
    const { rageQuitTask } = await import("./tasks");
    await rageQuitTask("77777777-7777-7777-7777-777777777777");
    expect(cancelCalls).toEqual(
      expect.arrayContaining([
        "77777777-7777-7777-7777-777777777777",
        "88888888-8888-8888-8888-888888888888",
      ]),
    );
  });
});

describe("Annulation du rappel deadline — actions du Réveil (#114)", () => {
  test("completeOverdueTask annule le rappel de la tâche et de sa cascade", async () => {
    fakeClient = new FakeSupabaseClient({
      profiles: [{ id: "u1", level: 1, xp: 0 }],
      tasks: [
        { id: "aaaaaaaa-0000-0000-0000-000000000001", user_id: "u1", is_abandoned: false },
      ],
    });
    const { completeOverdueTask } = await import("./tasks");
    await completeOverdueTask("aaaaaaaa-0000-0000-0000-000000000001");
    expect(cancelCalls).toContain("aaaaaaaa-0000-0000-0000-000000000001");
  });

  test("annihilateOverdueTask annule le rappel de la tâche", async () => {
    fakeClient = new FakeSupabaseClient({
      profiles: [{ id: "u1", level: 1, xp: 0 }],
      tasks: [{ id: "aaaaaaaa-0000-0000-0000-000000000002", user_id: "u1", is_abandoned: false }],
    });
    const { annihilateOverdueTask } = await import("./tasks");
    await annihilateOverdueTask("aaaaaaaa-0000-0000-0000-000000000002");
    expect(cancelCalls).toContain("aaaaaaaa-0000-0000-0000-000000000002");
  });

  test("annihilateOverdueOlderThan annule le rappel de toutes les tâches affectées", async () => {
    fakeClient = new FakeSupabaseClient({
      profiles: [{ id: "u1", level: 1, xp: 0 }],
      tasks: [
        {
          id: "aaaaaaaa-0000-0000-0000-000000000003",
          user_id: "u1",
          day_date: "2026-01-01",
          is_completed: false,
          is_abandoned: false,
        },
      ],
    });
    const { annihilateOverdueOlderThan } = await import("./tasks");
    await annihilateOverdueOlderThan(3);
    expect(cancelCalls).toContain("aaaaaaaa-0000-0000-0000-000000000003");
  });
});

describe("Annulation du rappel deadline — report/retour (#114)", () => {
  test("deferOverdueTask annule le rappel des lignes reportées", async () => {
    fakeClient = new FakeSupabaseClient({
      profiles: [{ id: "u1", level: 1, xp: 0, timezone: "UTC" }],
      tasks: [{ id: "bbbbbbbb-0000-0000-0000-000000000001", user_id: "u1", is_abandoned: false }],
    });
    const { deferOverdueTask } = await import("./tasks");
    await deferOverdueTask("bbbbbbbb-0000-0000-0000-000000000001");
    expect(cancelCalls).toContain("bbbbbbbb-0000-0000-0000-000000000001");
  });

  test("deferAllOverdue annule le rappel de toutes les lignes reportées", async () => {
    fakeClient = new FakeSupabaseClient({
      profiles: [{ id: "u1", level: 1, xp: 0, timezone: "UTC" }],
      tasks: [
        {
          id: "bbbbbbbb-0000-0000-0000-000000000002",
          user_id: "u1",
          day_date: "2026-01-01",
          is_completed: false,
          is_abandoned: false,
        },
      ],
    });
    const { deferAllOverdue } = await import("./tasks");
    await deferAllOverdue();
    expect(cancelCalls).toContain("bbbbbbbb-0000-0000-0000-000000000002");
  });

  test("reportToTomorrow annule le rappel des lignes reportées", async () => {
    fakeClient = new FakeSupabaseClient({
      profiles: [{ id: "u1", level: 1, xp: 0, timezone: "UTC" }],
      tasks: [
        {
          id: "bbbbbbbb-0000-0000-0000-000000000003",
          user_id: "u1",
          day_date: dayKeyToday(),
          is_completed: false,
          is_abandoned: false,
        },
      ],
    });
    const { reportToTomorrow } = await import("./tasks");
    await reportToTomorrow("bbbbbbbb-0000-0000-0000-000000000003");
    expect(cancelCalls).toContain("bbbbbbbb-0000-0000-0000-000000000003");
  });

  test("bringToToday annule le rappel des lignes ramenées", async () => {
    fakeClient = new FakeSupabaseClient({
      profiles: [{ id: "u1", level: 1, xp: 0, timezone: "UTC" }],
      tasks: [
        { id: "bbbbbbbb-0000-0000-0000-000000000004", user_id: "u1", is_abandoned: false },
      ],
    });
    const { bringToToday } = await import("./tasks");
    await bringToToday("bbbbbbbb-0000-0000-0000-000000000004");
    expect(cancelCalls).toContain("bbbbbbbb-0000-0000-0000-000000000004");
  });
});

describe("setTaskDeadline — moteur de rappel (#114)", () => {
  test("émet un cancel puis un schedule quand une deadline non nulle est posée", async () => {
    fakeClient = new FakeSupabaseClient({
      profiles: [{ id: "u1", level: 1, xp: 0, timezone: "UTC", reminder_offset_minutes: 30 }],
      tasks: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          user_id: "u1",
          reminder_enabled: true,
          reminder_offset_minutes: null,
        },
      ],
    });
    const { setTaskDeadline } = await import("./tasks");
    const result = await setTaskDeadline(
      "11111111-1111-1111-1111-111111111111",
      "2026-08-01T16:00:00.000Z",
    );
    expect(result.error).toBeNull();
    expect(cancelCalls).toEqual(["11111111-1111-1111-1111-111111111111"]);
    expect(scheduleCalls).toEqual([
      {
        taskId: "11111111-1111-1111-1111-111111111111",
        userId: "u1",
        deadlineAt: "2026-08-01T16:00:00.000Z",
        offsetMinutes: 30,
      },
    ]);
  });

  test("utilise l'override par tâche plutôt que le défaut du profil", async () => {
    fakeClient = new FakeSupabaseClient({
      profiles: [{ id: "u1", level: 1, xp: 0, timezone: "UTC", reminder_offset_minutes: 30 }],
      tasks: [
        {
          id: "22222222-2222-2222-2222-222222222222",
          user_id: "u1",
          reminder_enabled: true,
          reminder_offset_minutes: 5,
        },
      ],
    });
    const { setTaskDeadline } = await import("./tasks");
    await setTaskDeadline("22222222-2222-2222-2222-222222222222", "2026-08-01T16:00:00.000Z");
    expect(scheduleCalls[0].offsetMinutes).toBe(5);
  });

  test("n'émet qu'un cancel quand reminder_enabled est false", async () => {
    fakeClient = new FakeSupabaseClient({
      profiles: [{ id: "u1", level: 1, xp: 0, timezone: "UTC", reminder_offset_minutes: 30 }],
      tasks: [
        {
          id: "33333333-3333-3333-3333-333333333333",
          user_id: "u1",
          reminder_enabled: false,
          reminder_offset_minutes: null,
        },
      ],
    });
    const { setTaskDeadline } = await import("./tasks");
    await setTaskDeadline("33333333-3333-3333-3333-333333333333", "2026-08-01T16:00:00.000Z");
    expect(cancelCalls).toEqual(["33333333-3333-3333-3333-333333333333"]);
    expect(scheduleCalls).toEqual([]);
  });

  test("n'émet qu'un cancel quand deadlineAt est null (effacement)", async () => {
    fakeClient = new FakeSupabaseClient({
      profiles: [{ id: "u1", level: 1, xp: 0, timezone: "UTC", reminder_offset_minutes: 30 }],
      tasks: [
        {
          id: "44444444-4444-4444-4444-444444444444",
          user_id: "u1",
          reminder_enabled: true,
          reminder_offset_minutes: null,
        },
      ],
    });
    const { setTaskDeadline } = await import("./tasks");
    await setTaskDeadline("44444444-4444-4444-4444-444444444444", null);
    expect(cancelCalls).toEqual(["44444444-4444-4444-4444-444444444444"]);
    expect(scheduleCalls).toEqual([]);
  });
});

describe("Suppression du heal Héros — verrouillage à la résolution", () => {
  test("setTaskCompleted verrouille hp_penalty=10 quand la deadline était déjà dépassée", async () => {
    const id = "99999999-0000-0000-0000-000000000001";
    const task: Row = {
      id,
      user_id: "u1",
      is_completed: false,
      is_abandoned: false,
      xp_awarded: null,
      deadline_at: "2020-01-01T00:00:00.000Z",
      deferred_at: null,
    };
    fakeClient = new FakeSupabaseClient({
      profiles: [{ id: "u1", level: 1, xp: 0, timezone: "UTC" }],
      tasks: [task],
    });
    const { setTaskCompleted } = await import("./tasks");
    await setTaskCompleted(id, true);
    expect(task.hp_penalty).toBe(10);
  });

  test("setTaskCompleted ne verrouille rien quand la deadline n'est pas dépassée", async () => {
    const id = "99999999-0000-0000-0000-000000000002";
    const task: Row = {
      id,
      user_id: "u1",
      is_completed: false,
      is_abandoned: false,
      xp_awarded: null,
      deadline_at: "2999-01-01T00:00:00.000Z",
      deferred_at: null,
    };
    fakeClient = new FakeSupabaseClient({
      profiles: [{ id: "u1", level: 1, xp: 0, timezone: "UTC" }],
      tasks: [task],
    });
    const { setTaskCompleted } = await import("./tasks");
    await setTaskCompleted(id, true);
    expect(task.hp_penalty).toBeUndefined();
  });

  test("setTaskCompleted verrouille hp_penalty=20 sur un reste reporté (deferred_at posé)", async () => {
    const id = "99999999-0000-0000-0000-000000000003";
    const task: Row = {
      id,
      user_id: "u1",
      is_completed: false,
      is_abandoned: false,
      xp_awarded: null,
      deadline_at: null,
      deferred_at: "2026-08-10T08:00:00.000Z",
    };
    fakeClient = new FakeSupabaseClient({
      profiles: [{ id: "u1", level: 1, xp: 0, timezone: "UTC" }],
      tasks: [task],
    });
    const { setTaskCompleted } = await import("./tasks");
    await setTaskCompleted(id, true);
    expect(task.hp_penalty).toBe(20);
  });

  test("setTaskCompleted ne verrouille rien au décochage (isCompleted=false)", async () => {
    const id = "99999999-0000-0000-0000-000000000004";
    const task: Row = {
      id,
      user_id: "u1",
      is_completed: true,
      is_abandoned: false,
      xp_awarded: 10,
      deadline_at: "2020-01-01T00:00:00.000Z",
      deferred_at: null,
    };
    fakeClient = new FakeSupabaseClient({
      profiles: [{ id: "u1", level: 1, xp: 0, timezone: "UTC" }],
      tasks: [task],
    });
    const { setTaskCompleted } = await import("./tasks");
    await setTaskCompleted(id, false);
    expect(task.hp_penalty).toBeUndefined();
  });

  test("rageQuitTask verrouille hp_penalty=20 sur la racine et sa sous-tâche, toutes deux déférées", async () => {
    const rootId = "99999999-0000-0000-0000-000000000005";
    const childId = "99999999-0000-0000-0000-000000000006";
    const root: Row = {
      id: rootId,
      user_id: "u1",
      parent_id: null,
      is_completed: false,
      is_abandoned: false,
      deadline_at: null,
      deferred_at: "2026-08-10T08:00:00.000Z",
    };
    const child: Row = {
      id: childId,
      user_id: "u1",
      parent_id: rootId,
      is_completed: false,
      is_abandoned: false,
      deadline_at: null,
      deferred_at: "2026-08-10T08:00:00.000Z",
    };
    fakeClient = new FakeSupabaseClient({
      profiles: [{ id: "u1", level: 1, xp: 0 }],
      tasks: [root, child],
    });
    const { rageQuitTask } = await import("./tasks");
    await rageQuitTask(rootId);
    expect(root.hp_penalty).toBe(20);
    expect(child.hp_penalty).toBe(20);
  });

  test("rageQuitTask ne verrouille rien sur une tâche sans pénalité active", async () => {
    const id = "99999999-0000-0000-0000-000000000007";
    const task: Row = {
      id,
      user_id: "u1",
      parent_id: null,
      is_completed: false,
      is_abandoned: false,
      deadline_at: null,
      deferred_at: null,
    };
    fakeClient = new FakeSupabaseClient({
      profiles: [{ id: "u1", level: 1, xp: 0 }],
      tasks: [task],
    });
    const { rageQuitTask } = await import("./tasks");
    await rageQuitTask(id);
    expect(task.hp_penalty).toBeUndefined();
  });

  test("completeOverdueTask renvoie le dégât verrouillé cumulé (racine + sous-tâche = 2 × -20)", async () => {
    fakeClient = new FakeSupabaseClient({
      profiles: [{ id: "u1", level: 1, xp: 0, timezone: "UTC", hp_damage_locked: 0, hp_damage_locked_day: null }],
      tasks: [
        { id: "99999999-0000-0000-0000-000000000008", user_id: "u1", is_abandoned: false },
        {
          id: "99999999-0000-0000-0000-000000000009",
          user_id: "u1",
          parent_id: "99999999-0000-0000-0000-000000000008",
          is_abandoned: false,
        },
      ],
    });
    const { completeOverdueTask } = await import("./tasks");
    const result = await completeOverdueTask("99999999-0000-0000-0000-000000000008");
    expect(result.hpDamageLocked?.hp_damage_locked).toBe(40);
  });

  test("annihilateOverdueTask renvoie le dégât verrouillé, cumulé avec un lock déjà posé le même jour", async () => {
    fakeClient = new FakeSupabaseClient({
      profiles: [
        { id: "u1", level: 1, xp: 0, timezone: "UTC", hp_damage_locked: 20, hp_damage_locked_day: dayKeyToday() },
      ],
      tasks: [{ id: "99999999-0000-0000-0000-00000000000a", user_id: "u1", is_abandoned: false }],
    });
    const { annihilateOverdueTask } = await import("./tasks");
    const result = await annihilateOverdueTask("99999999-0000-0000-0000-00000000000a");
    expect(result.hpDamageLocked?.hp_damage_locked).toBe(40);
  });

  test("annihilateOverdueTask repart de 0 si le lock stocké portait sur un autre jour", async () => {
    fakeClient = new FakeSupabaseClient({
      profiles: [
        { id: "u1", level: 1, xp: 0, timezone: "UTC", hp_damage_locked: 60, hp_damage_locked_day: "2000-01-01" },
      ],
      tasks: [{ id: "99999999-0000-0000-0000-00000000000b", user_id: "u1", is_abandoned: false }],
    });
    const { annihilateOverdueTask } = await import("./tasks");
    const result = await annihilateOverdueTask("99999999-0000-0000-0000-00000000000b");
    expect(result.hpDamageLocked?.hp_damage_locked).toBe(20);
  });

  test("annihilateOverdueOlderThan renvoie le dégât verrouillé pour toutes les lignes affectées", async () => {
    fakeClient = new FakeSupabaseClient({
      profiles: [{ id: "u1", level: 1, xp: 0, timezone: "UTC", hp_damage_locked: 0, hp_damage_locked_day: null }],
      tasks: [
        { id: "99999999-0000-0000-0000-00000000000c", user_id: "u1", day_date: "2000-01-01", is_completed: false, is_abandoned: false },
        { id: "99999999-0000-0000-0000-00000000000d", user_id: "u1", day_date: "2000-01-01", is_completed: false, is_abandoned: false },
      ],
    });
    const { annihilateOverdueOlderThan } = await import("./tasks");
    const result = await annihilateOverdueOlderThan(3);
    expect(result.hpDamageLocked?.hp_damage_locked).toBe(40);
  });
});

function dayKeyToday(): string {
  return new Date().toISOString().slice(0, 10);
}
