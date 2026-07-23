import { beforeEach, describe, expect, test, vi } from "vitest";
import { deriveCodeChallenge, generateCodeVerifier } from "../../../lib/pkce";
import {
  AUTHORIZATION_CODE_TTL_MS,
  expiresAtFromNow,
  generateOpaqueToken,
  hashOpaqueToken,
} from "../../../lib/oauth-tokens";

type Row = Record<string, unknown>;

class FakeQueryBuilder implements PromiseLike<{ data: Row[]; error: null }> {
  private filters: Array<(row: Row) => boolean> = [];
  private mode: "select" | "insert" | "delete" = "select";
  private insertedRow: Row | null = null;

  constructor(private readonly rows: Row[]) {}

  select(): this {
    return this;
  }

  insert(row: Row): this {
    this.mode = "insert";
    this.insertedRow = Object.assign({ id: "row-" + String(this.rows.length + 1) }, row);
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

  private matched(): Row[] {
    return this.rows.filter((row) => this.filters.every((f) => f(row)));
  }

  async maybeSingle(): Promise<{ data: Row | null; error: null }> {
    return { data: this.matched()[0] ?? null, error: null };
  }

  then<TResult1 = { data: Row[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    if (this.mode === "insert" && this.insertedRow) {
      this.rows.push(this.insertedRow);
    }
    if (this.mode === "delete") {
      const toDelete = new Set(this.matched());
      const remaining = this.rows.filter((row) => !toDelete.has(row));
      this.rows.length = 0;
      this.rows.push(...remaining);
    }
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

function stubEnv(): void {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fake.supabase.co");
  vi.stubEnv("NEXT_PRIVATE_KEY_SUPABASE", "fake-service-role-key");
}

const CLIENT_ID = "11111111-1111-1111-1111-111111111111";
const REDIRECT_URI = "https://gemini.google.com/callback";

beforeEach(() => {
  dbTables = { oauth_authorization_codes: [], oauth_tokens: [] };
  stubEnv();
});

function tokenRequest(params: Record<string, string>, ip = "203.0.113.20"): Request {
  return new Request("http://localhost/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": ip },
    body: new URLSearchParams(params).toString(),
  });
}

function seedAuthorizationCode(overrides: Partial<Row> = {}): { code: string; verifier: string } {
  const verifier = generateCodeVerifier();
  const code = generateOpaqueToken();
  dbTables.oauth_authorization_codes.push(
    Object.assign(
      {
        code_hash: hashOpaqueToken(code),
        client_id: CLIENT_ID,
        user_id: "u1",
        redirect_uri: REDIRECT_URI,
        code_challenge: deriveCodeChallenge(verifier),
        code_challenge_method: "S256",
        scope: "tasks:write",
        expires_at: expiresAtFromNow(AUTHORIZATION_CODE_TTL_MS),
      },
      overrides,
    ),
  );
  return { code, verifier };
}

describe("POST /oauth/token - grant_type=authorization_code (US-22)", () => {
  test("400 unsupported_grant_type si grant_type absent", async () => {
    const { POST } = await import("./route");
    const response = await POST(tokenRequest({}, "1.0.0.1"));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("unsupported_grant_type");
  });

  test("400 invalid_request si des parametres requis manquent", async () => {
    const { POST } = await import("./route");
    const response = await POST(tokenRequest({ grant_type: "authorization_code" }, "1.0.0.2"));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("invalid_request");
  });

  test("400 invalid_grant si le code est inconnu", async () => {
    const { POST } = await import("./route");
    const params = {
      grant_type: "authorization_code",
      code: "inconnu",
      code_verifier: "x",
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
    };
    const response = await POST(tokenRequest(params, "1.0.0.3"));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("invalid_grant");
  });
});

describe("POST /oauth/token - grant_type=authorization_code, suite (US-22)", () => {
  test("400 invalid_grant si le code est expire", async () => {
    const seeded = seedAuthorizationCode({ expires_at: "2020-01-01T00:00:00.000Z" });
    const { POST } = await import("./route");
    const params = {
      grant_type: "authorization_code",
      code: seeded.code,
      code_verifier: seeded.verifier,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
    };
    const response = await POST(tokenRequest(params, "1.0.0.4"));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("invalid_grant");
  });

  test("400 invalid_grant si client_id ou redirect_uri ne correspondent pas au code", async () => {
    const seeded = seedAuthorizationCode();
    const { POST } = await import("./route");
    const params = {
      grant_type: "authorization_code",
      code: seeded.code,
      code_verifier: seeded.verifier,
      redirect_uri: "https://autre.example/callback",
      client_id: CLIENT_ID,
    };
    const response = await POST(tokenRequest(params, "1.0.0.5"));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("invalid_grant");
  });

  test("400 invalid_grant si le code_verifier ne correspond pas au code_challenge (PKCE)", async () => {
    const seeded = seedAuthorizationCode();
    const { POST } = await import("./route");
    const params = {
      grant_type: "authorization_code",
      code: seeded.code,
      code_verifier: generateCodeVerifier(),
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
    };
    const response = await POST(tokenRequest(params, "1.0.0.6"));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("invalid_grant");
  });
});

describe("POST /oauth/token - echange reussi et rejeu (US-22)", () => {
  test("200 : access_token + refresh_token emis, code consomme (usage unique), rejeu refuse", async () => {
    const seeded = seedAuthorizationCode();
    const { POST } = await import("./route");
    const params = {
      grant_type: "authorization_code",
      code: seeded.code,
      code_verifier: seeded.verifier,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
    };
    const response = await POST(tokenRequest(params, "1.0.0.7"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.token_type).toBe("Bearer");
    expect(body.access_token).toMatch(/^[0-9a-f]{64}$/);
    expect(body.refresh_token).toMatch(/^[0-9a-f]{64}$/);
    expect(body.scope).toBe("tasks:write");
    expect(dbTables.oauth_authorization_codes).toHaveLength(0);
    expect(dbTables.oauth_tokens).toHaveLength(1);
    expect(dbTables.oauth_tokens[0]).toMatchObject({ client_id: CLIENT_ID, user_id: "u1" });

    const replay = await POST(tokenRequest(params, "1.0.0.7"));
    expect(replay.status).toBe(400);
    expect((await replay.json()).error).toBe("invalid_grant");
  });
});

describe("POST /oauth/token - grant_type=refresh_token (US-22)", () => {
  test("400 invalid_request si refresh_token ou client_id manquent", async () => {
    const { POST } = await import("./route");
    const response = await POST(tokenRequest({ grant_type: "refresh_token" }, "1.0.1.1"));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("invalid_request");
  });

  test("400 invalid_grant si le refresh_token est inconnu", async () => {
    const { POST } = await import("./route");
    const params = { grant_type: "refresh_token", refresh_token: "inconnu", client_id: CLIENT_ID };
    const response = await POST(tokenRequest(params, "1.0.1.2"));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("invalid_grant");
  });
});

describe("POST /oauth/token - rotation refresh_token (US-22)", () => {
  test("200 : rotation - nouveau couple emis, l'ancien est supprime, l'ancien refresh_token ne fonctionne plus", async () => {
    const oldRefresh = generateOpaqueToken();
    dbTables.oauth_tokens.push({
      id: "token-1",
      access_token_hash: hashOpaqueToken(generateOpaqueToken()),
      refresh_token_hash: hashOpaqueToken(oldRefresh),
      client_id: CLIENT_ID,
      user_id: "u1",
      scope: "tasks:write",
      expires_at: expiresAtFromNow(3_600_000),
    });

    const { POST } = await import("./route");
    const params = { grant_type: "refresh_token", refresh_token: oldRefresh, client_id: CLIENT_ID };
    const response = await POST(tokenRequest(params, "1.0.1.3"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.refresh_token).not.toBe(oldRefresh);
    expect(dbTables.oauth_tokens).toHaveLength(1);
    expect(dbTables.oauth_tokens[0].refresh_token_hash).toBe(hashOpaqueToken(body.refresh_token));

    const replay = await POST(tokenRequest(params, "1.0.1.3"));
    expect(replay.status).toBe(400);
  });
});

describe("POST /oauth/token - rate limiting (US-22)", () => {
  test("429 apres depassement de la limite par IP", async () => {
    const { POST } = await import("./route");
    const ip = "198.51.100.99";
    for (let i = 0; i < 10; i++) {
      const response = await POST(tokenRequest({ grant_type: "refresh_token" }, ip));
      expect(response.status).toBe(400);
    }
    const limited = await POST(tokenRequest({ grant_type: "refresh_token" }, ip));
    expect(limited.status).toBe(429);
  });
});
