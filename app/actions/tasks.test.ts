import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

type Row = Record<string, unknown>;

// Fake Supabase minimal — un seul query builder type couvre select/insert/
// update/eq/maybeSingle. Les guards UUID des server actions court-circuitent
// AVANT tout appel Supabase, donc le fake n'est jamais sollicité pour les cas
// testés ici ; on le garde quand même monté pour valider qu'aucune requête
// part effectivement (assertions `dbCalls === 0`).
class FakeQueryBuilder implements PromiseLike<{ data: Row[]; error: null }> {
  private filters: Array<(row: Row) => boolean> = [];
  private mode: "select" | "insert" | "update" = "select";
  private patch: Row = {};
  private insertedRow: Row | null = null;

  constructor(private readonly rows: Row[]) {}

  select(): this {
    return this;
  }

  insert(row: Row): this {
    this.mode = "insert";
    this.insertedRow = { id: `task-${this.rows.length + 1}`, ...row };
    return this;
  }

  update(patch: Row): this {
    this.mode = "update";
    this.patch = patch;
    return this;
  }

  eq(): this {
    this.filters.push(() => true);
    return this;
  }

  private apply(): Row[] {
    if (this.mode === "insert" && this.insertedRow) {
      this.rows.push(this.insertedRow);
      return [this.insertedRow];
    }
    if (this.mode === "update") {
      const matched = this.rows.filter(() => true);
      for (const row of matched) Object.assign(row, this.patch);
      return matched;
    }
    return this.rows;
  }

  async maybeSingle(): Promise<{ data: Row | null; error: null }> {
    const rows = this.apply();
    return { data: rows[0] ?? null, error: null };
  }

  async single(): Promise<{ data: Row | null; error: null }> {
    const rows = this.apply();
    return { data: rows[0] ?? null, error: null };
  }

  then<TResult1 = { data: Row[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const data = this.apply();
    return Promise.resolve({ data, error: null as null }).then(
      onfulfilled ?? undefined,
    ) as PromiseLike<TResult1 | TResult2>;
  }
}

class FakeSupabaseClient {
  public calls = 0;
  constructor(private readonly tables: Record<string, Row[]>) {}

  from(table: string): FakeQueryBuilder {
    this.calls += 1;
    if (!this.tables[table]) this.tables[table] = [];
    return new FakeQueryBuilder(this.tables[table]);
  }

  auth = {
    getUser: vi.fn(async () => ({
      data: { user: { id: "u1" } },
    })),
  };
}

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
