import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

type Row = Record<string, unknown>;

// Fake Supabase minimal : insert().select().single() (creation d'un client).
class FakeQueryBuilder implements PromiseLike<{ data: Row[]; error: null }> {
  private mode: "select" | "insert" = "select";
  private insertedRow: Row | null = null;

  constructor(private readonly rows: Row[]) {}

  select(): this {
    return this;
  }

  insert(row: Row): this {
    this.mode = "insert";
    const nextId = "client-" + String(this.rows.length + 1);
    this.insertedRow = Object.assign({ client_id: nextId, client_secret_hash: null }, row);
    return this;
  }

  async single(): Promise<{ data: Row | null; error: null }> {
    if (this.mode === "insert" && this.insertedRow) {
      this.rows.push(this.insertedRow);
      return { data: this.insertedRow, error: null };
    }
    return { data: null, error: null };
  }

  then<TResult1 = { data: Row[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ data: this.rows, error: null as null }).then(onfulfilled ?? undefined) as PromiseLike<
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

function stubEnv(): void {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fake.supabase.co");
  vi.stubEnv("NEXT_PRIVATE_KEY_SUPABASE", "fake-service-role-key");
}

beforeEach(() => {
  dbTables = { oauth_clients: [] };
  stubEnv();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function registerRequest(body: unknown, ip = "203.0.113.10"): Request {
  return new Request("http://localhost/oauth/register", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

describe("POST /oauth/register (US-22 - RFC 7591)", () => {
  test("201 avec redirect_uris valides : client public cree, pas de secret", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      registerRequest({ redirect_uris: ["https://gemini.google.com/callback"], client_name: "Gemini" }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      client_name: "Gemini",
      redirect_uris: ["https://gemini.google.com/callback"],
      token_endpoint_auth_method: "none",
    });
    expect(body.client_secret).toBeUndefined();
    expect(dbTables.oauth_clients).toHaveLength(1);
  });

  test("client_name par defaut si absent", async () => {
    const { POST } = await import("./route");
    const response = await POST(registerRequest({ redirect_uris: ["https://client.example/callback"] }));
    const body = await response.json();
    expect(body.client_name).toBe("Client MCP");
  });

  test("400 si redirect_uris est absent", async () => {
    const { POST } = await import("./route");
    const response = await POST(registerRequest({}));
    expect(response.status).toBe(400);
    expect(dbTables.oauth_clients).toHaveLength(0);
  });

  test("400 si un redirect_uri n'est pas une URL valide", async () => {
    const { POST } = await import("./route");
    const response = await POST(registerRequest({ redirect_uris: ["pas-une-url"] }));
    expect(response.status).toBe(400);
  });

  test("429 apres depassement de la limite par IP", async () => {
    const { POST } = await import("./route");
    const ip = "198.51.100.7";
    for (let i = 0; i < 5; i++) {
      const response = await POST(registerRequest({ redirect_uris: ["https://client.example/callback"] }, ip));
      expect(response.status).toBe(201);
    }
    const limited = await POST(registerRequest({ redirect_uris: ["https://client.example/callback"] }, ip));
    expect(limited.status).toBe(429);
  });
});
