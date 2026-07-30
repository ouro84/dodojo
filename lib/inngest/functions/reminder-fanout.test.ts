import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

type Row = Record<string, unknown>;

class FakeQueryBuilder implements PromiseLike<{ data: Row[]; error: null }> {
  private filters: Array<(row: Row) => boolean> = [];

  constructor(private readonly rows: Row[]) {}

  select(): this {
    return this;
  }
  eq(column: string, value: unknown): this {
    this.filters.push((row) => row[column] === value);
    return this;
  }
  in(column: string, values: unknown[]): this {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }

  private matched(): Row[] {
    return this.rows.filter((row) => this.filters.every((f) => f(row)));
  }

  then<TResult1 = { data: Row[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ data: this.matched(), error: null as null }).then(onfulfilled ?? undefined) as PromiseLike<
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

let dbTables: Record<string, Row[]> = {};

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => new FakeSupabaseClient(dbTables),
}));

// Capture le handler de la fonction Inngest instanciée (même pattern que
// send-reminder.test.ts — SDK 4.x : createFunction({ id, triggers }, handler)).
const { inngestClientMock, capturedFns } = vi.hoisted(() => ({
  inngestClientMock: {
    createFunction: vi.fn(),
  },
  capturedFns: [] as Array<{
    id: string;
    fn: (args: {
      step: {
        run: <T>(id: string, cb: () => T | Promise<T>) => Promise<T>;
        sendEvent: (id: string, payload: unknown) => Promise<unknown>;
      };
    }) => Promise<unknown>;
  }>,
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: inngestClientMock,
}));

inngestClientMock.createFunction.mockImplementation(
  (
    opts: { id: string },
    fn: (args: {
      step: {
        run: <T>(id: string, cb: () => T | Promise<T>) => Promise<T>;
        sendEvent: (id: string, payload: unknown) => Promise<unknown>;
      };
    }) => Promise<unknown>,
  ) => {
    capturedFns.push({ id: opts.id, fn });
    return { id: opts.id, fn };
  },
);

const sendEventMock = vi.fn();

type FakeStep = {
  run: <TReturn>(id: string, cb: () => TReturn | Promise<TReturn>) => Promise<TReturn>;
  sendEvent: (id: string, payload: unknown) => Promise<unknown>;
};
function makeFakeStep(): FakeStep {
  return {
    run: vi.fn(async <TReturn>(_id: string, cb: () => TReturn | Promise<TReturn>): Promise<TReturn> => {
      return await cb();
    }) as FakeStep["run"],
    sendEvent: sendEventMock,
  };
}

function stubEnv(): void {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fake.supabase.co");
  vi.stubEnv("NEXT_PRIVATE_KEY_SUPABASE", "fake-service-role-key");
}

// 15h30 UTC = 17h30 heure d'été Europe/Paris (dans la fenêtre), et 00h30 le
// lendemain à Asia/Tokyo (hors fenêtre).
const NOW_1730_PARIS = "2026-07-22T15:30:00.000Z";

async function invokeFanout(): Promise<unknown> {
  const fn = capturedFns.find((f) => f.id === "reminder-fanout");
  if (!fn) throw new Error("reminder-fanout function not registered");
  return await fn.fn({ step: makeFakeStep() });
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW_1730_PARIS));
  dbTables = {
    push_subscriptions: [],
    profiles: [],
    tasks: [],
    day_results: [],
  };
  stubEnv();
  sendEventMock.mockReset();
  capturedFns.length = 0;
  await import("./reminder-fanout");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.resetModules();
});

function withSub(userId: string): Row {
  return { user_id: userId, endpoint: `https://push.example/${userId}`, p256dh: "p", auth: "a" };
}
function withProfile(id: string, timezone: string, lastReminderSentOn: string | null = null): Row {
  return { id, timezone, last_reminder_sent_on: lastReminderSentOn, aggressivity_level: "direct" };
}
function withTask(userId: string, dayDate: string): Row {
  return { user_id: userId, day_date: dayDate, parent_id: null, is_abandoned: false, is_completed: false };
}

describe("reminder-fanout", () => {
  test("F1 — 1 seul profil dans la fenêtre 17h30 locale sur 2 candidats", async () => {
    dbTables.push_subscriptions = [withSub("u1"), withSub("u2")];
    dbTables.profiles = [
      withProfile("u1", "Europe/Paris"), // dans la fenêtre (17h30 heure d'été)
      withProfile("u2", "Asia/Tokyo"), // hors fenêtre (00h30 le lendemain)
    ];
    dbTables.tasks = [withTask("u1", "2026-07-22"), withTask("u2", "2026-07-23")];

    const result = await invokeFanout();

    expect(sendEventMock).toHaveBeenCalledTimes(1);
    const payload = sendEventMock.mock.calls[0]?.[1] as Array<{ data: { profileId: string; dayKey: string } }>;
    expect(payload).toHaveLength(1);
    expect(payload[0]?.data.profileId).toBe("u1");
    expect(payload[0]?.data.dayKey).toBe("2026-07-22");
    expect(result).toEqual({ fanned: 1 });
  });

  test("F2 — profil déjà notifié aujourd'hui (jour local) → exclu", async () => {
    dbTables.push_subscriptions = [withSub("u1")];
    dbTables.profiles = [withProfile("u1", "Europe/Paris", "2026-07-22")];
    dbTables.tasks = [withTask("u1", "2026-07-22")];

    const result = await invokeFanout();

    expect(sendEventMock).not.toHaveBeenCalled();
    expect(result).toEqual({ fanned: 0 });
  });

  test("F3 — aucun éligible → step.sendEvent non appelé, retour { fanned: 0 }", async () => {
    dbTables.push_subscriptions = [];
    dbTables.profiles = [];

    const result = await invokeFanout();

    expect(sendEventMock).not.toHaveBeenCalled();
    expect(result).toEqual({ fanned: 0 });
  });

  test("F4 — payload complet et typé ; variantIndex stable entre deux exécutions à la même date", async () => {
    dbTables.push_subscriptions = [withSub("u1")];
    dbTables.profiles = [withProfile("u1", "Europe/Paris")];
    dbTables.tasks = [withTask("u1", "2026-07-22")];

    await invokeFanout();
    const firstPayload = sendEventMock.mock.calls[0]?.[1] as Array<{
      data: { profileId: string; dayKey: string; nowIso: string; variantIndex: number };
    }>;
    expect(firstPayload[0]?.data).toEqual({
      profileId: "u1",
      dayKey: "2026-07-22",
      nowIso: NOW_1730_PARIS,
      variantIndex: expect.any(Number),
    });
    const firstVariant = firstPayload[0]?.data.variantIndex;

    sendEventMock.mockClear();
    dbTables.profiles[0]!.last_reminder_sent_on = null; // ré-éligible pour le 2e run
    await invokeFanout();
    const secondPayload = sendEventMock.mock.calls[0]?.[1] as Array<{ data: { variantIndex: number } }>;

    expect(secondPayload[0]?.data.variantIndex).toBe(firstVariant);
  });

  test("F5 — profil sans souscription → exclu", async () => {
    dbTables.push_subscriptions = [];
    dbTables.profiles = [withProfile("u1", "Europe/Paris")];
    dbTables.tasks = [withTask("u1", "2026-07-22")];

    const result = await invokeFanout();

    expect(sendEventMock).not.toHaveBeenCalled();
    expect(result).toEqual({ fanned: 0 });
  });
});
