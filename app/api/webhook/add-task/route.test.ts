import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { hashWebhookToken } from "../../../../lib/webhook-token";

type Row = Record<string, unknown>;

// Fake Supabase minimal : select/eq/maybeSingle (lookup profil par hash),
// select/eq/eq (fetch tâches du jour, via insertTaskForUser), insert/select/single
// (création tâche), update/eq (dernière utilisation).
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
    this.insertedRow = {
      id: `task-${this.rows.length + 1}`,
      parent_id: null,
      is_abandoned: false,
      is_completed: false,
      ...row,
    };
    return this;
  }

  update(patch: Row): this {
    this.mode = "update";
    this.patch = patch;
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  private matched(): Row[] {
    return this.rows.filter((row) => this.filters.every((f) => f(row)));
  }

  private apply(): Row[] {
    if (this.mode === "insert" && this.insertedRow) {
      this.rows.push(this.insertedRow);
      return [this.insertedRow];
    }
    if (this.mode === "update") {
      const matched = this.matched();
      for (const row of matched) Object.assign(row, this.patch);
      return matched;
    }
    return this.matched();
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
    return Promise.resolve({ data, error: null as null }).then(onfulfilled ?? undefined) as PromiseLike<
      TResult1 | TResult2
    >;
  }
}

class FakeSupabaseClient {
  constructor(private readonly tables: Record<string, Row[]>) {}
  from(table: string): FakeQueryBuilder {
    if (!this.tables[table]) this.tables[table] = [];
    return new FakeQueryBuilder(this.tables[table]);
  }
}

let dbTables: Record<string, Row[]> = {};

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => new FakeSupabaseClient(dbTables),
}));

const RAW_TOKEN = "a".repeat(64);
const NOW = "2026-07-22T12:00:00.000Z"; // midi UTC : même jour calendaire à Paris et en UTC

function baseTables(): Record<string, Row[]> {
  return {
    profiles: [
      {
        id: "u1",
        timezone: "Europe/Paris",
        webhook_token_hash: hashWebhookToken(RAW_TOKEN),
        webhook_token_last_used_at: null,
      },
    ],
    tasks: [],
  };
}

function stubEnv(): void {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fake.supabase.co");
  vi.stubEnv("NEXT_PRIVATE_KEY_SUPABASE", "fake-service-role-key");
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  dbTables = baseTables();
  stubEnv();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("POST /api/webhook/add-task (US-03)", () => {
  test("401 sans header Authorization", async () => {
    const { POST } = await import("./route");
    const request = new Request("http://localhost/api/webhook/add-task", {
      method: "POST",
      body: JSON.stringify({ title: "Rappeler le client" }),
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
    expect(dbTables.tasks).toHaveLength(0);
  });

  test("401 avec un mauvais token", async () => {
    const { POST } = await import("./route");
    const request = new Request("http://localhost/api/webhook/add-task", {
      method: "POST",
      headers: { authorization: "Bearer mauvais-token", "content-type": "application/json" },
      body: JSON.stringify({ title: "Rappeler le client" }),
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
    expect(dbTables.tasks).toHaveLength(0);
  });

  test("201 avec le bon token : tâche créée, HP recalculés, dernière utilisation posée", async () => {
    const { POST } = await import("./route");
    const request = new Request("http://localhost/api/webhook/add-task", {
      method: "POST",
      headers: { authorization: `Bearer ${RAW_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ title: "Rappeler le client" }),
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({ dayDate: "2026-07-22", bossMaxHp: 20, bossCurrentHp: 20 });
    expect(dbTables.tasks).toHaveLength(1);
    expect(dbTables.tasks[0]).toMatchObject({
      user_id: "u1",
      title: "Rappeler le client",
      day_date: "2026-07-22",
    });
    expect(dbTables.profiles[0]?.webhook_token_last_used_at).toBe(NOW);
  });

  test("400 si le titre est vide", async () => {
    const { POST } = await import("./route");
    const request = new Request("http://localhost/api/webhook/add-task", {
      method: "POST",
      headers: { authorization: `Bearer ${RAW_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ title: "   " }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(dbTables.tasks).toHaveLength(0);
  });

  test("400 si le titre dépasse 140 caractères", async () => {
    const { POST } = await import("./route");
    const request = new Request("http://localhost/api/webhook/add-task", {
      method: "POST",
      headers: { authorization: `Bearer ${RAW_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ title: "x".repeat(141) }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(dbTables.tasks).toHaveLength(0);
  });
});
