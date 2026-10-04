import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const { sendNotificationMock, setVapidDetailsMock } = vi.hoisted(() => ({
  sendNotificationMock: vi.fn(),
  setVapidDetailsMock: vi.fn(),
}));

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: setVapidDetailsMock,
    sendNotification: sendNotificationMock,
  },
}));

type Row = Record<string, unknown>;

class FakeQueryBuilder implements PromiseLike<{ data: Row | Row[] | null; error: null }> {
  private filters: Array<(row: Row) => boolean> = [];
  private single = false;

  constructor(private readonly rows: Row[]) {}

  select(): this {
    return this;
  }
  eq(column: string, value: unknown): this {
    this.filters.push((row) => row[column] === value);
    return this;
  }
  // `.is(col, null)` : une colonne absente de la fixture EST un NULL SQL.
  is(column: string, value: unknown): this {
    this.filters.push((row) => (value === null ? row[column] == null : row[column] === value));
    return this;
  }
  maybeSingle(): this {
    this.single = true;
    return this;
  }

  private matched(): Row[] {
    return this.rows.filter((row) => this.filters.every((f) => f(row)));
  }

  then<TResult1 = { data: Row | Row[] | null; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Row | Row[] | null; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const matched = this.matched();
    const data = this.single ? (matched[0] ?? null) : matched;
    return Promise.resolve({ data, error: null as null }).then(onfulfilled ?? undefined) as PromiseLike<
      TResult1 | TResult2
    >;
  }
}

class FakeSupabaseClient {
  constructor(private readonly tables: Record<string, Row[]>) {}
  from(table: string): FakeQueryBuilder {
    return new FakeQueryBuilder(this.tables[table] ?? []);
  }
}

interface EventData {
  taskId: string;
  userId: string;
  deadlineAt: string;
  offsetMinutes: number;
}
const { inngestClientMock, capturedFns } = vi.hoisted(() => ({
  inngestClientMock: { createFunction: vi.fn() },
  capturedFns: [] as Array<{
    id: string;
    fn: (args: {
      event: { data: EventData };
      step: {
        sleepUntil: (id: string, date: Date) => Promise<void>;
        run: <T>(id: string, cb: () => T | Promise<T>) => Promise<T>;
      };
    }) => Promise<unknown>;
  }>,
}));

inngestClientMock.createFunction.mockImplementation(
  (
    opts: { id: string },
    fn: (args: {
      event: { data: EventData };
      step: {
        sleepUntil: (id: string, date: Date) => Promise<void>;
        run: <T>(id: string, cb: () => T | Promise<T>) => Promise<T>;
      };
    }) => Promise<unknown>,
  ) => {
    capturedFns.push({ id: opts.id, fn });
    return { id: opts.id, fn };
  },
);

vi.mock("@/lib/inngest/client", () => ({ inngest: inngestClientMock }));

let dbTables: Record<string, Row[]> = {};
vi.mock("@supabase/supabase-js", () => ({ createClient: () => new FakeSupabaseClient(dbTables) }));

interface FakeStep {
  sleepUntil: (id: string, date: Date) => Promise<void>;
  run: <T>(id: string, cb: () => T | Promise<T>) => Promise<T>;
}

function makeFakeStep(): FakeStep {
  return {
    sleepUntil: vi.fn(async () => undefined),
    run: vi.fn(async (_id: string, cb: () => unknown) => cb()) as FakeStep["run"],
  };
}

function baseTables(): Record<string, Row[]> {
  return {
    tasks: [
      {
        id: "t1",
        title: "Ranger la chambre",
        deadline_at: "2026-07-22T16:00:00.000Z",
        is_completed: false,
        is_abandoned: false,
        reminder_enabled: true,
      },
    ],
    profiles: [{ id: "u1", aggressivity_level: "direct" }],
    push_subscriptions: [{ user_id: "u1", endpoint: "https://push.example/u1", p256dh: "p", auth: "a" }],
  };
}

function stubEnv(): void {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fake.supabase.co");
  vi.stubEnv("NEXT_PRIVATE_KEY_SUPABASE", "fake-service-role-key");
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "fake-public-key");
  vi.stubEnv("VAPID_PRIVATE_KEY", "fake-private-key");
  vi.stubEnv("VAPID_SUBJECT", "mailto:test@dodojo.app");
}

beforeEach(async () => {
  dbTables = baseTables();
  stubEnv();
  sendNotificationMock.mockReset();
  setVapidDetailsMock.mockReset();
  capturedFns.length = 0;
  await import("./schedule-deadline-reminder");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function invoke(eventData: EventData) {
  const step = makeFakeStep();
  const captured = capturedFns.find((f) => f.id === "schedule-deadline-reminder");
  if (!captured) throw new Error("fonction non enregistrée");
  await captured.fn({ event: { data: eventData }, step });
  return step;
}

describe("schedule-deadline-reminder", () => {
  const baseEvent: EventData = {
    taskId: "t1",
    userId: "u1",
    deadlineAt: "2026-07-22T16:00:00.000Z",
    offsetMinutes: 15,
  };

  test("envoie le push si la tâche est toujours active et le rappel activé", async () => {
    await invoke(baseEvent);
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
  });

  test("n'envoie rien si la tâche est complétée depuis", async () => {
    dbTables.tasks[0].is_completed = true;
    await invoke(baseEvent);
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  test("n'envoie rien si la tâche est abandonnée depuis", async () => {
    dbTables.tasks[0].is_abandoned = true;
    await invoke(baseEvent);
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  test("n'envoie rien si reminder_enabled est passé à false depuis", async () => {
    dbTables.tasks[0].reminder_enabled = false;
    await invoke(baseEvent);
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  test("n'envoie rien si la deadline a changé depuis l'émission de l'event", async () => {
    dbTables.tasks[0].deadline_at = "2026-07-22T18:00:00.000Z";
    await invoke(baseEvent);
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  // Issue #183 (C2a) : PostgREST renvoie un timestamptz avec le suffixe
  // "+00:00" (pas "Z"), et parfois sans les millisecondes — une comparaison
  // de strings brutes contre event.data.deadlineAt (Date.toISOString(),
  // suffixe "Z") échouait donc systématiquement même sans changement réel de
  // deadline. Régression : aucun rappel de deadline n'était jamais envoyé.
  test("envoie le push même si deadline_at revient au format PostgREST (+00:00, même instant)", async () => {
    dbTables.tasks[0].deadline_at = "2026-07-22T16:00:00+00:00";
    await invoke(baseEvent);
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
  });

  test("n'envoie rien si aucune souscription push n'existe", async () => {
    dbTables.push_subscriptions = [];
    await invoke(baseEvent);
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  test("n'envoie rien si la seule souscription est expirée (issue #215)", async () => {
    dbTables.push_subscriptions[0]!.expired_at = "2026-07-20T15:30:00.000Z";
    await invoke(baseEvent);
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  test("dort jusqu'à deadlineAt − offsetMinutes", async () => {
    const step = await invoke(baseEvent);
    expect(step.sleepUntil).toHaveBeenCalledWith(
      "wait-until-reminder",
      new Date("2026-07-22T15:45:00.000Z"),
    );
  });
});
