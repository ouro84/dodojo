import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ACCESS_TOKEN_TTL_MS, expiresAtFromNow, generateOpaqueToken, hashOpaqueToken } from "../../../lib/oauth-tokens";
import { FakeSupabaseClient } from "../../../lib/domain/fake-supabase";

type Row = Record<string, unknown>;

let dbTables: Record<string, Row[]>;
let rpcQuotaResult: boolean;

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => {
    const client = new FakeSupabaseClient(dbTables);
    client.rpcResult = rpcQuotaResult;
    return client;
  },
}));

const NOW = "2026-07-22T12:00:00.000Z";
const ACCESS_TOKEN = generateOpaqueToken();

function stubEnv(): void {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fake.supabase.co");
  vi.stubEnv("NEXT_PRIVATE_KEY_SUPABASE", "fake-service-role-key");
}

function baseTables(expiresAt: string, scope = "tasks:read tasks:write"): Record<string, Row[]> {
  return {
    oauth_tokens: [
      { user_id: "u1", access_token_hash: hashOpaqueToken(ACCESS_TOKEN), expires_at: expiresAt, scope },
    ],
    profiles: [{ id: "u1", timezone: "Europe/Paris" }],
    tasks: [],
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  dbTables = baseTables(expiresAtFromNow(ACCESS_TOKEN_TTL_MS, new Date(NOW)));
  rpcQuotaResult = true;
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

  test("tools/list retourne les tools couverts par le scope tasks:read tasks:write (issue #201, lot 3/4)", async () => {
    const { POST } = await import("./route");
    const response = await POST(mcpRequest({ jsonrpc: "2.0", id: 2, method: "tools/list" }));
    const body = await response.json();
    const names = body.result.tools.map((t: { name: string }) => t.name).sort();
    // Lot 4 (tache 3) ajoute complete_task/set_deadline, lot 4 (tache 4)
    // ajoute move_task - tous requiredScope "tasks:write", couverts par le
    // meme scope que ce test exerce deja. equip_hero (profile:write) reste
    // absent : ce scope ne l'accorde pas.
    expect(names).toEqual([
      "add_task",
      "complete_task",
      "get_boss_status",
      "get_streak",
      "list_tasks",
      "move_task",
      "set_deadline",
    ]);
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

describe("POST /api/mcp - scopes (issue #201)", () => {
  test("tools/list ne renvoie que les tools couverts par le scope du token", async () => {
    dbTables.oauth_tokens[0].scope = "tasks:read";
    const { POST } = await import("./route");
    const response = await POST(mcpRequest({ jsonrpc: "2.0", id: 7, method: "tools/list" }));
    const body = await response.json();
    const names = body.result.tools.map((t: { name: string }) => t.name).sort();
    expect(names).toEqual(["get_boss_status", "get_streak", "list_tasks"]);
  });

  test("tools/call sur add_task avec un token scope tasks:read seul -> isError avec message de scope, pas -32601", async () => {
    dbTables.oauth_tokens[0].scope = "tasks:read";
    const { POST } = await import("./route");
    const response = await POST(
      mcpRequest({
        jsonrpc: "2.0",
        id: 8,
        method: "tools/call",
        params: { name: "add_task", arguments: { title: "Rappeler le client" } },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.error).toBeUndefined();
    expect(body.result.isError).toBe(true);
    // Revue #201 (lot 4 revue finale, finding 4) : convention `<code> : <phrase>` retrofittee
    // ici aussi — ce refus de scope n'emettait auparavant qu'une prose sans
    // code stable a brancher (contrairement aux erreurs du domaine, deja
    // unifiees par lib/mcp-tools.ts).
    expect(body.result.content[0].text).toBe(
      "scope_denied : ce tool necessite le scope tasks:write.",
    );
    expect(dbTables.tasks).toHaveLength(0);
  });
});

describe("POST /api/mcp - throw non rattrape dans un handler (revue finale PR #205, fix 1)", () => {
  test("un fuseau profiles.timezone invalide fait planter le handler cote serveur (RangeError Intl) sans jamais fuiter en HTTP 500", async () => {
    // profiles.timezone est capture cote navigateur a l'onboarding, jamais
    // valide serveur (cf. CLAUDE.md) - une valeur IANA malformee est donc
    // atteignable en pratique. `handleListTasks` (lib/mcp-tools.ts) appelle
    // `userToday` (dayKey -> Intl.DateTimeFormat({ timeZone })) avant meme
    // d'atteindre `localTimeFromIso` : le RangeError part donc de `dayKey`,
    // un cran plus tot que `localTimeFromIso`, mais reste exactement le meme
    // declencheur reel (un fuseau invalide non valide) et traverse la meme
    // absence de try/catch qu'on verifie ici.
    dbTables.profiles[0].timezone = "Not/AZone";
    const { POST } = await import("./route");
    const response = await POST(
      mcpRequest({
        jsonrpc: "2.0",
        id: 10,
        method: "tools/call",
        params: { name: "list_tasks", arguments: {} },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.error).toBeUndefined();
    expect(body.result.isError).toBe(true);
    // Revue #201 (lot 4 revue finale, finding 4) : ce site emettait un code nu
    // ("internal_error"), pas la forme "<code> : <phrase>" unifiee partout
    // ailleurs — seul `isError` etait verifie jusqu'ici, jamais le message.
    expect(body.result.content[0].text).toBe("internal_error : erreur interne du serveur MCP.");
  });
});

describe("POST /api/mcp - rate limit (issue #201)", () => {
  test("un token ayant atteint son quota recoit une erreur rate_limited, jamais un 500", async () => {
    rpcQuotaResult = false;
    const { POST } = await import("./route");
    const response = await POST(
      mcpRequest({
        jsonrpc: "2.0",
        id: 9,
        method: "tools/call",
        params: { name: "add_task", arguments: { title: "Rappeler le client" } },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(response.status).not.toBe(500);
    expect(body.error.message).toBe("rate_limited");
    expect(dbTables.tasks).toHaveLength(0);
  });
});
