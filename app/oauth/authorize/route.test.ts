import { beforeEach, describe, expect, test, vi } from "vitest";

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
    this.insertedRow = Object.assign({}, row);
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
    return Promise.resolve({ data: this.matched(), error: null as null }).then(
      onfulfilled ?? undefined,
    ) as PromiseLike<TResult1 | TResult2>;
  }
}

class FakeSupabaseClient {
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };

  constructor(
    private readonly tables: Record<string, Row[]>,
    user: { id: string } | null,
  ) {
    this.auth = { getUser: async () => ({ data: { user } }) };
  }

  from(table: string): FakeQueryBuilder {
    if (!this.tables[table]) this.tables[table] = [];
    return new FakeQueryBuilder(this.tables[table]);
  }
}

let dbTables: Record<string, Row[]>;
let currentUser: { id: string } | null;

vi.mock("../../../lib/supabase/server", () => ({
  createClient: async () => new FakeSupabaseClient(dbTables, currentUser),
}));

const CLIENT_ID = "11111111-1111-1111-1111-111111111111";
const REDIRECT_URI = "https://gemini.google.com/callback";

function baseTables(): Record<string, Row[]> {
  return {
    oauth_clients: [{ client_id: CLIENT_ID, client_name: "Gemini", redirect_uris: [REDIRECT_URI] }],
    oauth_authorization_codes: [],
  };
}

beforeEach(() => {
  dbTables = baseTables();
  currentUser = { id: "u1" };
});

function authorizeUrl(overrides: Record<string, string> = {}): string {
  const params = new URLSearchParams(
    Object.assign(
      {
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
        code_challenge_method: "S256",
        scope: "tasks:write",
        state: "xyz",
      },
      overrides,
    ),
  );
  return "https://dodojo.vercel.app/oauth/authorize?" + params.toString();
}

describe("GET /oauth/authorize (US-22)", () => {
  test("sans session : redirige vers /login avec next=", async () => {
    currentUser = null;
    const { GET } = await import("./route");
    const response = await GET(new Request(authorizeUrl()));
    expect(response.status).toBe(307);
    const location = response.headers.get("location") ?? "";
    expect(location).toContain("/login?next=");
  });

  test("client_id inconnu : erreur 400, jamais de redirection", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request(authorizeUrl({ client_id: "inconnu" })));
    expect(response.status).toBe(400);
    expect(response.headers.get("location")).toBeNull();
    const html = await response.text();
    expect(html).toContain("client_id inconnu");
  });

  test("redirect_uri non enregistre : erreur 400, jamais de redirection vers ce redirect_uri", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request(authorizeUrl({ redirect_uri: "https://evil.example/steal" })));
    expect(response.status).toBe(400);
    expect(response.headers.get("location")).toBeNull();
  });

  test("code_challenge_method different de S256 : erreur 400", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request(authorizeUrl({ code_challenge_method: "plain" })));
    expect(response.status).toBe(400);
  });

  test("requete valide : ecran de consentement 200 avec le nom du client", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request(authorizeUrl()));
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Gemini veut accéder à ton compte Dodojo");
  });

  test("scope inconnu : erreur 400, jamais de redirection (Task 4, issue #201)", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request(authorizeUrl({ scope: "openid tasks:write" })));
    expect(response.status).toBe(400);
    expect(response.headers.get("location")).toBeNull();
    const html = await response.text();
    expect(html).toContain("Portee inconnue");
  });

  test("scope absent : DEFAULT_SCOPE accorde, jamais l'ancien fallback tasks:write seul", async () => {
    const { GET } = await import("./route");
    const url = new URL(authorizeUrl());
    url.searchParams.delete("scope");
    const response = await GET(new Request(url.toString()));
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('name="scope" value="tasks:read tasks:write"');
  });
});

describe("POST /oauth/authorize (US-22)", () => {
  function approveForm(): FormData {
    const form = new FormData();
    form.set("client_id", CLIENT_ID);
    form.set("redirect_uri", REDIRECT_URI);
    form.set("code_challenge", "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    form.set("code_challenge_method", "S256");
    form.set("scope", "tasks:write");
    form.set("state", "xyz");
    form.set("decision", "approve");
    return form;
  }

  test("sans session : 401", async () => {
    currentUser = null;
    const { POST } = await import("./route");
    const response = await POST(
      new Request("https://dodojo.vercel.app/oauth/authorize", { method: "POST", body: approveForm() }),
    );
    expect(response.status).toBe(401);
  });

  test("decision refuse : redirige vers redirect_uri avec error=access_denied", async () => {
    const form = approveForm();
    form.set("decision", "deny");
    const { POST } = await import("./route");
    const response = await POST(
      new Request("https://dodojo.vercel.app/oauth/authorize", { method: "POST", body: form }),
    );
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.origin + location.pathname).toBe(REDIRECT_URI);
    expect(location.searchParams.get("error")).toBe("access_denied");
    expect(location.searchParams.get("state")).toBe("xyz");
    expect(dbTables.oauth_authorization_codes).toHaveLength(0);
  });

  test("redirect_uri falsifie dans le formulaire : erreur 400, aucune redirection", async () => {
    const form = approveForm();
    form.set("redirect_uri", "https://evil.example/steal");
    const { POST } = await import("./route");
    const response = await POST(
      new Request("https://dodojo.vercel.app/oauth/authorize", { method: "POST", body: form }),
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("location")).toBeNull();
  });

  test("scope inconnu falsifie dans le formulaire : erreur 400, aucune redirection, aucun insert (Task 4, issue #201)", async () => {
    const form = approveForm();
    form.set("scope", "openid tasks:write");
    const { POST } = await import("./route");
    const response = await POST(
      new Request("https://dodojo.vercel.app/oauth/authorize", { method: "POST", body: form }),
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("location")).toBeNull();
    expect(dbTables.oauth_authorization_codes).toHaveLength(0);
  });

  test("decision approuve : code d'autorisation cree (hashe) et redirection avec code+state", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("https://dodojo.vercel.app/oauth/authorize", { method: "POST", body: approveForm() }),
    );
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.origin + location.pathname).toBe(REDIRECT_URI);
    const code = location.searchParams.get("code");
    expect(code).toMatch(/^[0-9a-f]{64}$/);
    expect(location.searchParams.get("state")).toBe("xyz");

    expect(dbTables.oauth_authorization_codes).toHaveLength(1);
    const stored = dbTables.oauth_authorization_codes[0];
    expect(stored.code_hash).not.toBe(code);
    expect(stored).toMatchObject({ client_id: CLIENT_ID, user_id: "u1", redirect_uri: REDIRECT_URI });
  });
});
