# Lot 3 — 5 tools MCP de lecture (issue #201)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exposer 5 tools MCP de lecture (`list_tasks`, `get_boss_status`, `get_streak`, `get_progression`, `list_heroes`) sur le registry livré au lot 2 — et, **avant d'écrire le moindre handler de lecture**, réparer le double-test qui ne filtre rien.

**Architecture:** Chaque tool = une entrée dans `TOOL_REGISTRY` (`lib/mcp-tools.ts`) déléguant à une fonction de lecture pure de `lib/domain/`, jamais à une server action. Aucune écriture, aucun effet de bord : `get_boss_status` lit `daily_boss` sans jamais le tirer.

**Tech Stack:** TypeScript strict, Supabase, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-05-mcp-catalogue-tools-design.md` — section **D6** (catalogue), **D6.1** (boss en lecture seule), **D6.2** (retours en texte seul), **D6.3** (contrat d'erreur). Les 5 tools d'écriture de D6 sont le lot 4, hors scope ici.

**Branche :** `feat/issue-201-mcp-tools-lecture` (déjà créée depuis `main` post-merge du lot 2, commit `ebb2f4a`).

## Global Constraints

- **TypeScript strict :** interdiction d'`any`.
- **Client Supabase :** toujours `SupabaseClient` de `@supabase/supabase-js`.
- **`lib/domain/` reste sans framework :** pas de `"use server"`, pas de `revalidatePath`, pas de `supabase.auth.getUser()`.
- **Aucune écriture.** Ces 5 tools sont en lecture seule. Aucun `insert`/`update`/`upsert`/`delete` ne doit apparaître dans le code ajouté par ce lot. En particulier `get_boss_status` appelle `readDailyBoss` (`lib/domain/boss.ts`) et **jamais** `resolveDailyBoss` (`app/actions/boss.ts`), qui upsert `daily_boss` et évalue les succès — D6.1 du spec.
- **Scopes :** `list_tasks`/`get_boss_status`/`get_streak` → `tasks:read`. `get_progression`/`list_heroes` → `profile:read`.
- **Retours en texte seul** (D6.2) : pas de `structuredContent`, pas d'`outputSchema`. Texte compact, en français, lisible par un agent.
- **Contrat d'erreur** (D6.3) : erreur métier → `buildToolErrorResult` dans une enveloppe JSON-RPC **succès** (`isError: true`). Jamais un code JSON-RPC de transport (`-326xx`) pour une erreur métier.
- **Commits :** Conventional Commits, message en français.
- **Jamais de commit direct sur `main`.**
- **`CHANGELOG.md` / `CLAUDE.md` :** mis à jour dans la dernière tâche.

### État hérité (vérifié dans le code avant d'écrire ce plan)

- `lib/mcp-tools.ts` porte `McpContext { supabase, userId, timezone }`, `McpToolDef { tool, requiredScope, parseArgs, handler }`, `TOOL_REGISTRY` (une seule entrée : `add_task`), `findTool`, `toolsForScope`.
- `lib/domain/boss.ts` exporte déjà `readDailyBoss(supabase, userId, dayDate) → DailyBossRead | null` (`{ bossId, backgroundId }`).
- `lib/domain/progression.ts` exporte déjà `readProgression(supabase, userId) → ProgressionRead | null` (`{ level, xp, xpToNextLevel, gold, equippedHeroId, equippedSkinId }`). **Réutilisable tel quel pour `get_progression`, aucune nouvelle fonction domaine nécessaire.**
- `lib/domain/tasks.ts` exporte `userToday(supabase, userId) → string` (jour local via `profiles.timezone`).
- `lib/game-engine.ts` : `sortTasksHierarchically`, `calculateBossMaxHp(HpTask[])`, `calculateBossCurrentHp(HpTask[])`, `currentStreak(dayResults, today) → { length, jokersUsedThisWeek, atRisk }`, `nextDayKey(dayDate)`, `missedDeadlineTasks(tasks, now)`.
- `lib/bosses.ts` : `BOSSES`, `getBoss(id) → Boss | undefined` (`Boss` porte `name`, `lore`).
- `lib/heroes.ts` : `HEROES`, `getHero(id)`, `isHeroOwned(heroId, ownedIds)`.

---

## Task 1 : PRIORITÉ 1 — réparer le double-test qui ne filtre rien

Cette tâche vient **en premier et bloque tout le reste**. Les revues des lots 1 et 2 l'ont signalée deux fois : `FakeQueryBuilder`'s `eq`/`or`/`lt`/`is`/`in` sont tous des no-op (`this.filters.push(() => true)` et `apply()` ne lit jamais `this.filters`). Tant que c'est vrai, **aucun test du domaine ne peut détecter un `.eq("user_id", userId)` manquant** — et le lot 3 ajoute cinq fonctions de lecture branchées au client service-role de `/api/mcp`, qui contourne RLS. Un filtre oublié dans un tool de **lecture** ne corrompt pas un compteur : il renvoie les tâches d'un autre utilisateur.

**Files:**
- Modify: `lib/domain/fake-supabase.ts`
- Modify: `app/actions/tasks.test.ts` (remplacer la copie locale par un import — la contrainte « ne jamais modifier ce fichier » était propre au lot 1, qui est mergé ; elle ne s'applique plus)
- Create: `lib/domain/tenant-isolation.test.ts`

**Interfaces:**
- Produces: un `FakeQueryBuilder` dont `eq`/`in`/`lt`/`is` filtrent réellement, `FakeSupabaseClient` inchangé par ailleurs.

- [ ] **Step 1 : Écrire les tests du faux client (RED)**

Ajouter à `lib/domain/fake-supabase.test.ts` (le fichier existe déjà) :

```ts
import { describe, expect, test } from "vitest";
import { FakeSupabaseClient } from "./fake-supabase";

describe("FakeQueryBuilder — filtres réels (issue #201, lot 3)", () => {
  test("eq filtre réellement les lignes", async () => {
    const c = new FakeSupabaseClient({
      tasks: [
        { id: "t1", user_id: "u1", title: "mienne" },
        { id: "t2", user_id: "u2", title: "autre" },
      ],
    });
    const { data } = await c.from("tasks").select().eq("user_id", "u1");
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe("t1");
  });

  test("eq enchaînés se cumulent (AND)", async () => {
    const c = new FakeSupabaseClient({
      tasks: [
        { id: "t1", user_id: "u1", day_date: "2026-09-06" },
        { id: "t2", user_id: "u1", day_date: "2026-09-05" },
        { id: "t3", user_id: "u2", day_date: "2026-09-06" },
      ],
    });
    const { data } = await c.from("tasks").select().eq("user_id", "u1").eq("day_date", "2026-09-06");
    expect(data.map((r) => r.id)).toEqual(["t1"]);
  });

  test("in filtre sur une liste de valeurs", async () => {
    const c = new FakeSupabaseClient({
      tasks: [{ id: "t1" }, { id: "t2" }, { id: "t3" }],
    });
    const { data } = await c.from("tasks").select().in("id", ["t1", "t3"]);
    expect(data.map((r) => r.id)).toEqual(["t1", "t3"]);
  });

  test("lt filtre strictement inférieur", async () => {
    const c = new FakeSupabaseClient({
      tasks: [{ id: "t1", day_date: "2026-09-05" }, { id: "t2", day_date: "2026-09-07" }],
    });
    const { data } = await c.from("tasks").select().lt("day_date", "2026-09-06");
    expect(data.map((r) => r.id)).toEqual(["t1"]);
  });

  test("is filtre sur null", async () => {
    const c = new FakeSupabaseClient({
      tasks: [{ id: "t1", parent_id: null }, { id: "t2", parent_id: "t1" }],
    });
    const { data } = await c.from("tasks").select().is("parent_id", null);
    expect(data.map((r) => r.id)).toEqual(["t1"]);
  });

  test("update ne touche que les lignes filtrées", async () => {
    const rows = [
      { id: "t1", user_id: "u1", done: false },
      { id: "t2", user_id: "u2", done: false },
    ];
    const c = new FakeSupabaseClient({ tasks: rows });
    await c.from("tasks").update({ done: true }).eq("user_id", "u1");
    expect(rows.find((r) => r.id === "t1")?.done).toBe(true);
    expect(rows.find((r) => r.id === "t2")?.done).toBe(false);
  });

  test("maybeSingle respecte les filtres", async () => {
    const c = new FakeSupabaseClient({
      profiles: [{ id: "u1", level: 3 }, { id: "u2", level: 9 }],
    });
    const { data } = await c.from("profiles").select().eq("id", "u2").maybeSingle();
    expect(data?.level).toBe(9);
  });
});
```

- [ ] **Step 2 : Lancer, confirmer que ça échoue**

Run : `npx vitest run lib/domain/fake-supabase.test.ts`
Attendu : les nouveaux tests ÉCHOUENT (les filtres ne filtrent pas), les tests pré-existants du fichier passent toujours.

- [ ] **Step 3 : Implémenter les filtres**

Dans `lib/domain/fake-supabase.ts`, remplacer les cinq méthodes no-op et brancher `this.filters` dans `apply()` :

```ts
  eq(column: string, value: unknown): this {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  // `or` reste volontairement permissif : les vraies clauses `.or()` de ce
  // repo sont des chaines PostgREST (`id.eq.X,parent_id.eq.X`) dont le
  // parsing complet n'apporterait rien ici — mais contrairement aux autres,
  // ce no-op est desormais EXPLICITE et documente, plus un oubli silencieux.
  or(): this {
    return this;
  }

  lt(column: string, value: unknown): this {
    this.filters.push((row) => (row[column] as string | number) < (value as string | number));
    return this;
  }

  is(column: string, value: unknown): this {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  in(column: string, values: unknown[]): this {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }
```

et dans `apply()`, remplacer les deux `filter(() => true)` :

```ts
  private matches(row: Row): boolean {
    return this.filters.every((f) => f(row));
  }

  private apply(): Row[] {
    if (this.mode === "insert" && this.insertedRow) {
      this.rows.push(this.insertedRow);
      return [this.insertedRow];
    }
    if (this.mode === "update") {
      const matched = this.rows.filter((row) => this.matches(row));
      for (const row of matched) Object.assign(row, this.patch);
      return matched;
    }
    // (commentaire existant sur le clone en lecture : le CONSERVER tel quel)
    return this.rows.filter((row) => this.matches(row)).map((row) => ({ ...row }));
  }
```

Mettre à jour l'en-tête du fichier : retirer la phrase « Les deux copies seront fusionnées dans un PR ultérieur » (c'est ce lot qui le fait, Step 5) et remplacer par une note expliquant que `or()` est le seul no-op restant, volontairement.

- [ ] **Step 4 : Lancer, confirmer GREEN**

```bash
npx vitest run lib/domain/fake-supabase.test.ts
npx vitest run lib/domain/
```

Attendu : les 7 nouveaux tests passent. ⚠️ **Les tests existants de `lib/domain/*.test.ts` peuvent maintenant échouer** — c'est le résultat attendu et sain : certains passaient uniquement parce que les filtres ne filtraient pas (une requête `.eq("user_id", "u1")` renvoyait toute la table). Corriger les **fixtures** de ces tests (ajouter le bon `user_id`/`day_date` aux lignes seedées) — jamais en affaiblissant une assertion. Si un test ne peut être réparé qu'en retirant une assertion, s'arrêter et le signaler : ça voudrait dire que le code de production a un vrai défaut que le faux client masquait.

- [ ] **Step 5 : Supprimer la duplication dans `app/actions/tasks.test.ts`**

Ce fichier porte sa propre copie de `FakeQueryBuilder`/`FakeSupabaseClient` (lignes ~10-125). La contrainte « ne jamais modifier ce fichier » appartenait au lot 1 (mergé) et ne s'applique plus.

Retirer les deux classes locales et importer les versions partagées :

```ts
import { FakeSupabaseClient } from "@/lib/domain/fake-supabase";
```

Les tests de ce fichier vont probablement échouer pour la même raison qu'au Step 4 — mêmes règles : réparer les fixtures, jamais les assertions.

- [ ] **Step 6 : Écrire les tests d'isolation de tenant**

Créer `lib/domain/tenant-isolation.test.ts`. C'est le filet que tout ce lot existe pour poser : il vérifie qu'une fonction du domaine appelée avec un `userId` donné ne voit **jamais** les lignes d'un autre utilisateur.

```ts
import { describe, expect, test } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FakeSupabaseClient } from "./fake-supabase";
import { completeTaskForUser } from "./tasks";
import { readProgression } from "./progression";
import { readDailyBoss } from "./boss";

// Ces tests sont la raison d'etre du correctif des filtres du faux client
// (lot 3, Task 1). Avant lui, ils auraient tous passe meme sans le moindre
// .eq("user_id", ...) dans le code de production. Le serveur MCP appelle le
// domaine avec un client service-role qui CONTOURNE RLS : ces filtres
// applicatifs sont la seule frontiere de tenant qui reste.
describe("isolation de tenant — le domaine ne voit jamais les lignes d'autrui", () => {
  test("completeTaskForUser refuse une tache appartenant a un autre utilisateur", async () => {
    const c = new FakeSupabaseClient({
      profiles: [{ id: "u1", level: 1, xp: 0, combo_count: 0, last_combo_completed_at: null, timezone: "UTC" }],
      tasks: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          user_id: "victime",
          is_completed: false,
          is_abandoned: false,
          xp_awarded: null,
          deadline_at: null,
          deferred_at: null,
        },
      ],
      unlocked_achievements: [],
    });

    const res = await completeTaskForUser(
      c as unknown as SupabaseClient,
      "u1",
      "11111111-1111-1111-1111-111111111111",
      true,
    );

    expect(res.error).not.toBeNull();
  });

  test("readProgression ne lit pas le profil d'un autre utilisateur", async () => {
    const c = new FakeSupabaseClient({
      profiles: [{ id: "victime", level: 99, xp: 5000, equipped_hero_id: "x", equipped_skin_id: null }],
      day_results: [],
      unlocked_heroes: [],
      unlocked_skins: [],
    });

    const res = await readProgression(c as unknown as SupabaseClient, "u1");
    expect(res).toBeNull();
  });

  test("readDailyBoss ne lit pas le boss d'un autre utilisateur", async () => {
    const c = new FakeSupabaseClient({
      daily_boss: [
        { user_id: "victime", day_date: "2026-09-06", boss_id: "minotaur", background_id: "forest-1" },
      ],
    });

    const res = await readDailyBoss(c as unknown as SupabaseClient, "u1", "2026-09-06");
    expect(res).toBeNull();
  });
});
```

- [ ] **Step 7 : Lancer, confirmer GREEN**

```bash
npx vitest run lib/domain/tenant-isolation.test.ts
npm run test
npx tsc --noEmit
```

Attendu : tout vert. Si `completeTaskForUser` ne renvoie pas d'erreur sur la tâche d'autrui, **c'est un vrai bug de production à signaler immédiatement**, pas un test à ajuster.

- [ ] **Step 8 : Commit**

```bash
git add lib/domain/fake-supabase.ts lib/domain/fake-supabase.test.ts lib/domain/tenant-isolation.test.ts app/actions/tasks.test.ts
git add lib/domain/*.test.ts
git commit -m "test: faire filtrer le faux client Supabase et verrouiller l'isolation de tenant (issue #201)"
```

---

## Task 2 : Lectures domaine — tâches et série

**Files:**
- Modify: `lib/domain/tasks.ts`
- Create: `lib/domain/streak.ts`
- Modify: `lib/domain/tasks.test.ts`
- Create: `lib/domain/streak.test.ts`

**Interfaces:**
- Produces:

```ts
// lib/domain/tasks.ts
export interface TaskRead {
  id: string;
  title: string;
  isCompleted: boolean;
  parentId: string | null;
  deadlineAt: string | null;
  isOverdue: boolean;
}
export async function listTasksForUser(
  supabase: SupabaseClient,
  userId: string,
  dayDate: string,
  includeCompleted: boolean,
): Promise<TaskRead[]>

// lib/domain/streak.ts
export interface StreakRead {
  length: number;
  jokersUsedThisWeek: number;
  atRisk: boolean;
}
export async function readStreak(
  supabase: SupabaseClient,
  userId: string,
  today: string,
): Promise<StreakRead>
```

- [ ] **Step 1 : Écrire les tests (RED)**

Ajouter à `lib/domain/tasks.test.ts` :

```ts
import { listTasksForUser } from "./tasks";

describe("listTasksForUser", () => {
  test("ne renvoie que les taches du jour demande et du bon utilisateur", async () => {
    const c = new FakeSupabaseClient({
      tasks: [
        { id: "a", user_id: "u1", day_date: "2026-09-06", title: "aujourd hui", parent_id: null, is_completed: false, is_abandoned: false, deadline_at: null, position: 0 },
        { id: "b", user_id: "u1", day_date: "2026-09-05", title: "hier", parent_id: null, is_completed: false, is_abandoned: false, deadline_at: null, position: 0 },
        { id: "c", user_id: "autre", day_date: "2026-09-06", title: "pas a moi", parent_id: null, is_completed: false, is_abandoned: false, deadline_at: null, position: 0 },
      ],
    });
    const res = await listTasksForUser(c as unknown as SupabaseClient, "u1", "2026-09-06", true);
    expect(res.map((t) => t.title)).toEqual(["aujourd hui"]);
  });

  test("exclut les taches abandonnees", async () => {
    const c = new FakeSupabaseClient({
      tasks: [
        { id: "a", user_id: "u1", day_date: "2026-09-06", title: "active", parent_id: null, is_completed: false, is_abandoned: false, deadline_at: null, position: 0 },
        { id: "b", user_id: "u1", day_date: "2026-09-06", title: "abandonnee", parent_id: null, is_completed: false, is_abandoned: true, deadline_at: null, position: 1 },
      ],
    });
    const res = await listTasksForUser(c as unknown as SupabaseClient, "u1", "2026-09-06", true);
    expect(res.map((t) => t.title)).toEqual(["active"]);
  });

  test("includeCompleted=false retire les taches cochees", async () => {
    const c = new FakeSupabaseClient({
      tasks: [
        { id: "a", user_id: "u1", day_date: "2026-09-06", title: "active", parent_id: null, is_completed: false, is_abandoned: false, deadline_at: null, position: 0 },
        { id: "b", user_id: "u1", day_date: "2026-09-06", title: "faite", parent_id: null, is_completed: true, is_abandoned: false, deadline_at: null, position: 1 },
      ],
    });
    const res = await listTasksForUser(c as unknown as SupabaseClient, "u1", "2026-09-06", false);
    expect(res.map((t) => t.title)).toEqual(["active"]);
  });

  test("marque isOverdue sur une deadline passee et non cochee", async () => {
    const past = new Date(Date.now() - 3600_000).toISOString();
    const c = new FakeSupabaseClient({
      tasks: [
        { id: "a", user_id: "u1", day_date: "2026-09-06", title: "en retard", parent_id: null, is_completed: false, is_abandoned: false, deadline_at: past, position: 0 },
      ],
    });
    const res = await listTasksForUser(c as unknown as SupabaseClient, "u1", "2026-09-06", true);
    expect(res[0].isOverdue).toBe(true);
  });
});
```

Créer `lib/domain/streak.test.ts` :

```ts
import { describe, expect, test } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FakeSupabaseClient } from "./fake-supabase";
import { readStreak } from "./streak";

describe("readStreak", () => {
  test("renvoie une serie a zero sans aucun jour enregistre", async () => {
    const c = new FakeSupabaseClient({ day_results: [] });
    const res = await readStreak(c as unknown as SupabaseClient, "u1", "2026-09-06");
    expect(res).toEqual({ length: 0, jokersUsedThisWeek: 0, atRisk: false });
  });

  test("ne compte que les jours de l'utilisateur demande", async () => {
    const c = new FakeSupabaseClient({
      day_results: [
        { user_id: "autre", day_date: "2026-09-05", outcome: "victory" },
        { user_id: "autre", day_date: "2026-09-04", outcome: "victory" },
      ],
    });
    const res = await readStreak(c as unknown as SupabaseClient, "u1", "2026-09-06");
    expect(res.length).toBe(0);
  });
});
```

- [ ] **Step 2 : Lancer, confirmer que ça échoue**

Run : `npx vitest run lib/domain/tasks.test.ts lib/domain/streak.test.ts`
Attendu : FAIL — fonctions absentes.

- [ ] **Step 3 : Implémenter `listTasksForUser`**

Ajouter à `lib/domain/tasks.ts` :

```ts
export interface TaskRead {
  id: string;
  title: string;
  isCompleted: boolean;
  parentId: string | null;
  deadlineAt: string | null;
  isOverdue: boolean;
}

// Lecture seule (lot 3). Trie hierarchiquement (parents puis leurs enfants,
// completees en bas) via le meme comparateur que l'UI — un agent voit la
// liste dans l'ordre que l'utilisateur voit a l'ecran.
export async function listTasksForUser(
  supabase: SupabaseClient,
  userId: string,
  dayDate: string,
  includeCompleted: boolean,
): Promise<TaskRead[]> {
  const { data } = await supabase
    .from("tasks")
    .select("id, title, parent_id, is_completed, is_abandoned, deadline_at, position")
    .eq("user_id", userId)
    .eq("day_date", dayDate)
    .eq("is_abandoned", false);

  const rows = (data ?? []) as Array<{
    id: string;
    title: string;
    parent_id: string | null;
    is_completed: boolean;
    is_abandoned: boolean;
    deadline_at: string | null;
    position: number;
  }>;

  const visible = includeCompleted ? rows : rows.filter((r) => !r.is_completed);
  const sorted = sortTasksHierarchically(visible);
  const now = Date.now();

  return sorted.map((r) => ({
    id: r.id,
    title: r.title,
    isCompleted: r.is_completed,
    parentId: r.parent_id,
    deadlineAt: r.deadline_at,
    isOverdue:
      r.deadline_at !== null && !r.is_completed && new Date(r.deadline_at).getTime() < now,
  }));
}
```

Vérifier que `sortTasksHierarchically` est déjà importé en tête de `lib/domain/tasks.ts` ; sinon l'ajouter à l'import existant depuis `@/lib/game-engine`.

- [ ] **Step 4 : Implémenter `lib/domain/streak.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { currentStreak } from "@/lib/game-engine";

export interface StreakRead {
  length: number;
  jokersUsedThisWeek: number;
  atRisk: boolean;
}

// Lecture seule. La serie est DERIVEE de day_results (source unique, US-12) —
// jamais lue depuis les caches profiles.streak_days/best_streak.
export async function readStreak(
  supabase: SupabaseClient,
  userId: string,
  today: string,
): Promise<StreakRead> {
  const { data } = await supabase
    .from("day_results")
    .select("day_date, outcome")
    .eq("user_id", userId);

  const rows = (data ?? []) as Array<{ day_date: string; outcome: string }>;
  return currentStreak(rows as Parameters<typeof currentStreak>[0], today);
}
```

- [ ] **Step 5 : Lancer, confirmer GREEN**

```bash
npx vitest run lib/domain/tasks.test.ts lib/domain/streak.test.ts
npx tsc --noEmit
```

- [ ] **Step 6 : Commit**

```bash
git add lib/domain/tasks.ts lib/domain/tasks.test.ts lib/domain/streak.ts lib/domain/streak.test.ts
git commit -m "feat: lectures domaine pour les taches du jour et la serie (issue #201)"
```

---

## Task 3 : Lectures domaine — boss et roster de héros

**Files:**
- Modify: `lib/domain/boss.ts`
- Create: `lib/domain/heroes.ts`
- Modify: `lib/domain/boss.test.ts`
- Create: `lib/domain/heroes.test.ts`

**Interfaces:**
- Produces:

```ts
// lib/domain/boss.ts (s'ajoute a readDailyBoss, qui ne change pas)
export interface BossStatusRead {
  bossId: string;
  name: string;
  lore: string;
  currentHp: number;
  maxHp: number;
  tasksRemaining: number;
}
export async function readBossStatus(
  supabase: SupabaseClient,
  userId: string,
  dayDate: string,
): Promise<BossStatusRead | null>   // null = boss pas encore tire

// lib/domain/heroes.ts
export interface HeroRead {
  id: string;
  name: string;
  owned: boolean;
  equipped: boolean;
}
export async function readHeroRoster(
  supabase: SupabaseClient,
  userId: string,
): Promise<HeroRead[]>
```

- [ ] **Step 1 : Écrire les tests (RED)**

Ajouter à `lib/domain/boss.test.ts` :

```ts
import { readBossStatus } from "./boss";

describe("readBossStatus", () => {
  test("renvoie null quand le boss du jour n'a pas ete tire", async () => {
    const c = new FakeSupabaseClient({ daily_boss: [], tasks: [] });
    const res = await readBossStatus(c as unknown as SupabaseClient, "u1", "2026-09-06");
    expect(res).toBeNull();
  });

  test("n'ecrit JAMAIS dans daily_boss", async () => {
    const rows: Record<string, unknown>[] = [];
    const c = new FakeSupabaseClient({ daily_boss: rows, tasks: [] });
    await readBossStatus(c as unknown as SupabaseClient, "u1", "2026-09-06");
    expect(rows).toHaveLength(0);
  });

  test("calcule les HP depuis les taches du jour", async () => {
    const c = new FakeSupabaseClient({
      daily_boss: [{ user_id: "u1", day_date: "2026-09-06", boss_id: "minotaur", background_id: "forest-1" }],
      tasks: [
        { id: "a", user_id: "u1", day_date: "2026-09-06", parent_id: null, is_completed: true, is_abandoned: false },
        { id: "b", user_id: "u1", day_date: "2026-09-06", parent_id: null, is_completed: false, is_abandoned: false },
      ],
    });
    const res = await readBossStatus(c as unknown as SupabaseClient, "u1", "2026-09-06");
    expect(res?.maxHp).toBe(40);
    expect(res?.currentHp).toBe(20);
    expect(res?.tasksRemaining).toBe(1);
    expect(res?.name).toBeTruthy();
  });
});
```

⚠️ `maxHp`/`currentHp` : deux tâches racines non abandonnées = 2 × 20 HP = 40 max ; une cochée = 20 restants. **Vérifier la constante réelle** (`calculateBossMaxHp` dans `lib/game-engine.ts`) avant de figer ces nombres — si le barème diffère, ajuster les attentes du test sur le barème réel, jamais l'inverse.

Créer `lib/domain/heroes.test.ts` :

```ts
import { describe, expect, test } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FakeSupabaseClient } from "./fake-supabase";
import { readHeroRoster } from "./heroes";
import { HEROES } from "@/lib/heroes";

describe("readHeroRoster", () => {
  test("liste tout le catalogue avec le statut de possession", async () => {
    const c = new FakeSupabaseClient({
      profiles: [{ id: "u1", equipped_hero_id: "fire_knight" }],
      unlocked_heroes: [{ user_id: "u1", hero_id: "fire_knight" }],
    });
    const res = await readHeroRoster(c as unknown as SupabaseClient, "u1");
    expect(res).toHaveLength(HEROES.length);
    const fk = res.find((h) => h.id === "fire_knight");
    expect(fk?.owned).toBe(true);
    expect(fk?.equipped).toBe(true);
  });

  test("ne compte pas les possessions d'un autre utilisateur", async () => {
    const c = new FakeSupabaseClient({
      profiles: [{ id: "u1", equipped_hero_id: null }],
      unlocked_heroes: [{ user_id: "autre", hero_id: "fire_knight" }],
    });
    const res = await readHeroRoster(c as unknown as SupabaseClient, "u1");
    expect(res.every((h) => !h.owned)).toBe(true);
  });
});
```

- [ ] **Step 2 : Lancer, confirmer que ça échoue**

Run : `npx vitest run lib/domain/boss.test.ts lib/domain/heroes.test.ts`
Attendu : FAIL — fonctions absentes.

- [ ] **Step 3 : Implémenter `readBossStatus`**

Ajouter à `lib/domain/boss.ts` (ne pas toucher `readDailyBoss`) :

```ts
import { calculateBossCurrentHp, calculateBossMaxHp, type HpTask } from "@/lib/game-engine";
import { getBoss } from "@/lib/bosses";

export interface BossStatusRead {
  bossId: string;
  name: string;
  lore: string;
  currentHp: number;
  maxHp: number;
  tasksRemaining: number;
}

// Lecture seule, D6.1 : s'appuie sur readDailyBoss (qui n'ecrit jamais) et
// recalcule les HP depuis les taches du jour, exactement comme l'Arene.
// null = le boss du jour n'a pas encore ete tire (l'utilisateur n'a pas
// ouvert l'app aujourd'hui) — surtout ne pas le tirer ici.
export async function readBossStatus(
  supabase: SupabaseClient,
  userId: string,
  dayDate: string,
): Promise<BossStatusRead | null> {
  const daily = await readDailyBoss(supabase, userId, dayDate);
  if (!daily) return null;

  const { data } = await supabase
    .from("tasks")
    .select("parent_id, is_completed, is_abandoned")
    .eq("user_id", userId)
    .eq("day_date", dayDate);

  const rows = (data ?? []) as HpTask[];
  const boss = getBoss(daily.bossId);

  return {
    bossId: daily.bossId,
    name: boss?.name ?? daily.bossId,
    lore: boss?.lore ?? "",
    currentHp: calculateBossCurrentHp(rows),
    maxHp: calculateBossMaxHp(rows),
    tasksRemaining: rows.filter((t) => !t.is_abandoned && !t.is_completed).length,
  };
}
```

- [ ] **Step 4 : Implémenter `lib/domain/heroes.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { HEROES, isHeroOwned } from "@/lib/heroes";

export interface HeroRead {
  id: string;
  name: string;
  owned: boolean;
  equipped: boolean;
}

// Lecture seule : catalogue statique (lib/heroes.ts) croise avec la
// possession reelle en base. La possession est STRICTEMENT en base depuis
// US-29 — aucun heros n'est possede d'office.
export async function readHeroRoster(
  supabase: SupabaseClient,
  userId: string,
): Promise<HeroRead[]> {
  const [{ data: profile }, { data: owned }] = await Promise.all([
    supabase.from("profiles").select("equipped_hero_id").eq("id", userId).maybeSingle(),
    supabase.from("unlocked_heroes").select("hero_id").eq("user_id", userId),
  ]);

  const equippedId = (profile as { equipped_hero_id: string | null } | null)?.equipped_hero_id ?? null;
  const ownedIds = ((owned ?? []) as Array<{ hero_id: string }>).map((r) => r.hero_id);

  return HEROES.map((hero) => ({
    id: hero.id,
    name: hero.name,
    owned: isHeroOwned(hero.id, ownedIds),
    equipped: hero.id === equippedId,
  }));
}
```

- [ ] **Step 5 : Lancer, confirmer GREEN**

```bash
npx vitest run lib/domain/
npx tsc --noEmit
```

- [ ] **Step 6 : Commit**

```bash
git add lib/domain/boss.ts lib/domain/boss.test.ts lib/domain/heroes.ts lib/domain/heroes.test.ts
git commit -m "feat: lectures domaine pour le statut du boss et le roster de heros (issue #201)"
```

---

## Task 4 : Les 5 tools dans le registry

**Files:**
- Modify: `lib/mcp-tools.ts`
- Modify: `lib/mcp-tools.test.ts`

**Interfaces:**
- Consumes: `listTasksForUser` (Task 2), `readStreak` (Task 2), `readBossStatus` (Task 3), `readHeroRoster` (Task 3), `readProgression` (lot 1, déjà là), `userToday`/`nextDayKey`.
- Produces: `TOOL_REGISTRY` passe de 1 à 6 entrées.

- [ ] **Step 1 : Durcir `McpToolDef.parseArgs` en union discriminée**

Les revues des lots 1 et 2 l'ont signalé : `Record<string, unknown> | { error: string }` n'est pas une vraie union discriminée (un `Record` peut structurellement contenir une clé `error`), ce qui a déjà forcé un garde `typeof parsedArgs.error === "string"` dans `app/api/mcp/route.ts`. Ce lot ajoute cinq parseurs : c'est le moment de fermer le sujet.

Dans `lib/mcp-tools.ts` :

```ts
export type ParsedArgs<T> = { ok: true; args: T } | { ok: false; error: string };

export interface McpToolDef {
  tool: McpTool;
  requiredScope: OAuthScope;
  parseArgs: (args: Record<string, unknown>) => ParsedArgs<Record<string, unknown>>;
  handler: (ctx: McpContext, args: Record<string, unknown>) => Promise<McpToolResult>;
}
```

Adapter `parseAddTaskArgs` en conséquence (`return { ok: false, error: "title est requis (string)." }` / `return { ok: true, args: { title: rawTitle } }`), puis `app/api/mcp/route.ts` :

```ts
  const parsed = def.parseArgs(args);
  if (!parsed.ok) {
    return NextResponse.json(successResponse(rpcRequest.id, buildToolErrorResult(parsed.error)));
  }
  // ... plus loin : def.handler(ctx, parsed.args)
```

Le garde `typeof parsedArgs.error === "string"` disparaît — il n'a plus de raison d'être.

- [ ] **Step 2 : Écrire les tests des 5 tools (RED)**

Ajouter à `lib/mcp-tools.test.ts` :

```ts
describe("catalogue de lecture (lot 3)", () => {
  test("les 6 tools attendus sont enregistres", () => {
    expect(TOOL_REGISTRY.map((t) => t.tool.name).sort()).toEqual(
      ["add_task", "get_boss_status", "get_progression", "get_streak", "list_heroes", "list_tasks"].sort(),
    );
  });

  test("les scopes requis sont corrects", () => {
    const scopeOf = (name: string) => findTool(name)?.requiredScope;
    expect(scopeOf("list_tasks")).toBe("tasks:read");
    expect(scopeOf("get_boss_status")).toBe("tasks:read");
    expect(scopeOf("get_streak")).toBe("tasks:read");
    expect(scopeOf("get_progression")).toBe("profile:read");
    expect(scopeOf("list_heroes")).toBe("profile:read");
  });

  test("un token tasks:read seul ne voit aucun tool d'ecriture", () => {
    const names = toolsForScope("tasks:read").map((t) => t.name);
    expect(names).toContain("list_tasks");
    expect(names).not.toContain("add_task");
  });

  test("un token profile:read seul ne voit que les tools de profil", () => {
    const names = toolsForScope("profile:read").map((t) => t.name).sort();
    expect(names).toEqual(["get_progression", "list_heroes"]);
  });

  test("list_tasks refuse un argument day invalide", () => {
    const parsed = findTool("list_tasks")!.parseArgs({ day: "hier" });
    expect(parsed.ok).toBe(false);
  });

  test("list_tasks accepte l'absence d'arguments", () => {
    const parsed = findTool("list_tasks")!.parseArgs({});
    expect(parsed.ok).toBe(true);
  });

  test("les tools sans argument acceptent un objet vide", () => {
    for (const name of ["get_boss_status", "get_streak", "get_progression", "list_heroes"]) {
      expect(findTool(name)!.parseArgs({}).ok).toBe(true);
    }
  });
});
```

- [ ] **Step 3 : Lancer, confirmer que ça échoue**

Run : `npx vitest run lib/mcp-tools.test.ts`
Attendu : FAIL.

- [ ] **Step 4 : Déclarer les 5 `McpTool`**

Dans `lib/mcp-tools.ts`, déclarer les descripteurs (le registry est le seul endroit où vivent les tools de lecture ; `lib/mcp-protocol.ts` reste le cadre JSON-RPC pur et ne bouge pas) :

```ts
const LIST_TASKS_TOOL: McpTool = {
  name: "list_tasks",
  description:
    "Liste les tâches Dodojo d'une journée (aujourd'hui par défaut), triées comme dans l'Arène.",
  inputSchema: {
    type: "object",
    properties: {
      day: { type: "string", description: "'today' (défaut) ou 'tomorrow'" },
      include_completed: { type: "string", description: "'true' (défaut) ou 'false'" },
    },
    required: [],
  },
};

const GET_BOSS_STATUS_TOOL: McpTool = {
  name: "get_boss_status",
  description: "Donne le Boss du jour et ses HP restants.",
  inputSchema: { type: "object", properties: {}, required: [] },
};

const GET_STREAK_TOOL: McpTool = {
  name: "get_streak",
  description: "Donne la série de victoires en cours et les jokers restants de la semaine.",
  inputSchema: { type: "object", properties: {}, required: [] },
};

const GET_PROGRESSION_TOOL: McpTool = {
  name: "get_progression",
  description: "Donne le niveau, l'XP, l'XP restante avant le niveau suivant et l'or.",
  inputSchema: { type: "object", properties: {}, required: [] },
};

const LIST_HEROES_TOOL: McpTool = {
  name: "list_heroes",
  description: "Liste les combattants du catalogue, lesquels sont débloqués et lequel est équipé.",
  inputSchema: { type: "object", properties: {}, required: [] },
};
```

⚠️ `McpTool.inputSchema.properties` est typé `Record<string, { type: string; description: string }>` — d'où `include_completed` déclaré en `string` plutôt qu'en `boolean`. Vérifier le type réel dans `lib/mcp-protocol.ts` : s'il accepte `boolean`, préférer `boolean` et adapter le parseur en conséquence ; sinon garder `string` et parser `"true"`/`"false"`. Ne pas élargir le type de `McpTool` pour ce lot.

- [ ] **Step 5 : Écrire les parseurs et les handlers**

`list_tasks` (le seul avec des arguments) :

```ts
function parseListTasksArgs(args: Record<string, unknown>): ParsedArgs<Record<string, unknown>> {
  const day = args.day ?? "today";
  if (day !== "today" && day !== "tomorrow") {
    return { ok: false, error: "day doit valoir 'today' ou 'tomorrow'." };
  }
  const rawInclude = args.include_completed;
  const includeCompleted = rawInclude === undefined ? true : rawInclude === "true" || rawInclude === true;
  return { ok: true, args: { day, includeCompleted } };
}

async function handleListTasks(ctx: McpContext, args: Record<string, unknown>): Promise<McpToolResult> {
  const today = await userToday(ctx.supabase, ctx.userId);
  const dayDate = args.day === "tomorrow" ? nextDayKey(today) : today;
  const tasks = await listTasksForUser(
    ctx.supabase,
    ctx.userId,
    dayDate,
    args.includeCompleted === true,
  );

  if (tasks.length === 0) {
    return { content: [{ type: "text", text: `Aucune tâche pour le ${dayDate}.` }], isError: false };
  }

  const lines = tasks.map((t) => {
    const box = t.isCompleted ? "[x]" : "[ ]";
    const indent = t.parentId ? "  " : "";
    const flags: string[] = [];
    if (t.deadlineAt) flags.push(`deadline ${t.deadlineAt}`);
    if (t.isOverdue) flags.push("EN RETARD");
    const suffix = flags.length > 0 ? ` · ${flags.join(" · ")}` : "";
    return `${indent}${box} ${t.id} — ${t.title}${suffix}`;
  });

  const active = tasks.filter((t) => !t.isCompleted).length;
  const header = `Tâches du ${dayDate} — ${active} active(s) sur ${tasks.length} :`;
  return { content: [{ type: "text", text: [header, ...lines].join("\n") }], isError: false };
}
```

`get_boss_status` :

```ts
async function handleGetBossStatus(ctx: McpContext): Promise<McpToolResult> {
  const today = await userToday(ctx.supabase, ctx.userId);
  const status = await readBossStatus(ctx.supabase, ctx.userId, today);

  if (!status) {
    return {
      content: [{
        type: "text",
        text: `Le Boss du ${today} n'a pas encore été tiré — il le sera à la prochaine ouverture de l'Arène.`,
      }],
      isError: false,
    };
  }

  return {
    content: [{
      type: "text",
      text: `Boss du ${today} : ${status.name} — ${status.currentHp}/${status.maxHp} HP, ${status.tasksRemaining} tâche(s) restante(s).`,
    }],
    isError: false,
  };
}
```

Les trois derniers (aucun argument, une lecture, une ligne de texte) :

```ts
async function handleGetStreak(ctx: McpContext): Promise<McpToolResult> {
  const today = await userToday(ctx.supabase, ctx.userId);
  const streak = await readStreak(ctx.supabase, ctx.userId, today);
  const risk = streak.atRisk ? " ⚠ Série en danger." : "";
  return {
    content: [{
      type: "text",
      text: `Série : ${streak.length} jour(s). Jokers utilisés cette semaine : ${streak.jokersUsedThisWeek} sur 2.${risk}`,
    }],
    isError: false,
  };
}

async function handleGetProgression(ctx: McpContext): Promise<McpToolResult> {
  const prog = await readProgression(ctx.supabase, ctx.userId);
  if (!prog) return buildToolErrorResult("profile_not_found");

  const hero = prog.equippedHeroId ? ` Combattant équipé : ${prog.equippedHeroId}.` : "";
  return {
    content: [{
      type: "text",
      text: `Niveau ${prog.level} · ${prog.xp} XP · ${prog.xpToNextLevel} XP avant le niveau ${prog.level + 1} · ${prog.gold} or.${hero}`,
    }],
    isError: false,
  };
}

async function handleListHeroes(ctx: McpContext): Promise<McpToolResult> {
  const roster = await readHeroRoster(ctx.supabase, ctx.userId);
  const ownedCount = roster.filter((h) => h.owned).length;

  const lines = roster.map((h) => {
    const flags: string[] = [];
    if (h.equipped) flags.push("équipé");
    if (!h.owned) flags.push("verrouillé");
    const suffix = flags.length > 0 ? ` (${flags.join(", ")})` : "";
    return `- ${h.id} — ${h.name}${suffix}`;
  });

  const header = `${ownedCount} combattant(s) débloqué(s) sur ${roster.length} :`;
  return { content: [{ type: "text", text: [header, ...lines].join("\n") }], isError: false };
}
```

⚠️ `handler` a la signature `(ctx, args) => Promise<McpToolResult>`. Ces quatre handlers sans argument ignorent `args` — les déclarer avec le seul paramètre `ctx` fonctionne en TypeScript (un callback peut déclarer moins de paramètres que sa signature), mais vérifier que `tsc --noEmit` l'accepte dans ce contexte précis ; sinon ajouter `_args: Record<string, unknown>` et le préfixe `_` pour satisfaire la règle lint des variables inutilisées.

Enregistrer les 5 entrées dans `TOOL_REGISTRY` avec leurs scopes (cf. Global Constraints). Pour les 4 tools sans argument, `parseArgs` est `() => ({ ok: true, args: {} })` — l'écrire une fois dans une constante partagée `const NO_ARGS: McpToolDef["parseArgs"] = () => ({ ok: true, args: {} });` plutôt que cinq fois.

- [ ] **Step 6 : Lancer, confirmer GREEN**

```bash
npx vitest run lib/mcp-tools.test.ts app/api/mcp/route.test.ts
npm run test
npx tsc --noEmit
npm run lint
```

Attendu : tout vert. `app/api/mcp/route.test.ts` doit passer sans modification d'assertion — seul le changement de forme de `parseArgs` (Step 1) peut demander un ajustement mécanique.

- [ ] **Step 7 : Commit**

```bash
git add lib/mcp-tools.ts lib/mcp-tools.test.ts app/api/mcp/route.ts app/api/mcp/route.test.ts
git commit -m "feat: 5 tools MCP de lecture (taches, boss, serie, progression, heros) — issue #201"
```

---

## Task 5 : e2e, documentation, PR

**Files:**
- Modify: `e2e/mcp-oauth.spec.ts`
- Modify: `CHANGELOG.md`, `CLAUDE.md`

- [ ] **Step 1 : Étendre l'e2e**

Dans `e2e/mcp-oauth.spec.ts`, le test à scope complet (`DEFAULT_SCOPE`) doit maintenant vérifier les tools de lecture. Ajouter après l'appel `add_task` existant :

```ts
    // Lot 3 : les tools de lecture repondent avec le scope par defaut
    const listTasksRes = await request.post(`${baseURL}/api/mcp`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        jsonrpc: "2.0", id: 10, method: "tools/call",
        params: { name: "list_tasks", arguments: {} },
      },
    });
    const listTasksBody = await listTasksRes.json();
    expect(listTasksBody.result.isError).toBe(false);
    // la tache creee juste avant par add_task doit apparaitre
    expect(listTasksBody.result.content[0].text).toContain(taskTitle);

    const bossRes = await request.post(`${baseURL}/api/mcp`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        jsonrpc: "2.0", id: 11, method: "tools/call",
        params: { name: "get_boss_status", arguments: {} },
      },
    });
    expect((await bossRes.json()).result.isError).toBe(false);
```

⚠️ `taskTitle` : le test existant génère le titre inline dans l'appel `add_task`. L'extraire dans une variable en amont pour pouvoir l'asserter ici.

Et dans le test à scope restreint (`tasks:read` seul), ajouter que `get_progression` est refusé (il exige `profile:read`, non accordé) :

```ts
    const progRes = await request.post(`${baseURL}/api/mcp`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        jsonrpc: "2.0", id: 12, method: "tools/call",
        params: { name: "get_progression", arguments: {} },
      },
    });
    expect(progRes.status()).toBe(200);
    const progBody = await progRes.json();
    expect(progBody.error).toBeUndefined();
    expect(progBody.result.isError).toBe(true);
```

C'est la première assertion croisée entre deux familles de scopes : `tasks:read` voit `list_tasks` mais pas `get_progression`.

- [ ] **Step 2 : Lancer l'e2e**

```bash
npx playwright test e2e/mcp-oauth.spec.ts
npm run e2e
```

⚠️ Flake préexistant connu et sans rapport : `echoppe-skins.spec.ts` (timing du carrousel Embla). Si c'est le seul échec, ce n'est pas un blocage — le signaler comme tel.

- [ ] **Step 3 : Vérification complète**

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run build
```

- [ ] **Step 4 : `CHANGELOG.md`**

Sous `## [Unreleased]` :

```markdown
- Serveur MCP : 5 tools de lecture (tâches du jour, statut du Boss, série, progression, roster de combattants) — un assistant IA peut désormais consulter l'état du combat, pas seulement créer des tâches (issue #201).
```

- [ ] **Step 5 : `CLAUDE.md`**

Ajouter sous « Pièges et décisions non-évidentes » :

```markdown
**Tools MCP de lecture — jamais d'effet de bord, et le faux client filtre enfin (issue #201, lot 3)** — Les 5 tools de lecture (`list_tasks`, `get_boss_status`, `get_streak`, `get_progression`, `list_heroes`) délèguent tous à `lib/domain/`, jamais à une server action. `get_boss_status` appelle `readDailyBoss` et **jamais** `resolveDailyBoss` : ce dernier upsert `daily_boss` et évalue les succès, donc un agent qui consulte le Boss à 3h du matin figerait le tirage du jour et débloquerait des succès sans que l'utilisateur ait ouvert l'app (D6.1 du spec). Un boss non encore tiré renvoie un message explicite, pas une erreur. **Corollaire de sécurité posé par ce lot** : `FakeQueryBuilder` (`lib/domain/fake-supabase.ts`) filtre désormais réellement sur `eq`/`in`/`lt`/`is` — avant, tous étaient des no-op, donc aucun test du domaine ne pouvait détecter un `.eq("user_id", …)` manquant. C'était sans conséquence tant que RLS protégeait un client cookie-scope, mais le serveur MCP appelle le domaine avec un client **service-role qui contourne RLS** : ces filtres applicatifs sont la seule frontière de tenant qui reste. `lib/domain/tenant-isolation.test.ts` verrouille l'invariant. Seul `or()` reste un no-op, explicitement documenté (les vraies clauses `.or()` du repo sont des chaînes PostgREST dont le parsing n'apporterait rien au test).
```

- [ ] **Step 6 : Commit, push, PR**

```bash
git add e2e/mcp-oauth.spec.ts CHANGELOG.md CLAUDE.md
git commit -m "docs: documenter les tools MCP de lecture et l'isolation de tenant (issue #201)"
git push -u origin feat/issue-201-mcp-tools-lecture
gh pr create --title "feat: 5 tools MCP de lecture (issue #201, lot 3)" --body "Lot 3 de l'issue #201.

Expose 5 tools de lecture sur le registry livré au lot 2 : \`list_tasks\`, \`get_boss_status\`, \`get_streak\`, \`get_progression\`, \`list_heroes\`. Aucune écriture, aucun effet de bord — \`get_boss_status\` lit \`daily_boss\` sans jamais le tirer (D6.1).

**Priorité 1 traitée en premier** : \`FakeQueryBuilder\` filtre désormais réellement. Avant ce lot, ses \`eq\`/\`in\`/\`lt\`/\`is\` étaient tous des no-op, donc aucun test du domaine ne pouvait détecter un \`.eq(\"user_id\", …)\` manquant — sans conséquence tant que RLS protégeait un client cookie-scope, mais le serveur MCP appelle le domaine avec un client service-role qui contourne RLS. Sur des tools de **lecture**, un filtre oublié fuiterait les tâches d'autrui. \`lib/domain/tenant-isolation.test.ts\` verrouille l'invariant, et la duplication du faux client entre \`lib/domain/\` et \`app/actions/tasks.test.ts\` est supprimée au passage.

Design : \`docs/superpowers/specs/2026-09-05-mcp-catalogue-tools-design.md\` (section D6)."
```

Cocher **PR3** et ses deux sous-cases sur l'issue #201.

⚠️ **Ne pas merger.**

---

## Notes pour l'exécutant

- **Task 1 bloque tout.** Ne pas commencer une fonction de lecture avant que le faux client filtre et que `tenant-isolation.test.ts` soit vert. C'est l'ordre entier de ce lot.
- Un test existant qui casse au Step 4 de Task 1 est une **bonne** nouvelle : il passait pour une mauvaise raison. Réparer sa fixture, jamais son assertion.
- Ces 5 tools ne doivent contenir **aucune** écriture. Un `insert`/`update`/`upsert`/`delete` dans le code ajouté par ce lot est un défaut, pas une optimisation.
- Les chiffres de HP dans les tests de Task 3 sont à vérifier contre le barème réel de `calculateBossMaxHp` avant d'être figés.
