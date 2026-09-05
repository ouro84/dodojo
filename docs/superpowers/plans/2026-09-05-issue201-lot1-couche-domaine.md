# Lot 1 — Couche domaine `lib/domain/` (issue #201)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extraire toute la logique métier des server actions vers `lib/domain/`, en fonctions paramétrées par un client Supabase et un `userId` explicites, pour qu'elles soient appelables sans session cookie (serveur MCP, webhook Siri) — sans changer un seul comportement observable.

**Architecture:** Chaque fonction de `lib/domain/` prend `(supabase: SupabaseClient, userId: string, ...)` et renvoie un résultat portant un **code** d'erreur machine. Les server actions de `app/actions/` deviennent des wrappers de ~8 lignes : résoudre la session, appeler le domaine, traduire le code en message « voix », `revalidatePath`. Aucun `"use server"`, `revalidatePath` ni `supabase.auth.getUser()` sous `lib/domain/`.

**Tech Stack:** TypeScript strict, Next.js 16 App Router, Supabase (`@supabase/supabase-js`), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-05-mcp-catalogue-tools-design.md`

**Branche:** `feat/issue-201-mcp-catalogue-tools` (déjà créée, porte le commit du spec)

---

## Global Constraints

- **Aucun changement de comportement.** `app/actions/tasks.test.ts` (701 lignes) doit rester vert **sans qu'une seule ligne de test ne soit modifiée**. Un test qu'il faut retoucher signale une régression, pas un déplacement : annuler et recommencer.
- **Typage du client Supabase :** toujours `SupabaseClient` importé de `@supabase/supabase-js`. **Jamais** `ReturnType<typeof createClient>` ni `Awaited<ReturnType<typeof createClient>>` — cet alias fait perdre l'inférence sur `.insert()`, qui résout vers `never[]` et casse `tsc --noEmit` dès qu'un client est passé en paramètre entre fonctions.
- **Interdits sous `lib/domain/` :** `"use server"`, `revalidatePath`, `supabase.auth.getUser()`.
- **`revalidatePath` uniquement sur succès.** `app/actions/tasks.test.ts` asserte `revalidateCalls === 0` sur les rejets de garde. Un wrapper qui revalide inconditionnellement casse ces tests.
- **Imports :** l'alias `@/` fonctionne sous Vitest (`vitest.config.ts` porte `resolve.alias` depuis US-20). Les fichiers `lib/domain/*` l'utilisent. La note CLAUDE.md imposant des imports relatifs est périmée et sera corrigée en Task 9.
- **TypeScript strict :** interdiction d'`any`.
- **Commits :** Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`), message en français.
- **Jamais de commit direct sur `main`.** Tout se fait sur `feat/issue-201-mcp-catalogue-tools`.

### Substitutions mécaniques d'extraction

Chaque tâche d'extraction applique **exactement** ces six substitutions au corps déplacé, et rien d'autre :

| Dans `app/actions/tasks.ts` | Devient dans `lib/domain/tasks.ts` |
|---|---|
| `const supabase = await createClient();` | supprimé — `supabase` est un paramètre |
| `const { data: { user } } = await supabase.auth.getUser();` + garde `if (!user)` | supprimé — remonte dans le wrapper |
| `user.id` | `userId` |
| `revalidatePath("/")` | supprimé — remonte dans le wrapper |
| `Awaited<ReturnType<typeof createClient>>` (helpers `userToday`, `lockOverdueDamage`) | `SupabaseClient` |
| `return { error: "Message français…" }` | `return { error: "code_machine" }` |

Toute autre modification du corps est hors périmètre de ce lot.

### Duplication temporaire assumée

`FakeSupabaseClient` / `FakeQueryBuilder` sont copiés depuis `app/actions/tasks.test.ts:10-118` vers `lib/domain/fake-supabase.ts` (Task 1). C'est une duplication **délibérée** : la contrainte « ne pas toucher `tasks.test.ts` » interdit de l'y remplacer par un import. La copie sera collapsée dans un PR ultérieur, une fois le lot 1 mergé et la suite verte confirmée.

---

## Structure de fichiers

| Fichier | Responsabilité |
|---|---|
| `lib/domain/errors.ts` | **Créé.** Union `DomainErrorCode` + type `DomainResult`. Aucune I/O, aucun message français. |
| `lib/domain/fake-supabase.ts` | **Créé.** Faux client Supabase pour les tests du domaine. Test-only, jamais importé par du code de production. |
| `lib/domain/tasks.ts` | **Créé.** Tout le métier de `app/actions/tasks.ts` : ajout, complétion, deadline, Rage Quit, Réveil, Demain, réordonnancement. |
| `lib/domain/shop.ts` | **Créé.** `equipHeroForUser`. |
| `lib/domain/boss.ts` | **Créé.** `readDailyBoss` — lecture seule, n'écrit jamais `daily_boss`. |
| `lib/domain/progression.ts` | **Créé.** `readProgression` — niveau, XP, seuil, solde d'or. |
| `lib/domain/*.test.ts` | **Créés.** Tests du domaine attaquant les fonctions directement. |
| `app/actions/tasks.ts` | **Modifié.** 1007 → ~200 lignes de wrappers. |
| `app/actions/achievements.ts` | **Modifié.** Re-typage sur `SupabaseClient`. |
| `app/actions/shop.ts` | **Modifié.** `equipHeroAndSkin` devient un wrapper. |
| `app/actions/tasks.test.ts` | **INTOUCHABLE.** |

---

## Task 1 : Socle — codes d'erreur, faux client, re-typage d'`achievements.ts`

**Files:**
- Create: `lib/domain/errors.ts`
- Create: `lib/domain/fake-supabase.ts`
- Modify: `app/actions/achievements.ts:11` (et toutes les signatures qui utilisent `SupabaseServer`)
- Test: `tsc --noEmit` + suite Vitest existante

**Interfaces:**
- Consumes: rien (première tâche)
- Produces: `DomainErrorCode`, `DomainResult<T>`, `FakeSupabaseClient`, et `assembleAchievementContext(supabase: SupabaseClient, userId: string)` / `applyNewAchievements(supabase: SupabaseClient, userId: string, ctx: AchievementContext)` désormais appelables avec un client service-role.

- [ ] **Step 1 : Établir la baseline verte avant de toucher quoi que ce soit**

```bash
git checkout feat/issue-201-mcp-catalogue-tools
npm run lint
npx tsc --noEmit
npm run test
npm run build
```

Attendu : tout vert. Noter la durée de `npm run test`. Si quoi que ce soit est rouge **avant** la première modification, s'arrêter et le signaler — on ne construit pas sur une baseline cassée.

- [ ] **Step 2 : Créer `lib/domain/errors.ts`**

```ts
// Codes d'erreur du domaine. Le domaine ne connaît AUCUN message français :
// la traduction en copy « voix » appartient aux server actions (app/actions/),
// qui seules savent à qui elles parlent. Le serveur MCP, lui, renvoie ces
// codes tels quels à un agent (cf. D6.3 du spec).
export type DomainErrorCode =
  | "invalid_task_id"
  | "invalid_title"
  | "task_not_found"
  | "task_abandoned"
  | "depth_limit"
  | "fetch_failed"
  | "insert_failed"
  | "update_failed"
  | "profile_not_found"
  | "hero_not_found"
  | "hero_not_owned"
  | "skin_not_found"
  | "skin_not_owned";

export interface DomainResult {
  error: DomainErrorCode | null;
}
```

- [ ] **Step 3 : Créer `lib/domain/fake-supabase.ts`**

Copier **à l'identique** les classes `FakeQueryBuilder` et `FakeSupabaseClient` de `app/actions/tasks.test.ts:10-118`, en les exportant et en ajoutant l'en-tête suivant. Ne rien changer à leur logique — c'est une copie, pas une réécriture.

```ts
// Faux client Supabase — TEST ONLY, jamais importé par du code de production.
// Copie délibérée de app/actions/tasks.test.ts (lot 1, issue #201) : ce
// fichier de test est sous contrainte « aucune modification » pendant la
// refacto, on ne peut donc pas l'y remplacer par un import. Les deux copies
// seront fusionnées dans un PR ultérieur.
```

- [ ] **Step 4 : Vérifier que le faux client compile et se comporte comme l'original**

Créer `lib/domain/fake-supabase.test.ts` :

```ts
import { describe, expect, test } from "vitest";
import { FakeSupabaseClient } from "./fake-supabase";

describe("FakeSupabaseClient", () => {
  test("n'incrémente calls que sur from(), jamais sur auth.getUser()", async () => {
    const client = new FakeSupabaseClient({ profiles: [{ id: "u1" }] });
    await client.auth.getUser();
    expect(client.calls).toBe(0);
    client.from("profiles");
    expect(client.calls).toBe(1);
  });

  test("select renvoie un instantané détaché, pas une référence vivante", async () => {
    const client = new FakeSupabaseClient({ tasks: [{ id: "t1", is_completed: false }] });
    const { data: before } = await client.from("tasks").select().eq().maybeSingle();
    await client.from("tasks").update({ is_completed: true }).eq();
    expect(before?.is_completed).toBe(false);
  });
});
```

Run : `npx vitest run lib/domain/fake-supabase.test.ts`
Attendu : PASS. Le second test verrouille l'invariant de clonage documenté dans `tasks.test.ts:70-80` — sans lui, une régression du faux client produirait des tests de domaine verts pour de mauvaises raisons.

- [ ] **Step 5 : Re-typer `app/actions/achievements.ts`**

Supprimer la ligne 11 :

```ts
type SupabaseServer = Awaited<ReturnType<typeof createClient>>;
```

Ajouter l'import et remplacer **toutes** les occurrences de `SupabaseServer` par `SupabaseClient` :

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
```

Signatures cibles :

```ts
export async function assembleAchievementContext(
  supabase: SupabaseClient,
  userId: string,
): Promise<AchievementContext>

export async function applyNewAchievements(
  supabase: SupabaseClient,
  userId: string,
  ctx: AchievementContext,
): Promise<string[]>
```

- [ ] **Step 6 : Vérifier que la compilation et les tests passent**

```bash
npx tsc --noEmit
npm run test
```

Attendu : tout vert. Si `tsc` remonte des erreurs `never[]` sur des `.insert()` dans `achievements.ts`, c'est que l'ancien alias traîne encore quelque part — chercher `SupabaseServer` dans tout le repo.

- [ ] **Step 7 : Commit**

```bash
git add lib/domain/errors.ts lib/domain/fake-supabase.ts lib/domain/fake-supabase.test.ts app/actions/achievements.ts
git commit -m "chore: socle de la couche domaine et re-typage des succes sur SupabaseClient (issue #201)"
```

---

## Task 2 : `completeTaskForUser` — l'extraction la plus dure

Faite en premier délibérément : elle concentre XP, combo server-authoritative, verrouillage `hp_penalty`, annulation de rappel et succès. Si le patron tient sur elle, il tient sur tout.

**Files:**
- Create: `lib/domain/tasks.ts`
- Create: `lib/domain/tasks.test.ts`
- Modify: `app/actions/tasks.ts:205-373` (`setTaskCompleted`)

**Interfaces:**
- Consumes: `DomainErrorCode` (Task 1), `assembleAchievementContext` / `applyNewAchievements` re-typées (Task 1), `FakeSupabaseClient` (Task 1)
- Produces:

```ts
export interface CompleteTaskOutcome {
  error: DomainErrorCode | null;
  level?: number;
  xp?: number;
  leveledUp?: boolean;
  comboCount?: number;
  newAchievements?: string[];
}

export async function completeTaskForUser(
  supabase: SupabaseClient,
  userId: string,
  taskId: string,
  isCompleted: boolean,
): Promise<CompleteTaskOutcome>
```

- [ ] **Step 1 : Écrire les tests du domaine (ils doivent échouer)**

Créer `lib/domain/tasks.test.ts` :

```ts
import { describe, expect, test, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FakeSupabaseClient } from "./fake-supabase";
import { completeTaskForUser } from "./tasks";

vi.mock("@/lib/inngest/deadline-reminder", () => ({
  cancelDeadlineReminder: async () => {},
  scheduleDeadlineReminder: async () => {},
}));

function client(tasks: Record<string, unknown>[]): FakeSupabaseClient {
  return new FakeSupabaseClient({
    profiles: [{ id: "u1", level: 1, xp: 0, timezone: "UTC", combo_count: 0, last_combo_completed_at: null }],
    tasks,
    unlocked_achievements: [],
  });
}

describe("completeTaskForUser", () => {
  test("refuse un id non-UUID sans emettre la moindre requete", async () => {
    const c = client([]);
    const res = await completeTaskForUser(c as unknown as SupabaseClient, "u1", "optimistic-1", true);
    expect(res.error).toBe("invalid_task_id");
    expect(c.calls).toBe(0);
  });

  test("accorde de l'XP a la premiere completion", async () => {
    const c = client([
      { id: "11111111-1111-1111-1111-111111111111", is_completed: false, is_abandoned: false, xp_awarded: null, deadline_at: null, deferred_at: null },
    ]);
    const res = await completeTaskForUser(
      c as unknown as SupabaseClient,
      "u1",
      "11111111-1111-1111-1111-111111111111",
      true,
    );
    expect(res.error).toBeNull();
    expect(res.xp).toBeGreaterThan(0);
  });

  test("ne renvoie jamais un message francais, seulement un code", async () => {
    const c = client([]);
    const res = await completeTaskForUser(c as unknown as SupabaseClient, "u1", "optimistic-1", true);
    expect(res.error).not.toMatch(/[éèêàùç]/);
  });
});
```

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

Run : `npx vitest run lib/domain/tasks.test.ts`
Attendu : FAIL — `Failed to resolve import "./tasks"`.

- [ ] **Step 3 : Créer `lib/domain/tasks.ts` avec `completeTaskForUser`**

En-tête du fichier :

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyXpDelta,
  hpPenaltyToLock,
  nextComboState,
  xpForCompletion,
  XP_PER_TASK,
} from "@/lib/game-engine";
import { assembleAchievementContext, applyNewAchievements } from "@/app/actions/achievements";
import { cancelDeadlineReminder } from "@/lib/inngest/deadline-reminder";
import type { DomainErrorCode } from "./errors";

// Audit #67, PR5 : `id` alimente un filtre PostgREST construit par
// interpolation de chaine. Valider le format avant construction. La garde vit
// ici (et non plus seulement dans la server action) parce que le serveur MCP
// appelle le domaine directement, sans passer par app/actions/.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
```

Déplacer le corps de `app/actions/tasks.ts:205-373` en appliquant **uniquement** les six substitutions du tableau des Global Constraints. Correspondance des codes d'erreur pour cette fonction :

| Message d'origine | Code |
|---|---|
| `"La tâche n'est pas encore prête…"` / `"Impossible d'annuler pour l'instant…"` | `invalid_task_id` |
| `"Le coup n'est pas passé. Réessaie."` / `"Impossible d'annuler le coup. Réessaie."` (fetch) | `task_not_found` |
| `"Le coup n'est pas passé. Réessaie."` / `"Impossible d'annuler le coup. Réessaie."` (update) | `update_failed` |

- [ ] **Step 4 : Lancer les tests du domaine**

Run : `npx vitest run lib/domain/tasks.test.ts`
Attendu : PASS (3 tests).

- [ ] **Step 5 : Réécrire `setTaskCompleted` en wrapper**

Remplacer entièrement `app/actions/tasks.ts:205-373` par :

```ts
export async function setTaskCompleted(
  id: string,
  isCompleted: boolean,
): Promise<TaskActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Session expirée. Reconnecte-toi." };
  }

  const outcome = await completeTaskForUser(supabase, user.id, id, isCompleted);

  if (outcome.error !== null) {
    return { error: completionErrorMessage(outcome.error, isCompleted) };
  }

  revalidatePath("/");
  return {
    error: null,
    level: outcome.level,
    xp: outcome.xp,
    leveledUp: outcome.leveledUp,
    comboCount: outcome.comboCount,
    newAchievements: outcome.newAchievements,
  };
}

// Traduction code → copy « voix ». Les deux variantes par code existent parce
// que cocher et décocher n'ont jamais eu le même message (Fix #95 : ne pas
// afficher « Le coup n'est pas passé » quand la vraie cause est un tap trop
// rapide sur une tâche pas encore créée).
function completionErrorMessage(code: DomainErrorCode, isCompleted: boolean): string {
  if (code === "invalid_task_id") {
    return isCompleted
      ? "La tâche n'est pas encore prête, réessaie dans un instant."
      : "Impossible d'annuler pour l'instant, réessaie dans un instant.";
  }
  return isCompleted ? "Le coup n'est pas passé. Réessaie." : "Impossible d'annuler le coup. Réessaie.";
}
```

- [ ] **Step 6 : Vérifier que les tests de la server action passent SANS avoir été modifiés**

```bash
git diff --exit-code app/actions/tasks.test.ts
npx vitest run app/actions/tasks.test.ts
npx tsc --noEmit
```

Attendu : `git diff --exit-code` sort en 0 (fichier intact), Vitest PASS. Si un test échoue, **ne pas le modifier** : le corps déplacé diverge de l'original, revenir dessus.

- [ ] **Step 7 : Commit**

```bash
git add lib/domain/tasks.ts lib/domain/tasks.test.ts app/actions/tasks.ts
git commit -m "refactor: extraire completeTaskForUser vers la couche domaine (issue #201)"
```

---

## Task 3 : Famille ajout — `addTaskForUser`, `addSubtaskForUser`

**Files:**
- Modify: `lib/domain/tasks.ts` (ajout), `lib/domain/tasks.test.ts` (ajout)
- Modify: `app/actions/tasks.ts:99-204` (`addTask`, `addSubtask`)

**Interfaces:**
- Consumes: `DomainErrorCode`, `UUID_RE` (Task 2, déjà dans le fichier)
- Produces:

```ts
export interface AddTaskOutcome {
  error: DomainErrorCode | null;
  id?: string;
}

export async function addTaskForUser(
  supabase: SupabaseClient,
  userId: string,
  title: string,
  dayDate?: string,
): Promise<AddTaskOutcome>

export async function addSubtaskForUser(
  supabase: SupabaseClient,
  userId: string,
  parentId: string,
  title: string,
): Promise<AddTaskOutcome>
```

`addTaskForUser` conserve la délégation à `insertTaskForUser` (`lib/task-insertion.ts`) : c'est déjà la fonction partagée avec le webhook Siri, elle ne bouge pas. Le `dayDate` optionnel prépare le tool `add_task` avec `day: "tomorrow"` du lot 4 ; il est passé tel quel à `insertTaskForUser`, qui l'accepte déjà.

- [ ] **Step 1 : Écrire les tests du domaine**

Ajouter à `lib/domain/tasks.test.ts` :

```ts
import { addSubtaskForUser, addTaskForUser } from "./tasks";

describe("addTaskForUser", () => {
  test("refuse un titre vide", async () => {
    const c = client([]);
    const res = await addTaskForUser(c as unknown as SupabaseClient, "u1", "   ");
    expect(res.error).toBe("invalid_title");
    expect(c.calls).toBe(0);
  });

  test("cree la tache et renvoie son id", async () => {
    const c = client([]);
    const res = await addTaskForUser(c as unknown as SupabaseClient, "u1", "Ranger le bureau");
    expect(res.error).toBeNull();
    expect(res.id).toBeTruthy();
  });
});

describe("addSubtaskForUser", () => {
  test("refuse un parent qui est deja une sous-tache (RG-01, deux niveaux max)", async () => {
    const c = client([
      { id: "22222222-2222-2222-2222-222222222222", parent_id: "11111111-1111-1111-1111-111111111111", is_abandoned: false, day_date: "2026-09-05" },
    ]);
    const res = await addSubtaskForUser(
      c as unknown as SupabaseClient,
      "u1",
      "22222222-2222-2222-2222-222222222222",
      "Sous-sous-tache",
    );
    expect(res.error).toBe("depth_limit");
  });

  test("refuse un parent abandonne", async () => {
    const c = client([
      { id: "33333333-3333-3333-3333-333333333333", parent_id: null, is_abandoned: true, day_date: "2026-09-05" },
    ]);
    const res = await addSubtaskForUser(
      c as unknown as SupabaseClient,
      "u1",
      "33333333-3333-3333-3333-333333333333",
      "Sous-tache",
    );
    expect(res.error).toBe("task_abandoned");
  });
});
```

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

Run : `npx vitest run lib/domain/tasks.test.ts`
Attendu : FAIL — `addTaskForUser is not a function`.

- [ ] **Step 3 : Déplacer les corps**

Déplacer `app/actions/tasks.ts:99-134` (`addTask`) et `135-204` (`addSubtask`) vers `lib/domain/tasks.ts`, six substitutions appliquées. Correspondance des codes :

| Message d'origine | Code |
|---|---|
| Retour de `validateTaskTitle` (`"error" in validation`) | `invalid_title` |
| `"Le monstre a résisté à l'invocation. Réessaie."` | `insert_failed` |
| `"Cette tâche est introuvable."` | `task_not_found` |
| `"Cette tâche a été abandonnée, pas de sous-tâche possible."` | `task_abandoned` |
| `"Deux niveaux, pas plus — cette tâche est déjà une sous-tâche."` | `depth_limit` |
| `"La sous-tâche a résisté à l'invocation. Réessaie."` | `insert_failed` |

⚠️ `invalid_title` perd le message précis de `validateTaskTitle` (titre vide vs trop long). Le wrapper doit donc **rappeler `validateTaskTitle` lui-même** pour restituer le message exact, avant de déléguer au domaine — la double validation est volontaire et sans coût (fonction pure).

- [ ] **Step 4 : Lancer les tests du domaine**

Run : `npx vitest run lib/domain/tasks.test.ts`
Attendu : PASS.

- [ ] **Step 5 : Réécrire les deux server actions en wrappers**

```ts
export async function addTask(title: string): Promise<TaskActionResult> {
  const validation = validateTaskTitle(title);
  if ("error" in validation) {
    return { error: validation.error };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Session expirée. Reconnecte-toi." };
  }

  const outcome = await addTaskForUser(supabase, user.id, validation.title);
  if (outcome.error !== null) {
    return { error: "Le monstre a résisté à l'invocation. Réessaie." };
  }

  revalidatePath("/");
  return { error: null, id: outcome.id };
}

export async function addSubtask(parentId: string, title: string): Promise<TaskActionResult> {
  const validation = validateTaskTitle(title);
  if ("error" in validation) {
    return { error: validation.error };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Session expirée. Reconnecte-toi." };
  }

  const outcome = await addSubtaskForUser(supabase, user.id, parentId, validation.title);
  if (outcome.error !== null) {
    return { error: subtaskErrorMessage(outcome.error) };
  }

  revalidatePath("/");
  return { error: null, id: outcome.id };
}

function subtaskErrorMessage(code: DomainErrorCode): string {
  if (code === "task_not_found") return "Cette tâche est introuvable.";
  if (code === "task_abandoned") return "Cette tâche a été abandonnée, pas de sous-tâche possible.";
  if (code === "depth_limit") return "Deux niveaux, pas plus — cette tâche est déjà une sous-tâche.";
  return "La sous-tâche a résisté à l'invocation. Réessaie.";
}
```

- [ ] **Step 6 : Vérifier**

```bash
git diff --exit-code app/actions/tasks.test.ts
npx vitest run app/actions/tasks.test.ts
npx tsc --noEmit
```

Attendu : fichier de test intact, PASS.

- [ ] **Step 7 : Commit**

```bash
git add lib/domain/tasks.ts lib/domain/tasks.test.ts app/actions/tasks.ts
git commit -m "refactor: extraire addTaskForUser et addSubtaskForUser (issue #201)"
```

---

## Task 4 : `setTaskDeadlineForUser`

**Files:**
- Modify: `lib/domain/tasks.ts`, `lib/domain/tasks.test.ts`
- Modify: `app/actions/tasks.ts:812-871` (`setTaskDeadline`)

**Interfaces:**
- Consumes: `DomainErrorCode`, `UUID_RE`
- Produces:

```ts
export async function setTaskDeadlineForUser(
  supabase: SupabaseClient,
  userId: string,
  taskId: string,
  deadlineAt: string | null,
  reminderOffsetMinutes?: number | null,
  reminderEnabled?: boolean,
): Promise<DomainResult>
```

Cette fonction tire `scheduleDeadlineReminder` / `cancelDeadlineReminder` (Inngest). Ces appels partent avec le corps — ils ne sont ni de la revalidation ni de l'auth, donc ils restent dans le domaine.

- [ ] **Step 1 : Écrire les tests du domaine**

Ajouter à `lib/domain/tasks.test.ts`. Remplacer le `vi.mock` du haut de fichier par une version qui enregistre les appels :

```ts
const cancelCalls: string[] = [];
const scheduleCalls: Array<{ taskId: string; offsetMinutes: number }> = [];

vi.mock("@/lib/inngest/deadline-reminder", () => ({
  cancelDeadlineReminder: async (taskId: string) => {
    cancelCalls.push(taskId);
  },
  scheduleDeadlineReminder: async (p: { taskId: string; offsetMinutes: number }) => {
    scheduleCalls.push(p);
  },
}));
```

Puis :

```ts
describe("setTaskDeadlineForUser", () => {
  test("effacer la deadline annule le rappel sans en reprogrammer", async () => {
    cancelCalls.length = 0;
    scheduleCalls.length = 0;
    const c = client([
      { id: "44444444-4444-4444-4444-444444444444", reminder_enabled: true, reminder_offset_minutes: null },
    ]);
    const res = await setTaskDeadlineForUser(
      c as unknown as SupabaseClient,
      "u1",
      "44444444-4444-4444-4444-444444444444",
      null,
    );
    expect(res.error).toBeNull();
    expect(cancelCalls).toContain("44444444-4444-4444-4444-444444444444");
    expect(scheduleCalls).toHaveLength(0);
  });

  test("refuse un id non-UUID sans emettre de requete", async () => {
    const c = client([]);
    const res = await setTaskDeadlineForUser(
      c as unknown as SupabaseClient,
      "u1",
      "optimistic-3",
      "2026-09-06T12:00:00.000Z",
    );
    expect(res.error).toBe("invalid_task_id");
    expect(c.calls).toBe(0);
  });
});
```

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

Run : `npx vitest run lib/domain/tasks.test.ts`
Attendu : FAIL — `setTaskDeadlineForUser is not a function`.

- [ ] **Step 3 : Déplacer le corps**

Déplacer `app/actions/tasks.ts:812-871`, six substitutions. Codes : `invalid_task_id` pour la garde UUID, `update_failed` pour `"Impossible de fixer cette deadline. Réessaie."`.

- [ ] **Step 4 : Lancer les tests du domaine**

Run : `npx vitest run lib/domain/tasks.test.ts`
Attendu : PASS.

- [ ] **Step 5 : Réécrire la server action en wrapper**

```ts
export async function setTaskDeadline(
  id: string,
  deadlineAt: string | null,
  reminderOffsetMinutes?: number | null,
  reminderEnabled?: boolean,
): Promise<TaskActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Session expirée. Reconnecte-toi." };
  }

  const outcome = await setTaskDeadlineForUser(
    supabase,
    user.id,
    id,
    deadlineAt,
    reminderOffsetMinutes,
    reminderEnabled,
  );

  if (outcome.error !== null) {
    return {
      error:
        outcome.error === "invalid_task_id"
          ? "Cette tâche n'est pas encore prête, réessaie dans un instant."
          : "Impossible de fixer cette deadline. Réessaie.",
    };
  }

  revalidatePath("/");
  return { error: null };
}
```

- [ ] **Step 6 : Vérifier**

```bash
git diff --exit-code app/actions/tasks.test.ts
npx vitest run app/actions/tasks.test.ts
npx tsc --noEmit
```

Attendu : intact, PASS. `describe("setTaskDeadline — moteur de rappel (#114)")` (`tasks.test.ts:427`) et les trois blocs d'annulation de rappel (lignes 257, 325, 367) sont les gardes les plus sensibles de cette tâche.

- [ ] **Step 7 : Commit**

```bash
git add lib/domain/tasks.ts lib/domain/tasks.test.ts app/actions/tasks.ts
git commit -m "refactor: extraire setTaskDeadlineForUser (issue #201)"
```

---

## Task 5 : Famille Réveil + helpers partagés

**Files:**
- Modify: `lib/domain/tasks.ts`, `lib/domain/tasks.test.ts`
- Modify: `app/actions/tasks.ts:58-98` (helpers `userToday`, `lockOverdueDamage`), `617-811` (actions du Réveil)

**Interfaces:**
- Consumes: `DomainErrorCode`, `UUID_RE`
- Produces:

```ts
export async function userToday(supabase: SupabaseClient, userId: string): Promise<string>

export interface OverdueOutcome {
  error: DomainErrorCode | null;
  deferredTasks?: Task[];
  hpDamageLocked?: { hp_damage_locked: number; hp_damage_locked_day: string };
}

export async function completeOverdueTaskForUser(supabase: SupabaseClient, userId: string, taskId: string): Promise<OverdueOutcome>
export async function deferOverdueTaskForUser(supabase: SupabaseClient, userId: string, taskId: string): Promise<OverdueOutcome>
export async function annihilateOverdueTaskForUser(supabase: SupabaseClient, userId: string, taskId: string): Promise<OverdueOutcome>
export async function deferAllOverdueForUser(supabase: SupabaseClient, userId: string): Promise<OverdueOutcome>
export async function annihilateOverdueOlderThanForUser(supabase: SupabaseClient, userId: string, days: number): Promise<OverdueOutcome>
```

`lockOverdueDamage` reste **privée** au module (pas d'`export`) : aucun appelant hors de cette famille, et le lot 4 n'en expose aucun tool.

`OverdueOutcome` référence le type `Task` — ajouter `import type { Task } from "@/types";` en tête de `lib/domain/tasks.ts` s'il n'y est pas déjà. Même remarque pour `MoveTaskOutcome` en Task 7.

- [ ] **Step 1 : Écrire les tests du domaine**

```ts
import { deferOverdueTaskForUser, userToday } from "./tasks";

describe("userToday", () => {
  test("derive le jour local depuis le fuseau du profil", async () => {
    const c = new FakeSupabaseClient({ profiles: [{ id: "u1", timezone: "Europe/Paris" }] });
    const day = await userToday(c as unknown as SupabaseClient, "u1");
    expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("retombe sur UTC quand le profil n'a pas de fuseau", async () => {
    const c = new FakeSupabaseClient({ profiles: [{ id: "u1", timezone: null }] });
    const day = await userToday(c as unknown as SupabaseClient, "u1");
    expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("deferOverdueTaskForUser", () => {
  test("efface deadline_at en meme temps qu'il reporte", async () => {
    const c = client([
      { id: "55555555-5555-5555-5555-555555555555", is_completed: false, is_abandoned: false, deadline_at: "2026-09-04T10:00:00.000Z", deferred_at: null, day_date: "2026-09-04" },
    ]);
    const res = await deferOverdueTaskForUser(
      c as unknown as SupabaseClient,
      "u1",
      "55555555-5555-5555-5555-555555555555",
    );
    expect(res.error).toBeNull();
    expect(res.deferredTasks?.[0]?.deadline_at).toBeNull();
  });
});
```

Le second test verrouille la règle documentée dans CLAUDE.md : le report du Réveil efface la deadline pour ne pas cumuler le malus −10 (deadline ratée) avec le −20 (retard reporté) sur la même tâche.

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

Run : `npx vitest run lib/domain/tasks.test.ts`
Attendu : FAIL — fonctions absentes.

- [ ] **Step 3 : Déplacer les corps**

Déplacer `app/actions/tasks.ts:58-98` puis `617-811`, six substitutions. Sur les helpers, remplacer `Awaited<ReturnType<typeof createClient>>` par `SupabaseClient`. Codes : `invalid_task_id` (gardes UUID), `task_not_found` (`"Cette tâche est introuvable."`), `update_failed` (les autres échecs d'écriture).

- [ ] **Step 4 : Lancer les tests du domaine**

Run : `npx vitest run lib/domain/tasks.test.ts`
Attendu : PASS.

- [ ] **Step 5 : Réécrire les cinq server actions en wrappers**

Même patron que Task 2, `TaskActionResult` reconstruit champ par champ. Ces actions propagent `deferredTasks` et `hpDamageLocked` — les oublier casserait le canal de remontée du bug #70 (`onResolved({ deferredTasks, createdTasks, hpDamageLocked })` côté `WakeUpRitual`), sans qu'aucun test unitaire ne le voie. Vérifier que chaque champ présent dans `OverdueOutcome` est bien recopié dans le `TaskActionResult` retourné.

Message d'erreur unique pour cette famille : `"Cette tâche est introuvable."` pour `task_not_found` et `invalid_task_id`, `"Le Réveil a échoué. Réessaie."` sinon — reprendre **exactement** les chaînes présentes dans le code d'origine, ne pas en inventer.

- [ ] **Step 6 : Vérifier**

```bash
git diff --exit-code app/actions/tasks.test.ts
npx vitest run app/actions/tasks.test.ts
npx tsc --noEmit
```

Attendu : intact, PASS. `describe("Annulation du rappel deadline — actions du Réveil (#114)")` (`tasks.test.ts:325`) est la garde critique ici.

- [ ] **Step 7 : Commit**

```bash
git add lib/domain/tasks.ts lib/domain/tasks.test.ts app/actions/tasks.ts
git commit -m "refactor: extraire la famille Reveil vers la couche domaine (issue #201)"
```

---

## Task 6 : Rage Quit, undo et réordonnancement

**Files:**
- Modify: `lib/domain/tasks.ts`, `lib/domain/tasks.test.ts`
- Modify: `app/actions/tasks.ts:373-616` (`rageQuitTask`, `undoRageQuit`, `reorderSiblings`)

**Interfaces:**
- Produces:

```ts
export async function rageQuitTaskForUser(supabase: SupabaseClient, userId: string, taskId: string): Promise<CompleteTaskOutcome>
export async function undoRageQuitForUser(supabase: SupabaseClient, userId: string, taskId: string): Promise<CompleteTaskOutcome>
export async function reorderSiblingsForUser(supabase: SupabaseClient, userId: string, parentId: string | null, orderedTaskIds: string[]): Promise<DomainResult>
```

- [ ] **Step 1 : Écrire les tests du domaine**

```ts
import { rageQuitTaskForUser } from "./tasks";

describe("rageQuitTaskForUser", () => {
  test("refuse un id non-UUID sans emettre de requete", async () => {
    const c = client([]);
    const res = await rageQuitTaskForUser(c as unknown as SupabaseClient, "u1", "optimistic-2");
    expect(res.error).toBe("invalid_task_id");
    expect(c.calls).toBe(0);
  });

  test("applique le malus XP une seule fois, pas une par sous-tache cascadee", async () => {
    const c = client([
      { id: "66666666-6666-6666-6666-666666666666", parent_id: null, is_completed: false, is_abandoned: false, deadline_at: null, deferred_at: null },
      { id: "77777777-7777-7777-7777-777777777777", parent_id: "66666666-6666-6666-6666-666666666666", is_completed: false, is_abandoned: false, deadline_at: null, deferred_at: null },
      { id: "88888888-8888-8888-8888-888888888888", parent_id: "66666666-6666-6666-6666-666666666666", is_completed: false, is_abandoned: false, deadline_at: null, deferred_at: null },
    ]);
    const res = await rageQuitTaskForUser(
      c as unknown as SupabaseClient,
      "u1",
      "66666666-6666-6666-6666-666666666666",
    );
    expect(res.error).toBeNull();
    // RAGE_QUIT_XP_PENALTY vaut 5 : une racine à 2 enfants coûte 5 XP, jamais 15.
    expect(res.xp).toBe(0); // profil de départ à 0 XP, clampé sans de-level
  });
});
```

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

Run : `npx vitest run lib/domain/tasks.test.ts`
Attendu : FAIL.

- [ ] **Step 3 : Déplacer les corps**

Déplacer `app/actions/tasks.ts:373-616`, six substitutions. Codes : `invalid_task_id`, `task_not_found`, `update_failed`.

- [ ] **Step 4 : Lancer les tests du domaine**

Run : `npx vitest run lib/domain/tasks.test.ts`
Attendu : PASS.

- [ ] **Step 5 : Réécrire les trois server actions en wrappers**

Même patron. `reorderSiblings` reste réservé au drag & drop (issue #195) — sa signature publique et son comportement best-effort ne changent pas.

- [ ] **Step 6 : Vérifier**

```bash
git diff --exit-code app/actions/tasks.test.ts
npx vitest run app/actions/tasks.test.ts
npx tsc --noEmit
```

- [ ] **Step 7 : Commit**

```bash
git add lib/domain/tasks.ts lib/domain/tasks.test.ts app/actions/tasks.ts
git commit -m "refactor: extraire rageQuit, undo et reorder vers la couche domaine (issue #201)"
```

---

## Task 7 : Famille Demain

**Files:**
- Modify: `lib/domain/tasks.ts`, `lib/domain/tasks.test.ts`
- Modify: `app/actions/tasks.ts:872-1007` (`addTomorrowTask`, `reportToTomorrow`, `bringToToday`)

**Interfaces:**
- Produces:

```ts
export interface MoveTaskOutcome {
  error: DomainErrorCode | null;
  reportedTasks?: Task[];
  broughtBackTasks?: Task[];
}

export async function addTomorrowTaskForUser(supabase: SupabaseClient, userId: string, title: string): Promise<AddTaskOutcome>
export async function reportToTomorrowForUser(supabase: SupabaseClient, userId: string, taskId: string): Promise<MoveTaskOutcome>
export async function bringToTodayForUser(supabase: SupabaseClient, userId: string, taskId: string): Promise<MoveTaskOutcome>
```

- [ ] **Step 1 : Écrire les tests du domaine**

```ts
import { bringToTodayForUser, reportToTomorrowForUser } from "./tasks";

describe("famille Demain", () => {
  test("reportToTomorrow efface toujours deferred_at", async () => {
    const c = client([
      { id: "99999999-9999-9999-9999-999999999999", is_completed: false, is_abandoned: false, deferred_at: "2026-09-05T08:00:00.000Z", deadline_at: null, day_date: "2026-09-05" },
    ]);
    const res = await reportToTomorrowForUser(
      c as unknown as SupabaseClient,
      "u1",
      "99999999-9999-9999-9999-999999999999",
    );
    expect(res.error).toBeNull();
    expect(res.reportedTasks?.[0]?.deferred_at).toBeNull();
  });

  test("bringToToday efface aussi deferred_at", async () => {
    const c = client([
      { id: "aaaaaaaa-9999-9999-9999-999999999999", is_completed: false, is_abandoned: false, deferred_at: "2026-09-05T08:00:00.000Z", deadline_at: null, day_date: "2026-09-06" },
    ]);
    const res = await bringToTodayForUser(
      c as unknown as SupabaseClient,
      "u1",
      "aaaaaaaa-9999-9999-9999-999999999999",
    );
    expect(res.error).toBeNull();
    expect(res.broughtBackTasks?.[0]?.deferred_at).toBeNull();
  });
});
```

Ces deux tests verrouillent la règle de l'issue #116 : `deferred_at` est effacé à **chaque** changement de `day_date`, sinon le malus −20 « reste reporté » réapparaîtrait le lendemain sur une tâche qui n'est plus en retard.

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

Run : `npx vitest run lib/domain/tasks.test.ts`
Attendu : FAIL.

- [ ] **Step 3 : Déplacer les corps**

Déplacer `app/actions/tasks.ts:872-1007`, six substitutions. Codes : `invalid_task_id`, `invalid_title`, `task_not_found`, `insert_failed`, `update_failed`.

- [ ] **Step 4 : Lancer les tests du domaine**

Run : `npx vitest run lib/domain/tasks.test.ts`
Attendu : PASS.

- [ ] **Step 5 : Réécrire les trois server actions en wrappers**

Propager `reportedTasks` et `broughtBackTasks` dans `TaskActionResult` — même canal de remontée client que `deferredTasks`, même conséquence silencieuse si on les oublie.

- [ ] **Step 6 : Vérifier — et confirmer que `app/actions/tasks.ts` a fondu**

```bash
git diff --exit-code app/actions/tasks.test.ts
npx vitest run app/actions/tasks.test.ts
npx tsc --noEmit
wc -l app/actions/tasks.ts
```

Attendu : intact, PASS, et `app/actions/tasks.ts` autour de 200-280 lignes (contre 1007 au départ). Un fichier resté au-dessus de 400 lignes signale qu'un corps métier n'a pas été déplacé.

- [ ] **Step 7 : Commit**

```bash
git add lib/domain/tasks.ts lib/domain/tasks.test.ts app/actions/tasks.ts
git commit -m "refactor: extraire la famille Demain vers la couche domaine (issue #201)"
```

---

## Task 8 : `shop.ts`, `boss.ts`, `progression.ts`

**Files:**
- Create: `lib/domain/shop.ts`, `lib/domain/boss.ts`, `lib/domain/progression.ts`
- Create: `lib/domain/boss.test.ts`, `lib/domain/progression.test.ts`
- Modify: `app/actions/shop.ts:80-119` (`equipHeroAndSkin`)

**Interfaces:**
- Produces:

```ts
// lib/domain/shop.ts
export async function equipHeroForUser(
  supabase: SupabaseClient,
  userId: string,
  heroId: string,
  skinId: string,
): Promise<DomainResult>

// lib/domain/boss.ts — LECTURE SEULE, n'ecrit jamais daily_boss
export interface DailyBossRead {
  bossId: string;
  backgroundId: string;
}
export async function readDailyBoss(
  supabase: SupabaseClient,
  userId: string,
  dayDate: string,
): Promise<DailyBossRead | null>

// lib/domain/progression.ts
export interface ProgressionRead {
  level: number;
  xp: number;
  xpToNextLevel: number;
  gold: number;
  equippedHeroId: string | null;
  equippedSkinId: string | null;
}
export async function readProgression(
  supabase: SupabaseClient,
  userId: string,
): Promise<ProgressionRead | null>
```

- [ ] **Step 1 : Écrire les tests**

Créer `lib/domain/boss.test.ts` :

```ts
import { describe, expect, test } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FakeSupabaseClient } from "./fake-supabase";
import { readDailyBoss } from "./boss";

describe("readDailyBoss", () => {
  test("renvoie null quand le boss du jour n'a pas encore ete tire", async () => {
    const c = new FakeSupabaseClient({ daily_boss: [] });
    const res = await readDailyBoss(c as unknown as SupabaseClient, "u1", "2026-09-05");
    expect(res).toBeNull();
  });

  test("n'ecrit JAMAIS dans daily_boss, meme quand la ligne est absente", async () => {
    const rows: Record<string, unknown>[] = [];
    const c = new FakeSupabaseClient({ daily_boss: rows });
    await readDailyBoss(c as unknown as SupabaseClient, "u1", "2026-09-05");
    expect(rows).toHaveLength(0);
  });

  test("renvoie le boss et le decor persistes", async () => {
    const c = new FakeSupabaseClient({
      daily_boss: [{ user_id: "u1", day_date: "2026-09-05", boss_id: "minotaur", background_id: "forest-1" }],
    });
    const res = await readDailyBoss(c as unknown as SupabaseClient, "u1", "2026-09-05");
    expect(res).toEqual({ bossId: "minotaur", backgroundId: "forest-1" });
  });
});
```

Le deuxième test est le plus important du fichier : il verrouille D6.1 du spec — un agent qui consulte le Boss ne doit jamais figer le tirage du jour ni déclencher l'évaluation des succès.

Créer `lib/domain/progression.test.ts` :

```ts
import { describe, expect, test } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FakeSupabaseClient } from "./fake-supabase";
import { readProgression } from "./progression";

describe("readProgression", () => {
  test("calcule l'XP restante avant le niveau suivant", async () => {
    const c = new FakeSupabaseClient({
      profiles: [{ id: "u1", level: 3, xp: 120, equipped_hero_id: "fire_knight", equipped_skin_id: null }],
      day_results: [],
      unlocked_heroes: [],
      unlocked_skins: [],
    });
    const res = await readProgression(c as unknown as SupabaseClient, "u1");
    // xpThresholdForLevel(3) = 300 ; il reste 180 XP.
    expect(res?.xpToNextLevel).toBe(180);
  });
});
```

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

Run : `npx vitest run lib/domain/boss.test.ts lib/domain/progression.test.ts`
Attendu : FAIL — modules absents.

- [ ] **Step 3 : Écrire les trois modules**

`lib/domain/boss.ts` — extraire **uniquement** le bloc de relecture de `app/actions/boss.ts:51-58` (le `select` sur `daily_boss` filtré par `user_id` + `day_date`), sans aucune des branches d'upsert ni l'évaluation des succès :

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export interface DailyBossRead {
  bossId: string;
  backgroundId: string;
}

// D6.1 du spec : LECTURE SEULE. resolveDailyBoss (app/actions/boss.ts) upsert
// daily_boss et evalue les succes ; l'appeler depuis le serveur MCP ferait
// figer le boss du jour et debloquer des succes sans que l'utilisateur ait
// ouvert l'app. Ne jamais fusionner ces deux fonctions.
export async function readDailyBoss(
  supabase: SupabaseClient,
  userId: string,
  dayDate: string,
): Promise<DailyBossRead | null> {
  const { data } = await supabase
    .from("daily_boss")
    .select("boss_id, background_id")
    .eq("user_id", userId)
    .eq("day_date", dayDate)
    .maybeSingle();

  if (!data) return null;
  const row = data as { boss_id: string; background_id: string };
  return { bossId: row.boss_id, backgroundId: row.background_id };
}
```

`lib/domain/progression.ts` — lecture du profil + `goldBalance(dayResults, unlockedHeroes, unlockedSkins)` (les trois arguments sont **requis** depuis US-53) + `xpThresholdForLevel(level) - xp`.

`lib/domain/shop.ts` — déplacer `app/actions/shop.ts:80-119`, six substitutions. Codes : `hero_not_found`, `skin_not_found`, `hero_not_owned`, `skin_not_owned`, `update_failed`.

⚠️ Ne **pas** toucher `purchaseHero` ni `purchaseSkin` : le lot 4 n'expose aucun tool d'achat, et le garde `if (skin.isDefault) return { error: null }` de `purchaseSkin` est correct et doit rester tel quel (issue #192).

- [ ] **Step 4 : Lancer les tests**

Run : `npx vitest run lib/domain/`
Attendu : PASS.

- [ ] **Step 5 : Réécrire `equipHeroAndSkin` en wrapper**

```ts
export async function equipHeroAndSkin(heroId: string, skinId: string): Promise<ShopActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const outcome = await equipHeroForUser(supabase, user.id, heroId, skinId);
  if (outcome.error !== null) {
    return { error: equipErrorMessage(outcome.error) };
  }

  revalidatePath("/marche-noir");
  revalidatePath("/");
  return { error: null };
}

function equipErrorMessage(code: DomainErrorCode): string {
  if (code === "hero_not_found") return "Ce combattant n'existe pas.";
  if (code === "skin_not_found") return "Cette tenue n'existe pas.";
  if (code === "hero_not_owned") return "Débloque ce combattant avant de l'équiper.";
  if (code === "skin_not_owned") return "Débloque cette tenue avant de l'équiper.";
  return "Impossible d'équiper ce combattant. Réessaie.";
}
```

- [ ] **Step 6 : Vérifier**

```bash
npx vitest run
npx tsc --noEmit
```

Attendu : toute la suite verte, y compris `app/actions/shop.test.ts` (créé à l'issue #192, couvre l'achat de chaque héros et de chaque tenue via `it.each`).

- [ ] **Step 7 : Commit**

```bash
git add lib/domain/shop.ts lib/domain/boss.ts lib/domain/progression.ts lib/domain/boss.test.ts lib/domain/progression.test.ts app/actions/shop.ts
git commit -m "refactor: extraire shop, boss et progression vers la couche domaine (issue #201)"
```

---

## Task 9 : Vérification complète et documentation

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `CLAUDE.md`
- Modify: issue #201 (case PR1)

- [ ] **Step 1 : Lancer la suite complète, y compris e2e**

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run build
npm run e2e
```

Attendu : tout vert. Comparer la durée de `npm run test` à la baseline notée en Task 1 — une dérive importante signalerait un déplacement qui a introduit des requêtes en plus.

Si un test e2e échoue, télécharger le rapport et lire `error-context.md` (état réel de la page) **avant** de toucher au code : ça distingue en deux minutes une assertion trop courte d'un vrai bug d'état.

- [ ] **Step 2 : Confirmer que `app/actions/tasks.test.ts` n'a jamais été touché**

```bash
git diff 1573fa0 --stat -- app/actions/tasks.test.ts
```

Attendu : **aucune sortie**. Une sortie non vide invalide la garantie centrale de ce lot — identifier le commit fautif et le corriger avant d'aller plus loin.

- [ ] **Step 3 : Mettre à jour `CHANGELOG.md`**

Ajouter sous `## [Unreleased]` :

```markdown
- Couche domaine `lib/domain/` : toute la logique métier des tâches, de la boutique, du boss et de la progression est désormais appelable sans session cookie, préparant l'ouverture du serveur MCP (issue #201).
```

- [ ] **Step 4 : Mettre à jour `CLAUDE.md`**

Ajouter une entrée dans « Pièges et décisions non-évidentes » :

```markdown
**Couche domaine `lib/domain/` — client Supabase et userId explicites, jamais de session cookie (issue #201)** — Toute la logique métier des tâches, de la boutique, du boss et de la progression vit sous `lib/domain/`, en fonctions `(supabase: SupabaseClient, userId: string, …)`. Les server actions de `app/actions/` ne font plus que trois gestes : résoudre la session, appeler le domaine, traduire le code d'erreur en copy « voix » puis `revalidatePath`. **Trois interdits sous `lib/domain/`** : `"use server"`, `revalidatePath`, `supabase.auth.getUser()` — un seul suffit à rendre la fonction inappelable depuis le serveur MCP ou le webhook Siri, qui n'ont aucun cookie. Le client est **toujours** typé `SupabaseClient` de `@supabase/supabase-js`, jamais `ReturnType<typeof createClient>` : cet alias fait perdre l'inférence sur `.insert()`, qui résout vers `never[]` et casse `tsc --noEmit` dès qu'un client traverse une frontière de fonction (`app/actions/achievements.ts` portait ce défaut latent, invisible tant qu'aucun client service-role ne lui était passé). Le domaine renvoie des **codes** (`DomainErrorCode`, `lib/domain/errors.ts`), jamais de français : le MCP les sert tels quels à un agent, l'UI les habille.
```

Corriger également la note périmée sur les imports Vitest : `vitest.config.ts` porte `resolve.alias` pour `@` depuis US-20, les imports relatifs ne sont plus obligatoires pour un fichier chargé directement par un test.

- [ ] **Step 5 : Commit de la documentation**

```bash
git add CHANGELOG.md CLAUDE.md
git commit -m "docs: documenter la couche domaine et corriger la note Vitest perimee (issue #201)"
```

- [ ] **Step 6 : Pousser la branche et ouvrir la PR**

```bash
git push -u origin feat/issue-201-mcp-catalogue-tools
gh pr create --title "refactor: couche domaine lib/domain/ (issue #201, lot 1)" --body "Lot 1 de l'issue #201 — aucune fonctionnalité livrée, aucun comportement modifié.

Toute la logique métier de \`app/actions/tasks.ts\` (1007 → ~250 lignes), \`app/actions/shop.ts\` (equip), du boss et de la progression passe sous \`lib/domain/\`, en fonctions \`(supabase: SupabaseClient, userId: string, …)\` appelables sans session cookie. Les server actions deviennent des wrappers : session, appel du domaine, traduction du code d'erreur en copy « voix », \`revalidatePath\`.

Prépare l'ouverture du serveur MCP (lots 2 à 4). Design : \`docs/superpowers/specs/2026-09-05-mcp-catalogue-tools-design.md\`.

## Garantie de neutralité

\`app/actions/tasks.test.ts\` (701 lignes) est vert **sans avoir été modifié d'une seule ligne** — vérifiable par \`git diff main --stat -- app/actions/tasks.test.ts\`, qui ne sort rien. C'est le seul filet qui prouve que la refacto n'a rien changé.

## Corrigé au passage

\`app/actions/achievements.ts\` typait son client en \`Awaited<ReturnType<typeof createClient>>\` — anti-patron documenté dans CLAUDE.md, défaut latent qui cassait la compilation dès qu'un client service-role lui était passé. Re-typé sur \`SupabaseClient\`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Cocher la case **PR1** dans l'issue #201.

⚠️ **Ne pas merger.** La PR est poussée pour relecture ; le merge demande un accord explicite à chaque fois.

---

## Notes pour l'exécutant

- **Le critère de réussite de ce lot n'est pas « ça marche », c'est « rien n'a changé ».** Aucune fonctionnalité n'est livrée. Si un comportement diffère, c'est un bug, même s'il semble être une amélioration.
- **Ne jamais modifier `app/actions/tasks.test.ts`.** C'est le seul filet qui prouve que la refacto est neutre.
- **Un test qui devient vert après avoir été retouché ne prouve rien.** Si un test résiste, le corps déplacé diverge de l'original : relire la diff ligne à ligne plutôt que d'ajuster l'assertion.
- Les numéros de ligne cités (`app/actions/tasks.ts:205-373`, etc.) valent pour le fichier **avant** toute extraction. Ils se décalent dès la première tâche : localiser les fonctions par leur nom, en prenant les lignes comme indication d'ordre et de taille.
