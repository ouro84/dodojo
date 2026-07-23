import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ACCESS_TOKEN_TTL_MS, expiresAtFromNow, generateOpaqueToken, hashOpaqueToken } from "../../../lib/oauth-tokens";

type Row = Record<string, unknown>;

class FakeQueryBuilder implements PromiseLike<{ data: Row[]; error: null }> {
  private filters: Array<(row: Row) => boolean> = [];
  private mode: "select" | "insert" = "select";
  private insertedRow: Row | null = null;

  constructor(private readonly rows: Row[]) {}

  select(): this {
    return this;
  }

  insert(row: Row): this {
    this.mode = "insert";
    this.insertedRow = Object.assign(
      { id: "task-" + String(this.rows.length + 1), parent_id: null, is_abandoned: false, is_completed: false },
      row,
    );
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  private matched(): Row[] {
    return this.rows.filter((row) => this.filters.every((f) => f(row)));
  }

  async maybeSingle(): Promise<{ data: Row | null; error: null }> {
    return { data: this.matched()[0] ?? null, error: null };
  }

  async single(): Promise<{ data: Row | null; error: null }> {
    if (this.mode === "insert" && this.insertedRow) {
      this.rows.push(this.insertedRow);
      return { data: this.insertedRow, error: null };
    }
    return { data: this.matched()[0] ?? null, error: null };
  }

  then<TResult1 = { data: Row[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ data: this.matched(), error: null as null }).then(
      onfulfilled ?? undefined,
    ) as PromiseLike<TResult1 | TResult2>;
  }
}

class FakeSupabaseClient {
  constructor(private readonly tables: Record<string, Row[]>) {}
  from(table: string): FakeQueryBuilder {
    if (!this.tables[table]) this.tables[table] = [];
    return new FakeQueryBuilder(this.tables[table]);
  }
}

let dbTables: Record<string, Row[]>;

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => new FakeSupabaseClient(dbTables),
}));

const NOW = "2026-07-22T12:00:00.000Z";
const ACCESS_TOKEN = generateOpaqueToken();

function stubEnv(): void {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fake.supabase.co");
  vi.stubEnv("NEXT_PRIVATE_KEY_SUPABASE", "fake-service-role-key");
}

function baseTables(expiresAt: string): Record<string, Row[]> {
  return {
    oauth_tokens: [{ user_id: "u1", access_token_hash: hashOpaqueToken(ACCESS_TOKEN), expires_at: expiresAt }],
    profiles: [{ id: "u1", timezone: "Europe/Paris" }],
    tasks: [],
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  dbTables = baseTables(expiresAtFromNow(ACCESS_TOKEN_TTL_MS, new Date(NOW)));
  stubEnv();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

function mcpRequest(body: unknown, token: string | null = ACCESS_TOKEN): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = "Bearer " + token;
  return new Request("https://dodojo.vercel.app/api/mcp", { method: "POST", headers, body: JSON.stringify(body) });
}

describe("POST /api/mcp - authentification (US-22)", () => {
  test("401 sans header Authorization, avec WWW-Authenticate pointant la metadonnee de ressource", async () => {
    const { POST } = await import("./route");
    const response = await POST(mcpRequest({ jsonrpc: "2.0", id: 1, method: "tools/list" }, null));
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("/.well-known/oauth-protected-resource");
  });

  test("401 avec un access_token inconnu", async () => {
    const { POST } = await import("./route");
    const response = await POST(mcpRequest({ jsonrpc: "2.0", id: 1, method: "tools/list" }, "mauvais-token"));
    expect(response.status).toBe(401);
  });

  test("401 avec un access_token expire", async () => {
    dbTables.oauth_tokens[0].expires_at = "2020-01-01T00:00:00.000Z";
    const { POST } = await import("./route");
    const response = await POST(mcpRequest({ jsonrpc: "2.0", id: 1, method: "tools/list" }));
    expect(response.status).toBe(401);
  });
});

describe("POST /api/mcp - protocole JSON-RPC (US-22)", () => {
  test("initialize retourne les capacites du serveur", async () => {
    const { POST } = await import("./route");
    const response = await POST(mcpRequest({ jsonrpc: "2.0", id: 1, method: "initialize" }));
    const body = await response.json();
    expect(body.result.capabilities).toEqual({ tools: {} });
  });

  test("tools/list retourne le tool add_task", async () => {
    const { POST } = await import("./route");
    const response = await POST(mcpRequest({ jsonrpc: "2.0", id: 2, method: "tools/list" }));
    const body = await response.json();
    expect(body.result.tools).toHaveLength(1);
    expect(body.result.tools[0].name).toBe("add_task");
  });

  test("notifications/initialized repond 202 sans corps", async () => {
    const { POST } = await import("./route");
    const response = await POST(mcpRequest({ jsonrpc: "2.0", method: "notifications/initialized" }));
    expect(response.status).toBe(202);
  });

  test("methode inconnue -> erreur JSON-RPC method not found", async () => {
    const { POST } = await import("./route");
    const response = await POST(mcpRequest({ jsonrpc: "2.0", id: 3, method: "inconnue" }));
    const body = await response.json();
    expect(body.error.code).toBe(-32601);
  });
});

describe("POST /api/mcp - tools/call add_task (US-22)", () => {
  test("ajoute une tache pour l'utilisateur du token, reutilise insertTaskForUser", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      mcpRequest({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "add_task", arguments: { title: "Rappeler le client" } },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.result.isError).toBe(false);
    expect(body.result.content[0].text).toContain("2026-07-22");
    expect(dbTables.tasks).toHaveLength(1);
    expect(dbTables.tasks[0]).toMatchObject({ user_id: "u1", title: "Rappeler le client", day_date: "2026-07-22" });
  });

  test("titre vide -> resultat outil en erreur (isError true), aucune tache creee", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      mcpRequest({
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: { name: "add_task", arguments: { title: "   " } },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.result.isError).toBe(true);
    expect(dbTables.tasks).toHaveLength(0);
  });

  test("tool inconnu -> erreur JSON-RPC method not found", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      mcpRequest({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "delete_everything", arguments: {} } }),
    );
    const body = await response.json();
    expect(body.error.code).toBe(-32601);
  });
});
