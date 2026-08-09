# Suppression de compte & export RGPD (issue #154) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer un flow self-service de suppression définitive de compte (art. 17 RGPD) et d'export de données personnelles (art. 20 RGPD), accessibles depuis `app/vestiaire/profil/page.tsx`.

**Architecture:** Une nouvelle server action `deleteAccount` appelle `supabase.auth.admin.deleteUser(userId)` via un client service-role — la cascade FK déjà en place (`on delete cascade` sur toutes les tables référençant `profiles.id`) purge le reste sans code de purge manuel. Une seconde server action `exportUserData` agrège les tables personnelles de l'utilisateur via le client de session (RLS), en excluant explicitement les secrets (`webhook_token_hash`, tokens OAuth, clés de chiffrement push). Deux composants client dédiés (`ExportDataSection`, `DeleteAccountSection`) exposent ces actions, suivant les patterns déjà établis (`PasswordSection` pour la re-authentification, `useFocusTrap` pour la modale).

**Tech Stack:** Next.js 16 App Router (server actions), Supabase (`@supabase/supabase-js` client service-role + `@/lib/supabase/server` client de session), TypeScript strict, Vitest, Playwright.

## Global Constraints

- TypeScript strict, jamais de `any` (Règle de code #1).
- Toute mutation reste `is_abandoned`/`is_completed` pour les tables de jeu **en usage courant** — ceci ne s'applique PAS à la suppression de compte elle-même (RG-04 protège l'historique de combat contre l'usage courant, pas contre l'effacement définitif demandé par l'utilisateur, cf. spec).
- Commits `type: description courte` (Conventional Commits).
- Toute PR doit committer une mise à jour de `CLAUDE.md`, `CHANGELOG.md` et l'article Le Guide correspondant, dans le(s) même(s) commit(s) que le code.
- `vitest.config.ts` a un alias `@/*` fonctionnel — les fichiers `app/actions/*.ts` importent normalement via `@/...` (cf. `app/actions/profile.ts`).
- Client service-role : `createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PRIVATE_KEY_SUPABASE, { auth: { persistSession: false } })` depuis `@supabase/supabase-js` — jamais `@/lib/supabase/server` pour un appel `auth.admin.*`.
- Flake documenté (CLAUDE.md) : l'API Admin GoTrue de ce projet Supabase rejette parfois un appel (`bad_jwt`, 403) de façon intermittente ; un retry immédiat guérit systématiquement. Toute nouvelle utilisation de `auth.admin.*` doit retry (voir Task 2).
- Avant de pousser la PR : `graphify update .` (AST-only, pas de coût API) pour que le graphe de connaissance reflète les nouveaux fichiers — dernière étape avant `git push`/`gh pr create` (Task 10).

---

### Task 0: Créer la branche de fonctionnalité

**Files:** aucun.

`main` est protégée (Workflow Git, `CLAUDE.md`) — toute la suite des commits (Tasks 1-10) doit se faire sur une branche dédiée, jamais directement sur `main`.

- [ ] **Step 1: Créer et checkout la branche**

```bash
git checkout -b feat/issue154-suppression-compte
```

Expected: branche créée à partir de `main`, aucun fichier modifié à ce stade.

---

### Task 1: `exportUserData()` — server action d'export

**Files:**
- Create: `app/actions/account.ts`
- Test: `app/actions/account.test.ts`

**Interfaces:**
- Produces: `exportUserData(): Promise<{ data: ExportedUserData | null; error: string | null }>`
- `ExportedUserData` (exporté depuis `app/actions/account.ts`) :
  ```typescript
  export interface ExportedUserData {
    profile: Record<string, unknown>;
    tasks: Record<string, unknown>[];
    dayResults: Record<string, unknown>[];
    unlockedHeroes: Record<string, unknown>[];
    unlockedSkins: Record<string, unknown>[];
    unlockedAchievements: Record<string, unknown>[];
    dailyBoss: Record<string, unknown>[];
    recurringTemplates: Record<string, unknown>[];
    pushSubscriptions: { endpoint: string; created_at: string }[];
  }
  ```

- [ ] **Step 1: Écrire le test qui échoue**

```typescript
// app/actions/account.test.ts
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

type Row = Record<string, unknown>;

let currentUser: { id: string } | null = { id: "u1" };
let tables: Record<string, Row[]> = {};

function tableStub(name: string) {
  return {
    select: () => ({
      eq: () => Promise.resolve({ data: tables[name] ?? [], error: null }),
    }),
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: currentUser } }),
    },
    from: (name: string) => tableStub(name),
  }),
}));

beforeEach(() => {
  currentUser = { id: "u1" };
  tables = {
    profiles: [{ id: "u1", username: "Ryu", webhook_token_hash: "secret-hash" }],
    tasks: [{ id: "t1", title: "Tâche" }],
    day_results: [{ day_date: "2026-08-01" }],
    unlocked_heroes: [{ hero_id: "fire_knight" }],
    unlocked_skins: [{ skin_id: "fire_knight_default" }],
    unlocked_achievements: [{ code: "FIRST_VICTORY" }],
    daily_boss: [{ day_date: "2026-08-01", boss_id: "satyr" }],
    recurring_templates: [{ id: "r1", title: "Routine" }],
    push_subscriptions: [{ endpoint: "https://push.example/abc", keys: { p256dh: "x", auth: "y" }, created_at: "2026-08-01T00:00:00Z" }],
  };
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("exportUserData", () => {
  test("retourne une erreur si la session est expirée", async () => {
    currentUser = null;
    const { exportUserData } = await import("./account");
    const result = await exportUserData();
    expect(result.error).toMatch(/Session expirée/);
    expect(result.data).toBeNull();
  });

  test("agrège les tables personnelles", async () => {
    const { exportUserData } = await import("./account");
    const result = await exportUserData();
    expect(result.error).toBeNull();
    expect(result.data?.profile.username).toBe("Ryu");
    expect(result.data?.tasks).toEqual([{ id: "t1", title: "Tâche" }]);
    expect(result.data?.dayResults).toEqual([{ day_date: "2026-08-01" }]);
    expect(result.data?.unlockedHeroes).toEqual([{ hero_id: "fire_knight" }]);
    expect(result.data?.recurringTemplates).toEqual([{ id: "r1", title: "Routine" }]);
  });

  test("exclut webhook_token_hash du profil exporté", async () => {
    const { exportUserData } = await import("./account");
    const result = await exportUserData();
    expect(result.data?.profile).not.toHaveProperty("webhook_token_hash");
  });

  test("exclut les clés de chiffrement push, ne garde que endpoint/created_at", async () => {
    const { exportUserData } = await import("./account");
    const result = await exportUserData();
    expect(result.data?.pushSubscriptions).toEqual([
      { endpoint: "https://push.example/abc", created_at: "2026-08-01T00:00:00Z" },
    ]);
  });
});
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `npm test -- app/actions/account.test.ts`
Expected: FAIL — `Cannot find module './account'` (le fichier n'existe pas encore).

- [ ] **Step 3: Implémenter `exportUserData`**

```typescript
// app/actions/account.ts
"use server";

import { createClient } from "@/lib/supabase/server";

export interface ExportedUserData {
  profile: Record<string, unknown>;
  tasks: Record<string, unknown>[];
  dayResults: Record<string, unknown>[];
  unlockedHeroes: Record<string, unknown>[];
  unlockedSkins: Record<string, unknown>[];
  unlockedAchievements: Record<string, unknown>[];
  dailyBoss: Record<string, unknown>[];
  recurringTemplates: Record<string, unknown>[];
  pushSubscriptions: { endpoint: string; created_at: string }[];
}

// Issue #154 (art. 20 RGPD) : agrège toutes les tables personnelles de
// l'utilisateur via le client de session (RLS suffit, mêmes lectures que le
// reste de l'app — pas besoin de service-role ici, contrairement à
// deleteAccount). Exclut volontairement webhook_token_hash (hash inutile
// pour l'utilisateur, jamais le clair stocké) et les clés de chiffrement
// push (p256dh/auth, techniques au navigateur, pas une donnée exploitable
// par l'utilisateur) — cf. spec pour le raisonnement complet.
export async function exportUserData(): Promise<{
  data: ExportedUserData | null;
  error: string | null;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Session expirée. Reconnecte-toi." };

  const [
    { data: profile },
    { data: tasks },
    { data: dayResults },
    { data: unlockedHeroes },
    { data: unlockedSkins },
    { data: unlockedAchievements },
    { data: dailyBoss },
    { data: recurringTemplates },
    { data: pushSubscriptions },
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id),
    supabase.from("tasks").select("*").eq("user_id", user.id),
    supabase.from("day_results").select("*").eq("user_id", user.id),
    supabase.from("unlocked_heroes").select("*").eq("user_id", user.id),
    supabase.from("unlocked_skins").select("*").eq("user_id", user.id),
    supabase.from("unlocked_achievements").select("*").eq("user_id", user.id),
    supabase.from("daily_boss").select("*").eq("user_id", user.id),
    supabase.from("recurring_templates").select("*").eq("user_id", user.id),
    supabase.from("push_subscriptions").select("*").eq("user_id", user.id),
  ]);

  const profileRow = (profile as Record<string, unknown>[] | null)?.[0] ?? {};
  const { webhook_token_hash: _hash, ...profileWithoutSecrets } = profileRow;

  return {
    error: null,
    data: {
      profile: profileWithoutSecrets,
      tasks: (tasks as Record<string, unknown>[] | null) ?? [],
      dayResults: (dayResults as Record<string, unknown>[] | null) ?? [],
      unlockedHeroes: (unlockedHeroes as Record<string, unknown>[] | null) ?? [],
      unlockedSkins: (unlockedSkins as Record<string, unknown>[] | null) ?? [],
      unlockedAchievements: (unlockedAchievements as Record<string, unknown>[] | null) ?? [],
      dailyBoss: (dailyBoss as Record<string, unknown>[] | null) ?? [],
      recurringTemplates: (recurringTemplates as Record<string, unknown>[] | null) ?? [],
      pushSubscriptions: ((pushSubscriptions as Record<string, unknown>[] | null) ?? []).map(
        (row) => ({
          endpoint: row.endpoint as string,
          created_at: row.created_at as string,
        }),
      ),
    },
  };
}
```

Note : le test simplifié utilise `.select().eq()` en 2 niveaux ; le stub de test ci-dessus (`tableStub`) répond à n'importe quelle table par la même forme — suffisant pour ce test unitaire (pas un test d'intégration Supabase réel).

- [ ] **Step 4: Lancer le test, vérifier qu'il passe**

Run: `npm test -- app/actions/account.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add app/actions/account.ts app/actions/account.test.ts
git commit -m "feat: server action exportUserData (issue #154)"
```

---

### Task 2: `deleteAccount()` — server action de suppression

**Files:**
- Modify: `app/actions/account.ts`
- Modify: `app/actions/account.test.ts`

**Interfaces:**
- Consumes : rien de Task 1 (fonction indépendante dans le même fichier).
- Produces: `deleteAccount(confirmText: string): Promise<{ error: string | null }>`

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter à `app/actions/account.test.ts` (au-dessus du `beforeEach` existant, ajouter les variables de mock nécessaires) :

```typescript
// À ajouter en haut du fichier, avec les autres variables de mock
let deleteUserCalls: string[] = [];
let deleteUserErrorCount = 0;

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      admin: {
        deleteUser: async (id: string) => {
          deleteUserCalls.push(id);
          if (deleteUserErrorCount > 0) {
            deleteUserErrorCount -= 1;
            return { error: { message: "bad_jwt" } };
          }
          return { error: null };
        },
      },
    },
  }),
}));

// Dans beforeEach, ajouter :
// deleteUserCalls = [];
// deleteUserErrorCount = 0;

describe("deleteAccount", () => {
  test("rejette un texte de confirmation invalide sans appeler l'API admin", async () => {
    const { deleteAccount } = await import("./account");
    const result = await deleteAccount("supprimer"); // mauvaise casse
    expect(result.error).toMatch(/SUPPRIMER/);
    expect(deleteUserCalls.length).toBe(0);
  });

  test("rejette si la session est expirée", async () => {
    currentUser = null;
    const { deleteAccount } = await import("./account");
    const result = await deleteAccount("SUPPRIMER");
    expect(result.error).toMatch(/Session expirée/);
    expect(deleteUserCalls.length).toBe(0);
  });

  test("appelle admin.deleteUser avec l'id de l'utilisateur de session sur confirmation valide", async () => {
    const { deleteAccount } = await import("./account");
    const result = await deleteAccount("SUPPRIMER");
    expect(result.error).toBeNull();
    expect(deleteUserCalls).toEqual(["u1"]);
  });

  test("retry une fois sur le flake JWT Admin connu, puis réussit", async () => {
    deleteUserErrorCount = 1;
    const { deleteAccount } = await import("./account");
    const result = await deleteAccount("SUPPRIMER");
    expect(result.error).toBeNull();
    expect(deleteUserCalls.length).toBe(2);
  });

  test("retourne une erreur générique si toutes les tentatives échouent", async () => {
    deleteUserErrorCount = 5;
    const { deleteAccount } = await import("./account");
    const result = await deleteAccount("SUPPRIMER");
    expect(result.error).toMatch(/Réessaie/);
    expect(deleteUserCalls.length).toBe(3);
  });
});
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `npm test -- app/actions/account.test.ts`
Expected: FAIL — `deleteAccount is not a function` (ou `undefined`).

- [ ] **Step 3: Implémenter `deleteAccount`**

Ajouter à `app/actions/account.ts` (après `exportUserData`) :

```typescript
import { createClient as createServiceRoleClient } from "@supabase/supabase-js";

const DELETE_CONFIRM_TEXT = "SUPPRIMER";
const DELETE_USER_ATTEMPTS = 3;

// Issue #154 (art. 17 RGPD) : suppression réelle et définitive du compte.
// Toutes les FK vers profiles.id sont `on delete cascade` (vérifié dans les
// migrations) — cet appel unique purge tasks/day_results/unlocked_*/
// daily_boss/recurring_*/push_subscriptions/share_events/oauth_* en cascade,
// aucune purge manuelle table par table nécessaire. Client service-role
// requis pour auth.admin.* (bypass RLS) — jamais @/lib/supabase/server pour
// cet appel. Retry sur le flake JWT Admin GoTrue documenté (CLAUDE.md) :
// confirmé qu'un retry immédiat guérit systématiquement ce 403 intermittent.
export async function deleteAccount(confirmText: string): Promise<{ error: string | null }> {
  if (confirmText !== DELETE_CONFIRM_TEXT) {
    return { error: `Tape exactement "${DELETE_CONFIRM_TEXT}" pour confirmer.` };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.NEXT_PRIVATE_KEY_SUPABASE;
  if (!supabaseUrl || !serviceKey) {
    return { error: "Dodojo n'a pas pu supprimer ton compte. Réessaie." };
  }
  const admin = createServiceRoleClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  let lastError: { message: string } | null = null;
  for (let attempt = 0; attempt < DELETE_USER_ATTEMPTS; attempt++) {
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (!error) return { error: null };
    lastError = error;
  }

  return { error: "Dodojo n'a pas pu supprimer ton compte. Réessaie." };
}
```

- [ ] **Step 4: Lancer le test, vérifier qu'il passe**

Run: `npm test -- app/actions/account.test.ts`
Expected: PASS (9 tests au total avec Task 1)

- [ ] **Step 5: Commit**

```bash
git add app/actions/account.ts app/actions/account.test.ts
git commit -m "feat: server action deleteAccount avec retry sur flake JWT admin (issue #154)"
```

---

### Task 3: `ExportDataSection` — composant client

**Files:**
- Create: `components/qg/ExportDataSection.tsx`

**Interfaces:**
- Consumes: `exportUserData` (`app/actions/account.ts`, Task 1) — `() => Promise<{ data: ExportedUserData | null; error: string | null }>`.
- Produces: composant `<ExportDataSection />` (aucune prop), monté par Task 5.

- [ ] **Step 1: Implémenter le composant**

```typescript
// components/qg/ExportDataSection.tsx
"use client";

import { useState } from "react";
import { exportUserData } from "@/app/actions/account";

// Issue #154 (art. 20 RGPD) : export complet des données personnelles en un
// fichier JSON téléchargé côté client. Indépendant de DeleteAccountSection —
// aucune obligation de forcer l'export avant suppression (cf. spec).
export default function ExportDataSection() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setPending(true);
    setError(null);
    const result = await exportUserData();
    setPending(false);
    if (result.error || !result.data) {
      setError(result.error ?? "Dodojo n'a pas pu préparer ton export. Réessaie.");
      return;
    }

    const username = (result.data.profile.username as string | undefined) ?? "dodojo";
    const day = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `dodojo-export-${username}-${day}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="flex w-full max-w-sm flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <p className="font-display text-xs uppercase tracking-wide text-muted">
        Données & vie privée
      </p>
      <button
        type="button"
        onClick={handleExport}
        disabled={pending}
        className="self-start rounded border border-border px-3 py-1.5 text-xs uppercase tracking-wide text-ink disabled:opacity-50"
      >
        {pending ? "…" : "Télécharger mes données"}
      </button>
      {error && (
        <p role="alert" className="text-xs text-alert">
          {error}
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Vérification manuelle rapide**

Run: `npm run dev`, ouvrir `/vestiaire/profil` (le composant n'est pas encore monté — ce step attend Task 5 pour un test visuel réel ; ici juste vérifier `npx tsc --noEmit` passe sur ce fichier).

Run: `npx tsc --noEmit`
Expected: aucune erreur sur `components/qg/ExportDataSection.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/qg/ExportDataSection.tsx
git commit -m "feat: composant ExportDataSection (issue #154)"
```

---

### Task 4: `DeleteAccountSection` — composant client (modale)

**Files:**
- Create: `components/qg/DeleteAccountSection.tsx`

**Interfaces:**
- Consumes: `deleteAccount` (`app/actions/account.ts`, Task 2) — `(confirmText: string) => Promise<{ error: string | null }>` ; `useFocusTrap` (`@/hooks/useFocusTrap`) — `(containerRef, { active, onEscape })`.
- Produces: composant `<DeleteAccountSection />` (aucune prop), monté par Task 5.

- [ ] **Step 1: Implémenter le composant**

```typescript
// components/qg/DeleteAccountSection.tsx
"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { deleteAccount } from "@/app/actions/account";
import { useFocusTrap } from "@/hooks/useFocusTrap";

const CONFIRM_TEXT = "SUPPRIMER";

// Issue #154 (art. 17 RGPD) : suppression définitive du compte. Modale
// dismissable (onEscape fourni — contrairement à WakeUpRitual, cf. CLAUDE.md
// § useFocusTrap). Re-authentification par mot de passe (même pattern que
// PasswordSection.tsx) + texte de confirmation exact, double barrière avant
// une action irréversible.
export default function DeleteAccountSection() {
  const router = useRouter();
  const modalRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useFocusTrap(modalRef, { active: open, onEscape: () => setOpen(false) });

  function resetAndClose() {
    setOpen(false);
    setPassword("");
    setConfirmText("");
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) {
      setError("Session expirée. Reconnecte-toi.");
      setPending(false);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password,
    });
    if (signInError) {
      setError("Mot de passe actuel incorrect.");
      setPending(false);
      return;
    }

    const result = await deleteAccount(confirmText);
    if (result.error) {
      setError(result.error);
      setPending(false);
      return;
    }

    await supabase.auth.signOut();
    router.push("/welcome");
  }

  return (
    <section className="flex w-full max-w-sm flex-col gap-3 rounded-lg border border-alert p-4">
      <p className="font-display text-xs uppercase tracking-wide text-alert">Zone dangereuse</p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start rounded border border-alert px-3 py-1.5 text-xs uppercase tracking-wide text-alert"
      >
        Supprimer mon compte
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="presentation"
        >
          <div
            ref={modalRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
            className="flex w-full max-w-sm flex-col gap-3 rounded-lg border border-alert bg-surface p-4"
          >
            <h2 id="delete-account-title" className="font-display text-sm uppercase text-alert">
              Supprimer définitivement ton compte ?
            </h2>
            <p className="text-xs text-muted">
              Cette action est irréversible. Toutes tes données (tâches, historique de combat,
              héros débloqués) seront supprimées définitivement.
            </p>
            <form onSubmit={handleSubmit} className="flex flex-col gap-2">
              <label htmlFor="delete-account-password" className="text-xs text-muted">
                Mot de passe actuel
              </label>
              <input
                id="delete-account-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="rounded border border-border bg-transparent px-2 py-1 text-sm text-ink"
              />
              <label htmlFor="delete-account-confirm" className="text-xs text-muted">
                Tape {CONFIRM_TEXT} pour confirmer
              </label>
              <input
                id="delete-account-confirm"
                type="text"
                required
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                className="rounded border border-border bg-transparent px-2 py-1 text-sm text-ink"
              />
              {error && (
                <p role="alert" className="text-xs text-alert">
                  {error}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={pending || confirmText !== CONFIRM_TEXT}
                  className="rounded bg-alert px-3 py-1.5 text-xs uppercase tracking-wide text-ink disabled:opacity-50"
                >
                  {pending ? "…" : "Supprimer définitivement"}
                </button>
                <button
                  type="button"
                  onClick={resetAndClose}
                  className="rounded border border-border px-3 py-1.5 text-xs uppercase tracking-wide text-ink"
                >
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Vérification type**

Run: `npx tsc --noEmit`
Expected: aucune erreur sur `components/qg/DeleteAccountSection.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/qg/DeleteAccountSection.tsx
git commit -m "feat: composant DeleteAccountSection (issue #154)"
```

---

### Task 5: Câblage dans `app/vestiaire/profil/page.tsx`

**Files:**
- Modify: `app/vestiaire/profil/page.tsx:1-93`

**Interfaces:**
- Consumes: `ExportDataSection` (Task 3), `DeleteAccountSection` (Task 4) — aucune prop pour les deux.

- [ ] **Step 1: Ajouter les imports et monter les sections**

Dans `app/vestiaire/profil/page.tsx`, après l'import de `LogoutSection` (ligne 18) :

```typescript
import LogoutSection from "@/components/qg/LogoutSection";
import ExportDataSection from "@/components/qg/ExportDataSection";
import DeleteAccountSection from "@/components/qg/DeleteAccountSection";
```

Et dans le JSX, juste avant `<LogoutSection />` (ligne 88) :

```tsx
      <ExportDataSection />
      <DeleteAccountSection />

      <LogoutSection />
```

- [ ] **Step 2: Vérification manuelle dans le navigateur**

Run: `npm run dev`
- Ouvrir `/vestiaire/profil` connecté avec le compte e2e local (ou tout compte dev).
- Cliquer « Télécharger mes données » → vérifier le téléchargement d'un `.json` contenant `profile`/`tasks`/etc., sans `webhook_token_hash`.
- Cliquer « Supprimer mon compte » → vérifier l'ouverture de la modale, Echap la ferme, mauvais mot de passe affiche l'erreur, bouton « Supprimer définitivement » reste désactivé tant que le texte n'est pas exactement `SUPPRIMER`.
- **Ne pas confirmer la suppression sur un compte réel** à cette étape — ce test end-to-end complet est couvert par Task 9 sur un compte jetable dédié.

- [ ] **Step 3: Commit**

```bash
git add app/vestiaire/profil/page.tsx
git commit -m "feat: intègre export/suppression de compte dans Le Profil (issue #154)"
```

---

### Task 6: Mise à jour de `app/confidentialite/page.tsx`

**Files:**
- Modify: `app/confidentialite/page.tsx:6-9,79-89`

**Interfaces:** aucune — page statique.

- [ ] **Step 1: Retirer le commentaire de dette obsolète et mettre à jour la section « Tes droits »**

Remplacer les lignes 6-9 :

```typescript
// Issue #134. Tension documentée avec RG-04 (CLAUDE.md) : le droit à
// l'effacement RGPD est un droit sur les données PERSONNELLES, distinct de
// l'historique de jeu que RG-04 protège — traité manuellement par email pour
// l'instant (dette assumée MVP), jamais un flow en self-service.
```

par :

```typescript
// Issue #134, complété par l'issue #154 (self-service de suppression/export
// depuis Le Profil). Tension documentée avec RG-04 (CLAUDE.md) : le droit à
// l'effacement RGPD est un droit sur les données PERSONNELLES, distinct de
// l'historique de jeu que RG-04 protège.
```

Remplacer le contenu de la section « Tes droits » (lignes 77-90) :

```tsx
      <section className="flex flex-col gap-2">
        <h2 className="font-display text-sm uppercase tracking-wide text-muted">Tes droits</h2>
        <p className="text-sm text-ink">
          Tu peux télécharger une copie de tes données ou supprimer définitivement ton compte à
          tout moment, en self-service, depuis{" "}
          <a href="/vestiaire/profil" className="underline underline-offset-4">
            Le Profil
          </a>{" "}
          (section « Données & vie privée »). Pour toute autre demande (accès, rectification), ou
          si ton compte t&apos;est devenu inaccessible, écris à{" "}
          <a
            href="mailto:arnaud.solente+dodojo@gmail.com"
            className="underline underline-offset-4"
          >
            arnaud.solente+dodojo@gmail.com
          </a>{" "}
          — ta demande sera traitée manuellement, sous 30 jours.
        </p>
      </section>
```

- [ ] **Step 2: Vérification manuelle**

Run: `npm run dev`, ouvrir `/confidentialite`, vérifier le rendu de la section « Tes droits » et le lien vers `/vestiaire/profil`.

- [ ] **Step 3: Commit**

```bash
git add app/confidentialite/page.tsx
git commit -m "docs: politique de confidentialité reflète le self-service de suppression/export (issue #154)"
```

---

### Task 7: `CHANGELOG.md`

**Files:**
- Modify: `CHANGELOG.md:10-17`

**Interfaces:** aucune.

- [ ] **Step 1: Ajouter une ligne sous `[Unreleased]` → `### Produit`**

Ajouter après la ligne `- Issue #134 : pages légales (...)` (ligne 16) :

```markdown
- Issue #154 : suppression de compte (RGPD) et export de tes données personnelles, en self-service depuis Le Profil ("Données & vie privée").
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog suppression de compte & export RGPD (issue #154)"
```

---

### Task 8: Article Le Guide

**Files:**
- Create: `content/guide/compte.md`
- Modify: `content/guide/index.json`

**Interfaces:** aucune — contenu statique consommé par `app/guide/[slug]/page.tsx` (`generateStaticParams`, `dynamicParams = false` — le slug doit être présent dans `index.json` pour être servi).

- [ ] **Step 1: Créer le contenu de l'article**

```markdown
Depuis Le Profil (Le Vestiaire → Profil → section « Données & vie privée »), tu peux à tout moment :

- **Télécharger tes données** : un fichier JSON complet (tâches, historique de combat, héros/tenues/succès débloqués, réglages) — le droit à la portabilité de tes données.
- **Supprimer définitivement ton compte** : action irréversible, demande ton mot de passe actuel et de taper « SUPPRIMER » pour confirmer. Toutes tes données sont effacées, sans exception.

Ces deux actions sont indépendantes : tu peux exporter sans supprimer, ou supprimer sans avoir exporté au préalable.

Pour toute autre demande (accès, rectification), consulte la [politique de confidentialité](/confidentialite).
```

Écrire ce contenu dans `content/guide/compte.md`.

- [ ] **Step 2: Ajouter l'entrée dans `content/guide/index.json`**

Ajouter, dans le tableau, juste après l'entrée `"slug": "agressivite"` (section `Réglages`, ordre 10) :

```json
  {
    "titre": "Supprimer mon compte ou exporter mes données",
    "slug": "compte",
    "section": "Réglages",
    "ordre": 20,
    "resume": "Télécharger tes données ou supprimer définitivement ton compte, en self-service.",
    "motsCles": [
      "reglage",
      "rgpd"
    ],
    "majLe": "2026-08-09T00:00:00.000Z"
  },
```

(Respecter le JSON valide — virgule après l'entrée `agressivite` précédente, pas de virgule finale après la dernière entrée du tableau.)

- [ ] **Step 3: Vérification build**

Run: `npm run build`
Expected: build réussi, `generateStaticParams` génère bien `/guide/compte` (visible dans le récapitulatif des routes statiques en sortie de `next build`).

- [ ] **Step 4: Commit**

```bash
git add content/guide/compte.md content/guide/index.json
git commit -m "docs: article Le Guide - suppression de compte & export (issue #154)"
```

---

### Task 9: E2E — suppression de compte sur compte jetable

**Files:**
- Create: `e2e/account-deletion.spec.ts`

**Interfaces:**
- Consumes: aucun helper existant réutilisé pour la création (signup UI réel, comme `onboarding.spec.ts`) — pas de nouvel helper `e2e/fixtures.ts` nécessaire.

- [ ] **Step 1: Écrire le test**

```typescript
// e2e/account-deletion.spec.ts
import { test, expect } from "@playwright/test";

// Issue #154. Compte JETABLE créé à la volée pour ce test — jamais un des
// comptes fixes partagés (E2E_TEST_EMAIL*/E2E_ONBOARDING_EMAIL, cf. ADR-04) :
// la suppression réelle de ces comptes casserait toute la suite. Le test
// crée son propre compte via signup réel (/welcome), comme onboarding.spec.ts.
test("suppression de compte : signup, suppression en self-service, login suivant refusé", async ({
  page,
}) => {
  const email = `e2e-delete-${Date.now()}@example.com`;
  const password = "MotDePasseTest123!";

  await page.goto("/welcome");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: /créer mon compte|s'inscrire/i }).click();

  await page.waitForURL("/onboarding");
  await page.getByLabel(/pseudo/i).fill("Compte Jetable");
  await page.getByRole("button", { name: /continuer|valider/i }).click();

  await page.goto("/vestiaire/profil");
  await page.getByRole("button", { name: "Supprimer mon compte" }).click();

  const modal = page.getByRole("alertdialog");
  await expect(modal).toBeVisible();
  await modal.getByLabel("Mot de passe actuel").fill(password);
  await modal.getByLabel(/Tape SUPPRIMER/).fill("SUPPRIMER");
  await modal.getByRole("button", { name: "Supprimer définitivement" }).click();

  await page.waitForURL("/welcome");

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: /se connecter/i }).click();

  await expect(page.getByText(/identifiants invalides|invalid login credentials/i)).toBeVisible();
});
```

Note : les libellés exacts des boutons de signup/onboarding/login (`créer mon compte`, `continuer`, `se connecter`) doivent être vérifiés contre `WelcomeSignup`/`onboarding` réels — ajuster les regex si le libellé diffère (cf. `e2e/onboarding.spec.ts` pour les libellés déjà utilisés ailleurs dans la suite).

- [ ] **Step 2: Lancer le build de prod + le test isolé**

Run: `npm run build && npm run start &` puis `npx playwright test e2e/account-deletion.spec.ts`
Expected: PASS. (Le compte jetable n'a pas besoin d'être purgé après coup — il est supprimé par le test lui-même.)

- [ ] **Step 3: Commit**

```bash
git add e2e/account-deletion.spec.ts
git commit -m "test(e2e): suppression de compte sur compte jetable (issue #154)"
```

---

### Task 10: `CLAUDE.md`, suite complète, graphify, PR

**Files:**
- Modify: `CLAUDE.md` (section « Pièges et décisions non-évidentes »)

**Interfaces:** aucune.

- [ ] **Step 1: Ajouter l'entrée piège dans `CLAUDE.md`**

Ajouter, à la fin de la section « Pièges et décisions non-évidentes » (juste avant `## URL de production`) :

```markdown
**Suppression de compte : la cascade FK existante suffit, jamais de purge manuelle table par table (issue #154)** — Toutes les FK vers `profiles.id`/`auth.users.id` sont `on delete cascade` depuis les migrations d'origine (`tasks`, `day_results`, `unlocked_heroes`/`unlocked_skins`/`unlocked_achievements`, `daily_boss`, `recurring_templates`, `push_subscriptions`, `share_events`, `oauth_tokens`/`oauth_authorization_codes`). `deleteAccount` (`app/actions/account.ts`) se limite donc à un seul appel `supabase.auth.admin.deleteUser(userId)` via un client service-role (RLS bypass — la cascade s'exécute indépendamment de l'absence de policy `DELETE` côté utilisateur final). RG-04 ("pas de suppression destructive") protège l'historique de combat contre l'usage courant (rage quit, décochage) — il ne s'applique pas à une demande d'effacement définitif du compte lui-même, droit distinct de l'utilisateur (art. 17 RGPD). Retry x3 sur `admin.deleteUser` : réutilise le même flake JWT Admin GoTrue déjà documenté ci-dessus (`listUsersRetrying`/`deleteUserRetrying` de `e2e/fixtures.ts`) — confirmé qu'un retry immédiat guérit ce 403 intermittent. `exportUserData` (même fichier, art. 20 RGPD) exclut volontairement `webhook_token_hash` (hash inutile, jamais le clair stocké) et tout token OAuth brut (exporter un refresh token actif dans un fichier téléchargeable est un risque de fuite réel, pas une donnée utile à la portabilité) — ne jamais lever ces exclusions sans revoir cette décision de sécurité.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md - suppression de compte (cascade FK, retry flake) (issue #154)"
```

- [ ] **Step 3: Suite de vérification complète locale (gate de merge, cf. Workflow Git)**

Run séquentiellement :
```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
npm run e2e
```
Expected: tous verts. Ne pas passer à l'étape suivante si l'un échoue — corriger et recommit avant de continuer.

- [ ] **Step 4: Mettre à jour le graphe de connaissance graphify AVANT de pousser la PR**

Run: `graphify update .`
Expected : le graphe (`graphify-out/graph.json`) reflète les nouveaux fichiers (`app/actions/account.ts`, `components/qg/ExportDataSection.tsx`, `components/qg/DeleteAccountSection.tsx`, `content/guide/compte.md`, `e2e/account-deletion.spec.ts`) et les fichiers modifiés. C'est un run AST-only, pas de coût API — aucune raison de l'omettre.

```bash
git add graphify-out/
git commit -m "chore: graphify update (issue #154)"
```

- [ ] **Step 5: Pousser la branche, ouvrir la PR**

```bash
git push -u origin feat/issue154-suppression-compte
gh pr create --title "feat: suppression de compte & export RGPD (issue #154)" --body "$(cat <<'EOF'
## Summary
- Suppression définitive de compte (art. 17 RGPD) via `auth.admin.deleteUser`, cascade FK existante — pas de purge manuelle table par table.
- Export de données personnelles (art. 20 RGPD), JSON complet, secrets exclus (webhook token, OAuth, clés push).
- Deux actions indépendantes, section "Données & vie privée" dans Le Profil.
- Met à jour `/confidentialite` (self-service au lieu du traitement manuel par email), `CHANGELOG.md`, `CLAUDE.md`, article Le Guide.

## Test plan
- [x] `npm run lint`
- [x] `npx tsc --noEmit`
- [x] `npm test` (Vitest, `app/actions/account.test.ts`)
- [x] `npm run build`
- [x] `npm run e2e` (dont `e2e/account-deletion.spec.ts` sur compte jetable)
- [x] Vérification manuelle : export télécharge un JSON sans secrets ; modale de suppression bloque sans mot de passe/texte exact ; suppression réelle testée uniquement sur compte jetable e2e.

Closes #154

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

**Ne pas exécuter `git push`/`gh pr create` sans confirmation explicite de l'utilisateur au moment de l'implémentation** — cohérent avec la règle de ce projet (jamais de push/PR sans validation).
