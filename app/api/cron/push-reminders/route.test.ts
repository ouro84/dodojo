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

// Fake Supabase minimal : filtre réellement select/eq/in en mémoire, et
// applique update/delete sur le tableau de lignes (même référence que le
// fixture du test, pour pouvoir asserter l'état après coup).
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

let dbTables: Record<string, Row[]> = {};

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => new FakeSupabaseClient(dbTables),
}));

// 2026-07-22T15:30:00Z = 17h30 à Paris (CEST, UTC+2 en juillet) — dans la
// fenêtre du rappel (lib/push-eligibility.ts).
const NOW_1730_PARIS = "2026-07-22T15:30:00.000Z";

function baseTables(): Record<string, Row[]> {
  return {
    push_subscriptions: [{ user_id: "u1", endpoint: "https://push.example/u1", p256dh: "p", auth: "a" }],
    profiles: [
      { id: "u1", timezone: "Europe/Paris", last_reminder_sent_on: null, aggressivity_level: "sparring" },
    ],
    tasks: [
      { user_id: "u1", day_date: "2026-07-22", parent_id: null, is_abandoned: false, is_completed: false },
    ],
    day_results: [],
  };
}

function stubEnv(): void {
  vi.stubEnv("CRON_SECRET", "test-secret");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fake.supabase.co");
  vi.stubEnv("NEXT_PRIVATE_KEY_SUPABASE", "fake-service-role-key");
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "fake-public-key");
  vi.stubEnv("VAPID_PRIVATE_KEY", "fake-private-key");
  vi.stubEnv("VAPID_SUBJECT", "mailto:test@dodojo.app");
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW_1730_PARIS));
  dbTables = baseTables();
  stubEnv();
  sendNotificationMock.mockReset();
  setVapidDetailsMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("GET /api/cron/push-reminders", () => {
  test("401 si le secret cron est absent ou invalide", async () => {
    const { GET } = await import("./route");
    const request = new Request("http://localhost/api/cron/push-reminders");
    const response = await GET(request);
    expect(response.status).toBe(401);
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  test("envoie une notification au profil éligible et marque last_reminder_sent_on", async () => {
    sendNotificationMock.mockResolvedValueOnce(undefined);
    const { GET } = await import("./route");
    const request = new Request("http://localhost/api/cron/push-reminders", {
      headers: { authorization: "Bearer test-secret" },
    });

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ notified: 1 });
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
    expect(dbTables.profiles[0]?.last_reminder_sent_on).toBe("2026-07-22");
  });

  test("supprime la souscription expirée sur 410 Gone, sans marquer last_reminder_sent_on", async () => {
    sendNotificationMock.mockRejectedValueOnce({ statusCode: 410 });
    const { GET } = await import("./route");
    const request = new Request("http://localhost/api/cron/push-reminders", {
      headers: { authorization: "Bearer test-secret" },
    });

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ notified: 0 });
    expect(dbTables.push_subscriptions).toHaveLength(0);
    expect(dbTables.profiles[0]?.last_reminder_sent_on).toBeNull();
  });
});
