# US-22 - Serveur OAuth 2.1 + MCP pour Gemini Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre l'ajout d'une tache a la voix via Google Gemini ("OK Google, ajoute [X] a Dodojo") en implementant, cote Dodojo, un serveur d'autorisation OAuth 2.1 (PKCE, enregistrement dynamique de client RFC 7591) et un serveur de ressource MCP (`/api/mcp`, transport Streamable HTTP, tool `add_task`).

**Architecture:** Trois tables (`oauth_clients`, `oauth_authorization_codes`, `oauth_tokens`, toutes avec policy DELETE autorisee - donnees techniques, pas RG-04) soutiennent un flow OAuth 2.1 complet : `POST /oauth/register` (RFC 7591, auto-enregistrement), `GET`/`POST /oauth/authorize` (consentement, session Dodojo requise, PKCE S256 obligatoire), `POST /oauth/token` (echange `authorization_code` ou renouvellement `refresh_token`), `POST /oauth/revoke` (RFC 7009), et deux endpoints de metadonnees `.well-known` (RFC 8414/9728). Le serveur MCP (`/api/mcp`) verifie le Bearer token contre `oauth_tokens` puis delegue **strictement** a `insertTaskForUser` (`lib/task-insertion.ts`, US-03) - aucune seconde implementation du calcul HP. La section « Integrations » du QG (`components/qg/IntegrationsSection.tsx`, US-11) recoit un bloc sibling `GeminiConnectionSection` (statut + deconnexion). Toute la logique protocolaire pure (PKCE, hash/expiration de jetons, validation RFC 7591, cadre JSON-RPC MCP) est isolee dans `lib/` et testee en Vitest ; les routes elles-memes sont testees en integration avec un client Supabase simule (fake), sans dependre d'un vrai handshake Gemini.

**Tech Stack:** Next.js 16 (App Router, Route Handlers `runtime = "nodejs"`), Supabase (`@supabase/supabase-js` service-role pour les routes sans session, `@/lib/supabase/server` pour `/oauth/authorize` et le QG), `node:crypto` (PKCE S256, hash SHA-256), Vitest.

## Global Constraints

- TypeScript strict, **aucun `any`** (CLAUDE.md paragraphe Regles de code) - y compris dans les tests.
- Commentaires en francais, termes techniques en anglais quand c'est l'usage.
- Commits en Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`).
- `CHANGELOG.md` mis a jour sous `[Unreleased]` dans le meme commit/PR que la feature.
- Manuel du Dojo (`content/guide.json`) mis a jour dans la meme PR - nouvelle mecanique visible utilisateur (CLAUDE.md paragraphe Documentation utilisateur, US-28), `section.id: "gemini"` stable pour deep-link `/guide#gemini`.
- **Dependances amont deja mergees** :
  - **US-03** : `lib/task-insertion.ts` exporte `insertTaskForUser(supabase: SupabaseClient, params: { userId: string; title: string; timezone: string }): Promise<{ taskId: string; dayDate: string; bossMaxHp: number; bossCurrentHp: number }>` ; `lib/task-title.ts` exporte `validateTaskTitle(rawTitle: string): { title: string } | { error: string }` ; `components/qg/IntegrationsSection.tsx` (conteneur generique `children`) et `components/qg/WebhookTokenSection.tsx` sont deja montes dans `app/qg/page.tsx`, avec `profiles` selectionne via `.select("best_streak, timezone, webhook_token_hash, webhook_token_last_used_at")`.
  - **US-20 puis US-11** : `vitest.config.ts` inclut deja `["lib/**/*.test.ts", "components/**/*.test.tsx", "app/**/*.test.ts"]`.
- **Imports relatifs obligatoires dans tout fichier charge directement par un test Vitest** (pas de resolution d'alias tsconfig dans `vitest.config.ts`, pas de plugin `vite-tsconfig-paths`) : tous les fichiers `lib/*.ts` de ce plan et tous les `app/**/route.ts` crees ici importent leurs dependances internes en **relatif**, jamais via `@/`. Seuls `app/actions/oauth.ts` et les composants QG (jamais charges directement par un test Vitest) gardent l'alias `@/` habituel.
- **PKCE : seule la methode `S256` est acceptee** - `code_challenge_method=plain` est toujours rejete (OAuth 2.1 impose PKCE, et ce serveur n'accepte pas la variante faible `plain`).
- **Toutes les 3 nouvelles tables (`oauth_clients`, `oauth_authorization_codes`, `oauth_tokens`) ont une policy DELETE autorisee** - donnees techniques operationnelles (jetons, codes, clients enregistres dynamiquement), **pas** un historique de combat protege par RG-04 (CLAUDE.md paragraphe Regles de code n4).
- **Rate limiting best-effort, en memoire** (`lib/rate-limit.ts`) sur `/oauth/register` et `/oauth/token` uniquement (endpoints ouverts par construction, DCR) - ne survit pas a un cold start serverless, aucune garantie distribuee entre plusieurs instances Vercel. Documente comme limitation assumee, pas un vrai rempart distribue.
- **Decouverte pendant la planification, corrigee en Task 2** : le garde de session de `proxy.ts` (`lib/supabase/middleware.ts`, `updateSession`) redirigerait aujourd'hui toute requete non authentifiee vers `/welcome` - y compris les appels serveur-a-serveur de Gemini (aucun cookie Supabase) vers les nouvelles routes OAuth/MCP, et meme les routes API deja existantes (`/api/webhook/add-task` US-03, `/api/cron/push-reminders` US-11). Task 2 exempte `/api/`, `/oauth/`, `/.well-known/` de ce garde, dans les deux sens (ni redirection anonyme, ni redirection deja connecte).
- **Aucun test e2e Playwright sur le handshake Gemini reel** (dependance externe non reproductible en CI, ecosysteme "Connected Apps" MCP en evolution rapide cote Google) - seule une **verification manuelle post-deploiement avec un vrai compte Gemini** fait foi avant de considerer la US terminee (Task 18).
- Branche : `feat/us-22-gemini-mcp`.
- Design de reference : `docs/superpowers/specs/2026-07-22-us22-gemini-mcp-design.md`.

---

### Task 1: Migration Supabase (`oauth_clients`/`oauth_authorization_codes`/`oauth_tokens`) + types partages

**Files:**
- Create: `supabase/migrations/20260722150000_create_oauth_mcp.sql`
- Modify: `types/index.ts`

**Interfaces:**
- Produces: tables `public.oauth_clients` (`client_id` PK uuid, `client_secret_hash` nullable, `client_name`, `redirect_uris text[]`, `created_at`), `public.oauth_authorization_codes` (`code_hash` PK, `client_id` FK, `user_id` FK, `redirect_uri`, `code_challenge`, `code_challenge_method`, `scope`, `expires_at`, `created_at`), `public.oauth_tokens` (`id` PK uuid, `access_token_hash` unique, `refresh_token_hash` nullable unique, `client_id` FK, `user_id` FK, `scope`, `expires_at`, `created_at`) ; types `OAuthClient`, `OAuthAuthorizationCode`, `OAuthToken` - consommes par les Tasks 9, 10, 11, 12, 13, 14.

- [ ] **Step 1: Creer la branche de travail**

```bash
git checkout -b feat/us-22-gemini-mcp
```

- [ ] **Step 2: Ecrire la migration**

Create `supabase/migrations/20260722150000_create_oauth_mcp.sql`:

```sql
-- US-22 : serveur OAuth 2.1 + MCP pour Gemini (PKCE, enregistrement
-- dynamique RFC 7591). Trois tables, toutes avec policy DELETE AUTORISEE
-- (donnees techniques operationnelles - jetons/codes d'autorisation/clients
-- enregistres dynamiquement - PAS un historique de combat protege par
-- RG-04, cf. CLAUDE.md paragraphe Regles de code n4).

create table public.oauth_clients (
  client_id uuid primary key default gen_random_uuid(),
  -- Client PUBLIC par defaut (PKCE seul) : ce MVP n'emet jamais de secret,
  -- la colonne reste prete pour un futur client confidentiel.
  client_secret_hash text,
  client_name text not null,
  redirect_uris text[] not null,
  created_at timestamptz not null default now()
);

create table public.oauth_authorization_codes (
  code_hash text primary key,
  client_id uuid not null references public.oauth_clients (client_id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,
  code_challenge_method text not null default 'S256',
  scope text not null default 'tasks:write',
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index oauth_authorization_codes_expires_idx
  on public.oauth_authorization_codes (expires_at);

create table public.oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  access_token_hash text not null unique,
  refresh_token_hash text unique,
  client_id uuid not null references public.oauth_clients (client_id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  scope text not null default 'tasks:write',
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index oauth_tokens_user_idx on public.oauth_tokens (user_id);
create index oauth_tokens_client_user_idx on public.oauth_tokens (client_id, user_id);

alter table public.oauth_clients enable row level security;
alter table public.oauth_authorization_codes enable row level security;
alter table public.oauth_tokens enable row level security;

-- oauth_clients : lecture ouverte (metadonnees non secretes -
-- client_secret_hash reste toujours NULL dans ce MVP, clients publics
-- uniquement) pour permettre au QG (session utilisateur normale) de
-- retrouver un client par nom (lib/oauth-gemini.ts). Ecriture
-- (insert/update/delete) reservee au role service_role (route
-- /oauth/register), qui bypass RLS - donc aucune policy insert/update/delete
-- ici pour authenticated/anon.
create policy "oauth_clients_select_all"
  on public.oauth_clients for select
  using (true);

-- oauth_authorization_codes : un utilisateur connecte peut creer un code
-- lie a SON propre user_id (ecran de consentement /oauth/authorize, session
-- cookie) ; aucune policy select/update pour authenticated (l'echange du
-- code contre un token se fait exclusivement via service_role,
-- /oauth/token, qui bypass RLS).
create policy "oauth_authorization_codes_insert_own"
  on public.oauth_authorization_codes for insert
  with check (user_id = auth.uid());

-- oauth_tokens : un utilisateur connecte peut voir/revoquer SES propres
-- autorisations (statut + bouton Deconnecter au QG, session cookie) ; la
-- creation/rotation d'un token reste exclusivement service_role
-- (/oauth/token), aucune policy insert/update ici.
create policy "oauth_tokens_select_own"
  on public.oauth_tokens for select
  using (user_id = auth.uid());

create policy "oauth_tokens_delete_own"
  on public.oauth_tokens for delete
  using (user_id = auth.uid());
```

- [ ] **Step 3: Appliquer la migration**

```bash
echo "Y" | supabase db push
supabase migration list | grep 20260722150000
```
Expected: la migration `20260722150000_create_oauth_mcp` apparait appliquee. Si Docker/Supabase local est eteint, differer jusqu'a `supabase start` - la migration reste committee et sera appliquee par Supabase distant au deploiement (precedent deja accepte dans ce repo).

- [ ] **Step 4: Mettre a jour les types partages**

Modify `types/index.ts` - ajouter en fin de fichier (apres `UnlockedHero`) :

```ts

// US-22 : serveur OAuth 2.1 + MCP pour Gemini. Client public par defaut
// (client_secret_hash reste null dans ce MVP, PKCE seul).
export interface OAuthClient {
  client_id: string;
  client_secret_hash: string | null;
  client_name: string;
  redirect_uris: string[];
  created_at: string;
}

export interface OAuthAuthorizationCode {
  code_hash: string;
  client_id: string;
  user_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  scope: string;
  expires_at: string;
  created_at: string;
}

export interface OAuthToken {
  id: string;
  access_token_hash: string;
  refresh_token_hash: string | null;
  client_id: string;
  user_id: string;
  scope: string;
  expires_at: string;
  created_at: string;
}
```

- [ ] **Step 5: Verifier que ca compile**

```bash
npx tsc --noEmit
```
Expected: pas d'erreur.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260722150000_create_oauth_mcp.sql types/index.ts
git commit -m "feat: tables oauth_clients/oauth_authorization_codes/oauth_tokens (US-22)"
```

---

### Task 2: Étendre le garde de session (`proxy.ts`) à `/oauth/` et `/.well-known/`

**Contexte (cross-check du 2026-07-22)** : `lib/supabase/middleware.ts` et sa fonction exportée `isPublicRoute(path)` existent déjà — créés par **US-11** (qui a découvert que `proxy.ts` redirigeait toute requête sans cookie vers `/welcome`, cassant sa route cron) et exemptent déjà tout `/api/*`. Cette Task n'a donc **pas** à créer le fichier ni le test, seulement étendre `isPublicRoute` à `/oauth/` et `/.well-known/` (les routes OAuth/MCP de ce plan ne vivent pas toutes sous `/api/`).

**Files:**
- Modify: `lib/supabase/middleware.ts` (étend `isPublicRoute`, déjà créée par US-11)
- Modify: `lib/supabase/middleware.test.ts` (déjà créé par US-11, ajoute des cas)

**Interfaces:**
- Consumes: `isPublicRoute(path: string): boolean` (US-11, `lib/supabase/middleware.ts`).
- Produces: `isPublicRoute` couvre désormais aussi `/oauth/*` et `/.well-known/*` — nécessaire pour que les Tasks 9 à 15 (routes OAuth + MCP) fonctionnent réellement une fois déployées (Gemini les appelle sans cookie Supabase).

- [ ] **Step 1: Écrire les tests qui échouent**

Modify `lib/supabase/middleware.test.ts` — ajouter au `describe("isPublicRoute (garde de session proxy.ts)")` existant :

```ts
  test("/oauth/* et /.well-known/* sont publics (US-22 : Gemini n'a pas de cookie Supabase)", () => {
    expect(isPublicRoute("/oauth/register")).toBe(true);
    expect(isPublicRoute("/oauth/authorize")).toBe(true);
    expect(isPublicRoute("/api/mcp")).toBe(true);
    expect(isPublicRoute("/.well-known/oauth-authorization-server")).toBe(true);
  });
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

```bash
npm test -- lib/supabase/middleware.test.ts
```
Expected: FAIL sur le nouveau test (`/oauth/register`/`/.well-known/...` pas encore reconnus publics — `/api/mcp` passe déjà grâce à US-11).

- [ ] **Step 3: Étendre `isPublicRoute`**

Modify `lib/supabase/middleware.ts` :

Avant :
```ts
export function isPublicRoute(path: string): boolean {
  return path.startsWith("/login") || path.startsWith("/welcome") || path.startsWith("/api/");
}
```

Après :
```ts
// US-22 : /oauth/* et /.well-known/* s'ajoutent à /api/* (US-11) — routes
// techniques appelées sans cookie Supabase (Gemini), gèrent leur propre
// authentification (PKCE, Bearer, service-role).
export function isPublicRoute(path: string): boolean {
  return (
    path.startsWith("/login") ||
    path.startsWith("/welcome") ||
    path.startsWith("/api/") ||
    path.startsWith("/oauth/") ||
    path.startsWith("/.well-known/")
  );
}
```

- [ ] **Step 4: Lancer les tests, vérifier le succès**

```bash
npm test -- lib/supabase/middleware.test.ts
```
Expected: PASS (tous les tests, existants US-11 + nouveaux).

- [ ] **Step 5: Vérifier que ça compile**

```bash
npx tsc --noEmit
```
Expected: pas d'erreur.

- [ ] **Step 6: Commit**

```bash
git add lib/supabase/middleware.ts lib/supabase/middleware.test.ts
git commit -m "fix: étend le garde de session à /oauth et /.well-known (US-22)"
```

---

### Task 3: `lib/pkce.ts` - PKCE S256 (TDD)

**Files:**
- Create: `lib/pkce.ts`
- Test: `lib/pkce.test.ts`

**Interfaces:**
- Produces: `generateCodeVerifier(): string`, `deriveCodeChallenge(codeVerifier: string): string`, `verifyCodeChallenge(codeVerifier: string, expectedChallenge: string): boolean` - consommes par les Tasks 10 (`/oauth/authorize`, generation du code) et 11 (`/oauth/token`, verification a l'echange).

- [ ] **Step 1: Ecrire le test qui echoue**

Create `lib/pkce.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { deriveCodeChallenge, generateCodeVerifier, verifyCodeChallenge } from "./pkce";

describe("generateCodeVerifier (US-22 - RFC 7636)", () => {
  test("genere 43 caracteres dans l'alphabet non reserve (base64url)", () => {
    expect(generateCodeVerifier()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  test("deux appels generent des verifiers differents", () => {
    expect(generateCodeVerifier()).not.toBe(generateCodeVerifier());
  });
});

describe("deriveCodeChallenge (S256)", () => {
  test("vecteur de test officiel RFC 7636 Appendix B.1", () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    expect(deriveCodeChallenge(verifier)).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  test("deterministe : meme verifier -> meme challenge", () => {
    const verifier = generateCodeVerifier();
    expect(deriveCodeChallenge(verifier)).toBe(deriveCodeChallenge(verifier));
  });

  test("deux verifiers differents -> challenges differents", () => {
    expect(deriveCodeChallenge(generateCodeVerifier())).not.toBe(deriveCodeChallenge(generateCodeVerifier()));
  });
});

describe("verifyCodeChallenge", () => {
  test("verifier correct contre son challenge -> true", () => {
    const verifier = generateCodeVerifier();
    const challenge = deriveCodeChallenge(verifier);
    expect(verifyCodeChallenge(verifier, challenge)).toBe(true);
  });

  test("mauvais verifier contre le challenge -> false", () => {
    const challenge = deriveCodeChallenge(generateCodeVerifier());
    expect(verifyCodeChallenge(generateCodeVerifier(), challenge)).toBe(false);
  });
});
```

- [ ] **Step 2: Lancer le test, verifier qu'il echoue**

```bash
npm test -- lib/pkce.test.ts
```
Expected: FAIL - `Cannot find module './pkce'`.

- [ ] **Step 3: Implementation minimale**

Create `lib/pkce.ts`:

```ts
import { createHash, randomBytes } from "node:crypto";

// RFC 7636 (PKCE) : code_verifier = chaine haute entropie [A-Za-z0-9-._~],
// 43 a 128 caracteres. 32 octets aleatoires encodes en base64url produisent
// exactement 43 caracteres, tous dans l'alphabet autorise (base64url est un
// sous-ensemble des caracteres "unreserved" RFC 3986 moins '~', jamais
// utilise par Node ici) - sans padding.
export function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

// S256 uniquement (seule methode acceptee par ce serveur, cf.
// code_challenge_methods_supported du RFC 8414) : BASE64URL(SHA256(verifier)).
export function deriveCodeChallenge(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier).digest("base64url");
}

export function verifyCodeChallenge(codeVerifier: string, expectedChallenge: string): boolean {
  return deriveCodeChallenge(codeVerifier) === expectedChallenge;
}
```

- [ ] **Step 4: Lancer le test, verifier qu'il passe**

```bash
npm test -- lib/pkce.test.ts
```
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/pkce.ts lib/pkce.test.ts
git commit -m "feat: PKCE S256 (lib/pkce.ts, US-22)"
```

---

### Task 4: `lib/oauth-tokens.ts` - jetons opaques, hash, expiration (TDD)

**Files:**
- Create: `lib/oauth-tokens.ts`
- Test: `lib/oauth-tokens.test.ts`

**Interfaces:**
- Produces: `generateOpaqueToken(): string`, `hashOpaqueToken(token: string): string`, `AUTHORIZATION_CODE_TTL_MS = 60_000`, `ACCESS_TOKEN_TTL_MS = 3_600_000`, `expiresAtFromNow(ttlMs: number, now?: Date): string`, `isExpired(expiresAtIso: string, now?: Date): boolean` - consommes par les Tasks 10, 11, 12, 13.

- [ ] **Step 1: Ecrire le test qui echoue**

Create `lib/oauth-tokens.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
  ACCESS_TOKEN_TTL_MS,
  AUTHORIZATION_CODE_TTL_MS,
  expiresAtFromNow,
  generateOpaqueToken,
  hashOpaqueToken,
  isExpired,
} from "./oauth-tokens";

describe("generateOpaqueToken (US-22)", () => {
  test("genere un jeton hexadecimal de 64 caracteres (256 bits)", () => {
    expect(generateOpaqueToken()).toMatch(/^[0-9a-f]{64}$/);
  });

  test("deux appels generent des jetons differents", () => {
    expect(generateOpaqueToken()).not.toBe(generateOpaqueToken());
  });
});

describe("hashOpaqueToken", () => {
  test("deterministe : meme jeton -> meme hash", () => {
    const token = "a".repeat(64);
    expect(hashOpaqueToken(token)).toBe(hashOpaqueToken(token));
  });

  test("deux jetons differents -> hash differents", () => {
    expect(hashOpaqueToken("a".repeat(64))).not.toBe(hashOpaqueToken("b".repeat(64)));
  });

  test("produit un hex SHA-256 (64 caracteres)", () => {
    expect(hashOpaqueToken("code-de-test")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("expiresAtFromNow / isExpired", () => {
  test("expiresAtFromNow ajoute exactement le TTL en millisecondes", () => {
    const now = new Date("2026-07-22T12:00:00.000Z");
    expect(expiresAtFromNow(AUTHORIZATION_CODE_TTL_MS, now)).toBe("2026-07-22T12:01:00.000Z");
    expect(expiresAtFromNow(ACCESS_TOKEN_TTL_MS, now)).toBe("2026-07-22T13:00:00.000Z");
  });

  test("isExpired : false avant l'expiration", () => {
    const now = new Date("2026-07-22T12:00:00.000Z");
    const expiresAt = expiresAtFromNow(ACCESS_TOKEN_TTL_MS, now);
    const before = new Date("2026-07-22T12:30:00.000Z");
    expect(isExpired(expiresAt, before)).toBe(false);
  });

  test("isExpired : true apres l'expiration", () => {
    const now = new Date("2026-07-22T12:00:00.000Z");
    const expiresAt = expiresAtFromNow(AUTHORIZATION_CODE_TTL_MS, now);
    const after = new Date("2026-07-22T12:02:00.000Z");
    expect(isExpired(expiresAt, after)).toBe(true);
  });

  test("isExpired : true pile a l'instant d'expiration (limite inclusive)", () => {
    const now = new Date("2026-07-22T12:00:00.000Z");
    const expiresAt = expiresAtFromNow(AUTHORIZATION_CODE_TTL_MS, now);
    const atExpiry = new Date("2026-07-22T12:01:00.000Z");
    expect(isExpired(expiresAt, atExpiry)).toBe(true);
  });
});
```

- [ ] **Step 2: Lancer le test, verifier qu'il echoue**

```bash
npm test -- lib/oauth-tokens.test.ts
```
Expected: FAIL - `Cannot find module './oauth-tokens'`.

- [ ] **Step 3: Implementation minimale**

Create `lib/oauth-tokens.ts`:

```ts
import { createHash, randomBytes } from "node:crypto";

// US-22 : jeton opaque haute entropie (256 bits, hex) - reutilise pour code
// d'autorisation, access_token, refresh_token (RFC 6749). Seul le hash
// SHA-256 est stocke en base (jamais en clair), meme principe que
// lib/webhook-token.ts (US-03).
export function generateOpaqueToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// 60s, usage unique (design). Suffisant pour un aller-retour navigateur
// immediat entre /oauth/authorize et /oauth/token.
export const AUTHORIZATION_CODE_TTL_MS = 60_000;

// 1h - jeton court, renouvelable via grant refresh_token sans nouvel ecran
// de consentement.
export const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;

export function expiresAtFromNow(ttlMs: number, now: Date = new Date()): string {
  return new Date(now.getTime() + ttlMs).toISOString();
}

// Limite inclusive : expire pile a l'instant d'expiration (pas une
// microseconde apres), pour ne jamais laisser passer un jeton dont le TTL
// vient tout juste de s'ecouler.
export function isExpired(expiresAtIso: string, now: Date = new Date()): boolean {
  return new Date(expiresAtIso).getTime() <= now.getTime();
}
```

- [ ] **Step 4: Lancer le test, verifier qu'il passe**

```bash
npm test -- lib/oauth-tokens.test.ts
```
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/oauth-tokens.ts lib/oauth-tokens.test.ts
git commit -m "feat: jetons opaques hash/expiration (lib/oauth-tokens.ts, US-22)"
```

---

### Task 5: `lib/oauth-client-registration.ts` - validation RFC 7591 (TDD)

**Files:**
- Create: `lib/oauth-client-registration.ts`
- Test: `lib/oauth-client-registration.test.ts`

**Interfaces:**
- Produces: `interface ClientRegistration { clientName: string; redirectUris: string[] }`, `type ClientRegistrationValidation = { registration: ClientRegistration } | { error: string }`, `validateClientRegistration(body: unknown): ClientRegistrationValidation` - consomme par la Task 9 (`POST /oauth/register`).

- [ ] **Step 1: Ecrire le test qui echoue**

Create `lib/oauth-client-registration.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { validateClientRegistration } from "./oauth-client-registration";

describe("validateClientRegistration (US-22 - RFC 7591)", () => {
  test("valide : redirect_uris + client_name", () => {
    const result = validateClientRegistration({
      redirect_uris: ["https://gemini.google.com/callback"],
      client_name: "Gemini",
    });
    expect(result).toEqual({
      registration: { clientName: "Gemini", redirectUris: ["https://gemini.google.com/callback"] },
    });
  });

  test("valide : client_name absent -> valeur par defaut", () => {
    const result = validateClientRegistration({ redirect_uris: ["https://client.example/callback"] });
    expect(result).toEqual({
      registration: { clientName: "Client MCP", redirectUris: ["https://client.example/callback"] },
    });
  });

  test("valide : plusieurs redirect_uris", () => {
    const result = validateClientRegistration({
      redirect_uris: ["https://a.example/cb", "https://b.example/cb"],
    });
    expect("registration" in result && result.registration.redirectUris).toEqual([
      "https://a.example/cb",
      "https://b.example/cb",
    ]);
  });

  test("erreur : body qui n'est pas un objet", () => {
    expect(validateClientRegistration("pas un objet")).toEqual({ error: "redirect_uris est requis." });
    expect(validateClientRegistration(null)).toEqual({ error: "redirect_uris est requis." });
  });

  test("erreur : redirect_uris absent", () => {
    const result = validateClientRegistration({});
    expect("error" in result).toBe(true);
  });

  test("erreur : redirect_uris vide", () => {
    const result = validateClientRegistration({ redirect_uris: [] });
    expect("error" in result).toBe(true);
  });

  test("erreur : un redirect_uri n'est pas une URL valide", () => {
    const result = validateClientRegistration({ redirect_uris: ["pas-une-url"] });
    expect("error" in result).toBe(true);
  });

  test("erreur : client_name vide", () => {
    const result = validateClientRegistration({
      redirect_uris: ["https://client.example/callback"],
      client_name: "   ",
    });
    expect("error" in result).toBe(true);
  });

  test("erreur : client_name trop long (> 200 caracteres)", () => {
    const result = validateClientRegistration({
      redirect_uris: ["https://client.example/callback"],
      client_name: "x".repeat(201),
    });
    expect("error" in result).toBe(true);
  });
});
```

- [ ] **Step 2: Lancer le test, verifier qu'il echoue**

```bash
npm test -- lib/oauth-client-registration.test.ts
```
Expected: FAIL - `Cannot find module './oauth-client-registration'`.

- [ ] **Step 3: Implementation minimale**

Create `lib/oauth-client-registration.ts`:

```ts
export interface ClientRegistration {
  clientName: string;
  redirectUris: string[];
}

export type ClientRegistrationValidation = { registration: ClientRegistration } | { error: string };

const DEFAULT_CLIENT_NAME = "Client MCP";
const CLIENT_NAME_MAX_LENGTH = 200;

function isValidRedirectUri(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

// RFC 7591 (Dynamic Client Registration) - validation minimale : Dodojo
// accepte l'auto-enregistrement de n'importe quel client MCP (Gemini ou
// futur assistant), pas seulement un client code en dur (design US-22).
// `redirect_uris` est la seule metadonnee reellement structurante ici (le
// serveur d'autorisation doit savoir ou rediriger apres consentement) ;
// `client_name` reste informatif, jamais utilise pour une decision de
// securite (l'identification "Gemini" au QG, lib/oauth-gemini.ts, est une
// heuristique d'affichage, pas un controle d'acces).
export function validateClientRegistration(body: unknown): ClientRegistrationValidation {
  if (typeof body !== "object" || body === null) {
    return { error: "redirect_uris est requis." };
  }
  const candidate = body as Record<string, unknown>;

  const redirectUris = candidate.redirect_uris;
  if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
    return { error: "redirect_uris doit etre un tableau non vide d'URLs." };
  }
  if (!redirectUris.every(isValidRedirectUri)) {
    return { error: "Chaque redirect_uri doit etre une URL absolue valide." };
  }

  let clientName = DEFAULT_CLIENT_NAME;
  if (candidate.client_name !== undefined) {
    if (typeof candidate.client_name !== "string" || !candidate.client_name.trim()) {
      return { error: "client_name doit etre une chaine non vide." };
    }
    if (candidate.client_name.length > CLIENT_NAME_MAX_LENGTH) {
      return { error: `client_name est trop long (${CLIENT_NAME_MAX_LENGTH} caracteres max).` };
    }
    clientName = candidate.client_name.trim();
  }

  return { registration: { clientName, redirectUris: redirectUris as string[] } };
}
```

- [ ] **Step 4: Lancer le test, verifier qu'il passe**

```bash
npm test -- lib/oauth-client-registration.test.ts
```
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/oauth-client-registration.ts lib/oauth-client-registration.test.ts
git commit -m "feat: validation RFC 7591 (lib/oauth-client-registration.ts, US-22)"
```

---

### Task 6: `lib/rate-limit.ts` - rate limiting basique par IP (TDD)

**Files:**
- Create: `lib/rate-limit.ts`
- Test: `lib/rate-limit.test.ts`

**Interfaces:**
- Produces: `interface RateLimitResult { allowed: boolean; retryAfterMs: number }`, `interface RateLimiter { consume(key: string, now?: number): RateLimitResult }`, `createRateLimiter(limit: number, windowMs: number): RateLimiter`, `extractClientIp(request: Request): string` - consommes par les Tasks 9 (`/oauth/register`) et 11 (`/oauth/token`).

- [ ] **Step 1: Ecrire le test qui echoue**

Create `lib/rate-limit.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { createRateLimiter, extractClientIp } from "./rate-limit";

describe("createRateLimiter (US-22 - protection basique par IP)", () => {
  test("autorise jusqu'a la limite dans la fenetre", () => {
    const limiter = createRateLimiter(3, 1000);
    expect(limiter.consume("ip-a", 0).allowed).toBe(true);
    expect(limiter.consume("ip-a", 100).allowed).toBe(true);
    expect(limiter.consume("ip-a", 200).allowed).toBe(true);
  });

  test("bloque la requete au-dela de la limite dans la meme fenetre", () => {
    const limiter = createRateLimiter(2, 1000);
    limiter.consume("ip-b", 0);
    limiter.consume("ip-b", 100);
    const result = limiter.consume("ip-b", 200);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  test("la fenetre glisse : une requete hors fenetre redevient autorisee", () => {
    const limiter = createRateLimiter(1, 1000);
    limiter.consume("ip-c", 0);
    expect(limiter.consume("ip-c", 500).allowed).toBe(false);
    expect(limiter.consume("ip-c", 1001).allowed).toBe(true);
  });

  test("deux cles (IP) differentes sont comptees independamment", () => {
    const limiter = createRateLimiter(1, 1000);
    expect(limiter.consume("ip-d", 0).allowed).toBe(true);
    expect(limiter.consume("ip-e", 0).allowed).toBe(true);
  });
});

describe("extractClientIp", () => {
  test("retourne la premiere IP de x-forwarded-for", () => {
    const request = new Request("http://localhost", {
      headers: { "x-forwarded-for": "203.0.113.4, 10.0.0.1" },
    });
    expect(extractClientIp(request)).toBe("203.0.113.4");
  });

  test("retire les espaces autour de l'IP", () => {
    const request = new Request("http://localhost", {
      headers: { "x-forwarded-for": "  203.0.113.4  ,10.0.0.1" },
    });
    expect(extractClientIp(request)).toBe("203.0.113.4");
  });

  test("header absent -> \"unknown\"", () => {
    const request = new Request("http://localhost");
    expect(extractClientIp(request)).toBe("unknown");
  });
});
```

- [ ] **Step 2: Lancer le test, verifier qu'il echoue**

```bash
npm test -- lib/rate-limit.test.ts
```
Expected: FAIL - `Cannot find module './rate-limit'`.

- [ ] **Step 3: Implementation minimale**

Create `lib/rate-limit.ts`:

```ts
export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

export interface RateLimiter {
  consume(key: string, now?: number): RateLimitResult;
}

// Fenetre glissante en memoire (best-effort, cf. design : "compteur simple en
// memoire/edge"). Ne survit PAS a un cold start serverless ni ne partage
// l'etat entre plusieurs instances Vercel - protection best-effort contre un
// abus grossier, pas un rempart distribue (un vrai rate limit distribue,
// ex. Vercel Firewall / Upstash, est hors scope de cette iteration).
export function createRateLimiter(limit: number, windowMs: number): RateLimiter {
  const hits = new Map<string, number[]>();
  return {
    consume(key: string, now: number = Date.now()): RateLimitResult {
      const windowStart = now - windowMs;
      const timestamps = (hits.get(key) ?? []).filter((t) => t > windowStart);
      if (timestamps.length >= limit) {
        const oldest = timestamps[0];
        return { allowed: false, retryAfterMs: oldest + windowMs - now };
      }
      timestamps.push(now);
      hits.set(key, timestamps);
      return { allowed: true, retryAfterMs: 0 };
    },
  };
}

// Vercel pose x-forwarded-for (liste eventuelle "client, proxy1, proxy2") -
// on ne retient que la premiere entree (l'appelant direct).
export function extractClientIp(request: Request): string {
  const header = request.headers.get("x-forwarded-for");
  if (!header) return "unknown";
  const [first] = header.split(",");
  return first.trim() || "unknown";
}
```

- [ ] **Step 4: Lancer le test, verifier qu'il passe**

```bash
npm test -- lib/rate-limit.test.ts
```
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/rate-limit.ts lib/rate-limit.test.ts
git commit -m "feat: rate limiting basique par IP (lib/rate-limit.ts, US-22)"
```

---

### Task 7: `lib/oauth-metadata.ts` + routes `.well-known` (RFC 8414/9728)

**Files:**
- Create: `lib/oauth-metadata.ts`
- Test: `lib/oauth-metadata.test.ts`
- Create: `app/.well-known/oauth-authorization-server/route.ts`
- Test: `app/.well-known/oauth-authorization-server/route.test.ts`
- Create: `app/.well-known/oauth-protected-resource/route.ts`
- Test: `app/.well-known/oauth-protected-resource/route.test.ts`

**Interfaces:**
- Produces: `buildAuthorizationServerMetadata(origin: string): AuthorizationServerMetadata`, `buildProtectedResourceMetadata(origin: string): ProtectedResourceMetadata` (`lib/oauth-metadata.ts`) ; `GET` handlers a `/.well-known/oauth-authorization-server` et `/.well-known/oauth-protected-resource` - consommes par le client MCP (Gemini) pour decouvrir les endpoints OAuth, et par la Task 13 (`/api/mcp`, header `WWW-Authenticate` en 401 pointant vers `oauth-protected-resource`).

- [ ] **Step 1: Ecrire le test qui echoue (lib pure)**

Create `lib/oauth-metadata.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { buildAuthorizationServerMetadata, buildProtectedResourceMetadata } from "./oauth-metadata";

describe("buildAuthorizationServerMetadata (RFC 8414)", () => {
  test("construit les endpoints a partir de l'origine", () => {
    expect(buildAuthorizationServerMetadata("https://dodojo.vercel.app")).toEqual({
      issuer: "https://dodojo.vercel.app",
      authorization_endpoint: "https://dodojo.vercel.app/oauth/authorize",
      token_endpoint: "https://dodojo.vercel.app/oauth/token",
      registration_endpoint: "https://dodojo.vercel.app/oauth/register",
      revocation_endpoint: "https://dodojo.vercel.app/oauth/revoke",
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
    });
  });
});

describe("buildProtectedResourceMetadata (RFC 9728)", () => {
  test("pointe vers /api/mcp et l'origine comme serveur d'autorisation", () => {
    expect(buildProtectedResourceMetadata("https://dodojo.vercel.app")).toEqual({
      resource: "https://dodojo.vercel.app/api/mcp",
      authorization_servers: ["https://dodojo.vercel.app"],
      bearer_methods_supported: ["header"],
      scopes_supported: ["tasks:write"],
    });
  });
});
```

- [ ] **Step 2: Lancer le test, verifier qu'il echoue**

```bash
npm test -- lib/oauth-metadata.test.ts
```
Expected: FAIL - Cannot find module './oauth-metadata'.

- [ ] **Step 3: Implementation minimale de la lib**

Create `lib/oauth-metadata.ts`:

```ts
export interface AuthorizationServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint: string;
  revocation_endpoint: string;
  response_types_supported: string[];
  grant_types_supported: string[];
  code_challenge_methods_supported: string[];
  token_endpoint_auth_methods_supported: string[];
}

// RFC 8414 : decouverte du serveur d'autorisation. origin = origine de la
// requete entrante (new URL(request.url).origin) plutot qu'une variable
// d'environnement figee - reste correct aussi bien en production
// (dodojo.vercel.app) que sur une preview Vercel (URL differente par PR).
export function buildAuthorizationServerMetadata(origin: string): AuthorizationServerMetadata {
  return {
    issuer: origin,
    authorization_endpoint: origin + "/oauth/authorize",
    token_endpoint: origin + "/oauth/token",
    registration_endpoint: origin + "/oauth/register",
    revocation_endpoint: origin + "/oauth/revoke",
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  };
}

export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: string[];
  bearer_methods_supported: string[];
  scopes_supported: string[];
}

// RFC 9728 : pointe le client MCP vers le serveur d'autorisation qui protege
// /api/mcp.
export function buildProtectedResourceMetadata(origin: string): ProtectedResourceMetadata {
  return {
    resource: origin + "/api/mcp",
    authorization_servers: [origin],
    bearer_methods_supported: ["header"],
    scopes_supported: ["tasks:write"],
  };
}
```

- [ ] **Step 4: Lancer le test, verifier qu'il passe**

```bash
npm test -- lib/oauth-metadata.test.ts
```
Expected: PASS (2 tests).

- [ ] **Step 5: Ecrire les tests d'integration des routes .well-known**

Create `app/.well-known/oauth-authorization-server/route.test.ts`:

```ts
import { describe, expect, test } from "vitest";

describe("GET /.well-known/oauth-authorization-server (US-22)", () => {
  test("retourne les metadonnees RFC 8414 basees sur l'origine de la requete", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("https://dodojo.vercel.app/.well-known/oauth-authorization-server"));
    const body = await response.json();
    expect(body).toMatchObject({
      issuer: "https://dodojo.vercel.app",
      authorization_endpoint: "https://dodojo.vercel.app/oauth/authorize",
      token_endpoint: "https://dodojo.vercel.app/oauth/token",
      code_challenge_methods_supported: ["S256"],
    });
  });
});
```

Create `app/.well-known/oauth-protected-resource/route.test.ts`:

```ts
import { describe, expect, test } from "vitest";

describe("GET /.well-known/oauth-protected-resource (US-22)", () => {
  test("retourne les metadonnees RFC 9728 basees sur l'origine de la requete", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("https://dodojo.vercel.app/.well-known/oauth-protected-resource"));
    const body = await response.json();
    expect(body).toMatchObject({
      resource: "https://dodojo.vercel.app/api/mcp",
      authorization_servers: ["https://dodojo.vercel.app"],
    });
  });
});
```

- [ ] **Step 6: Lancer les tests, verifier qu'ils echouent**

```bash
npm test -- app/.well-known
```
Expected: FAIL - Cannot find module './route' (x2).

- [ ] **Step 7: Implementer les routes**

Create `app/.well-known/oauth-authorization-server/route.ts`:

```ts
import { NextResponse } from "next/server";
import { buildAuthorizationServerMetadata } from "../../../lib/oauth-metadata";

export const dynamic = "force-dynamic";

// RFC 8414 : metadonnees de decouverte du serveur d'autorisation, attendues
// par tout client MCP conforme (Gemini) avant d'entamer le flow OAuth.
export async function GET(request: Request): Promise<Response> {
  const origin = new URL(request.url).origin;
  return NextResponse.json(buildAuthorizationServerMetadata(origin));
}
```

Create `app/.well-known/oauth-protected-resource/route.ts`:

```ts
import { NextResponse } from "next/server";
import { buildProtectedResourceMetadata } from "../../../lib/oauth-metadata";

export const dynamic = "force-dynamic";

// RFC 9728 : pointe /api/mcp vers son serveur d'autorisation. Reference
// depuis le header WWW-Authenticate d'un 401 de /api/mcp (Task 13).
export async function GET(request: Request): Promise<Response> {
  const origin = new URL(request.url).origin;
  return NextResponse.json(buildProtectedResourceMetadata(origin));
}
```

- [ ] **Step 8: Lancer les tests, verifier qu'ils passent**

```bash
npm test -- app/.well-known
```
Expected: PASS (2 tests).

- [ ] **Step 9: Verifier que tout compile**

```bash
npx tsc --noEmit
```
Expected: pas d'erreur.

- [ ] **Step 10: Commit**

```bash
git add lib/oauth-metadata.ts lib/oauth-metadata.test.ts app/.well-known
git commit -m "feat: metadonnees de decouverte OAuth RFC 8414/9728 (US-22)"
```

---

### Task 8: `lib/oauth-request-body.ts` - parsing form/JSON partage (TDD)

**Files:**
- Create: `lib/oauth-request-body.ts`
- Test: `lib/oauth-request-body.test.ts`

**Interfaces:**
- Produces: `parseOAuthRequestBody(request: Request): Promise<Record<string, string>>` - consomme par les Tasks 11 (`/oauth/token`) et 12 (`/oauth/revoke`).

- [ ] **Step 1: Ecrire le test qui echoue**

Create `lib/oauth-request-body.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { parseOAuthRequestBody } from "./oauth-request-body";

describe("parseOAuthRequestBody (US-22)", () => {
  test("parse un corps application/x-www-form-urlencoded", async () => {
    const request = new Request("http://localhost/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "grant_type=authorization_code&code=abc123",
    });
    await expect(parseOAuthRequestBody(request)).resolves.toEqual({
      grant_type: "authorization_code",
      code: "abc123",
    });
  });

  test("parse un corps application/json", async () => {
    const request = new Request("http://localhost/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grant_type: "refresh_token", refresh_token: "xyz" }),
    });
    await expect(parseOAuthRequestBody(request)).resolves.toEqual({
      grant_type: "refresh_token",
      refresh_token: "xyz",
    });
  });

  test("ignore les champs JSON non-string", async () => {
    const request = new Request("http://localhost/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grant_type: "authorization_code", extra: 42 }),
    });
    await expect(parseOAuthRequestBody(request)).resolves.toEqual({ grant_type: "authorization_code" });
  });
});
```

- [ ] **Step 2: Lancer le test, verifier qu'il echoue**

```bash
npm test -- lib/oauth-request-body.test.ts
```
Expected: FAIL - Cannot find module './oauth-request-body'.

- [ ] **Step 3: Implementation minimale**

Create `lib/oauth-request-body.ts`:

```ts
// Les endpoints OAuth token/revoke acceptent classiquement
// application/x-www-form-urlencoded (RFC 6749 paragraphes 4.1.3/2.3), mais
// aussi application/json (tolerance courante cote clients MCP). Ne retient
// que les valeurs string (un champ non-string est ignore, jamais caste).
export async function parseOAuthRequestBody(request: Request): Promise<Record<string, string>> {
  const contentType = request.headers.get("content-type") ?? "";
  const result: Record<string, string> = {};

  if (contentType.includes("application/json")) {
    const json = (await request.json()) as Record<string, unknown>;
    for (const [key, value] of Object.entries(json)) {
      if (typeof value === "string") result[key] = value;
    }
    return result;
  }

  const form = await request.formData();
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") result[key] = value;
  }
  return result;
}
```

- [ ] **Step 4: Lancer le test, verifier qu'il passe**

```bash
npm test -- lib/oauth-request-body.test.ts
```
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/oauth-request-body.ts lib/oauth-request-body.test.ts
git commit -m "feat: parsing de corps OAuth form/JSON partage (lib/oauth-request-body.ts, US-22)"
```

---

### Task 9: `POST /oauth/register` (RFC 7591) + tests d'integration

**Files:**
- Create: `app/oauth/register/route.ts`
- Test: `app/oauth/register/route.test.ts`

**Interfaces:**
- Consumes: `validateClientRegistration` (Task 5, `../../../lib/oauth-client-registration`), `createRateLimiter`/`extractClientIp` (Task 6, `../../../lib/rate-limit`).
- Produces: `POST` handler a `/oauth/register` - `429` si rate limite depassee, `400` si `redirect_uris` invalide, `201 { client_id, client_name, redirect_uris, token_endpoint_auth_method: "none", grant_types, response_types }` sinon (jamais de `client_secret`, client public). Consomme par tout client MCP tiers (Gemini) et par la Task 10 (`/oauth/authorize` a besoin d'un `client_id` enregistre).

- [ ] **Step 1: Ecrire le test qui echoue**

Create `app/oauth/register/route.test.ts`:

```ts
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
```

- [ ] **Step 2: Ajouter les cas de test**

Append au meme fichier `app/oauth/register/route.test.ts` :

```ts

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
```

- [ ] **Step 3: Lancer le test, verifier qu'il echoue**

```bash
npm test -- app/oauth/register/route.test.ts
```
Expected: FAIL - Cannot find module './route'.

- [ ] **Step 4: Implementation minimale**

Create `app/oauth/register/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateClientRegistration } from "../../../lib/oauth-client-registration";
import { createRateLimiter, extractClientIp } from "../../../lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// RFC 7591 : endpoint OUVERT par construction (n'importe quel client MCP
// peut s'auto-enregistrer) - rate limit basique par IP, best-effort (cf.
// lib/rate-limit.ts). 5 enregistrements/minute/IP est large pour un usage
// legitime (un client ne s'enregistre qu'une fois par appareil/install) mais
// bloque un scraping grossier.
const registerRateLimiter = createRateLimiter(5, 60_000);

interface OAuthClientRow {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
}

export async function POST(request: Request): Promise<Response> {
  const ip = extractClientIp(request);
  if (!registerRateLimiter.consume(ip).allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_client_metadata" }, { status: 400 });
  }

  const validation = validateClientRegistration(body);
  if ("error" in validation) {
    return NextResponse.json(
      { error: "invalid_client_metadata", error_description: validation.error },
      { status: 400 },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.NEXT_PRIVATE_KEY_SUPABASE;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: inserted, error } = await supabase
    .from("oauth_clients")
    .insert({
      client_name: validation.registration.clientName,
      redirect_uris: validation.registration.redirectUris,
    })
    .select("client_id, client_name, redirect_uris")
    .single();

  if (error || !inserted) {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
  const client = inserted as OAuthClientRow;

  // Client PUBLIC (PKCE seul, pas de secret) - cf. design : "client public,
  // pas de secret necessaire s'il utilise PKCE".
  return NextResponse.json(
    {
      client_id: client.client_id,
      client_name: client.client_name,
      redirect_uris: client.redirect_uris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
    { status: 201 },
  );
}
```

- [ ] **Step 5: Lancer le test, verifier qu'il passe**

```bash
npm test -- app/oauth/register/route.test.ts
```
Expected: PASS (5 tests).

- [ ] **Step 6: Verifier que tout compile**

```bash
npx tsc --noEmit
```
Expected: pas d'erreur.

- [ ] **Step 7: Commit**

```bash
git add app/oauth/register
git commit -m "feat: route POST /oauth/register RFC 7591 (US-22)"
```

---

### Task 10: `lib/oauth-consent-page.ts` + `GET`/`POST /oauth/authorize` (PKCE, consentement) + tests d'integration

**Files:**
- Create: `lib/oauth-consent-page.ts`
- Test: `lib/oauth-consent-page.test.ts`
- Create: `app/oauth/authorize/route.ts`
- Test: `app/oauth/authorize/route.test.ts`

**Interfaces:**
- Consumes: `generateOpaqueToken`, `hashOpaqueToken`, `expiresAtFromNow`, `AUTHORIZATION_CODE_TTL_MS` (Task 4, `../../../lib/oauth-tokens`), `createClient` (`../../../lib/supabase/server`, existant).
- Produces: `renderConsentPage(params: ConsentPageParams): string`, `renderErrorPage(message: string): string` (`lib/oauth-consent-page.ts`) ; `GET`/`POST` handlers a `/oauth/authorize` - consommes par le navigateur de l'utilisateur (redirige depuis les reglages "Connected Apps" de Gemini) et, pour le code genere, par la Task 11 (`/oauth/token`).

- [ ] **Step 1: Ecrire le test qui echoue (page de consentement)**

Create `lib/oauth-consent-page.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { renderConsentPage, renderErrorPage } from "./oauth-consent-page";

describe("renderConsentPage (US-22)", () => {
  const baseParams = {
    clientName: "Gemini",
    scope: "tasks:write",
    clientId: "11111111-1111-1111-1111-111111111111",
    redirectUri: "https://gemini.google.com/callback",
    codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    codeChallengeMethod: "S256",
    state: "xyz",
  };

  test("affiche le nom du client et la portee demandee", () => {
    const html = renderConsentPage(baseParams);
    expect(html).toContain("Gemini veut ajouter des taches a ta place");
    expect(html).toContain("tasks:write");
  });

  test("porte les champs caches necessaires a la reconstruction de la requete", () => {
    const html = renderConsentPage(baseParams);
    expect(html).toContain('name="client_id" value="11111111-1111-1111-1111-111111111111"');
    expect(html).toContain('name="redirect_uri" value="https://gemini.google.com/callback"');
    expect(html).toContain('name="code_challenge" value="E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"');
    expect(html).toContain('name="code_challenge_method" value="S256"');
    expect(html).toContain('name="state" value="xyz"');
  });

  test("echappe un client_name malveillant (protection XSS)", () => {
    const html = renderConsentPage(Object.assign({}, baseParams, { clientName: "<script>alert(1)</script>" }));
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("renderErrorPage", () => {
  test("affiche le message d'erreur echappe", () => {
    const html = renderErrorPage("redirect_uri non enregistre <img>");
    expect(html).toContain("redirect_uri non enregistre");
    expect(html).not.toContain("<img>");
  });
});
```

- [ ] **Step 2: Lancer le test, verifier qu'il echoue**

```bash
npm test -- lib/oauth-consent-page.test.ts
```
Expected: FAIL - Cannot find module './oauth-consent-page'.

- [ ] **Step 3: Implementation minimale**

Create `lib/oauth-consent-page.ts`:

```ts
export interface ConsentPageParams {
  clientName: string;
  scope: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  state: string | null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function hiddenField(name: string, value: string): string {
  return '<input type="hidden" name="' + escapeHtml(name) + '" value="' + escapeHtml(value) + '" />';
}

// US-22 : ecran de consentement OAuth (design : "Gemini veut ajouter des
// taches a ta place - Autoriser ?"). HTML minimal genere cote serveur (pas
// de composant React : ce endpoint doit rester un Route Handler testable en
// Vitest sans moteur de rendu React, cf. Global Constraints du plan).
export function renderConsentPage(params: ConsentPageParams): string {
  const hidden = [
    hiddenField("client_id", params.clientId),
    hiddenField("redirect_uri", params.redirectUri),
    hiddenField("code_challenge", params.codeChallenge),
    hiddenField("code_challenge_method", params.codeChallengeMethod),
    hiddenField("scope", params.scope),
    hiddenField("state", params.state ?? ""),
  ].join("\n        ");

  return [
    "<!doctype html>",
    '<html lang="fr">',
    "  <head>",
    '    <meta charset="utf-8" />',
    "    <title>Autoriser " + escapeHtml(params.clientName) + " - Dodojo</title>",
    "  </head>",
    "  <body>",
    "    <main>",
    "      <h1>" + escapeHtml(params.clientName) + " veut ajouter des taches a ta place</h1>",
    "      <p>Portee demandee : " + escapeHtml(params.scope) + "</p>",
    '      <form method="POST" action="/oauth/authorize">',
    "        " + hidden,
    '        <button type="submit" name="decision" value="approve">Autoriser</button>',
    '        <button type="submit" name="decision" value="deny">Refuser</button>',
    "      </form>",
    "    </main>",
    "  </body>",
    "</html>",
  ].join("\n");
}

export function renderErrorPage(message: string): string {
  return [
    "<!doctype html>",
    '<html lang="fr">',
    "  <head><meta charset=\"utf-8\" /><title>Erreur d'autorisation - Dodojo</title></head>",
    "  <body><main><h1>Autorisation refusee</h1><p>" + escapeHtml(message) + "</p></main></body>",
    "</html>",
  ].join("\n");
}
```

- [ ] **Step 4: Lancer le test, verifier qu'il passe**

```bash
npm test -- lib/oauth-consent-page.test.ts
```
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/oauth-consent-page.ts lib/oauth-consent-page.test.ts
git commit -m "feat: page de consentement OAuth (lib/oauth-consent-page.ts, US-22)"
```

- [ ] **Step 6: Ecrire le test qui echoue (route /oauth/authorize)**

Create `app/oauth/authorize/route.test.ts`:

```ts
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
    expect(html).toContain("Gemini veut ajouter des taches a ta place");
  });
});
```

Append au meme fichier `app/oauth/authorize/route.test.ts` :

```ts

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
```

- [ ] **Step 7: Lancer le test, verifier qu'il echoue**

```bash
npm test -- app/oauth/authorize/route.test.ts
```
Expected: FAIL - Cannot find module './route'.

- [ ] **Step 8: Implementation minimale**

Create `app/oauth/authorize/route.ts`:

```ts
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createSessionClient } from "../../../lib/supabase/server";
import { renderConsentPage, renderErrorPage } from "../../../lib/oauth-consent-page";
import {
  AUTHORIZATION_CODE_TTL_MS,
  expiresAtFromNow,
  generateOpaqueToken,
  hashOpaqueToken,
} from "../../../lib/oauth-tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface OAuthClientRow {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
}

interface AuthorizeParams {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope: string;
  state: string | null;
}

function parseAuthorizeParams(searchParams: URLSearchParams): AuthorizeParams {
  return {
    clientId: searchParams.get("client_id") ?? "",
    redirectUri: searchParams.get("redirect_uri") ?? "",
    codeChallenge: searchParams.get("code_challenge") ?? "",
    codeChallengeMethod: searchParams.get("code_challenge_method") ?? "",
    scope: searchParams.get("scope") ?? "tasks:write",
    state: searchParams.get("state"),
  };
}

async function loadClient(supabase: SupabaseClient, clientId: string): Promise<OAuthClientRow | null> {
  if (!clientId) return null;
  const { data } = await supabase
    .from("oauth_clients")
    .select("client_id, client_name, redirect_uris")
    .eq("client_id", clientId)
    .maybeSingle();
  return (data as OAuthClientRow | null) ?? null;
}

// Valide client_id/redirect_uri/code_challenge_method AVANT toute
// redirection vers redirect_uri (RFC 6749 paragraphe 10.6 : ne jamais
// rediriger vers une URL non verifiee - prevention d'open redirect).
// Retourne le client si tout est valide, sinon une erreur affichee
// directement (jamais une redirection).
async function validateAuthorizeRequest(
  supabase: SupabaseClient,
  params: AuthorizeParams,
): Promise<{ client: OAuthClientRow } | { error: string }> {
  const client = await loadClient(supabase, params.clientId);
  if (!client) return { error: "client_id inconnu." };
  if (!params.redirectUri || !client.redirect_uris.includes(params.redirectUri)) {
    return { error: "redirect_uri non enregistre pour ce client." };
  }
  if (params.codeChallengeMethod !== "S256" || !params.codeChallenge) {
    return { error: "code_challenge_method doit etre S256 avec un code_challenge." };
  }
  return { client };
}

function errorPageResponse(message: string): Response {
  return new NextResponse(renderErrorPage(message), {
    status: 400,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

// US-22 : GET affiche l'ecran de consentement ("Gemini veut ajouter des
// taches a ta place - Autoriser ?", design) - necessite une session Dodojo
// active, sinon redirection vers /login d'abord.
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const params = parseAuthorizeParams(url.searchParams);

  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const nextPath = "/oauth/authorize?" + url.searchParams.toString();
    const loginUrl = new URL("/login", url.origin);
    loginUrl.searchParams.set("next", nextPath);
    return NextResponse.redirect(loginUrl);
  }

  const validation = await validateAuthorizeRequest(supabase, params);
  if ("error" in validation) {
    return errorPageResponse(validation.error);
  }

  const html = renderConsentPage({
    clientName: validation.client.client_name,
    scope: params.scope,
    clientId: params.clientId,
    redirectUri: params.redirectUri,
    codeChallenge: params.codeChallenge,
    codeChallengeMethod: params.codeChallengeMethod,
    state: params.state,
  });
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

// US-22 : POST traite la decision (Autoriser/Refuser) soumise depuis
// l'ecran de consentement. Revalide TOUT cote serveur (jamais confiance
// dans les champs caches du formulaire) avant de generer le code
// d'autorisation.
export async function POST(request: Request): Promise<Response> {
  const form = await request.formData();
  const params: AuthorizeParams = {
    clientId: String(form.get("client_id") ?? ""),
    redirectUri: String(form.get("redirect_uri") ?? ""),
    codeChallenge: String(form.get("code_challenge") ?? ""),
    codeChallengeMethod: String(form.get("code_challenge_method") ?? ""),
    scope: String(form.get("scope") ?? "tasks:write"),
    state: form.get("state") ? String(form.get("state")) : null,
  };
  const decision = String(form.get("decision") ?? "");

  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const validation = await validateAuthorizeRequest(supabase, params);
  if ("error" in validation) {
    return errorPageResponse(validation.error);
  }

  const redirectUrl = new URL(params.redirectUri);
  if (params.state) redirectUrl.searchParams.set("state", params.state);

  if (decision !== "approve") {
    redirectUrl.searchParams.set("error", "access_denied");
    return NextResponse.redirect(redirectUrl);
  }

  const code = generateOpaqueToken();
  const { error: insertError } = await supabase.from("oauth_authorization_codes").insert({
    code_hash: hashOpaqueToken(code),
    client_id: params.clientId,
    user_id: user.id,
    redirect_uri: params.redirectUri,
    code_challenge: params.codeChallenge,
    code_challenge_method: params.codeChallengeMethod,
    scope: params.scope,
    expires_at: expiresAtFromNow(AUTHORIZATION_CODE_TTL_MS),
  });

  if (insertError) {
    return errorPageResponse("Impossible de generer le code d'autorisation. Reessaie.");
  }

  redirectUrl.searchParams.set("code", code);
  return NextResponse.redirect(redirectUrl);
}
```

- [ ] **Step 9: Lancer le test, verifier qu'il passe**

```bash
npm test -- app/oauth/authorize/route.test.ts
```
Expected: PASS (9 tests).

- [ ] **Step 10: Verifier que tout compile**

```bash
npx tsc --noEmit
```
Expected: pas d'erreur.

- [ ] **Step 11: Commit**

```bash
git add app/oauth/authorize
git commit -m "feat: route GET/POST /oauth/authorize (consentement PKCE, US-22)"
```

---

### Task 11: `POST /oauth/token` (authorization_code + refresh_token) + tests d'integration

**Files:**
- Create: `app/oauth/token/route.ts`
- Test: `app/oauth/token/route.test.ts`

**Interfaces:**
- Consumes: `verifyCodeChallenge` (Task 3, `../../../lib/pkce`), `ACCESS_TOKEN_TTL_MS`, `expiresAtFromNow`, `generateOpaqueToken`, `hashOpaqueToken`, `isExpired` (Task 4, `../../../lib/oauth-tokens`), `parseOAuthRequestBody` (Task 8, `../../../lib/oauth-request-body`), `createRateLimiter`/`extractClientIp` (Task 6, `../../../lib/rate-limit`).
- Produces: `POST` handler a `/oauth/token` - `400 { error: "unsupported_grant_type" | "invalid_request" | "invalid_grant" }`, `429 { error: "rate_limited" }`, ou `200 { access_token, refresh_token, token_type: "Bearer", expires_in, scope }`. Le `access_token` produit est consomme par la Task 13 (`/api/mcp`).

- [ ] **Step 1: Ecrire le test qui echoue (fakes + grant authorization_code)**

Create `app/oauth/token/route.test.ts`:

```ts
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
```

Append au meme fichier `app/oauth/token/route.test.ts` :

```ts

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
```

Append encore au meme fichier (suite des cas `authorization_code`) :

```ts

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
```

Append encore (echange reussi + rejeu) :

```ts

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
```

- [ ] **Step 2: Ecrire le test qui echoue (grant refresh_token + rate limiting)**

Append au meme fichier `app/oauth/token/route.test.ts` :

```ts

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
```

Append encore (rotation refresh_token + rate limiting) :

```ts

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
```

- [ ] **Step 3: Lancer le test, verifier qu'il echoue**

```bash
npm test -- app/oauth/token/route.test.ts
```
Expected: FAIL - Cannot find module './route'.

- [ ] **Step 4: Implementation minimale (partie 1 - dispatch + grant authorization_code)**

Create `app/oauth/token/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyCodeChallenge } from "../../../lib/pkce";
import {
  ACCESS_TOKEN_TTL_MS,
  expiresAtFromNow,
  generateOpaqueToken,
  hashOpaqueToken,
  isExpired,
} from "../../../lib/oauth-tokens";
import { parseOAuthRequestBody } from "../../../lib/oauth-request-body";
import { createRateLimiter, extractClientIp } from "../../../lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Endpoint OUVERT par construction (n'importe quel client MCP peut
// echanger un code ou renouveler un token) - rate limit basique par IP,
// best-effort.
const tokenRateLimiter = createRateLimiter(10, 60_000);

interface AuthorizationCodeRow {
  code_hash: string;
  client_id: string;
  user_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  scope: string;
  expires_at: string;
}

interface OAuthTokenRow {
  id: string;
  access_token_hash: string;
  refresh_token_hash: string | null;
  client_id: string;
  user_id: string;
  scope: string;
  expires_at: string;
}

function tokenError(error: string, status: number): Response {
  return NextResponse.json({ error }, { status });
}

function serviceClient(): ReturnType<typeof createClient> | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.NEXT_PRIVATE_KEY_SUPABASE;
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
}

// US-22 : POST /oauth/token - echange le code d'autorisation (grant
// authorization_code, PKCE obligatoire) ou renouvelle un access_token
// (grant refresh_token). Client PUBLIC (pas de secret, cf. design) : la
// seule preuve de possession exigee est le code_verifier (PKCE).
export async function POST(request: Request): Promise<Response> {
  const ip = extractClientIp(request);
  if (!tokenRateLimiter.consume(ip).allowed) {
    return tokenError("rate_limited", 429);
  }

  let body: Record<string, string>;
  try {
    body = await parseOAuthRequestBody(request);
  } catch {
    return tokenError("invalid_request", 400);
  }

  const supabase = serviceClient();
  if (!supabase) {
    return tokenError("server_error", 500);
  }

  if (body.grant_type === "authorization_code") {
    return handleAuthorizationCodeGrant(supabase, body);
  }
  if (body.grant_type === "refresh_token") {
    return handleRefreshTokenGrant(supabase, body);
  }
  return tokenError("unsupported_grant_type", 400);
}

async function handleAuthorizationCodeGrant(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, string>,
): Promise<Response> {
  const code = body.code;
  const codeVerifier = body.code_verifier;
  const redirectUri = body.redirect_uri;
  const clientId = body.client_id;
  if (!code || !codeVerifier || !redirectUri || !clientId) {
    return tokenError("invalid_request", 400);
  }

  const { data } = await supabase
    .from("oauth_authorization_codes")
    .select("code_hash, client_id, user_id, redirect_uri, code_challenge, code_challenge_method, scope, expires_at")
    .eq("code_hash", hashOpaqueToken(code))
    .maybeSingle();

  const authCode = data as AuthorizationCodeRow | null;

  // Usage unique (RFC 6749 paragraphe 4.1.2) : le code est supprime des
  // qu'on l'a lu, valide ou pas - empeche tout rejeu meme si l'echange
  // echoue ensuite pour une autre raison (client_id/redirect_uri/PKCE
  // invalides).
  if (authCode) {
    await supabase.from("oauth_authorization_codes").delete().eq("code_hash", authCode.code_hash);
  }

  if (
    !authCode ||
    authCode.client_id !== clientId ||
    authCode.redirect_uri !== redirectUri ||
    isExpired(authCode.expires_at)
  ) {
    return tokenError("invalid_grant", 400);
  }

  if (!verifyCodeChallenge(codeVerifier, authCode.code_challenge)) {
    return tokenError("invalid_grant", 400);
  }

  return issueTokenResponse(supabase, authCode.client_id, authCode.user_id, authCode.scope);
}
```

- [ ] **Step 5: Implementation minimale (partie 2 - grant refresh_token + emission)**

Append a la fin de `app/oauth/token/route.ts` :

```ts

async function handleRefreshTokenGrant(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, string>,
): Promise<Response> {
  const refreshToken = body.refresh_token;
  const clientId = body.client_id;
  if (!refreshToken || !clientId) {
    return tokenError("invalid_request", 400);
  }

  const { data } = await supabase
    .from("oauth_tokens")
    .select("id, access_token_hash, refresh_token_hash, client_id, user_id, scope, expires_at")
    .eq("refresh_token_hash", hashOpaqueToken(refreshToken))
    .maybeSingle();

  const existing = data as OAuthTokenRow | null;
  if (!existing || existing.client_id !== clientId) {
    return tokenError("invalid_grant", 400);
  }

  // Rotation (best practice OAuth 2.1) : l'ancien couple access/refresh est
  // supprime, un nouveau est emis - limite la fenetre d'exploitation d'un
  // refresh_token vole. Pas de TTL propre au refresh_token dans ce MVP (une
  // seule colonne expires_at par ligne, cf. schema) : il reste valide
  // jusqu'a rotation ou revocation explicite (/oauth/revoke).
  await supabase.from("oauth_tokens").delete().eq("id", existing.id);

  return issueTokenResponse(supabase, existing.client_id, existing.user_id, existing.scope);
}

async function issueTokenResponse(
  supabase: ReturnType<typeof createClient>,
  clientId: string,
  userId: string,
  scope: string,
): Promise<Response> {
  const accessToken = generateOpaqueToken();
  const refreshToken = generateOpaqueToken();

  const { error } = await supabase.from("oauth_tokens").insert({
    access_token_hash: hashOpaqueToken(accessToken),
    refresh_token_hash: hashOpaqueToken(refreshToken),
    client_id: clientId,
    user_id: userId,
    scope,
    expires_at: expiresAtFromNow(ACCESS_TOKEN_TTL_MS),
  });

  if (error) {
    return tokenError("server_error", 500);
  }

  return NextResponse.json({
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: "Bearer",
    expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    scope,
  });
}
```

- [ ] **Step 6: Lancer le test, verifier qu'il passe**

```bash
npm test -- app/oauth/token/route.test.ts
```
Expected: PASS (12 tests).

- [ ] **Step 7: Verifier que tout compile**

```bash
npx tsc --noEmit
```
Expected: pas d'erreur.

- [ ] **Step 8: Commit**

```bash
git add app/oauth/token
git commit -m "feat: route POST /oauth/token (authorization_code + refresh_token, US-22)"
```

---

### Task 12: `POST /oauth/revoke` (RFC 7009) + tests d'integration

**Files:**
- Create: `app/oauth/revoke/route.ts`
- Test: `app/oauth/revoke/route.test.ts`

**Interfaces:**
- Consumes: `hashOpaqueToken` (Task 4, `../../../lib/oauth-tokens`), `parseOAuthRequestBody` (Task 8, `../../../lib/oauth-request-body`).
- Produces: `POST` handler a `/oauth/revoke` - toujours `200` (RFC 7009 paragraphe 2.2 : ne jamais reveler si un token existait), sauf `400` si le champ `token` est absent. Supprime la ligne `oauth_tokens` correspondante (access OU refresh token soumis). Consomme par le bouton "Deconnecter" de Gemini (reglages "Connected Apps").

- [ ] **Step 1: Ecrire le test qui echoue**

Create `app/oauth/revoke/route.test.ts`:

```ts
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
```

Append au meme fichier `app/oauth/revoke/route.test.ts` :

```ts

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
```

- [ ] **Step 2: Lancer le test, verifier qu'il echoue**

```bash
npm test -- app/oauth/revoke/route.test.ts
```
Expected: FAIL - Cannot find module './route'.

- [ ] **Step 3: Implementation minimale**

Create `app/oauth/revoke/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { hashOpaqueToken } from "../../../lib/oauth-tokens";
import { parseOAuthRequestBody } from "../../../lib/oauth-request-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function serviceClient(): ReturnType<typeof createClient> | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.NEXT_PRIVATE_KEY_SUPABASE;
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
}

// US-22 : POST /oauth/revoke (RFC 7009) - revocation proactive cote client
// (Gemini), ex. deconnexion initiee depuis les reglages "Connected Apps"
// plutot que depuis le QG Dodojo. Le token soumis peut etre un access_token
// OU un refresh_token (RFC 7009 paragraphe 2.1) : les deux hashent la meme
// ligne oauth_tokens (couple emis ensemble), chercher sur les deux colonnes
// suffit a retrouver et supprimer la ligne entiere. Toujours 200, meme si
// le token est deja invalide/inconnu (RFC 7009 paragraphe 2.2 : ne jamais
// reveler si un token existait).
export async function POST(request: Request): Promise<Response> {
  let body: Record<string, string>;
  try {
    body = await parseOAuthRequestBody(request);
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const token = body.token;
  if (!token) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const supabase = serviceClient();
  if (!supabase) {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  const hash = hashOpaqueToken(token);
  await supabase.from("oauth_tokens").delete().eq("access_token_hash", hash);
  await supabase.from("oauth_tokens").delete().eq("refresh_token_hash", hash);

  return new NextResponse(null, { status: 200 });
}
```

- [ ] **Step 4: Lancer le test, verifier qu'il passe**

```bash
npm test -- app/oauth/revoke/route.test.ts
```
Expected: PASS (4 tests).

- [ ] **Step 5: Verifier que tout compile**

```bash
npx tsc --noEmit
```
Expected: pas d'erreur.

- [ ] **Step 6: Commit**

```bash
git add app/oauth/revoke
git commit -m "feat: route POST /oauth/revoke RFC 7009 (US-22)"
```

---

### Task 13: `lib/mcp-protocol.ts` + `POST /api/mcp` (Streamable HTTP, tool `add_task`) + tests d'integration

**Files:**
- Create: `lib/mcp-protocol.ts`
- Test: `lib/mcp-protocol.test.ts`
- Create: `app/api/mcp/route.ts`
- Test: `app/api/mcp/route.test.ts`

**Interfaces:**
- Consumes: `insertTaskForUser` (US-03, `../../../lib/task-insertion`), `validateTaskTitle` (US-03, `../../../lib/task-title`), `hashOpaqueToken`, `isExpired` (Task 4, `../../../lib/oauth-tokens`), `type InsertTaskOutcome` (US-03, `./task-insertion`, importe par `lib/mcp-protocol.ts`).
- Produces: `parseJsonRpcRequest`, `buildInitializeResult`, `buildToolsListResult`, `buildAddTaskToolResult`, `buildToolErrorResult`, `successResponse`, `errorResponse`, `ADD_TASK_TOOL`, `JSON_RPC_ERROR_METHOD_NOT_FOUND`, `JSON_RPC_ERROR_INVALID_PARAMS` (`lib/mcp-protocol.ts`) ; `POST` handler a `/api/mcp` (transport Streamable HTTP, JSON-RPC 2.0, tool `add_task`) - `401` (avec `WWW-Authenticate`) si Bearer absent/invalide/expire, `200`/`202` sinon. Endpoint final consomme par Gemini une fois autorise (access_token de la Task 11).

- [ ] **Step 1: Ecrire le test qui echoue (lib pure)**

Create `lib/mcp-protocol.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
  ADD_TASK_TOOL,
  buildAddTaskToolResult,
  buildInitializeResult,
  buildToolErrorResult,
  buildToolsListResult,
  errorResponse,
  parseJsonRpcRequest,
  successResponse,
} from "./mcp-protocol";

describe("parseJsonRpcRequest (US-22)", () => {
  test("accepte une requete JSON-RPC 2.0 valide avec params", () => {
    const parsed = parseJsonRpcRequest({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { a: 1 } });
    expect(parsed).toEqual({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { a: 1 } });
  });

  test("accepte une notification sans id (id -> null)", () => {
    const parsed = parseJsonRpcRequest({ jsonrpc: "2.0", method: "notifications/initialized" });
    expect(parsed?.id).toBeNull();
  });

  test("rejette un corps sans jsonrpc 2.0", () => {
    expect(parseJsonRpcRequest({ method: "tools/list" })).toBeNull();
  });

  test("rejette un corps sans method", () => {
    expect(parseJsonRpcRequest({ jsonrpc: "2.0" })).toBeNull();
  });

  test("rejette un id d'un type invalide", () => {
    expect(parseJsonRpcRequest({ jsonrpc: "2.0", id: {}, method: "tools/list" })).toBeNull();
  });

  test("rejette un body qui n'est pas un objet", () => {
    expect(parseJsonRpcRequest("pas un objet")).toBeNull();
    expect(parseJsonRpcRequest(null)).toBeNull();
  });
});
```

Append au meme fichier `lib/mcp-protocol.test.ts` :

```ts

describe("buildInitializeResult / buildToolsListResult", () => {
  test("initialize expose une version de protocole et les capacites tools", () => {
    const result = buildInitializeResult() as { capabilities: unknown; protocolVersion: unknown };
    expect(result.capabilities).toEqual({ tools: {} });
    expect(typeof result.protocolVersion).toBe("string");
  });

  test("tools/list expose add_task avec son schema d'entree", () => {
    const result = buildToolsListResult();
    expect(result.tools).toEqual([ADD_TASK_TOOL]);
    expect(ADD_TASK_TOOL.name).toBe("add_task");
    expect(ADD_TASK_TOOL.inputSchema.required).toEqual(["title"]);
  });
});

describe("buildAddTaskToolResult / buildToolErrorResult", () => {
  test("formate un resultat de succes avec les HP du Boss", () => {
    const result = buildAddTaskToolResult({ taskId: "t1", dayDate: "2026-07-22", bossMaxHp: 40, bossCurrentHp: 20 });
    expect(result.isError).toBe(false);
    expect(result.content).toEqual([
      { type: "text", text: "Tache ajoutee pour le 2026-07-22. Boss a 20/40 HP." },
    ]);
  });

  test("formate un resultat d'erreur outil", () => {
    const result = buildToolErrorResult("Nomme ton monstre avant de l'invoquer.");
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: "text", text: "Nomme ton monstre avant de l'invoquer." }]);
  });
});

describe("successResponse / errorResponse", () => {
  test("enveloppe un resultat en reponse JSON-RPC 2.0", () => {
    expect(successResponse(1, { ok: true })).toEqual({ jsonrpc: "2.0", id: 1, result: { ok: true } });
  });

  test("enveloppe une erreur en reponse JSON-RPC 2.0", () => {
    expect(errorResponse(1, -32601, "Methode inconnue")).toEqual({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32601, message: "Methode inconnue" },
    });
  });
});
```

- [ ] **Step 2: Lancer le test, verifier qu'il echoue**

```bash
npm test -- lib/mcp-protocol.test.ts
```
Expected: FAIL - Cannot find module './mcp-protocol'.

- [ ] **Step 3: Implementation minimale**

Create `lib/mcp-protocol.ts`:

```ts
import type { InsertTaskOutcome } from "./task-insertion";

// US-22 : cadre JSON-RPC 2.0 minimal pour le serveur MCP (transport
// Streamable HTTP, cf. spec d'autorisation MCP). Fonctions PURES - aucune
// I/O ici, le cablage Supabase/insertTaskForUser reste dans
// app/api/mcp/route.ts. MCP_PROTOCOL_VERSION suit la revision de spec la
// plus recente connue a la redaction de ce plan - A REVERIFIER a
// l'implementation (l'ecosysteme "Connected Apps" MCP de Gemini evolue
// vite, cf. design paragraphe Risques & inconnues).
export const MCP_PROTOCOL_VERSION = "2025-06-18";

export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}

export const ADD_TASK_TOOL: McpTool = {
  name: "add_task",
  description: "Ajoute une tache au combat du jour dans Dodojo.",
  inputSchema: {
    type: "object",
    properties: { title: { type: "string", description: "Titre de la tache a ajouter" } },
    required: ["title"],
  },
};

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: string | number | null; result: unknown }
  | { jsonrpc: "2.0"; id: string | number | null; error: { code: number; message: string } };

export const JSON_RPC_ERROR_METHOD_NOT_FOUND = -32601;
export const JSON_RPC_ERROR_INVALID_PARAMS = -32602;
export const JSON_RPC_ERROR_INTERNAL = -32603;

// Valide la forme minimale d'une requete JSON-RPC 2.0. id absent (une
// notification, ex. notifications/initialized) devient null - jamais
// undefined dans le type retourne, pour rester serialisable tel quel.
export function parseJsonRpcRequest(body: unknown): JsonRpcRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const candidate = body as Record<string, unknown>;
  if (candidate.jsonrpc !== "2.0" || typeof candidate.method !== "string") return null;

  const id = candidate.id;
  if (id !== undefined && id !== null && typeof id !== "string" && typeof id !== "number") {
    return null;
  }

  return {
    jsonrpc: "2.0",
    id: (id as string | number | null | undefined) ?? null,
    method: candidate.method,
    params: (candidate.params as Record<string, unknown> | undefined) ?? undefined,
  };
}

export function buildInitializeResult(): Record<string, unknown> {
  return {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: { tools: {} },
    serverInfo: { name: "dodojo-mcp", version: "1.0.0" },
  };
}

export function buildToolsListResult(): { tools: McpTool[] } {
  return { tools: [ADD_TASK_TOOL] };
}

export interface McpToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError: boolean;
}

export function buildAddTaskToolResult(outcome: InsertTaskOutcome): McpToolResult {
  const text =
    "Tache ajoutee pour le " +
    outcome.dayDate +
    ". Boss a " +
    String(outcome.bossCurrentHp) +
    "/" +
    String(outcome.bossMaxHp) +
    " HP.";
  return { content: [{ type: "text", text }], isError: false };
}

export function buildToolErrorResult(message: string): McpToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

export function successResponse(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

export function errorResponse(id: string | number | null, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}
```

- [ ] **Step 4: Lancer le test, verifier qu'il passe**

```bash
npm test -- lib/mcp-protocol.test.ts
```
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/mcp-protocol.ts lib/mcp-protocol.test.ts
git commit -m "feat: cadre JSON-RPC 2.0 du serveur MCP (lib/mcp-protocol.ts, US-22)"
```

- [ ] **Step 6: Ecrire le test qui echoue (route /api/mcp - fakes + authentification)**

Create `app/api/mcp/route.test.ts`:

```ts
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
```

- [ ] **Step 7: Lancer le test, verifier qu'il echoue**

```bash
npm test -- app/api/mcp/route.test.ts
```
Expected: FAIL - Cannot find module './route'.

Append au meme fichier `app/api/mcp/route.test.ts` :

```ts

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
```

- [ ] **Step 8: Implementation minimale (partie 1 - authentification + dispatch)**

Create `app/api/mcp/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertTaskForUser } from "../../../lib/task-insertion";
import { validateTaskTitle } from "../../../lib/task-title";
import { hashOpaqueToken, isExpired } from "../../../lib/oauth-tokens";
import {
  ADD_TASK_TOOL,
  buildAddTaskToolResult,
  buildInitializeResult,
  buildToolErrorResult,
  buildToolsListResult,
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

function serviceClient(): ReturnType<typeof createClient> | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.NEXT_PRIVATE_KEY_SUPABASE;
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
}

// US-22 : serveur MCP (Resource Server), transport Streamable HTTP - un
// seul tool expose, add_task. Verifie le Bearer token contre oauth_tokens
// (hash + expiration) puis delegue STRICTEMENT a insertTaskForUser
// (lib/task-insertion.ts, US-03) : meme logique d'insertion + recalcul HP
// (RG-01/RG-02) que le formulaire in-app et le webhook Siri, jamais
// dupliquee.
export async function POST(request: Request): Promise<Response> {
  const token = extractBearerToken(request.headers.get("authorization"));
  if (!token) return unauthorized(request);

  const supabase = serviceClient();
  if (!supabase) {
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }

  const { data: tokenRow } = await supabase
    .from("oauth_tokens")
    .select("user_id, expires_at")
    .eq("access_token_hash", hashOpaqueToken(token))
    .maybeSingle();

  const resolvedToken = tokenRow as OAuthTokenRow | null;
  if (!resolvedToken || isExpired(resolvedToken.expires_at)) {
    return unauthorized(request);
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
    return NextResponse.json(successResponse(rpcRequest.id, buildToolsListResult()));
  }
  if (rpcRequest.method === "tools/call") {
    return handleToolsCall(supabase, resolvedToken.user_id, rpcRequest);
  }

  return NextResponse.json(
    errorResponse(rpcRequest.id, JSON_RPC_ERROR_METHOD_NOT_FOUND, "Methode inconnue : " + rpcRequest.method),
  );
}
```

- [ ] **Step 9: Implementation minimale (partie 2 - tools/call add_task)**

Append a la fin de `app/api/mcp/route.ts` :

```ts

async function handleToolsCall(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  rpcRequest: JsonRpcRequest,
): Promise<Response> {
  const toolName = rpcRequest.params?.name;
  const args = (rpcRequest.params?.arguments as Record<string, unknown> | undefined) ?? {};

  if (toolName !== ADD_TASK_TOOL.name) {
    return NextResponse.json(
      errorResponse(rpcRequest.id, JSON_RPC_ERROR_METHOD_NOT_FOUND, "Tool inconnu : " + String(toolName)),
    );
  }

  const rawTitle = args.title;
  if (typeof rawTitle !== "string") {
    return NextResponse.json(successResponse(rpcRequest.id, buildToolErrorResult("title est requis (string).")));
  }

  const validation = validateTaskTitle(rawTitle);
  if ("error" in validation) {
    return NextResponse.json(successResponse(rpcRequest.id, buildToolErrorResult(validation.error)));
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", userId)
    .maybeSingle();
  const timezone = (profile as ProfileTimezoneRow | null)?.timezone ?? "UTC";

  try {
    const outcome = await insertTaskForUser(supabase, { userId, title: validation.title, timezone });
    return NextResponse.json(successResponse(rpcRequest.id, buildAddTaskToolResult(outcome)));
  } catch {
    return NextResponse.json(successResponse(rpcRequest.id, buildToolErrorResult("insert_task_failed")));
  }
}
```

- [ ] **Step 10: Lancer le test, verifier qu'il passe**

```bash
npm test -- app/api/mcp/route.test.ts
```
Expected: PASS (10 tests).

- [ ] **Step 11: Lancer toute la suite Vitest (regression)**

```bash
npm test
```
Expected: tous les tests passent (existants + nouveaux).

- [ ] **Step 12: Verifier que tout compile**

```bash
npx tsc --noEmit
```
Expected: pas d'erreur.

- [ ] **Step 13: Commit**

```bash
git add lib/mcp-protocol.ts lib/mcp-protocol.test.ts app/api/mcp
git commit -m "feat: serveur MCP POST /api/mcp (Streamable HTTP, tool add_task, US-22)"
```

---

### Task 14: `lib/oauth-gemini.ts` + section "Gemini" du QG (statut + deconnexion)

**Files:**
- Create: `lib/oauth-gemini.ts`
- Test: `lib/oauth-gemini.test.ts`
- Create: `app/actions/oauth.ts`
- Create: `components/qg/GeminiConnectionSection.tsx`
- Modify: `app/qg/page.tsx`

**Interfaces:**
- Produces: `findGeminiClientIds(supabase: SupabaseClient): Promise<string[]>`, `isGeminiConnected(supabase: SupabaseClient, userId: string): Promise<boolean>` (`lib/oauth-gemini.ts`) ; `disconnectGemini(): Promise<{ error: string | null }>` (`app/actions/oauth.ts`) ; `<GeminiConnectionSection isConnected={boolean} />` monte en enfant sibling de `<WebhookTokenSection>` dans `<IntegrationsSection>` (`app/qg/page.tsx`).

- [ ] **Step 1: Ecrire le test qui echoue**

Create `lib/oauth-gemini.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { findGeminiClientIds, isGeminiConnected } from "./oauth-gemini";

type Row = Record<string, unknown>;

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\]/g, "\$&").replace(/%/g, ".*");
  return new RegExp("^" + escaped + "$", "i");
}

class FakeQueryBuilder implements PromiseLike<{ data: Row[] | null; error: null; count: number | null }> {
  private filters: Array<(row: Row) => boolean> = [];
  private wantCount = false;

  constructor(private readonly rows: Row[]) {}

  select(_columns?: string, options?: { count?: string; head?: boolean }): this {
    this.wantCount = Boolean(options?.count);
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

  ilike(column: string, pattern: string): this {
    const regexp = globToRegExp(pattern);
    this.filters.push((row) => regexp.test(String(row[column] ?? "")));
    return this;
  }

  private matched(): Row[] {
    return this.rows.filter((row) => this.filters.every((f) => f(row)));
  }

  then<TResult1 = { data: Row[] | null; error: null; count: number | null }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: Row[] | null; error: null; count: number | null }) => TResult1 | PromiseLike<TResult1>)
      | null,
  ): PromiseLike<TResult1 | TResult2> {
    const matched = this.matched();
    const result = this.wantCount
      ? { data: null, error: null as null, count: matched.length }
      : { data: matched, error: null as null, count: null };
    return Promise.resolve(result).then(onfulfilled ?? undefined) as PromiseLike<TResult1 | TResult2>;
  }
}

class FakeSupabaseClient {
  constructor(private readonly tables: Record<string, Row[]>) {}
  from(table: string): FakeQueryBuilder {
    return new FakeQueryBuilder(this.tables[table] ?? []);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fakeSupabase(tables: Record<string, Row[]>): any {
  return new FakeSupabaseClient(tables);
}
```

Append au meme fichier `lib/oauth-gemini.test.ts` :

```ts

describe("findGeminiClientIds (US-22)", () => {
  test("trouve les client_id dont le nom contient gemini (insensible a la casse)", async () => {
    const supabase = fakeSupabase({
      oauth_clients: [
        { client_id: "c1", client_name: "Google Gemini" },
        { client_id: "c2", client_name: "Siri Shortcuts" },
      ],
    });
    expect(await findGeminiClientIds(supabase)).toEqual(["c1"]);
  });

  test("aucun client Gemini enregistre -> tableau vide", async () => {
    const supabase = fakeSupabase({ oauth_clients: [] });
    expect(await findGeminiClientIds(supabase)).toEqual([]);
  });
});

describe("isGeminiConnected", () => {
  test("true si un oauth_tokens existe pour l'utilisateur sur un client Gemini", async () => {
    const supabase = fakeSupabase({
      oauth_clients: [{ client_id: "c1", client_name: "Gemini" }],
      oauth_tokens: [{ id: "t1", user_id: "u1", client_id: "c1" }],
    });
    expect(await isGeminiConnected(supabase, "u1")).toBe(true);
  });

  test("false si aucun token pour cet utilisateur", async () => {
    const supabase = fakeSupabase({
      oauth_clients: [{ client_id: "c1", client_name: "Gemini" }],
      oauth_tokens: [{ id: "t1", user_id: "autre-user", client_id: "c1" }],
    });
    expect(await isGeminiConnected(supabase, "u1")).toBe(false);
  });

  test("false si aucun client Gemini n'est enregistre du tout", async () => {
    const supabase = fakeSupabase({ oauth_clients: [], oauth_tokens: [] });
    expect(await isGeminiConnected(supabase, "u1")).toBe(false);
  });
});
```

- [ ] **Step 2: Lancer le test, verifier qu'il echoue**

```bash
npm test -- lib/oauth-gemini.test.ts
```
Expected: FAIL - Cannot find module './oauth-gemini'.

- [ ] **Step 3: Implementation minimale**

Create `lib/oauth-gemini.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export const GEMINI_CLIENT_NAME_PATTERN = "%gemini%";

// US-22 : identifie les client_id enregistres dont le nom ressemble a
// "Gemini" (heuristique - la DCR RFC 7591 n'impose pas d'identifiant client
// stable ; documente comme risque/hypothese dans CLAUDE.md). Reutilise par
// le statut affiche au QG ET par la deconnexion (une seule requete, jamais
// dupliquee).
export async function findGeminiClientIds(supabase: SupabaseClient): Promise<string[]> {
  const { data } = await supabase
    .from("oauth_clients")
    .select("client_id")
    .ilike("client_name", GEMINI_CLIENT_NAME_PATTERN);
  return (data ?? []).map((row: { client_id: string }) => row.client_id);
}

export async function isGeminiConnected(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const clientIds = await findGeminiClientIds(supabase);
  if (clientIds.length === 0) return false;
  const { count } = await supabase
    .from("oauth_tokens")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("client_id", clientIds);
  return (count ?? 0) > 0;
}
```

- [ ] **Step 4: Lancer le test, verifier qu'il passe**

```bash
npm test -- lib/oauth-gemini.test.ts
```
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/oauth-gemini.ts lib/oauth-gemini.test.ts
git commit -m "feat: identification des clients Gemini connectes (lib/oauth-gemini.ts, US-22)"
```

- [ ] **Step 6: Server action de deconnexion**

Create `app/actions/oauth.ts`:

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { findGeminiClientIds } from "@/lib/oauth-gemini";

export interface GeminiDisconnectResult {
  error: string | null;
}

// US-22 : revoque, depuis le QG, les autorisations MCP dont le client_name
// ressemble a "Gemini" (heuristique assumee - la DCR RFC 7591 n'impose
// aucun identifiant stable pour un client, cf. CLAUDE.md/Risques du
// design). Symetrique de POST /oauth/revoke (declenche, lui, depuis les
// reglages Gemini) : les deux chemins doivent laisser le QG refleter
// l'etat reel.
export async function disconnectGemini(): Promise<GeminiDisconnectResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expiree. Reconnecte-toi." };

  const clientIds = await findGeminiClientIds(supabase);
  if (clientIds.length === 0) return { error: null };

  const { error } = await supabase.from("oauth_tokens").delete().eq("user_id", user.id).in("client_id", clientIds);

  if (error) return { error: "Impossible de deconnecter Gemini. Reessaie." };
  return { error: null };
}
```

- [ ] **Step 7: Verifier que ca compile**

```bash
npx tsc --noEmit
```
Expected: pas d'erreur.

- [ ] **Step 8: Commit**

```bash
git add app/actions/oauth.ts
git commit -m "feat: server action de deconnexion Gemini (US-22)"
```

- [ ] **Step 9: Composant de la section QG**

Create `components/qg/GeminiConnectionSection.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { disconnectGemini } from "@/app/actions/oauth";

interface GeminiConnectionSectionProps {
  isConnected: boolean;
}

// US-22 : bloc "Gemini" de la section Integrations du QG - sibling de
// WebhookTokenSection (US-03) et PushReminderToggle (US-11). Contrairement
// a ces deux blocs, la CONNEXION s'initie cote Gemini ("Connected Apps"),
// pas ici : ce bloc n'affiche que l'etat + un bouton de deconnexion.
export default function GeminiConnectionSection({ isConnected }: GeminiConnectionSectionProps) {
  const [pending, startTransition] = useTransition();
  const [connected, setConnected] = useState(isConnected);
  const [error, setError] = useState<string | null>(null);

  function disconnect() {
    setError(null);
    startTransition(async () => {
      const result = await disconnectGemini();
      if (result.error) {
        setError(result.error);
        return;
      }
      setConnected(false);
    });
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink">Gemini {connected ? "connecte" : "non connecte"}</p>
        {connected ? (
          <button
            type="button"
            disabled={pending}
            onClick={disconnect}
            className="rounded-md border border-border bg-bg px-3 py-1.5 font-display text-[10px] uppercase tracking-wide text-hp disabled:opacity-50"
          >
            Deconnecter
          </button>
        ) : (
          <span className="text-xs text-faint">Connecte-toi depuis Gemini</span>
        )}
      </div>
      {!connected && (
        <p className="text-xs text-faint">
          Dans l&apos;app Gemini : reglages puis Apps connectees puis cherche Dodojo.
        </p>
      )}
      {error && <p className="text-xs text-hp">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 10: Monter le composant au QG**

Modify `app/qg/page.tsx` - ajouter les imports (apres les imports `components/qg/` existants) :

Avant :
```tsx
import IntegrationsSection from "@/components/qg/IntegrationsSection";
import PushReminderToggle from "@/components/qg/PushReminderToggle";
import WebhookTokenSection from "@/components/qg/WebhookTokenSection";
```

Apres :
```tsx
import IntegrationsSection from "@/components/qg/IntegrationsSection";
import PushReminderToggle from "@/components/qg/PushReminderToggle";
import WebhookTokenSection from "@/components/qg/WebhookTokenSection";
import GeminiConnectionSection from "@/components/qg/GeminiConnectionSection";
import { isGeminiConnected } from "@/lib/oauth-gemini";
```

Ajouter la lecture du statut, juste apres la requete `profiles` existante :

Avant :
```tsx
  const { data: profile } = await supabase
    .from("profiles")
    .select("best_streak, timezone, webhook_token_hash, webhook_token_last_used_at")
    .eq("id", user.id)
    .maybeSingle();
```

Apres :
```tsx
  const { data: profile } = await supabase
    .from("profiles")
    .select("best_streak, timezone, webhook_token_hash, webhook_token_last_used_at")
    .eq("id", user.id)
    .maybeSingle();

  const geminiConnected = await isGeminiConnected(supabase, user.id);
```

Ajouter `GeminiConnectionSection` en enfant sibling dans `IntegrationsSection` :

Avant :
```tsx
      <IntegrationsSection>
        <PushReminderToggle hasSubscription={(subscriptionCount ?? 0) > 0} />
        <WebhookTokenSection
          hasToken={Boolean(profile?.webhook_token_hash)}
          lastUsedAt={profile?.webhook_token_last_used_at ?? null}
        />
      </IntegrationsSection>
```

Apres :
```tsx
      <IntegrationsSection>
        <PushReminderToggle hasSubscription={(subscriptionCount ?? 0) > 0} />
        <WebhookTokenSection
          hasToken={Boolean(profile?.webhook_token_hash)}
          lastUsedAt={profile?.webhook_token_last_used_at ?? null}
        />
        <GeminiConnectionSection isConnected={geminiConnected} />
      </IntegrationsSection>
```

- [ ] **Step 11: Verifier que tout compile**

```bash
npx tsc --noEmit
```
Expected: pas d'erreur.

- [ ] **Step 12: Commit**

```bash
git add components/qg/GeminiConnectionSection.tsx app/qg/page.tsx
git commit -m "feat: section Gemini (statut + deconnexion) au QG (US-22)"
```

---

### Task 15: Manuel du Dojo - section "Ajouter une tache a la voix (Gemini / Android)"

**Files:**
- Modify: `content/guide.json`

**Interfaces:**
- Produces: nouvelle section `id: "gemini"`, ancre `/guide#gemini`.

- [ ] **Step 1: Ajouter la section**

Modify `content/guide.json` - inserer apres la section `siri` (US-03, derniere section), avant la fermeture du tableau :

Avant :
```json
    {
      "id": "siri",
      "title": "Ajouter une tache a la voix (Siri)",
      "blocks": [
        { "type": "p", "text": "..." }
      ]
    }
  ]
}
```

Apres :
```json
    {
      "id": "siri",
      "title": "Ajouter une tache a la voix (Siri)",
      "blocks": [
        { "type": "p", "text": "..." }
      ]
    },
    {
      "id": "gemini",
      "title": "Ajouter une tache a la voix (Gemini / Android)",
      "blocks": [
        { "type": "p", "text": "Sur Android (ou partout ou Gemini est disponible), connecte Dodojo depuis les reglages Apps connectees de Gemini - la connexion s'initie cote Gemini, pas depuis Dodojo." },
        { "type": "ul", "items": ["Dans l'app Gemini : Reglages puis Apps connectees puis cherche Dodojo puis Connecter", "Gemini te redirige vers Dodojo pour te connecter (si besoin) puis te demande de confirmer : Gemini veut ajouter des taches a ta place - Autoriser ?", "Une fois autorise, dis Ajoute [tache] dans Dodojo a Gemini : la tache apparait directement dans l'Arene du jour", "La section Integrations du QG affiche l'etat de la connexion (Gemini connecte / non connecte) et un bouton Deconnecter"] },
        { "type": "p", "text": "Deconnecter depuis le QG revoque immediatement l'acces ; deconnecter depuis les reglages Gemini a le meme effet cote Dodojo, dans les deux sens." }
      ]
    }
  ]
}
```

Note : le texte exact de la section `siri` existante (US-03) doit etre preserve tel quel - seule la nouvelle section `gemini` est ajoutee apres, avec une virgule entre les deux objets.

- [ ] **Step 2: Verifier que le JSON est valide et que les tests passent toujours**

```bash
node -e "JSON.parse(require('fs').readFileSync('content/guide.json', 'utf-8')); console.log('JSON valide')"
npm test
```
Expected: `JSON valide` ; tous les tests Vitest passent.

- [ ] **Step 3: Commit**

```bash
git add content/guide.json
git commit -m "docs: Manuel du Dojo - section Gemini / Android (US-22)"
```

---

### Task 16: `CHANGELOG.md`

**Files:**
- Modify: `CHANGELOG.md`

**Interfaces:** Aucune (documentation pure).

- [ ] **Step 1: Ajouter les lignes sous `[Unreleased]`**

Modify `CHANGELOG.md` - dans `### Produit`, apres la ligne US-03, ajouter :

```markdown
- US-22 : Ajout de tache vocale via Gemini (serveur MCP `/api/mcp` + serveur d'autorisation OAuth 2.1/PKCE `/oauth/*`, enregistrement dynamique de client RFC 7591, section "Integrations" du QG mise a jour avec l'etat de connexion Gemini + bouton Deconnecter)
```

Dans `### Technique`, apres la ligne technique US-03, ajouter :

```markdown
- Serveur OAuth 2.1 pour clients MCP tiers (PKCE S256, RFC 7591 enregistrement dynamique, RFC 7009 revocation, metadonnees RFC 8414/9728) : tables `oauth_clients`/`oauth_authorization_codes`/`oauth_tokens` (policy DELETE autorisee, donnees techniques hors RG-04) ; route `/api/mcp` (Streamable HTTP, tool `add_task`) reutilise `insertTaskForUser` (US-03) ; rate limiting basique par IP en memoire (`lib/rate-limit.ts`) sur `/oauth/register` et `/oauth/token` ; fix du garde de session (`proxy.ts`) pour exempter `/api/*`, `/oauth/*` et `/.well-known/*`
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: CHANGELOG - serveur OAuth 2.1 + MCP Gemini (US-22)"
```

---

### Task 17: `CLAUDE.md` - nouveau piege (serveur OAuth maison, tables DELETE autorisee, heuristique Gemini, garde de session)

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:** Aucune (documentation pure - mais obligatoire, CLAUDE.md paragraphe Regle de mise a jour de ce fichier : cette PR introduit trois nouvelles tables et corrige un comportement non-evident du garde de session).

- [ ] **Step 1: Ajouter le paragraphe**

Modify `CLAUDE.md` - ajouter un nouveau paragraphe juste apres celui sur "Token webhook Siri hashe..." (US-03) et avant `## URL de production` :

```markdown
**Serveur OAuth 2.1 + MCP pour Gemini (US-22)** - Dodojo implemente lui-meme un serveur d'autorisation OAuth 2.1 (PKCE S256 obligatoire, `lib/pkce.ts`) car Supabase Auth n'est pas un serveur OAuth conforme au spec MCP pour des clients tiers. Trois tables (`oauth_clients`/`oauth_authorization_codes`/`oauth_tokens`) ont une **policy DELETE autorisee** - contrairement a `tasks`/`day_results` (RG-04), ce sont des donnees techniques operationnelles (jetons/codes), jamais un historique de combat. Enregistrement dynamique de client **ouvert** (RFC 7591, `POST /oauth/register`) : n'importe quel client MCP peut s'auto-enregistrer, protege par un rate limit basique par IP **en memoire** (`lib/rate-limit.ts`, best-effort - ne survit pas a un cold start serverless, pas de garantie distribuee entre instances Vercel). `POST /oauth/authorize` valide `redirect_uri` contre la liste enregistree du client **avant** toute redirection (jamais de redirection vers un `redirect_uri` non verifie - prevention d'open redirect). Le serveur MCP (`/api/mcp`, transport Streamable HTTP, un seul tool `add_task`) reutilise **strictement** `insertTaskForUser` (`lib/task-insertion.ts`, US-03) - aucune seconde implementation du calcul HP. Le statut "Gemini connecte" affiche au QG (`lib/oauth-gemini.ts`) identifie les clients Gemini par une heuristique sur `client_name` (`ILIKE '%gemini%'`) - la DCR n'impose aucun identifiant stable, **hypothese a revalider** si Google impose un jour un format de nom different. **Piege garde de session** : `proxy.ts`/`lib/supabase/middleware.ts` (`updateSession`) exempte desormais explicitement `/api/*`, `/oauth/*` et `/.well-known/*` de la redirection anonyme-vers-`/welcome` et connecte-vers-`/` - decouvert en implementant US-22 (les appels serveur-a-serveur de Gemini n'ont aucun cookie Supabase), corrige retroactivement le meme trou latent pour `/api/webhook/add-task` (US-03) et `/api/cron/push-reminders` (US-11). Toute future route technique appelee sans session cookie navigateur doit verifier qu'elle tombe bien sous l'un de ces trois prefixes, sinon l'ajouter explicitement. **Aucun test e2e sur le handshake Gemini reel** (dependance externe non reproductible en CI) : une verification manuelle post-deploiement avec un vrai compte Gemini est **obligatoire** avant de considerer l'US terminee - l'ecosysteme "Connected Apps" MCP de Gemini evolue vite, les details exacts (transport impose, format de metadonnees) peuvent differer de ce qui est implemente ici.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md - piege serveur OAuth maison + garde de session (US-22)"
```

---

### Task 18: Verification finale, bilan sur l'issue GitHub #23 + Pull Request

**Files:** aucun fichier - actions GitHub uniquement.

**Interfaces:** aucune.

- [ ] **Step 1: Verification finale locale avant de pousser**

```bash
npm run lint
npm test
npm run build
```
Expected: les trois commandes reussissent sans erreur (regle projet CLAUDE.md : "Zero merge si la CI est rouge" / "zero PR poussee tant que les tests n'ont pas ete passes en local").

- [ ] **Step 2: Push de la branche**

```bash
git push -u origin feat/us-22-gemini-mcp
```

- [ ] **Step 3: Commenter le bilan sur l'issue #23**

```bash
gh issue comment 23 --body "US-22 (serveur OAuth 2.1 + MCP pour Gemini) implementee : oauth_clients/oauth_authorization_codes/oauth_tokens (DELETE autorisee, hors RG-04) ; POST /oauth/register (RFC 7591, rate limite) ; GET/POST /oauth/authorize (PKCE S256 obligatoire, consentement, redirect_uri verifie avant toute redirection) ; POST /oauth/token (authorization_code + refresh_token, rotation, rate limite) ; POST /oauth/revoke (RFC 7009) ; metadonnees /.well-known (RFC 8414/9728) ; serveur MCP /api/mcp (Streamable HTTP, tool add_task, reutilise STRICTEMENT insertTaskForUser de US-03, aucune duplication du calcul HP). Fix decouvert en route : le garde de session (proxy.ts) exempte maintenant /api/, /oauth/ et /.well-known/ (corrige aussi un trou latent sur le webhook Siri et le cron push). Tests Vitest complets sur toute la logique pure (PKCE, hash/expiration de jetons, validation RFC 7591, rate limiting, cadre JSON-RPC) et tests d'integration sur les 6 routes (fake Supabase). Section Gemini au QG (statut + Deconnecter, heuristique client_name ILIKE gemini - a revalider). Manuel du Dojo mis a jour. RISQUE ASSUME : aucun test e2e sur le handshake Gemini reel (ecosysteme Connected Apps MCP de Google en evolution rapide, dependance externe non reproductible en CI) - une verification manuelle post-deploiement avec un vrai compte Gemini reste obligatoire avant de clore definitivement cette US, les details exacts cote Google (transport, metadonnees) pouvant differer de ce qui est implemente ici. Closes #23"
```

- [ ] **Step 4: Creer la Pull Request**

```bash
gh pr create --title "feat: serveur OAuth 2.1 + MCP pour Gemini (US-22)" --body "## Resume
- Serveur d'autorisation OAuth 2.1 maison (Supabase Auth n'est pas conforme MCP pour des clients tiers) : PKCE S256 obligatoire, enregistrement dynamique RFC 7591, revocation RFC 7009, metadonnees RFC 8414/9728
- Tables oauth_clients/oauth_authorization_codes/oauth_tokens (policy DELETE autorisee, donnees techniques hors RG-04)
- Serveur MCP /api/mcp (Streamable HTTP, tool add_task) reutilise STRICTEMENT insertTaskForUser (US-03) - aucune duplication du calcul HP
- Rate limiting basique par IP en memoire sur /oauth/register et /oauth/token (best-effort, documente comme tel)
- Fix decouvert en route : le garde de session (proxy.ts) bloquait ces nouvelles routes (et deja /api/webhook, /api/cron) - desormais exemptees
- Section Gemini au QG (statut + Deconnecter), Manuel du Dojo, CHANGELOG, CLAUDE.md a jour

## Test plan
- [x] npm run lint
- [x] npm test
- [x] npm run build
- [ ] Verification manuelle post-deploiement OBLIGATOIRE : enregistrer Dodojo depuis les reglages Connected Apps d'un vrai compte Gemini, valider le flow d'autorisation complet, dire une commande vocale d'ajout de tache, confirmer qu'elle apparait dans l'Arene. RISQUE ASSUME : l'ecosysteme Connected Apps MCP de Google evolue vite ; les details exacts (transport impose, format de metadonnees) peuvent differer de ce que ce PR implemente et necessiter un ajustement post-deploiement.

Closes #23"
```

- [ ] **Step 5: Verifier la creation de la PR**

```bash
gh pr view
```
Expected: PR affichee avec le bon titre, la branche `feat/us-22-gemini-mcp`, et `Closes #23` dans le corps.

---

## Self-Review

**Couverture du spec (`docs/superpowers/specs/2026-07-22-us22-gemini-mcp-design.md`) :**
- Modele de donnees : `oauth_clients`/`oauth_authorization_codes`/`oauth_tokens`, toutes DELETE autorisee -> Task 1. OK.
- `POST /oauth/register` (RFC 7591, client public sans secret) -> Tasks 5, 9. OK.
- `GET /oauth/authorize` (session requise, consentement, PKCE, redirect_uri verifie) -> Task 10. OK.
- `POST /oauth/token` (authorization_code + refresh_token) -> Tasks 3, 4, 8, 11. OK.
- `POST /oauth/revoke` (RFC 7009, toujours 200) -> Tasks 8, 12. OK.
- Metadonnees `.well-known` (RFC 8414/9728) -> Task 7. OK.
- Rate limiting basique par IP sur register/token -> Task 6, cable dans Tasks 9 et 11. OK.
- Serveur MCP `/api/mcp` (Streamable HTTP, tool `add_task`, reutilise `insertTaskForUser`) -> Task 13. OK.
- Section Integrations du QG (statut Gemini connecte + Deconnecter) -> Task 14. OK.
- Edge cases (token expire -> refresh, deconnexion QG vs Gemini, client orphelin sans nettoyage) -> couverts par les tests des Tasks 11, 12, 13 et le design assume (pas de nettoyage automatique des clients orphelins, volume negligeable, non implemente ici - conforme au design).
- Tests Vitest PKCE + hash/expiration -> Tasks 3, 4. OK (mandat 1).
- Tests d'integration des routes OAuth + MCP (fake Supabase) -> Tasks 7, 9, 10, 11, 12, 13. OK (mandat 2).
- Pas d'e2e sur handshake Gemini reel, verification manuelle post-deploiement obligatoire -> documente en Global Constraints et Task 18 (mandat 3).
- Section Manuel du Dojo -> Task 15 (mandat 4).
- Ligne CHANGELOG [Unreleased] -> Task 16 (mandat 5).
- Bilan issue #23 + PR "Closes #23" rappelant le risque ecosysteme Gemini mouvant -> Task 18 (mandat 6).

**Scan placeholders :** aucun "TODO"/"TBD" ; tout le code est complet (aucune fonction vide, aucun commentaire "add logic here").

**Coherence des types/signatures :** `InsertTaskOutcome` (US-03) reutilise a l'identique par `buildAddTaskToolResult` (Task 13) et le call site de la Task 13 ; `generateOpaqueToken`/`hashOpaqueToken`/`isExpired`/`expiresAtFromNow` (Task 4) identiques entre leur definition et leurs usages (Tasks 10, 11, 12, 13) ; `verifyCodeChallenge`/`deriveCodeChallenge`/`generateCodeVerifier` (Task 3) identiques entre Task 3 et ses usages (Tasks 10, 11) ; `createRateLimiter`/`extractClientIp` (Task 6) identiques entre Task 6 et ses usages (Tasks 9, 11) ; `parseOAuthRequestBody` (Task 8) identique entre Task 8 et ses usages (Tasks 11, 12) ; `findGeminiClientIds`/`isGeminiConnected` (Task 14) identiques entre leur definition et leurs usages (`app/actions/oauth.ts`, `app/qg/page.tsx`).

**Decouverte non prevue par le design, documentee :** le garde de session de `proxy.ts` bloquerait toute requete anonyme vers les nouvelles routes OAuth/MCP (Gemini n'a aucun cookie Supabase) - Task 2, ajoutee en tete du plan, corrige ce trou et le meme probleme latent deja present pour `/api/webhook/add-task` (US-03) et `/api/cron/push-reminders` (US-11). Documente dans Global Constraints et CLAUDE.md (Task 17).

**Deviation documentee :** transport MCP limite a une reponse JSON directe (pas de flux SSE serveur->client, cf. design "un seul tool, add_task", operation synchrone courte) - choix explicitement scope dans les Global Constraints et rappele comme risque residuel dans le bilan de la Task 18 (l'ecosysteme Gemini pourrait exiger un comportement different, a verifier manuellement).

### Critical Files for Implementation

- `lib/task-insertion.ts` (US-03, deja mergee - reutilisee telle quelle par `/api/mcp`)
- `lib/oauth-tokens.ts`
- `lib/pkce.ts`
- `lib/mcp-protocol.ts`
- `app/api/mcp/route.ts`
- `app/oauth/authorize/route.ts`
- `app/oauth/token/route.ts`
- `lib/supabase/middleware.ts`
