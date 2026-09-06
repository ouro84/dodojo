# Lot 2 — Socle MCP : scopes, registry, consentement, rate limit (issue #201)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Durcir le serveur MCP existant (`app/api/mcp/route.ts`, un seul tool `add_task`) avec un vrai contrôle d'accès — 4 scopes OAuth, un registry de tools extensible, un écran de consentement honnête, un rate limit autoritaire en base — sans ajouter de nouveau tool métier. `add_task` migre vers le nouveau registry, inchangé fonctionnellement.

**Architecture:** `lib/oauth-scopes.ts` (parsing/validation), `lib/mcp-tools.ts` (registry de tools, scope requis par tool), `lib/mcp-rate-limit.ts` (quota autoritaire via RPC Postgres), `lib/oauth-consent-page.ts` réécrit (scopes affichés en clair). `app/api/mcp/route.ts` route désormais via le registry au lieu d'une chaîne de `if`.

**Tech Stack:** TypeScript strict, Next.js 16 App Router (Route Handlers), Supabase (migrations SQL + RPC), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-05-mcp-catalogue-tools-design.md` — sections D2 (scopes), D3 (registry), D4 (rate limit), D5 (consentement). D6 (catalogue de 10 tools) est hors scope de ce lot : seul `add_task` (déjà existant, argument `title` seul) est migré vers le registry — pas d'argument `parent_id`/`day` (ceux-là arrivent en PR4).

## Global Constraints

- **TypeScript strict :** interdiction d'`any`.
- **Client Supabase :** `SupabaseClient` de `@supabase/supabase-js` partout où un client traverse une frontière de fonction — jamais `ReturnType<typeof createClient>` (cf. lot 1).
- **Scopes par défaut :** une requête `/oauth/authorize` sans paramètre `scope` accorde `tasks:read tasks:write`, jamais `profile:write`. Un scope inconnu est **refusé** (page d'erreur), jamais filtré silencieusement.
- **`tools/list` filtre par scope du token** — un agent ne voit que les tools qu'il peut appeler.
- **Rate limit :** défense en profondeur dans cet ordre — garde IP en mémoire (`lib/rate-limit.ts` existant) à 60 req/min/IP, PUIS `consume_mcp_quota` (RPC Postgres, autoritaire) à 120 req/min/utilisateur. Le compteur ne doit **jamais** vivre sur `oauth_tokens` — cette table est vidée à chaque rotation de refresh token (`app/oauth/token/route.ts`, `handleRefreshTokenGrant`), un compteur qui y vivrait serait remis à zéro par un simple refresh.
- **Migration :** timestamp strictement postérieur à `20260810210000` (dernière migration sur `main` avant ce lot). Vérifier `npx supabase migration list --linked` avant tout merge (piège documenté : `supabase db push` ignore silencieusement une migration dont le timestamp est antérieur à une migration déjà appliquée).
- **`app/actions/tasks.test.ts` n'est pas concerné par ce lot** (ce lot ne touche pas `app/actions/`) — aucune contrainte spécifique ici, mais ne jamais le modifier par réflexe si un chemin de code le traverse par accident.
- **Commits :** Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`), message en français.
- **Jamais de commit direct sur `main`.** Branche : `feat/issue-201-mcp-socle-oauth`.
- **CHANGELOG.md / CLAUDE.md :** mise à jour dans la dernière tâche, comme le lot 1.

### Contexte hérité de l'existant (vérifié directement dans le code avant d'écrire ce plan)

- `app/oauth/authorize/route.ts` (GET+POST) construit déjà `AuthorizeParams.scope` avec un défaut **codé en dur** `"tasks:write"` (ligne `scope: searchParams.get("scope") ?? "tasks:write"` en GET, `String(form.get("scope") ?? "tasks:write")` en POST) — ce défaut doit changer pour `"tasks:read tasks:write"` (D2 du spec), et le POST doit désormais **valider** le scope (actuellement il ne fait que le faire transiter tel quel vers `oauth_authorization_codes.scope`).
- `lib/oauth-metadata.ts` → `buildProtectedResourceMetadata` a `scopes_supported: ["tasks:write"]` en dur — passe à 4 valeurs.
- `lib/oauth-consent-page.ts` → `renderConsentPage` affiche déjà `params.scope` brut (`<p>Portee demandee : {scope}</p>`) mais pas de traduction en droits lisibles, et le titre dit "veut ajouter des taches a ta place" (à corriger, D5).
- `app/api/mcp/route.ts` → `handleToolsCall` est une seule branche `if (toolName !== ADD_TASK_TOOL.name)`. `buildToolsListResult()` (`lib/mcp-protocol.ts`) renvoie `{ tools: [ADD_TASK_TOOL] }` sans filtrage — il n'y a qu'un tool donc rien à filtrer aujourd'hui, mais le registry doit être prêt pour PR3/PR4.
- `app/oauth/token/route.ts` → `issueTokenResponse(supabase, clientId, userId, scope)` propage déjà le `scope` de la ligne `oauth_authorization_codes`/`oauth_tokens` d'origine tel quel — aucun changement necessaire ici, le scope voyage déjà correctement du code d'autorisation au token.
- `app/api/mcp/route.ts` résout déjà le token et son `user_id` (`oauth_tokens.user_id`) — il faut aussi lire `oauth_tokens.scope` pour le contrôle d'accès (actuellement le `select` ne prend que `user_id, expires_at`).

---

## Task 1 : Scopes OAuth (`lib/oauth-scopes.ts`)

**Files:**
- Create: `lib/oauth-scopes.ts`
- Create: `lib/oauth-scopes.test.ts`

**Interfaces:**
- Consumes: rien (module autonome)
- Produces:

```ts
export type OAuthScope = "tasks:read" | "tasks:write" | "profile:read" | "profile:write";
export const ALL_SCOPES: readonly OAuthScope[];
export const DEFAULT_SCOPE = "tasks:read tasks:write";

export function parseScopeString(raw: string): OAuthScope[] | { error: string };
export function hasScope(grantedScope: string, required: OAuthScope): boolean;
```

- [ ] **Step 1 : Écrire les tests (RED)**

```ts
import { describe, expect, test } from "vitest";
import { ALL_SCOPES, DEFAULT_SCOPE, hasScope, parseScopeString } from "./oauth-scopes";

describe("parseScopeString", () => {
  test("accepte les 4 scopes connus, espace-separes", () => {
    const res = parseScopeString("tasks:read tasks:write");
    expect(res).toEqual(["tasks:read", "tasks:write"]);
  });

  test("refuse un scope inconnu, jamais un filtrage silencieux", () => {
    const res = parseScopeString("tasks:read admin:everything");
    expect(res).toEqual({ error: "Portee inconnue : admin:everything" });
  });

  test("chaine vide -> tableau vide (l'appelant decide du defaut)", () => {
    expect(parseScopeString("")).toEqual([]);
  });

  test("espaces multiples ignores", () => {
    const res = parseScopeString("tasks:read  tasks:write");
    expect(res).toEqual(["tasks:read", "tasks:write"]);
  });
});

describe("hasScope", () => {
  test("scope accorde -> true", () => {
    expect(hasScope("tasks:read tasks:write", "tasks:read")).toBe(true);
  });

  test("scope non accorde -> false", () => {
    expect(hasScope("tasks:read tasks:write", "profile:write")).toBe(false);
  });

  test("DEFAULT_SCOPE n'accorde jamais profile:write", () => {
    expect(hasScope(DEFAULT_SCOPE, "profile:write")).toBe(false);
  });
});

test("ALL_SCOPES contient exactement les 4 scopes du spec D2", () => {
  expect([...ALL_SCOPES].sort()).toEqual(
    ["profile:read", "profile:write", "tasks:read", "tasks:write"].sort(),
  );
});
```

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

Run : `npx vitest run lib/oauth-scopes.test.ts`
Attendu : FAIL — `Failed to resolve import "./oauth-scopes"`.

- [ ] **Step 3 : Implémenter**

```ts
export type OAuthScope = "tasks:read" | "tasks:write" | "profile:read" | "profile:write";

export const ALL_SCOPES: readonly OAuthScope[] = [
  "tasks:read",
  "tasks:write",
  "profile:read",
  "profile:write",
];

// D2 du spec : une requete /oauth/authorize sans parametre scope accorde ces
// deux-la, JAMAIS profile:write - un client qui ne demande rien n'obtient pas
// le droit de modifier l'equipement.
export const DEFAULT_SCOPE = "tasks:read tasks:write";

function isKnownScope(value: string): value is OAuthScope {
  return (ALL_SCOPES as readonly string[]).includes(value);
}

// Scope inconnu -> refus explicite, jamais un filtrage silencieux (D2) : un
// client qui croit avoir obtenu un droit qu'il n'a pas produit des erreurs
// incomprehensibles plus tard.
export function parseScopeString(raw: string): OAuthScope[] | { error: string } {
  const trimmed = raw.trim();
  if (trimmed === "") return [];
  const tokens = trimmed.split(/\s+/);
  for (const token of tokens) {
    if (!isKnownScope(token)) {
      return { error: `Portee inconnue : ${token}` };
    }
  }
  return tokens as OAuthScope[];
}

export function hasScope(grantedScope: string, required: OAuthScope): boolean {
  const parsed = parseScopeString(grantedScope);
  if ("error" in parsed) return false;
  return parsed.includes(required);
}
```

- [ ] **Step 4 : Lancer les tests, confirmer GREEN**

Run : `npx vitest run lib/oauth-scopes.test.ts`
Attendu : PASS (8 tests).

- [ ] **Step 5 : Commit**

```bash
git add lib/oauth-scopes.ts lib/oauth-scopes.test.ts
git commit -m "feat: ajouter le parsing et la validation des scopes OAuth (issue #201)"
```

---

## Task 2 : Rate limit autoritaire (migration + `lib/mcp-rate-limit.ts`)

**Files:**
- Create: `supabase/migrations/20260906090000_create_mcp_rate_limit.sql`
- Create: `lib/mcp-rate-limit.ts`
- Create: `lib/mcp-rate-limit.test.ts`

**Interfaces:**
- Consumes: `SupabaseClient` (`@supabase/supabase-js`)
- Produces:

```ts
export async function consumeMcpQuota(
  supabase: SupabaseClient,
  userId: string,
  limit?: number,
  windowSeconds?: number,
): Promise<boolean> // true = autorise, false = quota depasse
```

- [ ] **Step 1 : Écrire la migration**

Vérifier d'abord que le timestamp est bien postérieur à la dernière migration :

```bash
ls supabase/migrations/ | tail -3
```

Attendu : `20260810210000_remove_hero_hp_heal.sql` est la dernière. Créer `supabase/migrations/20260906090000_create_mcp_rate_limit.sql` :

```sql
-- Issue #201 : rate limit autoritaire sur /api/mcp. Un compteur pose sur
-- oauth_tokens serait efface a chaque rotation de refresh token
-- (handleRefreshTokenGrant, app/oauth/token/route.ts, supprime puis recree la
-- ligne) - table separee, cle user_id, pour survivre a la rotation.
create table public.mcp_rate_limit (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  window_started_at timestamptz not null default now(),
  request_count int not null default 0
);

alter table public.mcp_rate_limit enable row level security;
-- Aucune policy : ecriture/lecture exclusivement service-role (meme patron
-- que l'ecriture sur oauth_tokens), /api/mcp n'a jamais de cookie de session.

-- Fonction atomique : lit + incremente + reset de fenetre en un seul aller-
-- retour, evite la course lecture-puis-ecriture d'une implementation cote
-- application (deux requetes concurrentes liraient le meme compteur avant
-- que l'une des deux n'ecrive).
create or replace function public.consume_mcp_quota(
  p_user_id uuid,
  p_limit int,
  p_window_seconds int
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_started_at timestamptz;
  v_request_count int;
  v_now timestamptz := now();
begin
  insert into public.mcp_rate_limit (user_id, window_started_at, request_count)
  values (p_user_id, v_now, 1)
  on conflict (user_id) do nothing;

  select window_started_at, request_count
    into v_window_started_at, v_request_count
    from public.mcp_rate_limit
    where user_id = p_user_id
    for update;

  if v_now - v_window_started_at > (p_window_seconds || ' seconds')::interval then
    update public.mcp_rate_limit
      set window_started_at = v_now, request_count = 1
      where user_id = p_user_id;
    return true;
  end if;

  if v_request_count >= p_limit then
    return false;
  end if;

  update public.mcp_rate_limit
    set request_count = request_count + 1
    where user_id = p_user_id;
  return true;
end;
$$;
```

⚠️ Le premier `insert ... on conflict do nothing` gère le cas « première requête de cet utilisateur, aucune ligne encore » sans dupliquer la logique de reset — la ligne insérée démarre à `request_count = 1`, puis le `select ... for update` qui suit la relit immédiatement et la traite normalement (elle vient d'être créée, donc `v_now - window_started_at` est proche de zéro, la branche de reset n'est pas prise, la branche de decompte non plus car `request_count(1) >= limit` est faux sauf si `limit <= 1`) — se relire après l'insert plutôt que de retourner `true` immédiatement évite un double chemin de retour à maintenir.

- [ ] **Step 2 : Appliquer la migration localement et vérifier**

```bash
npx supabase migration list --linked
```

Si des credentials Supabase locaux/liés ne sont pas disponibles dans cet environnement d'exécution, documenter cette étape comme à vérifier manuellement avant merge (ne pas bloquer sur l'absence de credentials CI/local) et continuer.

- [ ] **Step 3 : Écrire les tests unitaires de `lib/mcp-rate-limit.ts` (RED)**

```ts
import { describe, expect, test, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { consumeMcpQuota } from "./mcp-rate-limit";

function fakeRpcClient(returnValue: boolean | { error: string }): {
  client: SupabaseClient;
  calls: Array<{ fn: string; args: unknown }>;
} {
  const calls: Array<{ fn: string; args: unknown }> = [];
  const client = {
    rpc: (fn: string, args: unknown) => {
      calls.push({ fn, args });
      if (typeof returnValue === "object") {
        return Promise.resolve({ data: null, error: returnValue.error });
      }
      return Promise.resolve({ data: returnValue, error: null });
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe("consumeMcpQuota", () => {
  test("appelle consume_mcp_quota avec les bons parametres par defaut", async () => {
    const { client, calls } = fakeRpcClient(true);
    const allowed = await consumeMcpQuota(client, "u1");
    expect(allowed).toBe(true);
    expect(calls).toEqual([
      { fn: "consume_mcp_quota", args: { p_user_id: "u1", p_limit: 120, p_window_seconds: 60 } },
    ]);
  });

  test("renvoie false quand le quota est depasse", async () => {
    const { client } = fakeRpcClient(false);
    const allowed = await consumeMcpQuota(client, "u1");
    expect(allowed).toBe(false);
  });

  test("une erreur RPC est fail-open (ne bloque jamais un appel legitime sur une panne de la fonction elle-meme)", async () => {
    const { client } = fakeRpcClient({ error: "connection lost" });
    const allowed = await consumeMcpQuota(client, "u1");
    expect(allowed).toBe(true);
  });

  test("accepte des limites personnalisees", async () => {
    const { client, calls } = fakeRpcClient(true);
    await consumeMcpQuota(client, "u1", 5, 30);
    expect(calls[0].args).toEqual({ p_user_id: "u1", p_limit: 5, p_window_seconds: 30 });
  });
});
```

- [ ] **Step 4 : Lancer les tests pour vérifier qu'ils échouent**

Run : `npx vitest run lib/mcp-rate-limit.test.ts`
Attendu : FAIL — module absent.

- [ ] **Step 5 : Implémenter**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

// Defense en profondeur : garde IP en memoire (lib/rate-limit.ts, best-effort)
// PUIS ce quota autoritaire par utilisateur (D4 du spec). Fail-open sur une
// erreur RPC : une panne de la fonction elle-meme (migration pas encore
// appliquee, table absente) ne doit jamais bloquer un appel MCP legitime -
// le rate limit est une protection contre l'abus, pas un point unique de
// defaillance pour le service.
export async function consumeMcpQuota(
  supabase: SupabaseClient,
  userId: string,
  limit = 120,
  windowSeconds = 60,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("consume_mcp_quota", {
    p_user_id: userId,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) return true;
  return data === true;
}
```

- [ ] **Step 6 : Lancer les tests, confirmer GREEN**

Run : `npx vitest run lib/mcp-rate-limit.test.ts`
Attendu : PASS (4 tests).

- [ ] **Step 7 : Commit**

```bash
git add supabase/migrations/20260906090000_create_mcp_rate_limit.sql lib/mcp-rate-limit.ts lib/mcp-rate-limit.test.ts
git commit -m "feat: ajouter le rate limit autoritaire mcp_rate_limit (issue #201)"
```

---

## Task 3 : Registry de tools (`lib/mcp-tools.ts`) + câblage dans `app/api/mcp/route.ts`

**Files:**
- Create: `lib/mcp-tools.ts`
- Create: `lib/mcp-tools.test.ts`
- Modify: `app/api/mcp/route.ts`
- Modify: `app/api/mcp/route.test.ts`

**Interfaces:**
- Consumes: `OAuthScope`/`hasScope` (Task 1), `ADD_TASK_TOOL`/`buildAddTaskToolResult`/`buildToolErrorResult`/`McpTool`/`McpToolResult` (`lib/mcp-protocol.ts`, déjà existant), `insertTaskForUser` (`lib/task-insertion.ts`, déjà existant), `validateTaskTitle` (`lib/task-title.ts`, déjà existant), `consumeMcpQuota` (Task 2)
- Produces:

```ts
export interface McpContext {
  supabase: SupabaseClient;
  userId: string;
  timezone: string;
}

export interface McpToolDef {
  tool: McpTool;
  requiredScope: OAuthScope;
  parseArgs: (args: Record<string, unknown>) => Record<string, unknown> | { error: string };
  handler: (ctx: McpContext, args: Record<string, unknown>) => Promise<McpToolResult>;
}

export const TOOL_REGISTRY: readonly McpToolDef[];
export function toolsForScope(grantedScope: string): McpTool[];
export function findTool(name: string): McpToolDef | undefined;
```

- [ ] **Step 1 : Écrire les tests (RED)**

```ts
import { describe, expect, test, vi } from "vitest";
import { findTool, toolsForScope, TOOL_REGISTRY } from "./mcp-tools";

describe("TOOL_REGISTRY", () => {
  test("contient exactement add_task pour ce lot", () => {
    expect(TOOL_REGISTRY.map((t) => t.tool.name)).toEqual(["add_task"]);
  });

  test("add_task requiert tasks:write", () => {
    const def = findTool("add_task");
    expect(def?.requiredScope).toBe("tasks:write");
  });
});

describe("findTool", () => {
  test("renvoie undefined pour un tool inconnu", () => {
    expect(findTool("delete_everything")).toBeUndefined();
  });
});

describe("toolsForScope", () => {
  test("filtre les tools selon le scope accorde - add_task visible avec tasks:write", () => {
    const tools = toolsForScope("tasks:read tasks:write");
    expect(tools.map((t) => t.name)).toContain("add_task");
  });

  test("add_task invisible sans tasks:write", () => {
    const tools = toolsForScope("tasks:read");
    expect(tools.map((t) => t.name)).not.toContain("add_task");
  });
});

describe("add_task parseArgs", () => {
  test("refuse un titre absent", () => {
    const def = findTool("add_task")!;
    const res = def.parseArgs({});
    expect(res).toEqual({ error: "title est requis (string)." });
  });

  test("refuse un titre non-string", () => {
    const def = findTool("add_task")!;
    const res = def.parseArgs({ title: 42 });
    expect(res).toEqual({ error: "title est requis (string)." });
  });
});
```

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

Run : `npx vitest run lib/mcp-tools.test.ts`
Attendu : FAIL — module absent.

- [ ] **Step 3 : Lire l'implémentation actuelle de `handleToolsCall`**

Lire `app/api/mcp/route.ts` en entier (le fichier fait ~154 lignes) pour reprendre **exactement** la logique de validation actuelle d'`add_task` (titre requis, `validateTaskTitle`, résolution du fuseau via `profiles.timezone` avec fallback `"UTC"`, appel à `insertTaskForUser`, catch générique → `"insert_task_failed"`).

- [ ] **Step 4 : Implémenter `lib/mcp-tools.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ADD_TASK_TOOL,
  buildAddTaskToolResult,
  buildToolErrorResult,
  type McpTool,
  type McpToolResult,
} from "./mcp-protocol";
import { insertTaskForUser } from "./task-insertion";
import { validateTaskTitle } from "./task-title";
import { hasScope, type OAuthScope } from "./oauth-scopes";

export interface McpContext {
  supabase: SupabaseClient;
  userId: string;
  timezone: string;
}

export interface McpToolDef {
  tool: McpTool;
  requiredScope: OAuthScope;
  parseArgs: (args: Record<string, unknown>) => Record<string, unknown> | { error: string };
  handler: (ctx: McpContext, args: Record<string, unknown>) => Promise<McpToolResult>;
}

function parseAddTaskArgs(args: Record<string, unknown>): Record<string, unknown> | { error: string } {
  const rawTitle = args.title;
  if (typeof rawTitle !== "string") {
    return { error: "title est requis (string)." };
  }
  return { title: rawTitle };
}

async function handleAddTask(ctx: McpContext, args: Record<string, unknown>): Promise<McpToolResult> {
  const validation = validateTaskTitle(args.title as string);
  if ("error" in validation) {
    return buildToolErrorResult(validation.error);
  }

  try {
    const outcome = await insertTaskForUser(ctx.supabase, {
      userId: ctx.userId,
      title: validation.title,
      timezone: ctx.timezone,
    });
    return buildAddTaskToolResult(outcome);
  } catch {
    return buildToolErrorResult("insert_task_failed");
  }
}

// Registry extensible : PR3 (lecture) et PR4 (ecriture) ajouteront leurs
// entrees ici, jamais une nouvelle chaine de if dans app/api/mcp/route.ts.
export const TOOL_REGISTRY: readonly McpToolDef[] = [
  {
    tool: ADD_TASK_TOOL,
    requiredScope: "tasks:write",
    parseArgs: parseAddTaskArgs,
    handler: handleAddTask,
  },
];

export function findTool(name: string): McpToolDef | undefined {
  return TOOL_REGISTRY.find((def) => def.tool.name === name);
}

// tools/list ne doit exposer que ce qu'un agent peut reellement appeler -
// sinon il tente, echoue, et brule des tours (D3.1 du spec).
export function toolsForScope(grantedScope: string): McpTool[] {
  return TOOL_REGISTRY.filter((def) => hasScope(grantedScope, def.requiredScope)).map(
    (def) => def.tool,
  );
}
```

- [ ] **Step 5 : Lancer les tests, confirmer GREEN**

Run : `npx vitest run lib/mcp-tools.test.ts`
Attendu : PASS (7 tests).

- [ ] **Step 6 : Lire `app/api/mcp/route.test.ts` en entier**

Ce fichier existe déjà et couvre le comportement actuel (`FakeQueryBuilder`, résolution du token, 401 sur token absent/expiré, `tools/list`, `tools/call` sur `add_task`). Il devra être étendu (pas remplacé) pour couvrir : lecture du `scope` du token, filtrage de `tools/list`, refus d'un tool hors scope, et l'appel à `consumeMcpQuota`. Ne rien casser de ce qui existe déjà.

- [ ] **Step 7 : Réécrire `app/api/mcp/route.ts`**

Remplacer le contenu du fichier par :

```ts
import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { hashOpaqueToken, isExpired } from "../../../lib/oauth-tokens";
import { consumeMcpQuota } from "../../../lib/mcp-rate-limit";
import { findTool, toolsForScope, type McpContext } from "../../../lib/mcp-tools";
import {
  buildInitializeResult,
  buildToolErrorResult,
  errorResponse,
  parseJsonRpcRequest,
  successResponse,
  JSON_RPC_ERROR_INVALID_PARAMS,
  JSON_RPC_ERROR_METHOD_NOT_FOUND,
  type JsonRpcRequest,
} from "../../../lib/mcp-protocol";

// hashOpaqueToken utilise node:crypto - pas compatible edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface OAuthTokenRow {
  user_id: string;
  expires_at: string;
  scope: string;
}

interface ProfileTimezoneRow {
  timezone: string;
}

function extractBearerToken(header: string | null): string | null {
  if (!header) return null;
  const [scheme, value] = header.split(" ");
  if (scheme !== "Bearer" || !value) return null;
  return value;
}

// 401 avec WWW-Authenticate pointant la metadonnee RFC 9728 : c'est ainsi
// qu'un client MCP conforme decouvre le serveur d'autorisation associe a
// cette ressource protegee.
function unauthorized(request: Request): Response {
  const origin = new URL(request.url).origin;
  return new NextResponse(null, {
    status: 401,
    headers: { "WWW-Authenticate": 'Bearer resource_metadata="' + origin + '/.well-known/oauth-protected-resource"' },
  });
}

function serviceClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.NEXT_PRIVATE_KEY_SUPABASE;
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
}

// US-22/issue #201 : serveur MCP (Resource Server), transport Streamable
// HTTP. Verifie le Bearer token (hash + expiration), applique un rate limit
// autoritaire par utilisateur, puis route via le registry de tools
// (lib/mcp-tools.ts) filtre par le scope du token.
export async function POST(request: Request): Promise<Response> {
  const token = extractBearerToken(request.headers.get("authorization"));
  if (!token) return unauthorized(request);

  const supabase = serviceClient();
  if (!supabase) {
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }

  const { data: tokenRow } = await supabase
    .from("oauth_tokens")
    .select("user_id, expires_at, scope")
    .eq("access_token_hash", hashOpaqueToken(token))
    .maybeSingle();

  const resolvedToken = tokenRow as OAuthTokenRow | null;
  if (!resolvedToken || isExpired(resolvedToken.expires_at)) {
    return unauthorized(request);
  }

  const allowed = await consumeMcpQuota(supabase, resolvedToken.user_id);
  if (!allowed) {
    return NextResponse.json(errorResponse(null, JSON_RPC_ERROR_INVALID_PARAMS, "rate_limited"), { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(errorResponse(null, JSON_RPC_ERROR_INVALID_PARAMS, "invalid_json"), { status: 400 });
  }

  const rpcRequest = parseJsonRpcRequest(body);
  if (!rpcRequest) {
    return NextResponse.json(
      errorResponse(null, JSON_RPC_ERROR_INVALID_PARAMS, "invalid_jsonrpc_request"),
      { status: 400 },
    );
  }

  if (rpcRequest.method === "notifications/initialized") {
    return new NextResponse(null, { status: 202 });
  }
  if (rpcRequest.method === "initialize") {
    return NextResponse.json(successResponse(rpcRequest.id, buildInitializeResult()));
  }
  if (rpcRequest.method === "tools/list") {
    return NextResponse.json(successResponse(rpcRequest.id, { tools: toolsForScope(resolvedToken.scope) }));
  }
  if (rpcRequest.method === "tools/call") {
    return handleToolsCall(supabase, resolvedToken.user_id, resolvedToken.scope, rpcRequest);
  }

  return NextResponse.json(
    errorResponse(rpcRequest.id, JSON_RPC_ERROR_METHOD_NOT_FOUND, "Methode inconnue : " + rpcRequest.method),
  );
}

async function handleToolsCall(
  supabase: SupabaseClient,
  userId: string,
  grantedScope: string,
  rpcRequest: JsonRpcRequest,
): Promise<Response> {
  const toolName = rpcRequest.params?.name;
  const args = (rpcRequest.params?.arguments as Record<string, unknown> | undefined) ?? {};

  const def = findTool(String(toolName));
  if (!def) {
    return NextResponse.json(
      errorResponse(rpcRequest.id, JSON_RPC_ERROR_METHOD_NOT_FOUND, "Tool inconnu : " + String(toolName)),
    );
  }

  const { hasScope } = await import("../../../lib/oauth-scopes");
  if (!hasScope(grantedScope, def.requiredScope)) {
    return NextResponse.json(
      successResponse(rpcRequest.id, buildToolErrorResult(`Ce tool necessite le scope ${def.requiredScope}.`)),
    );
  }

  const parsedArgs = def.parseArgs(args);
  if ("error" in parsedArgs) {
    return NextResponse.json(successResponse(rpcRequest.id, buildToolErrorResult(parsedArgs.error)));
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", userId)
    .maybeSingle();
  const timezone = (profile as ProfileTimezoneRow | null)?.timezone ?? "UTC";

  const ctx: McpContext = { supabase, userId, timezone };
  const result = await def.handler(ctx, parsedArgs);
  return NextResponse.json(successResponse(rpcRequest.id, result));
}
```

⚠️ Le `await import("../../../lib/oauth-scopes")` dynamique dans `handleToolsCall` est un pis-aller — préférer un import statique `import { hasScope } from "../../../lib/oauth-scopes";` en tête de fichier (ajouté à la liste d'imports du haut) plutôt que l'import dynamique inline montré ci-dessus, qui n'a été écrit ainsi que pour rester lisible dans ce diff de plan. Utiliser l'import statique dans le code réel.

Points de vérification en écrivant ce fichier :
- `JSON_RPC_ERROR_INVALID_PARAMS` est réutilisé pour `rate_limited` (pas de nouveau code JSON-RPC créé — un rate limit est un problème de requête, pas de méthode) ; si un code plus spécifique existe déjà dans `lib/mcp-protocol.ts`, l'utiliser à la place et documenter le choix dans le rapport de tâche.
- Le contrôle de scope renvoie une réponse JSON-RPC **succès** (`successResponse`) contenant un `McpToolResult` avec `isError: true` — jamais une erreur JSON-RPC de transport (D6.3 du spec).
- La résolution du fuseau horaire est désormais faite une fois dans `handleToolsCall`, après la vérification de scope et le parsing des arguments (pas avant) — évite une requête `profiles` inutile si le tool est finalement rejeté pour scope insuffisant ou arguments invalides.

- [ ] **Step 8 : Étendre `app/api/mcp/route.test.ts`**

Ajouter, sans modifier les tests existants :

```ts
test("tools/list ne renvoie que les tools couverts par le scope du token", async () => {
  // seeder un token avec scope "tasks:read" uniquement (pas tasks:write)
  // -> tools/list doit renvoyer une liste vide (add_task exige tasks:write)
});

test("tools/call sur add_task avec un token scope tasks:read seul -> isError avec message de scope, pas -32601", async () => {
  // ...
});

test("un token ayant atteint son quota recoit une erreur rate_limited, jamais un 500", async () => {
  // ...
});
```

Adapter le `FakeQueryBuilder` existant si nécessaire pour supporter `.rpc(...)` (actuellement il ne gère probablement que `.from(...)` — vérifier en lisant le fichier, l'étendre a minima pour que `supabase.rpc("consume_mcp_quota", ...)` renvoie `{ data: true, error: null }` par défaut dans les tests qui ne testent pas spécifiquement le rate limit).

- [ ] **Step 9 : Lancer tous les tests concernés**

```bash
npx vitest run lib/mcp-tools.test.ts app/api/mcp/route.test.ts lib/mcp-rate-limit.test.ts
npx tsc --noEmit
```

Attendu : tout PASS.

- [ ] **Step 10 : Commit**

```bash
git add lib/mcp-tools.ts lib/mcp-tools.test.ts app/api/mcp/route.ts app/api/mcp/route.test.ts
git commit -m "feat: registry de tools MCP avec controle de scope et rate limit (issue #201)"
```

---

## Task 4 : Consentement piloté par les scopes + métadonnées OAuth

**Files:**
- Modify: `lib/oauth-consent-page.ts`
- Modify: `lib/oauth-consent-page.test.ts` (si présent — sinon le créer)
- Modify: `lib/oauth-metadata.ts`
- Modify: `lib/oauth-metadata.test.ts` (si présent)
- Modify: `app/oauth/authorize/route.ts`
- Modify: `app/oauth/authorize/route.test.ts` (si présent — sinon vérifier son absence et ne pas en créer un hors scope de cette tâche si un fichier de test équivalent n'existe pas déjà)

**Interfaces:**
- Consumes: `ALL_SCOPES`/`DEFAULT_SCOPE`/`parseScopeString` (Task 1)
- Produces: aucune nouvelle fonction exportée — modification de fonctions existantes

- [ ] **Step 1 : Vérifier l'existence de fichiers de test pour ces trois modules**

```bash
ls lib/oauth-consent-page.test.ts lib/oauth-metadata.test.ts app/oauth/authorize/route.test.ts 2>&1
```

Pour chaque fichier existant, le lire en entier avant de modifier le module correspondant — préserver tous les tests déjà là, dont potentiellement des assertions sur le texte HTML actuel du consentement.

- [ ] **Step 2 : Mettre à jour `lib/oauth-metadata.ts`**

```ts
scopes_supported: ["tasks:read", "tasks:write", "profile:read", "profile:write"],
```

(remplace la valeur actuelle `["tasks:write"]`). Si un test existant vérifie l'ancienne valeur, l'ajuster — ce n'est PAS un fichier sous contrainte "jamais modifier" (cette contrainte ne s'applique qu'à `app/actions/tasks.test.ts`, propre au lot 1).

- [ ] **Step 3 : Réécrire `renderConsentPage` dans `lib/oauth-consent-page.ts`**

Le texte actuel (`"{clientName} veut ajouter des taches a ta place"`) doit devenir une liste de droits dérivée du scope réellement demandé. Utiliser `parseScopeString` (Task 1) pour transformer la chaîne de scope en tableau, puis mapper chaque scope vers une ligne de description :

```ts
const SCOPE_DESCRIPTIONS: Record<OAuthScope, string> = {
  "tasks:read": "Lire tes tâches, ton Boss et ta série",
  "tasks:write": "Créer et cocher des tâches",
  "profile:read": "Voir ta progression",
  "profile:write": "Changer ton combattant équipé",
};
```

Le titre devient `"{clientName} veut accéder à ton compte Dodojo"` (accents corrects — corriger au passage l'absence d'accents du fichier actuel, cf. minor du spec D5). L'avertissement existant sur l'identité non vérifiée du client **reste identique** (ne pas le retirer). Chaque droit s'affiche comme une ligne de liste (`<li>`), pas un paragraphe unique. Si `parseScopeString(params.scope)` renvoie une erreur (scope invalide déjà passé jusqu'ici — ne devrait normalement plus arriver après Task 4 Step 4, mais rester défensif), afficher la portée brute en repli plutôt que de planter le rendu.

- [ ] **Step 4 : Valider le scope dans `app/oauth/authorize/route.ts`**

GET : remplacer `scope: searchParams.get("scope") ?? "tasks:write"` par `scope: searchParams.get("scope") ?? DEFAULT_SCOPE` (import `DEFAULT_SCOPE` depuis `../../../lib/oauth-scopes`).

Ajouter la validation dans `validateAuthorizeRequest` (ou juste après son appel dans le `GET` et le `POST` — choisir l'un des deux emplacements, mais un seul, pour ne pas dupliquer la logique) : appeler `parseScopeString(params.scope)` ; si `"error" in résultat`, retourner une page d'erreur (`errorPageResponse`) avec le message de l'erreur — jamais de redirection vers `redirect_uri` sur un scope invalide (cohérent avec la garde anti-open-redirect déjà en place sur `client_id`/`redirect_uri` invalides).

POST : même défaut `DEFAULT_SCOPE`, même validation avant l'insertion dans `oauth_authorization_codes` (le POST insère déjà `scope: params.scope` tel quel — s'assurer que la validation intervient AVANT cet insert, pas après).

- [ ] **Step 5 : Lancer tous les tests**

```bash
npx vitest run lib/oauth-consent-page.test.ts lib/oauth-metadata.test.ts app/oauth/authorize/route.test.ts 2>&1 || true
npm run test
npx tsc --noEmit
```

(le `|| true` couvre le cas où un ou plusieurs de ces fichiers de test n'existent pas encore — ne pas laisser échouer la commande sur un fichier absent, mais bien lancer `npm run test` ensuite pour la suite complète).

- [ ] **Step 6 : Commit**

```bash
git add lib/oauth-consent-page.ts lib/oauth-metadata.ts app/oauth/authorize/route.ts
git add lib/oauth-consent-page.test.ts lib/oauth-metadata.test.ts app/oauth/authorize/route.test.ts 2>/dev/null || true
git commit -m "feat: ecran de consentement pilote par les scopes + validation (issue #201)"
```

---

## Task 5 : e2e handshake complet + purge des tables OAuth

**Files:**
- Create: `e2e/mcp-oauth.spec.ts`
- Modify: `e2e/fixtures.ts` (`purgeE2eAccountState`)

**Interfaces:**
- Consumes: `login`/`configuredE2eWorkerSuffixes`/`getE2eAdmin`-equivalent (déjà exportés par `e2e/fixtures.ts`), `generateCodeVerifier`/`deriveCodeChallenge` (`lib/pkce.ts`, déjà existant)

- [ ] **Step 1 : Étendre `purgeE2eAccountState` (`e2e/fixtures.ts`)**

Lire la fonction actuelle en entier (déjà lue lors de la préparation de ce plan — elle purge `tasks`/`recurring_templates`/`daily_boss`/`day_results`/`unlocked_achievements`/`unlocked_skins`/`unlocked_heroes` puis reseed `fire_knight` et reset plusieurs colonnes `profiles`). Ajouter, avant le reseed final :

```ts
await admin.from("oauth_tokens").delete().eq("user_id", uid);
await admin.from("oauth_authorization_codes").delete().eq("user_id", uid);
await admin.from("mcp_rate_limit").delete().eq("user_id", uid);
// oauth_clients n'a PAS de colonne user_id (clients enregistres
// dynamiquement, RFC 7591) - purge par prefixe de nom, pas par utilisateur.
// Les specs e2e qui enregistrent un client MCP doivent le nommer "e2e-...".
await admin.from("oauth_clients").delete().ilike("client_name", "e2e-%");
```

Mettre à jour le commentaire de tête de la fonction pour mentionner ces 4 tables supplémentaires, à la suite de la liste déjà présente.

- [ ] **Step 2 : Vérifier `npm run e2e:reset` (si ce script existe)**

```bash
cat package.json | grep -A2 '"e2e:reset"'
```

S'il existe et appelle `purgeE2eAccountState`, aucune autre modification n'est nécessaire (la fonction est déjà partagée). Sinon, noter l'absence et continuer — ce n'est pas dans le scope de cette tâche d'en créer un.

- [ ] **Step 3 : Écrire `e2e/mcp-oauth.spec.ts`**

```ts
import { expect, test } from "@playwright/test";
import { createHash, randomBytes } from "node:crypto";
import { login } from "./fixtures";

function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}
function deriveCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

test.describe("Handshake OAuth + MCP (issue #201)", () => {
  test("enregistrement, autorisation, echange de token, tools/list filtre, add_task, list_tasks refuse hors scope", async ({ page, request, baseURL }) => {
    const clientName = `e2e-mcp-${Date.now()}`;
    const redirectUri = "http://127.0.0.1:9999/callback";

    // 1. Enregistrement dynamique (RFC 7591)
    const registerRes = await request.post(`${baseURL}/oauth/register`, {
      data: { client_name: clientName, redirect_uris: [redirectUri] },
    });
    expect(registerRes.status()).toBe(201);
    const { client_id: clientId } = await registerRes.json();
    expect(clientId).toBeTruthy();

    // 2. PKCE
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = deriveCodeChallenge(codeVerifier);

    // 3. Login puis navigation vers /oauth/authorize (session cookie du navigateur)
    await login(page);
    const authorizeUrl = new URL("/oauth/authorize", baseURL!);
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("code_challenge", codeChallenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");
    await page.goto(authorizeUrl.toString());

    // 4. Consentement affiche les scopes par defaut (tasks:read + tasks:write)
    await expect(page.getByText(/Lire tes tâches/)).toBeVisible();
    await expect(page.getByText(/Créer et cocher des tâches/)).toBeVisible();
    await expect(page.getByText(/Changer ton combattant équipé/)).not.toBeVisible();

    // 5. Autoriser -> redirection vers redirect_uri avec ?code=...
    // Le redirect_uri est un port qui n'ecoute pas : intercepter la
    // redirection AVANT navigation plutot que de suivre le lien.
    await page.route(`${redirectUri}**`, (route) => route.abort());
    const [response] = await Promise.all([
      page.waitForResponse((res) => res.url().startsWith(redirectUri)).catch(() => null),
      page.getByRole("button", { name: "Autoriser" }).click(),
    ]);
    // Recuperer le code depuis l'URL de la requete interceptee/echouee
    const finalUrl = new URL(page.url());
    let code = finalUrl.searchParams.get("code");
    if (!code && response) {
      code = new URL(response.url()).searchParams.get("code");
    }
    expect(code).toBeTruthy();

    // 6. Echange du code contre un token
    const tokenRes = await request.post(`${baseURL}/oauth/token`, {
      form: {
        grant_type: "authorization_code",
        code: code!,
        code_verifier: codeVerifier,
        redirect_uri: redirectUri,
        client_id: clientId,
      },
    });
    expect(tokenRes.status()).toBe(200);
    const { access_token: accessToken } = await tokenRes.json();
    expect(accessToken).toBeTruthy();

    // 7. tools/list -> add_task visible (scope par defaut inclut tasks:write)
    const listRes = await request.post(`${baseURL}/api/mcp`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
    });
    expect(listRes.status()).toBe(200);
    const listBody = await listRes.json();
    expect(listBody.result.tools.map((t: { name: string }) => t.name)).toContain("add_task");

    // 8. add_task reussit
    const addRes = await request.post(`${baseURL}/api/mcp`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "add_task", arguments: { title: `Tache MCP e2e ${Date.now()}` } },
      },
    });
    const addBody = await addRes.json();
    expect(addBody.result.isError).toBe(false);

    // 9. Un tool hors catalogue -> isError, jamais un 500
    const unknownRes = await request.post(`${baseURL}/api/mcp`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "delete_everything", arguments: {} },
      },
    });
    expect(unknownRes.status()).toBe(200);
    const unknownBody = await unknownRes.json();
    expect(unknownBody.error).toBeTruthy();
  });
});
```

⚠️ L'étape 5 (interception de la redirection vers un `redirect_uri` qui n'écoute pas) est délicate en Playwright — si `page.route`/`waitForResponse` ne capture pas fiablement une redirection vers un port fermé, une alternative plus robuste est de définir `redirect_uri` sur une route interne de test qui répond 200 en échoing `?code=`, ou d'inspecter directement `page.url()` après la navigation si Playwright suit la redirection jusqu'à l'échec réseau et expose l'URL finale malgré tout. Adapter cette étape en fonction du comportement réellement observé lors du premier run — documenter l'écart dans le rapport de tâche plutôt que de forcer un mécanisme fragile.

- [ ] **Step 4 : Lancer ce spec seul en local**

```bash
npx playwright test e2e/mcp-oauth.spec.ts
```

Itérer sur l'étape 5 si nécessaire (cf. avertissement ci-dessus) jusqu'à un run vert.

- [ ] **Step 5 : Lancer la suite e2e complète**

```bash
npm run e2e
```

Attendu : tout vert, y compris les specs déjà existantes (aucune régression, en particulier `purgeE2eAccountState` étendu ne doit rien casser dans `global-setup.ts`).

- [ ] **Step 6 : Commit**

```bash
git add e2e/mcp-oauth.spec.ts e2e/fixtures.ts
git commit -m "test: handshake OAuth+MCP complet, purge oauth_clients/tokens/rate_limit (issue #201)"
```

---

## Task 6 : Vérification complète, documentation, PR

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1 : Suite complète**

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run build
npm run e2e
```

- [ ] **Step 2 : `CHANGELOG.md`**

```markdown
- Serveur MCP : scopes OAuth (lecture/écriture tâches, lecture/écriture profil), registry de tools extensible, consentement détaillant les droits demandés, rate limit autoritaire (issue #201).
```

- [ ] **Step 3 : `CLAUDE.md`**

Ajouter sous « Pièges et décisions non-évidentes » :

```markdown
**Scopes OAuth du serveur MCP — défaut restrictif, refus explicite sur l'inconnu (issue #201)** — `lib/oauth-scopes.ts` définit 4 scopes (`tasks:read`/`tasks:write`/`profile:read`/`profile:write`). Une requête `/oauth/authorize` sans paramètre `scope` accorde `tasks:read tasks:write` — jamais `profile:write` : un client qui ne demande rien n'obtient pas le droit de changer l'équipement. Un scope inconnu est refusé (page d'erreur), jamais filtré silencieusement. `lib/mcp-tools.ts` (registry de tools) filtre `tools/list` selon le scope du token — un agent ne voit que ce qu'il peut appeler. Le rate limit (`lib/mcp-rate-limit.ts`, RPC `consume_mcp_quota`) vit dans une table dédiée (`mcp_rate_limit`) et non sur `oauth_tokens`, qui est vidée à chaque rotation de refresh token (`handleRefreshTokenGrant`) — un compteur qui y vivrait serait effacé par un simple refresh.
```

- [ ] **Step 4 : Push et PR**

```bash
git push -u origin feat/issue-201-mcp-socle-oauth
gh pr create --title "feat: socle MCP — scopes, registry, consentement, rate limit (issue #201, lot 2)" --body "Lot 2 de l'issue #201.

Durcit le serveur MCP existant : 4 scopes OAuth (D2), registry de tools extensible (D3, add_task migré sans changement fonctionnel), écran de consentement listant les droits réels (D5), rate limit autoritaire en base (D4, table \`mcp_rate_limit\`, survit à la rotation de refresh token).

Design : \`docs/superpowers/specs/2026-09-05-mcp-catalogue-tools-design.md\`. Suite au lot 1 (couche domaine, mergé)."
```

Cocher la case **PR2** dans l'issue #201.

⚠️ **Ne pas merger.** La PR est poussée pour relecture.

---

## Notes pour l'exécutant

- Ce lot n'ajoute **aucun nouveau tool métier** — uniquement le socle qui rendra PR3/PR4 triviaux à ajouter. `add_task` doit se comporter exactement comme avant après migration vers le registry.
- Vérifier systématiquement l'existence d'un fichier de test avant de modifier un module (`lib/oauth-consent-page.ts`, `lib/oauth-metadata.ts`) — certains n'en ont peut-être pas encore, auquel cas ne pas en créer un hors du périmètre explicite de la tâche concernée, sauf pour les modules listés en Task 1/2/3 où le test est le livrable.
- Le fail-open de `consumeMcpQuota` sur une erreur RPC (Task 2) est une décision délibérée : le rate limit protège contre l'abus, il ne doit jamais devenir un point de défaillance qui bloquerait un usage légitime si la migration n'est pas encore appliquée en prod au moment du déploiement.
