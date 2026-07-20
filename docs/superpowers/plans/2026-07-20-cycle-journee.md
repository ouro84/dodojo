# Cycle de la Journée — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer US-08 (Rituel du Réveil, overlay bloquant de traitement des restes) et US-07 (Rituel du Crépuscule, clôture cérémonielle) comme un cycle de journée unifié, avec fondation `day_results` et fix du fuseau horaire.

**Architecture:** Logique pure dans `lib/game-engine.ts` (calculs de jour, résumé, groupage, streak), persistée via server actions dans `app/actions/`, orchestrée par `components/combat/Arena.tsx` avec deux nouveaux overlays. Le « jour » devient le jour **local** de l'utilisateur (colonne `profiles.timezone`). Nouvelle table `day_results` (une ligne / user / jour local).

**Tech Stack:** Next.js 16 App Router (Server Actions), Supabase (PostgreSQL + RLS), TypeScript strict, Vitest (pur), Playwright (e2e série + serveur prod).

**Spec de référence :** `docs/superpowers/specs/2026-07-20-cycle-journee-design.md`.

## Global Constraints

- **TypeScript strict** : aucun `any`, tout type explicite.
- **RG-04** : jamais de `DELETE` SQL. Annihiler = `is_abandoned = true`. Aucune policy DELETE en RLS.
- **RG-01** : tâche racine = 20 HP, sous-tâche = 10 HP (via `taskHpValue`). 2 niveaux max.
- **RG-02** : ajouter/reporter une tâche au jour J soigne le Boss.
- **RG-03** : le Boss du jour = tâches `day_date == jour local courant`.
- **Logique de jeu isolée** dans `lib/game-engine.ts`, testable sans UI.
- **3 états UI** (Loading / Error / Empty) sur tout écran.
- **Idempotence (B3)** : `day_result` recalculé depuis les tâches, jamais accumulé.
- **Reprise au fil de l'eau (B2)** : chaque action du Réveil = server action immédiate, pas de transaction tout-ou-rien.
- **Ton (B1)** : Annihiler ≠ échec (serein) ; jurons réservés au pic victoire (cf. `docs/superpowers/specs/2026-07-08-tone-of-voice-design.md`) ; jamais « Héros » générique, toujours `profiles.username`.
- **Commits** : Conventional Commits (`feat:` / `fix:` / `chore:` / `docs:`).
- **Renommage** : « Obi-Wan » → « Crépuscule » partout.

---

## File Structure

- **Migrations** : `supabase/migrations/<ts>_add_profile_timezone.sql`, `supabase/migrations/<ts>_create_day_results.sql`.
- **Types** : `types/index.ts` — ajoute `timezone` à `Profile`, ajoute `DayResult` + `DayOutcome`.
- **Logique pure** : `lib/game-engine.ts` (+ `lib/game-engine.test.ts`) — `dayKey`, `summarizeDay`, `planWakeUp`, `currentStreak`.
- **Actions** : `app/actions/tasks.ts` (fix fuseau + actions restes), `app/actions/day.ts` (nouveau : `closeDay`, `backfillMissedDays`).
- **Onboarding** : `app/onboarding/actions.ts` + `OnboardingForm.tsx` (capture timezone).
- **Page** : `app/page.tsx` (jour local + charge day_results récents).
- **Composants** : `components/combat/WakeUpRitual.tsx`, `components/combat/CrepusculeRecap.tsx` (nouveaux), `components/combat/Arena.tsx` (câblage).
- **E2E** : `e2e/wake-up-ritual.spec.ts`, `e2e/crepuscule-recap.spec.ts`.
- **Docs** : `CLAUDE.md`, `CHANGELOG.md`, `SPECS_FONCTIONNELLES.md`.

---

## Task 1 : Migrations Supabase (timezone + day_results)

**Files:**
- Create: `supabase/migrations/20260720120000_add_profile_timezone.sql`
- Create: `supabase/migrations/20260720120100_create_day_results.sql`

**Interfaces:**
- Produces: colonne `profiles.timezone text not null default 'UTC'` ; table `day_results`.

- [ ] **Step 1: Écrire la migration timezone**

`supabase/migrations/20260720120000_add_profile_timezone.sql` :
```sql
alter table public.profiles
  add column timezone text not null default 'UTC';
```

- [ ] **Step 2: Écrire la migration day_results**

`supabase/migrations/20260720120100_create_day_results.sql` :
```sql
create table public.day_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  day_date date not null,
  outcome text not null check (outcome in ('victory', 'retreat', 'defeat')),
  damage_dealt integer not null default 0,
  boss_max_hp integer not null default 0,
  tasks_completed integer not null default 0,
  tasks_abandoned integer not null default 0,
  xp_earned integer not null default 0,
  closed_manually boolean not null default false,
  closed_at timestamptz not null default now(),
  unique (user_id, day_date)
);

create index day_results_user_day_idx on public.day_results (user_id, day_date);

alter table public.day_results enable row level security;

create policy "day_results_select_own"
  on public.day_results for select
  using (user_id = auth.uid());

create policy "day_results_insert_own"
  on public.day_results for insert
  with check (user_id = auth.uid());

create policy "day_results_update_own"
  on public.day_results for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Volontairement aucune policy DELETE (RG-04).
```

- [ ] **Step 3: Appliquer les migrations en local**

Run: `supabase db reset` (ou `supabase migration up` selon le workflow local).
Expected: les deux migrations passent, table `day_results` visible, colonne `profiles.timezone` présente.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: add profiles.timezone and day_results table (US-07/08)"
```

---

## Task 2 : Types partagés

**Files:**
- Modify: `types/index.ts`

**Interfaces:**
- Produces: `Profile.timezone: string` ; `type DayOutcome = "victory" | "retreat" | "defeat"` ; `interface DayResult`.

- [ ] **Step 1: Étendre les types**

Dans `types/index.ts`, ajouter `timezone` à `Profile` et les nouveaux types :
```ts
export interface Profile {
  id: string;
  username: string;
  level: number;
  xp: number;
  gold: number;
  current_title: string;
  streak_days: number;
  timezone: string;
  created_at: string;
}

export type DayOutcome = "victory" | "retreat" | "defeat";

export interface DayResult {
  id: string;
  user_id: string;
  day_date: string;
  outcome: DayOutcome;
  damage_dealt: number;
  boss_max_hp: number;
  tasks_completed: number;
  tasks_abandoned: number;
  xp_earned: number;
  closed_manually: boolean;
  closed_at: string;
}
```

- [ ] **Step 2: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: PASS (ou seules des erreurs dans les fichiers non encore modifiés qui lisent `profile` sans timezone — sinon 0 erreur).

- [ ] **Step 3: Commit**

```bash
git add types/index.ts
git commit -m "feat: add DayResult type and Profile.timezone"
```

---

## Task 3 : `dayKey` — jour local (fix fuseau)

**Files:**
- Modify: `lib/game-engine.ts`
- Test: `lib/game-engine.test.ts`

**Interfaces:**
- Produces: `dayKey(date: Date, timezone: string): string` (retourne `YYYY-MM-DD` dans le fuseau donné).

- [ ] **Step 1: Écrire le test**

Ajouter dans `lib/game-engine.test.ts` :
```ts
import { dayKey } from "./game-engine";

describe("dayKey", () => {
  it("retourne la date calendaire locale, pas UTC", () => {
    // 2026-07-20T23:30:00Z = 01:30 le 21 à Paris (UTC+2 l'été)
    const instant = new Date("2026-07-20T23:30:00Z");
    expect(dayKey(instant, "Europe/Paris")).toBe("2026-07-21");
    expect(dayKey(instant, "UTC")).toBe("2026-07-20");
  });

  it("gère le passage de minuit dans l'autre sens", () => {
    // 2026-07-20T02:00:00Z = 22:00 le 19 à New York (UTC-4 l'été)
    const instant = new Date("2026-07-20T02:00:00Z");
    expect(dayKey(instant, "America/New_York")).toBe("2026-07-19");
  });
});
```

- [ ] **Step 2: Lancer le test (échoue)**

Run: `npx vitest run lib/game-engine.test.ts -t dayKey`
Expected: FAIL (`dayKey is not a function`).

- [ ] **Step 3: Implémenter**

Ajouter dans `lib/game-engine.ts` :
```ts
// Jour calendaire local (YYYY-MM-DD) dans le fuseau donné. Corrige le piège
// UTC : à 01h à Paris on est déjà "demain" alors que toISOString() dirait
// encore "hier". en-CA formate en ISO (2026-07-20).
export function dayKey(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
```

- [ ] **Step 4: Lancer le test (passe)**

Run: `npx vitest run lib/game-engine.test.ts -t dayKey`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/game-engine.ts lib/game-engine.test.ts
git commit -m "feat: add dayKey local-timezone day helper"
```

---

## Task 4 : `summarizeDay` — résumé + issue

**Files:**
- Modify: `lib/game-engine.ts`
- Test: `lib/game-engine.test.ts`

**Interfaces:**
- Consumes: `calculateBossMaxHp`, `calculateBossCurrentHp`, `taskHpValue`, `XP_PER_TASK`.
- Produces: `type DayContext = "manual" | "backfill"` ; `interface DaySummary` ; `summarizeDay(tasks: SummaryTask[], context: DayContext): DaySummary`.

Règle d'issue (spec §4/§5) : `victory` si `currentHp === 0 && bossMaxHp > 0` ; sinon `retreat` en contexte `manual`, `defeat` en contexte `backfill`.

- [ ] **Step 1: Écrire le test**

```ts
import { summarizeDay } from "./game-engine";

describe("summarizeDay", () => {
  const t = (over: Partial<{ parent_id: string | null; is_completed: boolean; is_abandoned: boolean }>) => ({
    parent_id: null,
    is_completed: false,
    is_abandoned: false,
    ...over,
  });

  it("victoire : toutes les tâches complétées, Boss à 0", () => {
    const s = summarizeDay([t({ is_completed: true }), t({ is_completed: true })], "manual");
    expect(s.outcome).toBe("victory");
    expect(s.bossMaxHp).toBe(40);
    expect(s.damageDealt).toBe(40);
    expect(s.tasksCompleted).toBe(2);
    expect(s.xpEarned).toBe(60);
  });

  it("retraite : clôture manuelle Boss vivant", () => {
    const s = summarizeDay([t({ is_completed: true }), t({})], "manual");
    expect(s.outcome).toBe("retreat");
    expect(s.damageDealt).toBe(20);
  });

  it("défaite : backfill Boss vivant", () => {
    const s = summarizeDay([t({ is_completed: true }), t({})], "backfill");
    expect(s.outcome).toBe("defeat");
  });

  it("sous-tâche vaut 10 HP, tâches abandonnées comptées à part", () => {
    const s = summarizeDay(
      [t({ is_completed: true }), t({ parent_id: "p", is_completed: true }), t({ is_abandoned: true })],
      "manual",
    );
    expect(s.bossMaxHp).toBe(30);
    expect(s.tasksAbandoned).toBe(1);
  });
});
```

- [ ] **Step 2: Lancer le test (échoue)**

Run: `npx vitest run lib/game-engine.test.ts -t summarizeDay`
Expected: FAIL.

- [ ] **Step 3: Implémenter**

```ts
export type DayContext = "manual" | "backfill";

export type SummaryTask = Pick<Task, "parent_id" | "is_completed" | "is_abandoned">;

export interface DaySummary {
  outcome: DayOutcome;
  damageDealt: number;
  bossMaxHp: number;
  tasksCompleted: number;
  tasksAbandoned: number;
  xpEarned: number;
}

export function summarizeDay(tasks: SummaryTask[], context: DayContext): DaySummary {
  const bossMaxHp = calculateBossMaxHp(tasks);
  const currentHp = calculateBossCurrentHp(tasks);
  const damageDealt = bossMaxHp - currentHp;
  const tasksCompleted = tasks.filter((t) => !t.is_abandoned && t.is_completed).length;
  const tasksAbandoned = tasks.filter((t) => t.is_abandoned).length;

  const outcome: DayOutcome =
    currentHp === 0 && bossMaxHp > 0
      ? "victory"
      : context === "manual"
        ? "retreat"
        : "defeat";

  return {
    outcome,
    damageDealt,
    bossMaxHp,
    tasksCompleted,
    tasksAbandoned,
    xpEarned: tasksCompleted * XP_PER_TASK,
  };
}
```

Note : importer `DayOutcome` depuis `../types` en tête de `game-engine.ts` (`import type { DayOutcome, Task } from "../types";`).

- [ ] **Step 4: Lancer le test (passe)**

Run: `npx vitest run lib/game-engine.test.ts -t summarizeDay`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/game-engine.ts lib/game-engine.test.ts
git commit -m "feat: add summarizeDay (outcome + day stats)"
```

---

## Task 5 : `planWakeUp` — groupage des restes

**Files:**
- Modify: `lib/game-engine.ts`
- Test: `lib/game-engine.test.ts`

**Interfaces:**
- Produces: `type WakeUpTask = Pick<Task, "id" | "parent_id" | "title" | "day_date" | "position" | "is_completed" | "is_abandoned">` ; `interface WakeUpRoot { task: WakeUpTask; children: WakeUpTask[] }` ; `interface WakeUpDayGroup { dayDate: string; roots: WakeUpRoot[] }` ; `planWakeUp(overdueTasks: WakeUpTask[]): WakeUpDayGroup[]`.

Comportement : ne garde que les restes (`!is_completed && !is_abandoned`), groupe par `day_date` (plus ancien d'abord), niche les sous-tâches restes sous leur parent reste ; une sous-tâche dont le parent n'est pas un reste du même jour devient une racine standalone. Tri par `position`.

- [ ] **Step 1: Écrire le test**

```ts
import { planWakeUp } from "./game-engine";

describe("planWakeUp", () => {
  const w = (over: Partial<{ id: string; parent_id: string | null; title: string; day_date: string; position: number; is_completed: boolean; is_abandoned: boolean }>) => ({
    id: "x", parent_id: null, title: "t", day_date: "2026-07-19", position: 0,
    is_completed: false, is_abandoned: false, ...over,
  });

  it("groupe par jour (plus ancien d'abord) et niche les sous-tâches", () => {
    const groups = planWakeUp([
      w({ id: "a", day_date: "2026-07-19", position: 0 }),
      w({ id: "a1", parent_id: "a", day_date: "2026-07-19", position: 0 }),
      w({ id: "b", day_date: "2026-07-18", position: 0 }),
    ]);
    expect(groups.map((g) => g.dayDate)).toEqual(["2026-07-18", "2026-07-19"]);
    const dayA = groups.find((g) => g.dayDate === "2026-07-19")!;
    expect(dayA.roots).toHaveLength(1);
    expect(dayA.roots[0].children.map((c) => c.id)).toEqual(["a1"]);
  });

  it("exclut les tâches complétées ou abandonnées", () => {
    const groups = planWakeUp([
      w({ id: "done", is_completed: true }),
      w({ id: "gone", is_abandoned: true }),
      w({ id: "live" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].roots[0].task.id).toBe("live");
  });

  it("promeut une sous-tâche orpheline en racine standalone", () => {
    const groups = planWakeUp([
      w({ id: "orphan", parent_id: "completed-parent", day_date: "2026-07-19" }),
    ]);
    expect(groups[0].roots[0].task.id).toBe("orphan");
  });
});
```

- [ ] **Step 2: Lancer le test (échoue)**

Run: `npx vitest run lib/game-engine.test.ts -t planWakeUp`
Expected: FAIL.

- [ ] **Step 3: Implémenter**

```ts
export type WakeUpTask = Pick<
  Task,
  "id" | "parent_id" | "title" | "day_date" | "position" | "is_completed" | "is_abandoned"
>;

export interface WakeUpRoot {
  task: WakeUpTask;
  children: WakeUpTask[];
}

export interface WakeUpDayGroup {
  dayDate: string;
  roots: WakeUpRoot[];
}

export function planWakeUp(overdueTasks: WakeUpTask[]): WakeUpDayGroup[] {
  const leftovers = overdueTasks.filter((t) => !t.is_completed && !t.is_abandoned);
  const idsInSet = new Set(leftovers.map((t) => t.id));
  const byDay = new Map<string, WakeUpTask[]>();

  for (const task of leftovers) {
    const bucket = byDay.get(task.day_date) ?? [];
    bucket.push(task);
    byDay.set(task.day_date, bucket);
  }

  const sortedDays = Array.from(byDay.keys()).sort();

  return sortedDays.map((dayDate) => {
    const dayTasks = byDay.get(dayDate)!;
    const childrenByParent = new Map<string, WakeUpTask[]>();
    const roots: WakeUpTask[] = [];

    for (const task of dayTasks) {
      const nestable = task.parent_id !== null && idsInSet.has(task.parent_id);
      if (nestable) {
        const siblings = childrenByParent.get(task.parent_id as string) ?? [];
        siblings.push(task);
        childrenByParent.set(task.parent_id as string, siblings);
      } else {
        roots.push(task);
      }
    }

    const byPosition = (a: WakeUpTask, b: WakeUpTask) => a.position - b.position;
    return {
      dayDate,
      roots: roots.sort(byPosition).map((task) => ({
        task,
        children: (childrenByParent.get(task.id) ?? []).sort(byPosition),
      })),
    };
  });
}
```

- [ ] **Step 4: Lancer le test (passe)**

Run: `npx vitest run lib/game-engine.test.ts -t planWakeUp`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/game-engine.ts lib/game-engine.test.ts
git commit -m "feat: add planWakeUp (group leftovers by day, nest subtasks)"
```

---

## Task 6 : `currentStreak` — preview lecture seule

**Files:**
- Modify: `lib/game-engine.ts`
- Test: `lib/game-engine.test.ts`

**Interfaces:**
- Consumes: `dayKey`.
- Produces: `currentStreak(dayResults: Array<Pick<DayResult, "day_date" | "outcome">>, today: string): number`.

Comportement : à partir de `today` (YYYY-MM-DD), remonte jour par jour ; compte tant qu'il existe un `day_result` du jour avec `outcome === "victory"` ; s'arrête au premier trou/non-victoire. `today` lui-même peut ne pas encore avoir de résultat (on démarre alors la veille).

- [ ] **Step 1: Écrire le test**

```ts
import { currentStreak } from "./game-engine";

describe("currentStreak", () => {
  it("compte les victoires consécutives en remontant depuis aujourd'hui", () => {
    const rows = [
      { day_date: "2026-07-20", outcome: "victory" as const },
      { day_date: "2026-07-19", outcome: "victory" as const },
      { day_date: "2026-07-18", outcome: "defeat" as const },
    ];
    expect(currentStreak(rows, "2026-07-20")).toBe(2);
  });

  it("démarre la veille si aujourd'hui n'a pas encore de résultat", () => {
    const rows = [{ day_date: "2026-07-19", outcome: "victory" as const }];
    expect(currentStreak(rows, "2026-07-20")).toBe(1);
  });

  it("un trou casse le streak", () => {
    const rows = [
      { day_date: "2026-07-20", outcome: "victory" as const },
      { day_date: "2026-07-18", outcome: "victory" as const },
    ];
    expect(currentStreak(rows, "2026-07-20")).toBe(1);
  });
});
```

- [ ] **Step 2: Lancer le test (échoue)**

Run: `npx vitest run lib/game-engine.test.ts -t currentStreak`
Expected: FAIL.

- [ ] **Step 3: Implémenter**

```ts
export function currentStreak(
  dayResults: Array<Pick<DayResult, "day_date" | "outcome">>,
  today: string,
): number {
  const victoryDays = new Set(
    dayResults.filter((r) => r.outcome === "victory").map((r) => r.day_date),
  );

  // Point de départ : aujourd'hui s'il est déjà gagné, sinon hier.
  const cursor = new Date(`${today}T00:00:00Z`);
  if (!victoryDays.has(today)) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  let streak = 0;
  while (victoryDays.has(dayKey(cursor, "UTC"))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}
```

- [ ] **Step 4: Lancer le test (passe)**

Run: `npx vitest run lib/game-engine.test.ts -t currentStreak`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/game-engine.ts lib/game-engine.test.ts
git commit -m "feat: add currentStreak read-only preview helper"
```

---

## Task 7 : Onboarding capture le fuseau

**Files:**
- Modify: `app/onboarding/OnboardingForm.tsx`
- Modify: `app/onboarding/actions.ts`

**Interfaces:**
- Produces: `profiles.timezone` renseigné à la création du profil.

- [ ] **Step 1: Ajouter un champ caché timezone au formulaire**

Dans `OnboardingForm.tsx`, ajouter un input caché rempli côté client. En tête du composant :
```tsx
import { useActionState, useEffect, useRef } from "react";
```
Dans le composant, avant le `return` :
```tsx
const tzRef = useRef<HTMLInputElement>(null);
useEffect(() => {
  if (tzRef.current) {
    tzRef.current.value = Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
}, []);
```
Dans le `<form>`, ajouter :
```tsx
<input ref={tzRef} type="hidden" name="timezone" defaultValue="UTC" />
```

- [ ] **Step 2: Lire timezone dans l'action**

Dans `app/onboarding/actions.ts`, modifier l'insert :
```ts
const timezone = String(formData.get("timezone") ?? "UTC").trim() || "UTC";

const { error } = await supabase.from("profiles").insert({
  id: user.id,
  username,
  timezone,
});
```

- [ ] **Step 3: Vérifier build + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/onboarding/
git commit -m "feat: capture user timezone at onboarding"
```

---

## Task 8 : Fix fuseau dans les actions de tâches + helper `userToday`

**Files:**
- Modify: `app/actions/tasks.ts`

**Interfaces:**
- Consumes: `dayKey`.
- Produces: `userToday(supabase, userId): Promise<string>` (interne au module) ; `addTask`/`addSubtask` utilisent le jour local.

- [ ] **Step 1: Remplacer `todayIso` par un jour local**

Dans `app/actions/tasks.ts`, importer `dayKey` et remplacer `todayIso` par un helper qui lit le fuseau du profil :
```ts
import { applyXpDelta, dayKey, isNestableParent, nextSiblingPosition, XP_PER_TASK } from "@/lib/game-engine";

async function userToday(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string> {
  const { data } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", userId)
    .maybeSingle();
  return dayKey(new Date(), data?.timezone ?? "UTC");
}
```
Supprimer l'ancienne fonction `todayIso()`.

- [ ] **Step 2: Utiliser `userToday` dans `addTask` et `addSubtask`**

Dans `addTask`, remplacer `const today = todayIso();` par `const today = await userToday(supabase, user.id);`.
Dans `addSubtask`, remplacer les deux `day_date: todayIso()` par une variable `const today = await userToday(supabase, user.id);` calculée après récupération du `user`, puis `day_date: today`.

- [ ] **Step 3: Vérifier que les tests existants passent toujours**

Run: `npm run test`
Expected: PASS (les tests purs ne dépendent pas de la DB ; aucune régression).

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/actions/tasks.ts
git commit -m "fix: use local-timezone day for task actions (RG-03)"
```

---

## Task 9 : Actions de traitement des restes (Réveil)

**Files:**
- Modify: `app/actions/tasks.ts`

**Interfaces:**
- Consumes: `userToday`, `nextSiblingPosition`.
- Produces: `completeOverdueTask(id)`, `deferOverdueTask(id)`, `annihilateOverdueTask(id)`, `deferAllOverdue()`, `annihilateOverdueOlderThan(days)` — toutes `Promise<TaskActionResult>`.

Chaque action = server action immédiate (B2). `annihilateOverdueTask` réutilise la sémantique de `abandonTask` (is_abandoned, jamais DELETE, RG-04). `deferOverdueTask` déplace la tâche **et ses sous-tâches restes** au jour local courant (RG-02 : re-soigne le Boss). `completeOverdueTask` marque `is_completed` (cascade sous-tâches via `computeToggleCascade` non nécessaire ici : on marque la racine + ses enfants restes directement).

- [ ] **Step 1: Implémenter `completeOverdueTask`**

```ts
// A1 : la tâche a été faite hors app — on la valide rétroactivement sur son
// jour d'origine (elle inflige ses dégâts au Boss de ce jour-là).
export async function completeOverdueTask(id: string): Promise<TaskActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const { error } = await supabase
    .from("tasks")
    .update({ is_completed: true })
    .or(`id.eq.${id},parent_id.eq.${id}`)
    .eq("user_id", user.id)
    .eq("is_abandoned", false);

  if (error) return { error: "Impossible de valider ce reste. Réessaie." };
  revalidatePath("/");
  return { error: null };
}
```

- [ ] **Step 2: Implémenter `deferOverdueTask`**

```ts
// Reporte au jour local courant (D5 : re-soigne le Boss du jour). La tâche et
// ses sous-tâches restes changent de day_date ; positions recalculées en tête.
export async function deferOverdueTask(id: string): Promise<TaskActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const today = await userToday(supabase, user.id);

  const { data: roots } = await supabase
    .from("tasks")
    .select("position")
    .eq("user_id", user.id)
    .eq("day_date", today)
    .is("parent_id", null);

  const { error } = await supabase
    .from("tasks")
    .update({ day_date: today, position: nextSiblingPosition(roots ?? []) })
    .or(`id.eq.${id},parent_id.eq.${id}`)
    .eq("user_id", user.id)
    .eq("is_abandoned", false);

  if (error) return { error: "Impossible de reporter ce reste. Réessaie." };
  revalidatePath("/");
  return { error: null };
}
```

- [ ] **Step 3: Implémenter `annihilateOverdueTask` et les actions groupées**

```ts
// Annihiler = is_abandoned (RG-04, jamais DELETE). Ton non-punitif côté UI.
export async function annihilateOverdueTask(id: string): Promise<TaskActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const { error } = await supabase
    .from("tasks")
    .update({ is_abandoned: true })
    .or(`id.eq.${id},parent_id.eq.${id}`)
    .eq("user_id", user.id);

  if (error) return { error: "Impossible d'annihiler ce reste. Réessaie." };
  revalidatePath("/");
  return { error: null };
}

export async function deferAllOverdue(): Promise<TaskActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const today = await userToday(supabase, user.id);
  const { error } = await supabase
    .from("tasks")
    .update({ day_date: today })
    .eq("user_id", user.id)
    .lt("day_date", today)
    .eq("is_completed", false)
    .eq("is_abandoned", false);

  if (error) return { error: "Impossible de tout reporter. Réessaie." };
  revalidatePath("/");
  return { error: null };
}

export async function annihilateOverdueOlderThan(days: number): Promise<TaskActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const today = await userToday(supabase, user.id);
  const cutoff = dayKey(new Date(Date.parse(`${today}T00:00:00Z`) - days * 86400000), "UTC");

  const { error } = await supabase
    .from("tasks")
    .update({ is_abandoned: true })
    .eq("user_id", user.id)
    .lt("day_date", cutoff)
    .eq("is_completed", false)
    .eq("is_abandoned", false);

  if (error) return { error: "Impossible d'annihiler les vieux restes. Réessaie." };
  revalidatePath("/");
  return { error: null };
}
```

- [ ] **Step 4: Vérifier compilation + tests**

Run: `npx tsc --noEmit && npm run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/actions/tasks.ts
git commit -m "feat: add wake-up ritual task actions (complete/defer/annihilate + bulk)"
```

---

## Task 10 : Actions de jour (`closeDay`, `backfillMissedDays`)

**Files:**
- Create: `app/actions/day.ts`

**Interfaces:**
- Consumes: `dayKey`, `summarizeDay`, `SummaryTask`.
- Produces: `closeDay(): Promise<{ error: string | null; outcome?: DayOutcome }>` ; `backfillMissedDays(): Promise<{ error: string | null }>`.

`closeDay` : résume le jour local courant (`context: "manual"`), upsert `day_results` (`closed_manually: true`). `backfillMissedDays` : pour chaque jour passé ayant des tâches et **sans** `day_result`, upsert (`context: "backfill"`, `closed_manually: false`) — appelé à la fin du traitement du Réveil. Chiffres recalculés depuis les tâches (B3).

- [ ] **Step 1: Créer `closeDay`**

`app/actions/day.ts` :
```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { dayKey, summarizeDay, type SummaryTask } from "@/lib/game-engine";
import type { DayOutcome } from "@/types";

interface CloseDayResult {
  error: string | null;
  outcome?: DayOutcome;
}

async function timezoneOf(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string> {
  const { data } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", userId)
    .maybeSingle();
  return data?.timezone ?? "UTC";
}

export async function closeDay(): Promise<CloseDayResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const today = dayKey(new Date(), await timezoneOf(supabase, user.id));

  const { data: tasks, error: tasksError } = await supabase
    .from("tasks")
    .select("parent_id, is_completed, is_abandoned")
    .eq("user_id", user.id)
    .eq("day_date", today);

  if (tasksError) return { error: "Impossible de clôturer la journée. Réessaie." };

  const summary = summarizeDay((tasks ?? []) as SummaryTask[], "manual");

  const { error: upsertError } = await supabase.from("day_results").upsert(
    {
      user_id: user.id,
      day_date: today,
      outcome: summary.outcome,
      damage_dealt: summary.damageDealt,
      boss_max_hp: summary.bossMaxHp,
      tasks_completed: summary.tasksCompleted,
      tasks_abandoned: summary.tasksAbandoned,
      xp_earned: summary.xpEarned,
      closed_manually: true,
    },
    { onConflict: "user_id,day_date" },
  );

  if (upsertError) return { error: "Impossible de clôturer la journée. Réessaie." };
  revalidatePath("/");
  return { error: null, outcome: summary.outcome };
}
```

- [ ] **Step 2: Ajouter `backfillMissedDays`**

Ajouter dans `app/actions/day.ts` :
```ts
export async function backfillMissedDays(): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const today = dayKey(new Date(), await timezoneOf(supabase, user.id));

  const { data: pastTasks, error: tasksError } = await supabase
    .from("tasks")
    .select("day_date, parent_id, is_completed, is_abandoned")
    .eq("user_id", user.id)
    .lt("day_date", today);

  if (tasksError) return { error: "Impossible d'enregistrer l'historique. Réessaie." };
  if (!pastTasks || pastTasks.length === 0) return { error: null };

  const { data: existing } = await supabase
    .from("day_results")
    .select("day_date")
    .eq("user_id", user.id)
    .lt("day_date", today);
  const alreadyRecorded = new Set((existing ?? []).map((r) => r.day_date));

  const byDay = new Map<string, SummaryTask[]>();
  for (const task of pastTasks) {
    if (alreadyRecorded.has(task.day_date)) continue;
    const bucket = byDay.get(task.day_date) ?? [];
    bucket.push(task as SummaryTask);
    byDay.set(task.day_date, bucket);
  }

  const rows = Array.from(byDay, ([day_date, tasks]) => {
    const s = summarizeDay(tasks, "backfill");
    return {
      user_id: user.id,
      day_date,
      outcome: s.outcome,
      damage_dealt: s.damageDealt,
      boss_max_hp: s.bossMaxHp,
      tasks_completed: s.tasksCompleted,
      tasks_abandoned: s.tasksAbandoned,
      xp_earned: s.xpEarned,
      closed_manually: false,
    };
  });

  if (rows.length === 0) return { error: null };

  const { error } = await supabase
    .from("day_results")
    .upsert(rows, { onConflict: "user_id,day_date" });

  if (error) return { error: "Impossible d'enregistrer l'historique. Réessaie." };
  revalidatePath("/");
  return { error: null };
}
```

Note : `backfillMissedDays` est appelé **après** que l'utilisateur a traité tous ses restes au Réveil, pour que « Terminé » ait pu transformer un jour en `victory`.

- [ ] **Step 3: Vérifier compilation + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/actions/day.ts
git commit -m "feat: add closeDay and backfillMissedDays actions"
```

---

## Task 11 : Composant `WakeUpRitual` (Réveil bloquant)

**Files:**
- Create: `components/combat/WakeUpRitual.tsx`

**Interfaces:**
- Consumes: `planWakeUp`, `WakeUpDayGroup`, `calculateHeroHp`, `HERO_MAX_HP`, les actions de restes + `backfillMissedDays`.
- Produces: `<WakeUpRitual overdueTasks={Task[]} timezone={string} onResolved={() => void} />`.

Comportement clé (spec §4) : overlay **bloquant** (`role="alertdialog"`, `aria-label="Rituel du Réveil"`, `fixed inset-0 z-50`), liste par jour (label « Hier »/« Il y a N jours » calculé depuis `dayKey`), jauge Héro animée en tête (A5), 3 boutons par racine (**Terminé** / **Reporter** / **Annihiler**) + boutons groupés (**Tout reporter**, **Annihiler les jours > 2j**). Chaque clic appelle l'action correspondante puis retire la racine de l'état local ; quand la liste est vide, appelle `backfillMissedDays()` puis `onResolved()`. `prefers-reduced-motion` (A7) : la jauge Héro ne s'anime pas si l'utilisateur le demande (classe conditionnelle). État Loading par bouton (disabled pendant l'appel), Error (bannière `role="alert"` + retry, la tâche reste en place). Ton non-punitif (B1) : intro Sensei + pique Boss, « Annihiler » présenté comme « on tourne la page ».

**Labels/roles requis par les tests e2e** (exacts) :
- conteneur : `role="alertdialog"`, `aria-label="Rituel du Réveil"`.
- par racine, boutons : `aria-label={`Terminé "${title}"`}`, `aria-label={`Reporter "${title}"`}`, `aria-label={`Annihiler "${title}"`}`.
- boutons groupés : texte `Tout reporter` et `Annihiler les jours > 2j`.

- [ ] **Step 1: Créer le composant**

Squelette complet à implémenter (client component) :
```tsx
"use client";

import { useMemo, useState } from "react";
import type { Task } from "@/types";
import { calculateHeroHp, dayKey, HERO_MAX_HP, planWakeUp } from "@/lib/game-engine";
import {
  annihilateOverdueOlderThan,
  annihilateOverdueTask,
  completeOverdueTask,
  deferAllOverdue,
  deferOverdueTask,
} from "@/app/actions/tasks";
import { backfillMissedDays } from "@/app/actions/day";

interface WakeUpRitualProps {
  overdueTasks: Task[];
  timezone: string;
  onResolved: () => void;
}

function dayLabel(dayDate: string, todayKey: string): string {
  const diff = Math.round(
    (Date.parse(`${todayKey}T00:00:00Z`) - Date.parse(`${dayDate}T00:00:00Z`)) / 86400000,
  );
  if (diff <= 1) return "Hier";
  return `Il y a ${diff} jours`;
}

export default function WakeUpRitual({ overdueTasks, timezone, onResolved }: WakeUpRitualProps) {
  const [tasks, setTasks] = useState<Task[]>(overdueTasks);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groups = useMemo(() => planWakeUp(tasks), [tasks]);
  const heroHp = calculateHeroHp(tasks);
  const todayKey = dayKey(new Date(), timezone);

  async function run(action: () => Promise<{ error: string | null }>, affectedIds: string[]) {
    setPending(true);
    setError(null);
    const result = await action();
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    const removed = new Set(affectedIds);
    const remaining = tasks.filter((t) => !removed.has(t.id) && !removed.has(t.parent_id ?? ""));
    setTasks(remaining);
    if (remaining.length === 0) {
      await backfillMissedDays();
      onResolved();
    }
  }

  function childIds(rootId: string): string[] {
    return tasks.filter((t) => t.parent_id === rootId).map((t) => t.id);
  }

  return (
    <div
      role="alertdialog"
      aria-label="Rituel du Réveil"
      className="fixed inset-0 z-50 flex flex-col gap-4 overflow-y-auto bg-[oklch(0.08_0_0_/_92%)] px-4 py-6"
    >
      <header className="flex flex-col gap-1">
        <p className="font-display text-xl uppercase tracking-wide text-hp">Rituel du Réveil</p>
        <p className="text-sm text-muted">
          Les monstres que tu as fuis hier sont revenus. Règle tes comptes avant d&apos;entrer dans l&apos;Arène.
        </p>
      </header>

      {/* A5 : jauge Héro animée (motion-safe uniquement) */}
      <div className="rounded-md border border-border bg-surface px-3 py-2">
        <div className="h-3 w-full overflow-hidden rounded bg-[oklch(0.2_0_0)]">
          <div
            className="h-full bg-hp transition-[width] motion-reduce:transition-none"
            style={{ width: `${(heroHp / HERO_MAX_HP) * 100}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-muted">Toi : {heroHp}/{HERO_MAX_HP} HP</p>
      </div>

      {error && (
        <div role="alert" className="rounded-md border border-alert bg-surface px-3 py-2 text-xs text-alert">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending}
          onClick={() => run(deferAllOverdue, tasks.map((t) => t.id))}
          className="rounded-md border border-border px-3 py-1.5 text-xs uppercase tracking-wide text-ink disabled:opacity-50">
          Tout reporter
        </button>
        <button type="button" disabled={pending}
          onClick={() => run(() => annihilateOverdueOlderThan(2), tasks.filter((t) => {
            const diff = Math.round((Date.parse(`${todayKey}T00:00:00Z`) - Date.parse(`${t.day_date}T00:00:00Z`)) / 86400000);
            return diff > 2;
          }).map((t) => t.id))}
          className="rounded-md border border-border px-3 py-1.5 text-xs uppercase tracking-wide text-muted disabled:opacity-50">
          Annihiler les jours &gt; 2j
        </button>
      </div>

      {groups.map((group) => (
        <section key={group.dayDate} className="flex flex-col gap-2">
          <h2 className="font-display text-xs uppercase tracking-wide text-faint">
            {dayLabel(group.dayDate, todayKey)}
          </h2>
          {group.roots.map(({ task, children }) => (
            <div key={task.id} className="rounded-md border border-border bg-surface px-3 py-2">
              <p className="text-sm text-ink">{task.title}</p>
              {children.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-xs text-muted">
                  {children.map((c) => <li key={c.id}>{c.title}</li>)}
                </ul>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" disabled={pending} aria-label={`Terminé "${task.title}"`}
                  onClick={() => run(() => completeOverdueTask(task.id), [task.id, ...childIds(task.id)])}
                  className="rounded border border-xp px-2 py-1 text-xs text-xp disabled:opacity-50">Terminé</button>
                <button type="button" disabled={pending} aria-label={`Reporter "${task.title}"`}
                  onClick={() => run(() => deferOverdueTask(task.id), [task.id, ...childIds(task.id)])}
                  className="rounded border border-border px-2 py-1 text-xs text-ink disabled:opacity-50">Reporter</button>
                <button type="button" disabled={pending} aria-label={`Annihiler "${task.title}"`}
                  onClick={() => run(() => annihilateOverdueTask(task.id), [task.id, ...childIds(task.id)])}
                  className="rounded border border-border px-2 py-1 text-xs text-muted disabled:opacity-50">Annihiler</button>
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Vérifier compilation + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/combat/WakeUpRitual.tsx
git commit -m "feat: add WakeUpRitual blocking overlay (US-08)"
```

---

## Task 12 : Composant `CrepusculeRecap` (carte de score)

**Files:**
- Create: `components/combat/CrepusculeRecap.tsx`

**Interfaces:**
- Consumes: `DayOutcome`.
- Produces: `<CrepusculeRecap outcome bossName damageDealt tasksCompleted tasksAbandoned xpEarned bossAlive streak username onDismiss />`.

Comportement (spec §5) : carte de score arcade **self-contained** (prête pour l'export PNG US-20). `role="dialog"`, `aria-label="Rituel du Crépuscule"`. Victoire → accent `text-hp`, « PERFECT », ton exalté (juron autorisé au pic). Retraite → ton apaisé, digne, jamais culpabilisant, + « il te reste N monstres, ils t'attendront demain » si `bossAlive`. Streak preview (A8) : « Nᵉ victoire d'affilée » si `streak > 0`. `prefers-reduced-motion` respecté (pas d'animation d'entrée si demandé).

**Labels/roles requis par les tests e2e** :
- conteneur : `role="dialog"`, `aria-label="Rituel du Crépuscule"`.
- attribut `data-outcome={outcome}` sur le conteneur (permet à l'e2e d'asserter `victory`/`retreat`).

- [ ] **Step 1: Créer le composant**

```tsx
"use client";

import type { DayOutcome } from "@/types";

interface CrepusculeRecapProps {
  outcome: DayOutcome;
  bossName: string;
  username: string;
  damageDealt: number;
  tasksCompleted: number;
  tasksAbandoned: number;
  xpEarned: number;
  remainingMonsters: number;
  streak: number;
  onDismiss: () => void;
}

export default function CrepusculeRecap({
  outcome, bossName, username, damageDealt, tasksCompleted,
  tasksAbandoned, xpEarned, remainingMonsters, streak, onDismiss,
}: CrepusculeRecapProps) {
  const victory = outcome === "victory";
  return (
    <div
      role="dialog"
      aria-label="Rituel du Crépuscule"
      data-outcome={outcome}
      className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-[oklch(0.08_0_0_/_88%)] px-4 text-center"
    >
      <p className={`font-display text-3xl uppercase tracking-wide ${victory ? "text-hp" : "text-ink"}`}>
        {victory ? "Perfect !" : "Crépuscule"}
      </p>
      <p className="max-w-[30ch] text-sm text-muted">
        {victory
          ? `${username}, tu as terrassé ${bossName}. La rue est calme pour ce soir.`
          : `${username}, tu poses les armes. Pas de honte — demain est un autre combat.`}
      </p>

      {/* Carte de score arcade — self-contained (prête export PNG US-20) */}
      <dl className="grid w-full max-w-xs grid-cols-2 gap-2 rounded-md border border-border bg-surface p-3 text-left text-xs">
        <dt className="text-faint">Dégâts</dt><dd className="text-right text-ink">{damageDealt} HP</dd>
        <dt className="text-faint">Monstres vaincus</dt><dd className="text-right text-ink">{tasksCompleted}</dd>
        <dt className="text-faint">Abandons</dt><dd className="text-right text-ink">{tasksAbandoned}</dd>
        <dt className="text-faint">XP gagnée</dt><dd className="text-right text-xp">+{xpEarned}</dd>
      </dl>

      {!victory && remainingMonsters > 0 && (
        <p className="text-xs text-muted">
          Il te reste {remainingMonsters} monstre{remainingMonsters > 1 ? "s" : ""} — ils t&apos;attendront demain.
        </p>
      )}
      {streak > 0 && (
        <p className="font-display text-xs uppercase tracking-wide text-hp">
          {streak}ᵉ victoire d&apos;affilée
        </p>
      )}

      <button type="button" onClick={onDismiss}
        className="rounded-md border border-border px-4 py-2 font-display text-xs uppercase tracking-wide text-ink">
        Continuer
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Vérifier compilation + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/combat/CrepusculeRecap.tsx
git commit -m "feat: add CrepusculeRecap arcade score card (US-07)"
```

---

## Task 13 : Câblage `page.tsx` + `Arena.tsx`

**Files:**
- Modify: `app/page.tsx`
- Modify: `components/combat/Arena.tsx`

**Interfaces:**
- Consumes: `WakeUpRitual`, `CrepusculeRecap`, `closeDay`, `currentStreak`, `summarizeDay`, `dayKey`.

- [ ] **Step 1: `page.tsx` — jour local + day_results récents**

Remplacer `todayIso()` par le jour local du profil et charger les day_results pour la preview de streak. Après le chargement du `profile` :
```ts
import { dayKey } from "@/lib/game-engine";
// ...
const today = dayKey(new Date(), profile.timezone ?? "UTC");
```
Remplacer les deux usages de `todayIso()` (requêtes `tasks` du jour et `overdueTasks`) par `today`. Ajouter la requête day_results :
```ts
const { data: dayResults } = await supabase
  .from("day_results")
  .select("day_date, outcome")
  .eq("user_id", user.id)
  .order("day_date", { ascending: false })
  .limit(60);
```
Passer `dayResults={dayResults ?? []}` et `today={today}` à `<Arena>`. Supprimer la fonction locale `todayIso`.

- [ ] **Step 2: `Arena.tsx` — props + état des rituels**

Étendre `ArenaProps` :
```ts
interface ArenaProps {
  initialProfile: Profile;
  initialTasks: Task[];
  overdueTasks: Task[];
  dayResults: Array<Pick<DayResult, "day_date" | "outcome">>;
  today: string;
}
```
Importer `WakeUpRitual`, `CrepusculeRecap`, `closeDay`, `currentStreak`, `summarizeDay`, `dayKey`, type `DayResult`. Remplacer le `todayIso()` local du fichier par l'usage de `dayKey(new Date(), profile.timezone)` dans les tâches optimistes (`handleAdd`/`handleAddSubtask`).

Ajouter les états :
```ts
const [showWakeUp, setShowWakeUp] = useState(overdueTasks.length > 0);
const [recap, setRecap] = useState<ReturnType<typeof summarizeDay> | null>(null);
const [closing, setClosing] = useState(false);
```

- [ ] **Step 3: `Arena.tsx` — handler de clôture Crépuscule**

```ts
async function handleCrepuscule() {
  setClosing(true);
  const result = await closeDay();
  setClosing(false);
  if (result.error) {
    setBanner(result.error);
    return;
  }
  setRecap(summarizeDay(tasks, "manual"));
}
```

- [ ] **Step 4: `Arena.tsx` — rendu des overlays + bouton**

Monter le Réveil en tête du `return` (avant le reste), bloquant :
```tsx
{showWakeUp && (
  <WakeUpRitual
    overdueTasks={overdueTasks}
    timezone={profile.timezone}
    onResolved={() => setShowWakeUp(false)}
  />
)}
```
Ajouter le bouton Crépuscule (visible dès ≥1 tâche active) près de `AddTaskForm` :
```tsx
{!isEmpty && (
  <button type="button" onClick={handleCrepuscule} disabled={closing}
    className="rounded-md border border-border px-4 py-2 font-display text-xs uppercase tracking-wide text-ink disabled:opacity-50">
    {closing ? "…" : "Rituel du Crépuscule"}
  </button>
)}
```
Monter le récap :
```tsx
{recap && (
  <CrepusculeRecap
    outcome={recap.outcome}
    bossName={BOSS_NAME}
    username={profile.username}
    damageDealt={recap.damageDealt}
    tasksCompleted={recap.tasksCompleted}
    tasksAbandoned={recap.tasksAbandoned}
    xpEarned={recap.xpEarned}
    remainingMonsters={activeTasks.filter((t) => !t.is_completed).length}
    streak={currentStreak(dayResults, today)}
    onDismiss={() => setRecap(null)}
  />
)}
```

- [ ] **Step 5: Vérifier build + lint + tests**

Run: `npx tsc --noEmit && npm run lint && npm run test`
Expected: PASS.

- [ ] **Step 6: Vérification visuelle manuelle**

Run: `npm run dev` puis ouvrir l'app.
Expected: bouton « Rituel du Crépuscule » présent ; le clic affiche le récap (victoire si Boss K.O., retraite sinon). (Le Réveil sera testé en e2e à la Task 14.)

- [ ] **Step 7: Commit**

```bash
git add app/page.tsx components/combat/Arena.tsx
git commit -m "feat: wire WakeUpRitual and CrepusculeRecap into Arena (US-07/08)"
```

---

## Task 14 : E2E Rituel du Réveil

**Files:**
- Create: `e2e/wake-up-ritual.spec.ts`

**Interfaces:**
- Consumes: `login` (`e2e/fixtures.ts`).

Le compte e2e est fixe et partagé (ADR-04), tests en série. Le test crée une tâche du jour, l'« antidate » via l'action Reporter inverse n'existe pas — donc on simule un reste en créant une tâche puis en manipulant son `day_date` par une requête Supabase de test **n'est pas possible côté client**. Approche retenue : le test vérifie le **comportement de l'overlay** quand des restes existent, en s'appuyant sur le fait qu'une tâche non terminée d'un jour précédent déclenche le Réveil. Comme le harnais e2e ne peut pas voyager dans le temps, on teste le **chemin nominal via l'UI** : créer une tâche, la laisser, et vérifier que — dans une session où `overdueTasks` est non vide — l'overlay bloque. Pour rendre le test déterministe sans triche horaire, on vérifie les **actions** sur un reste injecté par seed.

> Décision de test : ajouter un helper de seed `seedOverdueTask(page, title)` qui crée une tâche via l'UI puis appelle une route de test interne. **Si** aucune route de test n'existe, ce test est marqué `test.fixme` avec un commentaire, et la couverture du Réveil repose sur les tests unitaires de `planWakeUp` + une vérification manuelle (Task 13 Step 6 étendue). Ne PAS bloquer la livraison sur une infra de seed absente.

- [ ] **Step 1: Écrire le test (chemin nominal si seed dispo, sinon fixme documenté)**

```ts
import { test, expect } from "@playwright/test";
import { login } from "./fixtures";

// Le Réveil (US-08) dépend de tâches d'un jour local passé. Le compte e2e
// fixe ne permet pas de voyager dans le temps sans route de seed dédiée.
// Tant qu'elle n'existe pas, on documente le scénario et on s'appuie sur les
// tests unitaires planWakeUp/summarizeDay + vérif manuelle.
test.describe("Rituel du Réveil (US-08)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test.fixme("overlay bloquant : Reporter re-soigne le Boss, Annihiler abandonne (jamais DELETE)", async ({ page }) => {
    // Prérequis : seedOverdueTask (route de test). À implémenter avec l'infra e2e.
    const ritual = page.getByRole("alertdialog", { name: "Rituel du Réveil" });
    await expect(ritual).toBeVisible();
    // Reporter : la tâche revient au jour J et le Boss est soigné.
    // Annihiler : la tâche disparaît de la liste mais reste en base (is_abandoned).
  });
});
```

- [ ] **Step 2: Lancer la suite e2e**

Run: `npx playwright test e2e/wake-up-ritual.spec.ts`
Expected: le test `fixme` est reporté (skipped), suite verte.

- [ ] **Step 3: Commit**

```bash
git add e2e/wake-up-ritual.spec.ts
git commit -m "test: scaffold wake-up ritual e2e (fixme pending seed infra)"
```

---

## Task 15 : E2E Rituel du Crépuscule

**Files:**
- Create: `e2e/crepuscule-recap.spec.ts`

**Interfaces:**
- Consumes: `login` (`e2e/fixtures.ts`).

Ce scénario est testable via l'UI sans triche horaire (tout se passe le jour même).

- [ ] **Step 1: Écrire le test**

```ts
import { test, expect } from "@playwright/test";
import { login } from "./fixtures";

// US-07 : clôturer la journée écrit un day_result et affiche le récap figé.
test.describe("Rituel du Crépuscule (US-07)", () => {
  let title: string | undefined;

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test.afterEach(async ({ page }) => {
    if (!title) return;
    const abandon = page.getByLabel(`Abandonner "${title}"`);
    if (await abandon.count()) await abandon.click();
    title = undefined;
  });

  test("victoire : créer puis valider une tâche, clôturer → récap victory", async ({ page }) => {
    title = `E2E crep ${Date.now()}`;
    await page.getByLabel("Ajouter une tâche").fill(title);
    await page.getByRole("button", { name: "Ajouter" }).click();
    const row = page.locator("li", { hasText: title });
    await expect(row).toBeVisible();

    // Valider la tâche → Boss à 0 HP.
    await row.getByRole("checkbox").check();

    // Fermer l'overlay Perfect s'il apparaît, puis clôturer.
    const perfect = page.getByRole("alertdialog", { name: "Boss vaincu" });
    if (await perfect.count()) await perfect.getByRole("button", { name: "Continuer" }).click();

    await page.getByRole("button", { name: "Rituel du Crépuscule" }).click();

    const recap = page.getByRole("dialog", { name: "Rituel du Crépuscule" });
    await expect(recap).toBeVisible();
    await expect(recap).toHaveAttribute("data-outcome", "victory");
  });

  test("retraite : clôturer avec le Boss vivant → récap retreat", async ({ page }) => {
    title = `E2E crep retreat ${Date.now()}`;
    await page.getByLabel("Ajouter une tâche").fill(title);
    await page.getByRole("button", { name: "Ajouter" }).click();
    await expect(page.locator("li", { hasText: title })).toBeVisible();

    await page.getByRole("button", { name: "Rituel du Crépuscule" }).click();

    const recap = page.getByRole("dialog", { name: "Rituel du Crépuscule" });
    await expect(recap).toBeVisible();
    await expect(recap).toHaveAttribute("data-outcome", "retreat");
    await recap.getByRole("button", { name: "Continuer" }).click();
  });
});
```

- [ ] **Step 2: Lancer le test**

Run: `npx playwright test e2e/crepuscule-recap.spec.ts`
Expected: PASS (2 tests). Nécessite un build prod (`playwright.config.ts` démarre `npm run build && npm run start`).

- [ ] **Step 3: Commit**

```bash
git add e2e/crepuscule-recap.spec.ts
git commit -m "test: add crepuscule recap e2e (victory + retreat)"
```

---

## Task 16 : Documentation (CLAUDE.md, CHANGELOG, SPECS)

**Files:**
- Modify: `CLAUDE.md`
- Modify: `CHANGELOG.md`
- Modify: `SPECS_FONCTIONNELLES.md`

- [ ] **Step 1: `CLAUDE.md` — solder la dette + nouvelles conventions**

Dans la section « Pièges et décisions non-évidentes » :
- Mettre à jour l'entrée « Jauge de HP du Héros sans conséquence » : la dette est **soldée** par le Rituel du Réveil (US-08) qui traite les restes ; la jauge remonte quand les restes sont résolus.
- Mettre à jour « Décalage horaire » : le jour est désormais le **jour local** via `profiles.timezone` + `dayKey` (`lib/game-engine.ts`). Plus d'UTC.
- Ajouter une entrée : table `day_results` (fondation Panthéon/streak/partage), écriture idempotente, pas de policy DELETE (RG-04).

- [ ] **Step 2: `CHANGELOG.md` — sous `[Unreleased]`**

Ajouter dans la sous-section Produit :
```md
- US-07 : Rituel du Crépuscule (clôture cérémonielle, récap carte de score, day_results).
- US-08 : Rituel du Réveil (overlay bloquant, Terminé/Reporter/Annihiler + actions groupées, backfill historique).
```
Dans la sous-section Technique :
```md
- Table `day_results` + colonne `profiles.timezone` ; jour local (`dayKey`) remplace l'UTC (RG-03).
```

- [ ] **Step 3: `SPECS_FONCTIONNELLES.md` — renommer et aligner**

Remplacer toute occurrence de « Rituel Obi-Wan » par « Rituel du Crépuscule » (US-07). Aligner les BDD d'US-07/US-08 sur le spec `2026-07-20-cycle-journee-design.md` (référencer le spec).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md CHANGELOG.md SPECS_FONCTIONNELLES.md
git commit -m "docs: reconcile day-cycle (Crepuscule rename, timezone, day_results)"
```

---

## Vérification finale (avant PR)

1. `npm run test` (Vitest) — vert, incluant `dayKey`, `summarizeDay`, `planWakeUp`, `currentStreak`.
2. `npx tsc --noEmit` — 0 erreur (TS strict, aucun `any`).
3. `npm run lint` — propre.
4. `npm run build` — build prod OK.
5. `npx playwright test` — specs existantes + `crepuscule-recap` vertes en local (série, serveur prod). `wake-up-ritual` reporté (fixme documenté).
6. Manuel : profil avec `timezone` non-UTC → jour correct ; clôture victoire vs retraite ; (si seed dispo) Réveil bloquant, Reporter re-soigne le Boss, Annihiler garde la ligne en base (`is_abandoned=true`).
7. Base : `day_results` peuplée (clôture + backfill), aucune ligne `tasks` supprimée (RG-04).
8. PR : `Closes #4` (US-07) et `Closes #5` (US-08). **Ne pas merger sans feu vert** (règle projet).
