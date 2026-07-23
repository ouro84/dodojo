import { beforeEach, describe, expect, test, vi } from "vitest";
import { generateOpaqueToken, hashOpaqueToken } from "../../../lib/oauth-tokens";

type Row = Record<string, unknown>;

class FakeQueryBuilder implements PromiseLike<{ data: Row[]; error: null }> {
  private filters: Array<(row: Row) => boolean> = [];
  private mode: "select" | "delete" = "select";

  constructor(private readonly rows: Row[]) {}

  delete(): this {
    this.mode = "delete";
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  private matched(): Row[] {
    return this.rows.filter((row) => this.filters.every((f) => f(row)));
  }

  then<TResult1 = { data: Row[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const matched = this.matched();
    if (this.mode === "delete") {
      const toDelete = new Set(matched);
      const remaining = this.rows.filter((row) => !toDelete.has(row));
      this.rows.length = 0;
      this.rows.push(...remaining);
    }
    return Promise.resolve({ data: matched, error: null as null }).then(onfulfilled ?? undefined) as PromiseLike<
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

let dbTables: Record<string, Row[]>;

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => new FakeSupabaseClient(dbTables),
}));

function stubEnv(): void {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fake.supabase.co");
  vi.stubEnv("NEXT_PRIVATE_KEY_SUPABASE", "fake-service-role-key");
}

function revokeRequest(token: string | undefined): Request {
  const params = new URLSearchParams();
  if (token !== undefined) params.set("token", token);
  return new Request("http://localhost/oauth/revoke", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
}

beforeEach(() => {
  stubEnv();
});

describe("POST /oauth/revoke (US-22 - RFC 7009)", () => {
  test("400 invalid_request si token absent", async () => {
    dbTables = { oauth_tokens: [] };
    const { POST } = await import("./route");
    const response = await POST(revokeRequest(undefined));
    expect(response.status).toBe(400);
  });

  test("200 et supprime la ligne quand le token soumis est l'access_token", async () => {
    const accessToken = generateOpaqueToken();
    dbTables = {
      oauth_tokens: [
        { id: "t1", access_token_hash: hashOpaqueToken(accessToken), refresh_token_hash: "other-hash", user_id: "u1" },
      ],
    };
    const { POST } = await import("./route");
    const response = await POST(revokeRequest(accessToken));
    expect(response.status).toBe(200);
    expect(dbTables.oauth_tokens).toHaveLength(0);
  });

  test("200 et supprime la ligne quand le token soumis est le refresh_token", async () => {
    const refreshToken = generateOpaqueToken();
    dbTables = {
      oauth_tokens: [
        { id: "t1", access_token_hash: "other-hash", refresh_token_hash: hashOpaqueToken(refreshToken), user_id: "u1" },
      ],
    };
    const { POST } = await import("./route");
    const response = await POST(revokeRequest(refreshToken));
    expect(response.status).toBe(200);
    expect(dbTables.oauth_tokens).toHaveLength(0);
  });

  test("200 meme si le token est inconnu (RFC 7009 - ne jamais reveler l'existence d'un token)", async () => {
    dbTables = {
      oauth_tokens: [{ id: "t1", access_token_hash: "autre-hash", refresh_token_hash: "autre-hash-2", user_id: "u1" }],
    };
    const { POST } = await import("./route");
    const response = await POST(revokeRequest(generateOpaqueToken()));
    expect(response.status).toBe(200);
    expect(dbTables.oauth_tokens).toHaveLength(1);
  });
});
