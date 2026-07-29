import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// === Mocks hoisted (cf. pattern route.test.ts + plan §L1 L226) ===

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

class FakeQueryBuilder implements PromiseLike<{ data: Row[]; error: null }> {
  private filters: Array<(row: Row) => boolean> = [];
  private mode: "select" | "update" | "delete" = "select";
  private patch: Row = {};

  constructor(private readonly rows: Row[]) {}

  select(): this {
    this.mode = "select";
    return this;
  }
  update(patch: Row): this {
    this.mode = "update";
    this.patch = patch;
    return this;
  }
  delete(): this {
    this.mode = "delete";
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  limit(limit: number): this {
    // Le FakeQueryBuilder retourne déjà toutes les rows matchées ; on ignore
    // le `limit` ici car les tests contrôlent directement les fixtures.
    return this;
  }

  private matchedIndexes(): number[] {
    return this.rows
      .map((row, index) => (this.filters.every((f) => f(row)) ? index : -1))
      .filter((index) => index !== -1);
  }

  private apply(): Row[] {
    const indexes = this.matchedIndexes();
    if (this.mode === "update") {
      for (const i of indexes) Object.assign(this.rows[i], this.patch);
    }
    if (this.mode === "delete") {
      for (const i of [...indexes].reverse()) this.rows.splice(i, 1);
    }
    return indexes.map((i) => this.rows[i]).filter((row): row is Row => Boolean(row));
  }

  then<TResult1 = { data: Row[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const data = this.apply();
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

// Capture le handler de la fonction Inngest instanciée.
// SDK 4.x API : createFunction({ id, triggers }, handler) — le handler est
// 2e argument, plus 3e (legacy <4.0).
const { inngestClientMock, capturedFns } = vi.hoisted(() => ({
  inngestClientMock: {
    createFunction: vi.fn(),
  },
  capturedFns: [] as Array<{
    id: string;
    fn: (args: {
      event: { id?: string; name: string; data: { profileId: string } };
      step: { run: <T>(id: string, cb: () => T | Promise<T>) => Promise<T> };
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
      event: { id?: string; name: string; data: { profileId: string } };
      step: { run: <T>(id: string, cb: () => T | Promise<T>) => Promise<T> };
    }) => Promise<unknown>,
  ) => {
    capturedFns.push({ id: opts.id, fn });
    return { id: opts.id, fn };
  },
);

let dbTables: Record<string, Row[]> = {};

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => new FakeSupabaseClient(dbTables),
}));

// Step factice : exécute directement le callback (pas de overhead Inngest,
// l'ordre d'appel reste séquentiel comme en prod). Le type est aligné sur le
// contrat `step.run<TReturn>(() => TReturn): Promise<TReturn>` du SDK.
type FakeStep = {
  run: <TReturn>(id: string, cb: () => TReturn | Promise<TReturn>) => Promise<TReturn>;
};
function makeFakeStep(): FakeStep {
  return {
    run: vi.fn(async <TReturn>(_id: string, cb: () => TReturn | Promise<TReturn>): Promise<TReturn> => {
      return await cb();
    }) as FakeStep["run"],
  };
}

function baseTables(): Record<string, Row[]> {
  return {
    push_subscriptions: [{ user_id: "u1", endpoint: "https://push.example/u1", p256dh: "p", auth: "a" }],
    profiles: [
      { id: "u1", timezone: "Europe/Paris", last_reminder_sent_on: null, aggressivity_level: "direct" },
    ],
    tasks: [{ user_id: "u1", day_date: "2026-07-22", parent_id: null, is_abandoned: false, is_completed: false }],
    day_results: [],
  };
}

function stubEnv(): void {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fake.supabase.co");
  vi.stubEnv("NEXT_PRIVATE_KEY_SUPABASE", "fake-service-role-key");
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "fake-public-key");
  vi.stubEnv("VAPID_PRIVATE_KEY", "fake-private-key");
  vi.stubEnv("VAPID_SUBJECT", "mailto:test@dodojo.app");
  vi.stubEnv("INNGEST_EVENT_KEY", "test-event-key");
  vi.stubEnv("INNGEST_SIGNING_KEY", "test-signing-key");
  vi.stubEnv("INNGEST_APP_ID", "dodojo");
}

const NOW_1730_PARIS = "2026-07-22T15:30:00.000Z";

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW_1730_PARIS));
  dbTables = baseTables();
  stubEnv();
  sendNotificationMock.mockReset();
  setVapidDetailsMock.mockReset();
  capturedFns.length = 0;
  // Import eager pour que createFunction soit appelé à l'import.
  await import("./send-reminder");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function invokeSendReminder(profileId: string, eventId = "evt_1"): Promise<unknown> {
  const fn = capturedFns.find((f) => f.id === "send-reminder");
  if (!fn) throw new Error("send-reminder function not registered");
  return await fn.fn({
    event: { id: eventId, name: "send-reminder", data: { profileId } },
    step: makeFakeStep(),
  });
}

describe("send-reminder", () => {
  test("T1.3 — envoie une notification au profil éligible et marque last_reminder_sent_on", async () => {
    sendNotificationMock.mockResolvedValueOnce(undefined);

    await invokeSendReminder("u1");

    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
    expect(dbTables.profiles[0]?.last_reminder_sent_on).toBe("2026-07-22");
  });

  test("T1.1 — supprime la souscription sur 410 Gone, sans marquer last_reminder_sent_on", async () => {
    sendNotificationMock.mockRejectedValueOnce({ statusCode: 410 });

    await invokeSendReminder("u1");

    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
    expect(dbTables.push_subscriptions).toHaveLength(0);
    expect(dbTables.profiles[0]?.last_reminder_sent_on).toBeNull();
  });

  test("T1.5 — 404 supprime la sub ET marque last_reminder_sent_on", async () => {
    sendNotificationMock.mockRejectedValueOnce({ statusCode: 404 });

    await invokeSendReminder("u1");

    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
    expect(dbTables.push_subscriptions).toHaveLength(0);
    expect(dbTables.profiles[0]?.last_reminder_sent_on).toBe("2026-07-22");
  });

  test("T1.4 — ignore un profil non éligible (manque de souscription)", async () => {
    dbTables.push_subscriptions = []; // retire toutes les souscriptions
    await invokeSendReminder("u1");
    expect(sendNotificationMock).not.toHaveBeenCalled();
    expect(dbTables.profiles[0]?.last_reminder_sent_on).toBeNull();
  });

  test("T1.2 — idempotent : un second run avec un même event.id ne réémet pas de notification", async () => {
    sendNotificationMock.mockResolvedValue(undefined);

    // 1er run — event.id "evt_1". La DB est marquée "2026-07-22".
    await invokeSendReminder("u1", "evt_1");
    expect(dbTables.profiles[0]?.last_reminder_sent_on).toBe("2026-07-22");

    // 2e run avec le MEME event.id — l'idempotence DB (lastReminderSentOn == today)
    // court-circuite isReminderEligible → aucun envoi.
    await invokeSendReminder("u1", "evt_1");

    // sendNotification appelée exactement UNE fois (pas deux).
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
  });
});
