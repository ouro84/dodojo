# US-05 — Deadlines horaires (Attaques surprises du Boss) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre de fixer une heure limite (`deadline_at`) sur n'importe quelle tâche (racine ou sous-tâche) du jour, infliger -10 HP au pool Héros existant quand elle est ratée et non résolue, et déclencher une animation "Attaque Surprise" détectée par polling pendant que l'Arène est ouverte.

**Architecture:** Aucune migration (`tasks.deadline_at` existe déjà, colonne `timestamptz`). Extension de la fonction pure `calculateHeroHp` (`lib/game-engine.ts`) pour accepter un pool pondéré (`{ task, weight }`) au lieu d'un poids fixe -20, réutilisée à la fois pour les tâches en retard (US-08, poids -20) et les deadlines ratées du jour (poids -10). Nouveau composant `DeadlineControl` (popover `<input type="time">`) branché sur `TaskRow`. Détection du franchissement par polling client léger dans `Arena.tsx` (pas de nouvelle table, pas de websocket). Nouvelle server action `setTaskDeadline` ; `deferOverdueTask`/`deferAllOverdue` effacent `deadline_at` au report pour éviter le cumul de malus.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase (Postgres `timestamptz`), Tailwind CSS v4, Vitest, Playwright.

## Global Constraints

- Toute communication et tout commentaire/doc produit sont en français (termes techniques en anglais si c'est l'usage naturel).
- TypeScript strict : jamais de `any`, tout type explicite.
- Toute logique de calcul de jeu (HP, dégâts, dates) réside dans `lib/game-engine.ts`, pure et testée sans dépendance de rendu UI.
- RG-04 : jamais de `DELETE` SQL ; les mutations passent par `is_abandoned`/`is_completed`/colonnes dédiées.
- Tout écran doit garder ses 3 états UI (Loading/Error/Empty) — cette feature n'ajoute pas d'écran plein, donc n'a rien à casser sur ce point, mais ne doit pas les régresser.
- Commits en Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`), un commit par étape "Commit" ci-dessous.
- `CHANGELOG.md` : la ligne `[Unreleased]` s'ajoute dans le même commit que la feature qu'elle documente (ici, faite en tâche dédiée mais avant la PR finale).
- Manuel du Dojo (`content/guide.json`) : toute mécanique visible par l'utilisateur doit être documentée avant la PR.
- `CLAUDE.md` : tout changement de comportement des calculs de HP ou nouveau piège non-évident doit être documenté dans le même lot de travail.
- Zéro PR poussée avant que `npm run lint && npm test && npm run build && npm run e2e` soient verts en local (`CONTRIBUTING.md`).

---

### Task 1: Pool HP Héros pondéré (`calculateHeroHp`)

**Files:**
- Modify: `lib/game-engine.ts:197-208`
- Test: `lib/game-engine.test.ts` (import list + describe block `calculateHeroHp`, lignes 1-35 et 148-174)

**Interfaces:**
- Consumes: rien (fondation pure).
- Produces: `HERO_DAMAGE_PER_MISSED_DEADLINE = 10`, type `HeroHpPenaltyTask = Pick<Task, "is_abandoned" | "is_completed"> & { weight: number }`, `calculateHeroHp(penaltyTasks: HeroHpPenaltyTask[]): number`, `overdueHpPenalties(tasks: OverdueTask[]): HeroHpPenaltyTask[]` — utilisés par les tâches 2, 4, 11 et par `WakeUpRitual.tsx`.

- [ ] **Step 1: Remplacer le bloc de tests `calculateHeroHp` par la version pondérée (test qui échoue)**

Dans `lib/game-engine.test.ts`, remplacer l'import de `calculateHeroHp` (ligne 6) — ajouter `overdueHpPenalties` à la liste d'imports existante (juste après `calculateHeroHp,` ligne 6) :

```ts
  calculateHeroHp,
  overdueHpPenalties,
```

Puis remplacer entièrement le bloc `describe("calculateHeroHp (pénalité procrastination)", ...)` (lignes 148-174) par :

```ts
describe("calculateHeroHp (pool HP Héros pondéré, US-05)", () => {
  test("100 HP quand aucune pénalité", () => {
    expect(calculateHeroHp([])).toBe(100);
  });

  test("retire le poids de chaque pénalité non résolue", () => {
    const penalties = [
      { ...makeTask({ id: "1" }), weight: 20 },
      { ...makeTask({ id: "2" }), weight: 10 },
    ];
    expect(calculateHeroHp(penalties)).toBe(70);
  });

  test("ignore les pénalités déjà complétées ou abandonnées", () => {
    const penalties = [
      { ...makeTask({ id: "1", is_completed: true }), weight: 20 },
      { ...makeTask({ id: "2", is_abandoned: true }), weight: 10 },
      { ...makeTask({ id: "3" }), weight: 20 },
    ];
    expect(calculateHeroHp(penalties)).toBe(80);
  });

  test("plafonne à 0, jamais négatif", () => {
    const penalties = Array.from({ length: 10 }, (_, i) => ({
      ...makeTask({ id: `t${i}` }),
      weight: 20,
    }));
    expect(calculateHeroHp(penalties)).toBe(0);
  });

  test("combine un poids -20 (retard reporté) et un poids -10 (deadline ratée) sur deux tâches distinctes", () => {
    const penalties = [
      { ...makeTask({ id: "overdue-1" }), weight: 20 },
      { ...makeTask({ id: "deadline-1" }), weight: 10 },
    ];
    expect(calculateHeroHp(penalties)).toBe(70);
  });

  test("une pénalité résolue (cochée) libère son poids immédiatement", () => {
    const penalties = [
      { ...makeTask({ id: "1" }), weight: 10 },
      { ...makeTask({ id: "1", is_completed: true }), weight: 10 },
    ];
    // Cocher la tâche (2e entrée) doit faire remonter le HP à 100.
    expect(calculateHeroHp([penalties[1]])).toBe(100);
  });
});

describe("overdueHpPenalties (US-05)", () => {
  test("attribue le poids -20 à chaque tâche en retard, en conservant ses champs", () => {
    const tasks = [makeTask({ id: "1" }), makeTask({ id: "2", is_completed: true })];
    expect(overdueHpPenalties(tasks)).toEqual([
      { ...tasks[0], weight: 20 },
      { ...tasks[1], weight: 20 },
    ]);
  });
});
```

- [ ] **Step 2: Lancer les tests et vérifier l'échec**

Run: `npx vitest run lib/game-engine.test.ts`
Expected: FAIL — `overdueHpPenalties` n'est pas exporté par `./game-engine`, et la signature de `calculateHeroHp` ne correspond plus au code source actuel (TS error côté transpilation ou test rouge selon le cas).

- [ ] **Step 3: Étendre `lib/game-engine.ts`**

Remplacer les lignes 197-208 actuelles :

```ts
export const HERO_MAX_HP = 100;
export const HERO_DAMAGE_PER_OVERDUE_TASK = 20;

export type OverdueTask = Pick<Task, "is_abandoned" | "is_completed">;

export function calculateHeroHp(overdueTasks: OverdueTask[]): number {
  const unresolvedCount = overdueTasks.filter(
    (task) => !task.is_abandoned && !task.is_completed,
  ).length;

  return Math.max(0, HERO_MAX_HP - unresolvedCount * HERO_DAMAGE_PER_OVERDUE_TASK);
}
```

par :

```ts
export const HERO_MAX_HP = 100;
export const HERO_DAMAGE_PER_OVERDUE_TASK = 20;
export const HERO_DAMAGE_PER_MISSED_DEADLINE = 10;

export type OverdueTask = Pick<Task, "is_abandoned" | "is_completed">;

// US-05 : le pool HP Héros accepte un poids par tâche (overdue reporté = -20,
// deadline horaire ratée = -10) plutôt qu'un poids fixe pour toute la liste.
export type HeroHpPenaltyTask = Pick<Task, "is_abandoned" | "is_completed"> & {
  weight: number;
};

export function calculateHeroHp(penaltyTasks: HeroHpPenaltyTask[]): number {
  const damage = penaltyTasks
    .filter((task) => !task.is_abandoned && !task.is_completed)
    .reduce((total, task) => total + task.weight, 0);

  return Math.max(0, HERO_MAX_HP - damage);
}

// Construit les entrées pondérées du pool HP Héros pour des tâches en retard
// (reportées d'un jour précédent, poids -20). Utilisé par le Rituel du Réveil
// et l'Arène.
export function overdueHpPenalties(tasks: OverdueTask[]): HeroHpPenaltyTask[] {
  return tasks.map((task) => ({ ...task, weight: HERO_DAMAGE_PER_OVERDUE_TASK }));
}
```

- [ ] **Step 4: Lancer les tests et vérifier le succès**

Run: `npx vitest run lib/game-engine.test.ts`
Expected: PASS (tous les tests du fichier, y compris les nouveaux)

- [ ] **Step 5: Commit**

```bash
git add lib/game-engine.ts lib/game-engine.test.ts
git commit -m "feat: pool HP Héros pondéré par tâche (overdue -20, base US-05)"
```

---

### Task 2: Détection des deadlines ratées + badge agrégé

**Files:**
- Modify: `lib/game-engine.ts` (juste après le code ajouté en Task 1)
- Test: `lib/game-engine.test.ts`

**Interfaces:**
- Consumes: `HERO_DAMAGE_PER_MISSED_DEADLINE`, `HeroHpPenaltyTask` (Task 1).
- Produces: type `DeadlineTask = Pick<Task, "id" | "title" | "deadline_at" | "is_completed" | "is_abandoned">`, `missedDeadlineTasks(tasks: DeadlineTask[], now: Date): DeadlineTask[]`, `upcomingDeadlineCount(tasks: DeadlineTask[], now: Date): number`, `deadlineHpPenalties(tasks: DeadlineTask[]): HeroHpPenaltyTask[]` — utilisés par Task 11 (`Arena.tsx`).

- [ ] **Step 1: Ajouter les tests (échec attendu)**

Dans `lib/game-engine.test.ts`, ajouter à l'import (juste après `overdueHpPenalties,` ajouté en Task 1) :

```ts
  overdueHpPenalties,
  missedDeadlineTasks,
  upcomingDeadlineCount,
  deadlineHpPenalties,
```

Ajouter ces `describe` juste après le bloc `overdueHpPenalties` ajouté en Task 1 :

```ts
describe("missedDeadlineTasks (US-05)", () => {
  const now = new Date("2026-07-22T14:00:00.000Z");

  test("retient une tâche dont la deadline est dépassée et non résolue", () => {
    const tasks = [makeTask({ id: "1", deadline_at: "2026-07-22T13:00:00.000Z" })];
    expect(missedDeadlineTasks(tasks, now)).toEqual(tasks);
  });

  test("ignore une deadline pas encore atteinte", () => {
    const tasks = [makeTask({ id: "1", deadline_at: "2026-07-22T15:00:00.000Z" })];
    expect(missedDeadlineTasks(tasks, now)).toEqual([]);
  });

  test("ignore une tâche sans deadline", () => {
    expect(missedDeadlineTasks([makeTask({ id: "1", deadline_at: null })], now)).toEqual([]);
  });

  test("ignore une deadline dépassée mais déjà complétée ou abandonnée", () => {
    const tasks = [
      makeTask({ id: "1", deadline_at: "2026-07-22T13:00:00.000Z", is_completed: true }),
      makeTask({ id: "2", deadline_at: "2026-07-22T13:00:00.000Z", is_abandoned: true }),
    ];
    expect(missedDeadlineTasks(tasks, now)).toEqual([]);
  });

  test("une deadline pile égale à l'heure courante compte comme ratée", () => {
    const tasks = [makeTask({ id: "1", deadline_at: "2026-07-22T14:00:00.000Z" })];
    expect(missedDeadlineTasks(tasks, now)).toEqual(tasks);
  });
});

describe("upcomingDeadlineCount (US-05)", () => {
  const now = new Date("2026-07-22T14:00:00.000Z");

  test("compte les deadlines actives pas encore dépassées", () => {
    const tasks = [
      makeTask({ id: "1", deadline_at: "2026-07-22T15:00:00.000Z" }),
      makeTask({ id: "2", deadline_at: "2026-07-22T16:00:00.000Z" }),
      makeTask({ id: "3", deadline_at: "2026-07-22T13:00:00.000Z" }), // déjà ratée
      makeTask({ id: "4", deadline_at: null }),
    ];
    expect(upcomingDeadlineCount(tasks, now)).toBe(2);
  });

  test("0 quand aucune tâche n'a de deadline", () => {
    expect(upcomingDeadlineCount([makeTask({ id: "1" })], now)).toBe(0);
  });
});

describe("deadlineHpPenalties (US-05)", () => {
  test("attribue le poids -10 à chaque deadline ratée", () => {
    const tasks = [makeTask({ id: "1" })];
    expect(deadlineHpPenalties(tasks)).toEqual([{ ...tasks[0], weight: 10 }]);
  });
});
```

- [ ] **Step 2: Lancer les tests et vérifier l'échec**

Run: `npx vitest run lib/game-engine.test.ts`
Expected: FAIL — `missedDeadlineTasks`, `upcomingDeadlineCount`, `deadlineHpPenalties` non définis.

- [ ] **Step 3: Implémenter dans `lib/game-engine.ts`**

Ajouter, juste après `overdueHpPenalties` (ajouté en Task 1) :

```ts
export type DeadlineTask = Pick<
  Task,
  "id" | "title" | "deadline_at" | "is_completed" | "is_abandoned"
>;

// US-05 : tâches dont la deadline est dépassée et qui ne sont ni complétées ni
// abandonnées. Alimente le pool HP Héros (poids -10, cf. deadlineHpPenalties)
// et déclenche l'animation "Attaque Surprise" au polling (Arena.tsx). `now`
// explicite pour rester testable sans horloge système réelle.
export function missedDeadlineTasks(tasks: DeadlineTask[], now: Date): DeadlineTask[] {
  const nowMs = now.getTime();
  return tasks.filter(
    (task) =>
      task.deadline_at !== null &&
      !task.is_completed &&
      !task.is_abandoned &&
      new Date(task.deadline_at).getTime() <= nowMs,
  );
}

// US-05 : badge agrégé "N deadlines à venir aujourd'hui" — tâches actives à
// deadline non nulle et pas encore dépassée.
export function upcomingDeadlineCount(tasks: DeadlineTask[], now: Date): number {
  const nowMs = now.getTime();
  return tasks.filter(
    (task) =>
      task.deadline_at !== null &&
      !task.is_completed &&
      !task.is_abandoned &&
      new Date(task.deadline_at).getTime() > nowMs,
  ).length;
}

// Construit les entrées pondérées du pool HP Héros pour des deadlines ratées du
// jour courant (poids -10, cf. spec US-05).
export function deadlineHpPenalties(tasks: DeadlineTask[]): HeroHpPenaltyTask[] {
  return tasks.map((task) => ({ ...task, weight: HERO_DAMAGE_PER_MISSED_DEADLINE }));
}
```

- [ ] **Step 4: Lancer les tests et vérifier le succès**

Run: `npx vitest run lib/game-engine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/game-engine.ts lib/game-engine.test.ts
git commit -m "feat: détection pure des deadlines ratées et badge agrégé (US-05)"
```

---

### Task 3: Conversion heure locale ↔ ISO (pour le popover ⏰)

**Files:**
- Modify: `lib/game-engine.ts` (après le code de Task 2)
- Test: `lib/game-engine.test.ts`

**Interfaces:**
- Consumes: rien de nouveau.
- Produces: `deadlineIso(dayDate: string, timeHHMM: string, timezone: string): string`, `localTimeFromIso(iso: string, timezone: string): string` — utilisés par `DeadlineControl.tsx` (Task 6).

- [ ] **Step 1: Ajouter les tests (échec attendu)**

Ajouter à l'import de `lib/game-engine.test.ts` (après `deadlineHpPenalties,` ajouté en Task 2) :

```ts
  deadlineHpPenalties,
  deadlineIso,
  localTimeFromIso,
```

Ajouter ce `describe` après le bloc `deadlineHpPenalties` :

```ts
describe("deadlineIso / localTimeFromIso (US-05, conversion heure locale <-> ISO)", () => {
  test("construit l'ISO UTC d'une heure locale Europe/Paris (UTC+2 en été)", () => {
    expect(deadlineIso("2026-07-22", "14:00", "Europe/Paris")).toBe(
      "2026-07-22T12:00:00.000Z",
    );
  });

  test("construit l'ISO UTC d'une heure locale déjà en UTC", () => {
    expect(deadlineIso("2026-07-22", "09:30", "UTC")).toBe("2026-07-22T09:30:00.000Z");
  });

  test("round-trip : localTimeFromIso restitue la même heure locale (Europe/Paris)", () => {
    const iso = deadlineIso("2026-07-22", "14:00", "Europe/Paris");
    expect(localTimeFromIso(iso, "Europe/Paris")).toBe("14:00");
  });

  test("round-trip sur un fuseau à décalage négatif (America/New_York)", () => {
    const iso = deadlineIso("2026-07-22", "08:15", "America/New_York");
    expect(localTimeFromIso(iso, "America/New_York")).toBe("08:15");
  });

  test("round-trip sur minuit pile", () => {
    const iso = deadlineIso("2026-07-22", "00:00", "Europe/Paris");
    expect(localTimeFromIso(iso, "Europe/Paris")).toBe("00:00");
  });
});
```

- [ ] **Step 2: Lancer les tests et vérifier l'échec**

Run: `npx vitest run lib/game-engine.test.ts`
Expected: FAIL — `deadlineIso`, `localTimeFromIso` non définis.

- [ ] **Step 3: Implémenter dans `lib/game-engine.ts`**

Ajouter, juste après `deadlineHpPenalties` :

```ts
// US-05 : construit l'ISO UTC d'une deadline "aujourd'hui à HH:MM" dans le
// fuseau donné (valeur brute d'un <input type="time">). Jamais de date à
// choisir — la deadline est toujours bornée au day_date de la tâche. Même
// trick d'offset DST-aware que dayKey : on compare la même instant formaté
// dans le fuseau cible et en UTC pour en déduire le décalage exact.
export function deadlineIso(dayDate: string, timeHHMM: string, timezone: string): string {
  const [year, month, day] = dayDate.split("-").map(Number);
  const [hours, minutes] = timeHHMM.split(":").map(Number);
  const naiveUtc = Date.UTC(year, month - 1, day, hours, minutes);
  const asIfUtc = new Date(naiveUtc);
  const tzString = asIfUtc.toLocaleString("en-US", { timeZone: timezone });
  const utcString = asIfUtc.toLocaleString("en-US", { timeZone: "UTC" });
  const offsetMs = new Date(tzString).getTime() - new Date(utcString).getTime();
  return new Date(naiveUtc - offsetMs).toISOString();
}

// US-05 : heure locale HH:MM (fuseau donné) d'un horodatage ISO, pour
// pré-remplir le <input type="time"> du popover ⏰.
export function localTimeFromIso(iso: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
}
```

- [ ] **Step 4: Lancer les tests et vérifier le succès**

Run: `npx vitest run lib/game-engine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/game-engine.ts lib/game-engine.test.ts
git commit -m "feat: conversion heure locale <-> ISO pour les deadlines (US-05)"
```

---

### Task 4: Adapter les appelants existants du pool HP au nouveau contrat pondéré

**Files:**
- Modify: `components/combat/Arena.tsx:174` (et import ligne 24)
- Modify: `components/combat/WakeUpRitual.tsx:5,42`

**Interfaces:**
- Consumes: `overdueHpPenalties` (Task 1).
- Produces: rien de nouveau — restaure la compilation avec un comportement identique à l'existant (le malus overdue -20 continue de fonctionner tel quel ; le pool deadline sera branché en Task 11).

- [ ] **Step 1: `WakeUpRitual.tsx` — utiliser le pool pondéré**

Remplacer l'import (ligne 5) :

```ts
import { calculateHeroHp, dayKey, HERO_MAX_HP, planWakeUp } from "@/lib/game-engine";
```

par :

```ts
import {
  calculateHeroHp,
  dayKey,
  HERO_MAX_HP,
  overdueHpPenalties,
  planWakeUp,
} from "@/lib/game-engine";
```

Remplacer la ligne 42 :

```ts
  const heroHp = calculateHeroHp(tasks);
```

par :

```ts
  const heroHp = calculateHeroHp(overdueHpPenalties(tasks));
```

- [ ] **Step 2: `Arena.tsx` — utiliser le pool pondéré**

Dans l'import de `@/lib/game-engine` (lignes 20-39), ajouter `overdueHpPenalties` juste après `koOutcome,` :

```ts
  koOutcome,
  overdueHpPenalties,
```

Remplacer la ligne 174 :

```ts
  const heroHp = calculateHeroHp(overdueTasks);
```

par :

```ts
  const heroHp = calculateHeroHp(overdueHpPenalties(overdueTasks));
```

- [ ] **Step 3: Vérifier que le build type-check passe**

Run: `npm run build`
Expected: build Next.js réussi, sans erreur TypeScript.

- [ ] **Step 4: Vérifier la non-régression du parcours existant**

Run: `npx vitest run lib/game-engine.test.ts`
Expected: PASS (aucune régression sur les tests purs déjà en place)

- [ ] **Step 5: Commit**

```bash
git add components/combat/Arena.tsx components/combat/WakeUpRitual.tsx
git commit -m "refactor: adapter Arena et WakeUpRitual au pool HP Héros pondéré"
```

---

### Task 5: Server actions — fixer/effacer une deadline, et l'effacer au report

**Files:**
- Modify: `app/actions/tasks.ts` (nouvelle fonction + `deferOverdueTask`/`deferAllOverdue`)

**Interfaces:**
- Consumes: `TaskActionResult` (déjà défini dans ce fichier).
- Produces: `setTaskDeadline(id: string, deadlineAt: string | null): Promise<TaskActionResult>` — utilisé par `Arena.tsx` (Tasks 7 et 11).

- [ ] **Step 1: Ajouter `setTaskDeadline`**

Ajouter cette fonction à la fin de `app/actions/tasks.ts` (après `annihilateOverdueOlderThan`) :

```ts
// US-05 : fixe/modifie/efface l'heure limite d'une tâche (popover ⏰ sur
// TaskRow, ou le bouton "Repousser +1h" de l'Attaque Surprise). `deadlineAt` =
// ISO complet (UTC) ou null pour effacer.
export async function setTaskDeadline(
  id: string,
  deadlineAt: string | null,
): Promise<TaskActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Session expirée. Reconnecte-toi." };
  }

  const { error } = await supabase
    .from("tasks")
    .update({ deadline_at: deadlineAt })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return { error: "Impossible de fixer cette deadline. Réessaie." };
  }

  revalidatePath("/");
  return { error: null };
}
```

- [ ] **Step 2: Effacer `deadline_at` au report (`deferOverdueTask`)**

Remplacer dans `deferOverdueTask` (actuellement) :

```ts
  const { error } = await supabase
    .from("tasks")
    .update({ day_date: today, position: nextSiblingPosition(roots ?? []) })
    .or(`id.eq.${id},parent_id.eq.${id}`)
    .eq("user_id", user.id)
    .eq("is_abandoned", false);
```

par :

```ts
  // US-05 : la deadline (déjà passée la veille) est effacée au report pour ne
  // pas cumuler le malus "deadline ratée" (-10) avec le malus "retard reporté"
  // (-20) déjà appliqué par le mécanisme existant sur la même tâche.
  const { error } = await supabase
    .from("tasks")
    .update({
      day_date: today,
      position: nextSiblingPosition(roots ?? []),
      deadline_at: null,
    })
    .or(`id.eq.${id},parent_id.eq.${id}`)
    .eq("user_id", user.id)
    .eq("is_abandoned", false);
```

- [ ] **Step 3: Effacer `deadline_at` au report groupé (`deferAllOverdue`)**

Remplacer dans `deferAllOverdue` (actuellement) :

```ts
  const { error } = await supabase
    .from("tasks")
    .update({ day_date: today })
    .eq("user_id", user.id)
    .lt("day_date", today)
    .eq("is_completed", false)
    .eq("is_abandoned", false);
```

par :

```ts
  const { error } = await supabase
    .from("tasks")
    .update({ day_date: today, deadline_at: null })
    .eq("user_id", user.id)
    .lt("day_date", today)
    .eq("is_completed", false)
    .eq("is_abandoned", false);
```

- [ ] **Step 4: Vérifier le build**

Run: `npm run build`
Expected: build réussi.

- [ ] **Step 5: Commit**

```bash
git add app/actions/tasks.ts
git commit -m "feat: server action setTaskDeadline + effacement au report (US-05)"
```

---

### Task 6: Composant `DeadlineControl` (popover ⏰)

**Files:**
- Create: `components/combat/DeadlineControl.tsx`

**Interfaces:**
- Consumes: `deadlineIso`, `localTimeFromIso` (Task 3).
- Produces: composant `DeadlineControl` — props `{ taskId: string; taskTitle: string; deadlineAt: string | null; dayDate: string; timezone: string; disabled?: boolean; onSave: (deadlineAt: string | null) => void }` — utilisé par `TaskRow.tsx` (Task 7).

- [ ] **Step 1: Créer le composant**

```tsx
"use client";

import { useState } from "react";
import { deadlineIso, localTimeFromIso } from "@/lib/game-engine";

interface DeadlineControlProps {
  taskId: string;
  taskTitle: string;
  deadlineAt: string | null;
  dayDate: string;
  timezone: string;
  disabled?: boolean;
  onSave: (deadlineAt: string | null) => void;
}

// US-05 : icône ⏰ sur TaskRow (racine et sous-tâche) — popover inline avec un
// sélecteur d'heure natif pour fixer/modifier/effacer la deadline du jour de
// la tâche. Pas de date à choisir : la deadline est toujours bornée au
// day_date de la tâche (cf. design).
export default function DeadlineControl({
  taskId,
  taskTitle,
  deadlineAt,
  dayDate,
  timezone,
  disabled = false,
  onSave,
}: DeadlineControlProps) {
  const [open, setOpen] = useState(false);
  const [time, setTime] = useState(() =>
    deadlineAt ? localTimeFromIso(deadlineAt, timezone) : "",
  );

  function handleOpen() {
    setTime(deadlineAt ? localTimeFromIso(deadlineAt, timezone) : "");
    setOpen(true);
  }

  function handleSave() {
    if (!time) return;
    onSave(deadlineIso(dayDate, time, timezone));
    setOpen(false);
  }

  function handleClear() {
    onSave(null);
    setOpen(false);
  }

  const label = deadlineAt ? localTimeFromIso(deadlineAt, timezone) : null;

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={handleOpen}
        aria-label={
          label
            ? `Modifier la deadline de "${taskTitle}" (${label})`
            : `Fixer une deadline pour "${taskTitle}"`
        }
        className={`rounded px-1 text-xs ${
          label ? "text-alert" : "text-faint hover:text-ink focus-visible:text-ink"
        } disabled:cursor-wait disabled:opacity-40`}
      >
        ⏰{label ? ` ${label}` : ""}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={`Deadline de "${taskTitle}"`}
          className="absolute right-0 top-full z-20 mt-1 flex flex-col gap-2 rounded-md border border-border bg-surface p-2 shadow-lg"
        >
          <label htmlFor={`deadline-${taskId}`} className="text-xs text-muted">
            Heure limite
          </label>
          <input
            id={`deadline-${taskId}`}
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
            className="rounded border border-border bg-transparent px-2 py-1 text-xs text-ink"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={!time}
              className="flex-1 rounded bg-hp px-2 py-1 text-xs uppercase tracking-wide text-ink disabled:opacity-40"
            >
              Enregistrer
            </button>
            {deadlineAt && (
              <button
                type="button"
                onClick={handleClear}
                className="rounded border border-border px-2 py-1 text-xs text-muted"
              >
                Effacer
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fermer"
              className="rounded px-1.5 py-1 text-xs text-faint hover:text-alert"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Vérifier le build**

Run: `npm run build`
Expected: build réussi (composant non encore importé nulle part, donc pas d'erreur d'usage — juste vérifier qu'il compile seul).

- [ ] **Step 3: Commit**

```bash
git add components/combat/DeadlineControl.tsx
git commit -m "feat: composant DeadlineControl (popover heure limite, US-05)"
```

---

### Task 7: Brancher l'icône ⏰ dans `TaskRow`/`TaskList`/`Arena`

**Files:**
- Modify: `components/combat/TaskRow.tsx`
- Modify: `components/combat/TaskList.tsx`
- Modify: `components/combat/Arena.tsx` (import + JSX de `TaskList` + nouveau handler)

**Interfaces:**
- Consumes: `DeadlineControl` (Task 6), `setTaskDeadline` (Task 5).
- Produces: `TaskRow` prop `timezone: string` + `onSetDeadline: (id: string, deadlineAt: string | null) => void` ; `TaskList` mêmes props relayées ; `Arena.handleSetDeadline(id: string, deadlineAt: string | null): void` — utilisé par Task 11 (bouton "Repousser +1h").

- [ ] **Step 1: `TaskRow.tsx` — ajouter les props et l'icône**

Remplacer l'import du haut du fichier :

```tsx
import type { Task } from "@/types";
import { isNestableParent, isOptimisticTask } from "@/lib/game-engine";
import SubtaskForm from "./SubtaskForm";
```

par :

```tsx
import type { Task } from "@/types";
import { isNestableParent, isOptimisticTask } from "@/lib/game-engine";
import SubtaskForm from "./SubtaskForm";
import DeadlineControl from "./DeadlineControl";
```

Remplacer l'interface `TaskRowProps` et la signature du composant :

```tsx
interface TaskRowProps {
  task: Task;
  onToggle: (id: string, isCompleted: boolean) => void;
  onAbandon: (id: string) => void;
  onAddSubtask: (parentId: string, title: string) => void;
  isAddingSubtask: boolean;
  dropIndicator?: DragOverInfo | null;
}

export default function TaskRow({
  task,
  onToggle,
  onAbandon,
  onAddSubtask,
  isAddingSubtask,
  dropIndicator = null,
}: TaskRowProps) {
```

par :

```tsx
interface TaskRowProps {
  task: Task;
  timezone: string;
  onToggle: (id: string, isCompleted: boolean) => void;
  onAbandon: (id: string) => void;
  onAddSubtask: (parentId: string, title: string) => void;
  onSetDeadline: (id: string, deadlineAt: string | null) => void;
  isAddingSubtask: boolean;
  dropIndicator?: DragOverInfo | null;
}

export default function TaskRow({
  task,
  timezone,
  onToggle,
  onAbandon,
  onAddSubtask,
  onSetDeadline,
  isAddingSubtask,
  dropIndicator = null,
}: TaskRowProps) {
```

Insérer `<DeadlineControl>` juste après le bloc `SubtaskForm` conditionnel et avant le bouton d'abandon (`×`) :

```tsx
      {isNestableParent(task) && (
        <SubtaskForm
          onAdd={(title) => onAddSubtask(task.id, title)}
          pending={isAddingSubtask}
          disabled={isPending}
        />
      )}
      <DeadlineControl
        taskId={task.id}
        taskTitle={task.title}
        deadlineAt={task.deadline_at}
        dayDate={task.day_date}
        timezone={timezone}
        disabled={isPending}
        onSave={(deadlineAt) => onSetDeadline(task.id, deadlineAt)}
      />
      <button
        type="button"
        onClick={() => onAbandon(task.id)}
```

- [ ] **Step 2: `TaskList.tsx` — relayer les nouvelles props**

Remplacer tout le fichier par :

```tsx
import type { Task } from "@/types";
import { sortTasksHierarchically } from "@/lib/game-engine";
import TaskRow, { type DragOverInfo } from "./TaskRow";

interface TaskListProps {
  tasks: Task[];
  timezone: string;
  onToggle: (id: string, isCompleted: boolean) => void;
  onAbandon: (id: string) => void;
  onAddSubtask: (parentId: string, title: string) => void;
  onSetDeadline: (id: string, deadlineAt: string | null) => void;
  addingSubtaskParentId?: string | null;
  dragOverInfo?: DragOverInfo | null;
}

export default function TaskList({
  tasks,
  timezone,
  onToggle,
  onAbandon,
  onAddSubtask,
  onSetDeadline,
  addingSubtaskParentId = null,
  dragOverInfo = null,
}: TaskListProps) {
  const orderedTasks = sortTasksHierarchically(tasks);

  return (
    <ul className="flex flex-1 flex-col gap-1.5 overflow-y-auto">
      {orderedTasks.map((task) => (
        <li key={task.id}>
          <TaskRow
            task={task}
            timezone={timezone}
            onToggle={onToggle}
            onAbandon={onAbandon}
            onAddSubtask={onAddSubtask}
            onSetDeadline={onSetDeadline}
            isAddingSubtask={addingSubtaskParentId === task.id}
            dropIndicator={dragOverInfo?.overTaskId === task.id ? dragOverInfo : null}
          />
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 3: `Arena.tsx` — importer l'action, ajouter `handleSetDeadline`, passer les props à `TaskList`**

Dans l'import des server actions (lignes 43-50), ajouter `setTaskDeadline as setTaskDeadlineAction` :

```ts
import {
  addTask as addTaskAction,
  addSubtask as addSubtaskAction,
  rageQuitTask as rageQuitTaskAction,
  undoRageQuit as undoRageQuitAction,
  reorderSiblings as reorderSiblingsAction,
  setTaskCompleted as setTaskCompletedAction,
  setTaskDeadline as setTaskDeadlineAction,
} from "@/app/actions/tasks";
```

Ajouter cette fonction juste après `handleUndoRageQuit` (avant `async function handleCrepuscule`) :

```ts
  // US-05 : sauvegarde optimiste d'une deadline (popover ⏰ ou "Repousser +1h").
  // `deadlineAt` = null pour effacer.
  function handleSetDeadline(id: string, deadlineAt: string | null) {
    const previousSnapshot = tasks;
    setTasks((prev) =>
      prev.map((task) => (task.id === id ? { ...task, deadline_at: deadlineAt } : task)),
    );
    void setTaskDeadlineAction(id, deadlineAt).then((result) => {
      if (result.error) {
        setTasks(previousSnapshot);
        setBanner(result.error);
      }
    });
  }
```

Dans le JSX, remplacer l'appel à `<TaskList>` :

```tsx
          <TaskList
            tasks={activeTasks}
            onToggle={handleToggle}
            onAbandon={handleAbandon}
            onAddSubtask={handleAddSubtask}
            addingSubtaskParentId={addingSubtaskParentId}
            dragOverInfo={dragOverInfo}
          />
```

par :

```tsx
          <TaskList
            tasks={activeTasks}
            timezone={profile.timezone}
            onToggle={handleToggle}
            onAbandon={handleAbandon}
            onAddSubtask={handleAddSubtask}
            onSetDeadline={handleSetDeadline}
            addingSubtaskParentId={addingSubtaskParentId}
            dragOverInfo={dragOverInfo}
          />
```

- [ ] **Step 4: Vérifier le build**

Run: `npm run build`
Expected: build réussi.

- [ ] **Step 5: Commit**

```bash
git add components/combat/TaskRow.tsx components/combat/TaskList.tsx components/combat/Arena.tsx
git commit -m "feat: brancher l'icône ⏰ (popover deadline) sur TaskRow (US-05)"
```

---

### Task 8: Test e2e Playwright — flux simple du popover ⏰

**Files:**
- Create: `e2e/deadlines.spec.ts`

**Interfaces:**
- Consumes: `login`, `abandonViaUi` (`e2e/fixtures.ts`).
- Produces: rien de nouveau — couverture e2e du flux UI. Le polling/l'animation "Attaque Surprise" ne sont volontairement PAS testés en e2e (fragile, temporisation), cf. design.

- [ ] **Step 1: Écrire le test**

```ts
import { test, expect } from "@playwright/test";
import { abandonViaUi, login } from "./fixtures";

// Scénario US-05 : fixer une deadline horaire sur une tâche via le popover ⏰.
// Pas de test sur le déclenchement de l'Attaque Surprise (polling temporisé,
// fragile en e2e) — couvert par les tests unitaires purs (lib/game-engine :
// missedDeadlineTasks, upcomingDeadlineCount, calculateHeroHp pondéré).
test.describe("Deadlines horaires (US-05)", () => {
  let taskTitle: string | undefined;

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test.afterEach(async ({ page }) => {
    if (taskTitle) await abandonViaUi(page, taskTitle);
    taskTitle = undefined;
  });

  test("fixer une deadline depuis le popover ⏰ l'affiche sur la tâche", async ({ page }) => {
    taskTitle = `E2E deadline ${Date.now()}`;

    await page.getByLabel("Ajouter une tâche").fill(taskTitle);
    await page.getByRole("button", { name: "Ajouter" }).click();

    const row = page.locator("li", { hasText: taskTitle });
    await row.getByLabel(`Fixer une deadline pour "${taskTitle}"`).click();
    await page.getByLabel("Heure limite").fill("14:00");
    await page.getByRole("button", { name: "Enregistrer" }).click();

    await expect(
      row.getByLabel(`Modifier la deadline de "${taskTitle}" (14:00)`),
    ).toBeVisible();
  });

  test("effacer une deadline la retire de la tâche", async ({ page }) => {
    taskTitle = `E2E deadline clear ${Date.now()}`;

    await page.getByLabel("Ajouter une tâche").fill(taskTitle);
    await page.getByRole("button", { name: "Ajouter" }).click();

    const row = page.locator("li", { hasText: taskTitle });
    await row.getByLabel(`Fixer une deadline pour "${taskTitle}"`).click();
    await page.getByLabel("Heure limite").fill("09:15");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(
      row.getByLabel(`Modifier la deadline de "${taskTitle}" (09:15)`),
    ).toBeVisible();

    await row.getByLabel(`Modifier la deadline de "${taskTitle}" (09:15)`).click();
    await page.getByRole("button", { name: "Effacer" }).click();

    await expect(row.getByLabel(`Fixer une deadline pour "${taskTitle}"`)).toBeVisible();
  });
});
```

- [ ] **Step 2: Lancer la suite e2e localement**

Run: `npm run e2e -- e2e/deadlines.spec.ts`
Expected: PASS (2 tests verts). Nécessite `.env.local` avec `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD` (ADR-04), cf. `CONTRIBUTING.md`.

- [ ] **Step 3: Commit**

```bash
git add e2e/deadlines.spec.ts
git commit -m "test: e2e du popover deadline ⏰ (US-05)"
```

---

### Task 9: Effet visuel "Attaque Surprise" — CSS, `FloatingText`, `HeroBar`

**Files:**
- Modify: `app/globals.css`
- Modify: `components/combat/FloatingText.tsx`
- Modify: `components/combat/HeroBar.tsx`

**Interfaces:**
- Consumes: rien de nouveau.
- Produces: classe CSS `.hero-alarm`, prop `FloatingText.anchor?: "boss" | "hero"` (défaut `"boss"`), prop `HeroBar.alarm?: boolean` (défaut `false`) — utilisés par `VersusScene` (Task 10) et `Arena.tsx` (Task 11).

- [ ] **Step 1: Ajouter le keyframe CSS**

Dans `app/globals.css`, insérer juste après le bloc `.floating-text { animation: float-up 900ms ease-out forwards; }` (ligne 179-181) et avant le commentaire `/* ---- Dictée vocale (US-02) ---- */` :

```css

/* US-05 : clignotement bref de la jauge Héros lors d'une Attaque Surprise
   (deadline horaire ratée et non résolue). */
@keyframes hero-alarm-blink {
  0%,
  100% {
    box-shadow: 0 0 0 0 transparent;
  }
  50% {
    box-shadow: 0 0 0 2px var(--color-alert);
  }
}
.hero-alarm {
  animation: hero-alarm-blink 300ms ease-in-out 3;
}
```

Dans le bloc `@media (prefers-reduced-motion: reduce) { ... }` (lignes 256-286), ajouter juste après `.streak-flames { animation: none; }` et avant la fermeture `}` du média-query :

```css
  .hero-alarm {
    animation: none;
    box-shadow: 0 0 0 2px var(--color-alert);
  }
```

- [ ] **Step 2: Étendre `FloatingText.tsx` avec un ancrage "hero"**

Remplacer tout le fichier par :

```tsx
interface FloatingTextProps {
  amount: number;
  kind: "damage" | "heal";
  unit?: "HP" | "XP";
  anchor?: "boss" | "hero";
}

export default function FloatingText({
  amount,
  kind,
  unit = "HP",
  anchor = "boss",
}: FloatingTextProps) {
  const sign = kind === "damage" ? "-" : "+";
  const colorClass =
    unit === "XP" ? "text-xp" : kind === "damage" ? "text-hp" : "text-gold";
  const positionClass =
    unit === "XP"
      ? "right-3 top-2"
      : anchor === "hero"
        ? "left-6 bottom-12"
        : "left-1/2 top-2 -translate-x-1/2";

  return (
    <span
      aria-hidden="true"
      className={`floating-text pointer-events-none absolute z-10 font-display text-4xl drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] ${positionClass} ${colorClass}`}
    >
      {sign}
      {amount} {unit}
    </span>
  );
}
```

- [ ] **Step 3: Ajouter une prop `alarm` à `HeroBar.tsx`**

Remplacer tout le fichier par :

```tsx
interface HeroBarProps {
  heroName: string;
  currentHp: number;
  maxHp: number;
  alarm?: boolean;
}

export default function HeroBar({ heroName, currentHp, maxHp, alarm = false }: HeroBarProps) {
  const pct = maxHp > 0 ? Math.max(0, Math.min(100, (currentHp / maxHp) * 100)) : 0;

  return (
    <div className="flex flex-col gap-1">
      <div
        role="progressbar"
        aria-valuenow={currentHp}
        aria-valuemin={0}
        aria-valuemax={maxHp}
        aria-label={`Vie du héros : ${currentHp} sur ${maxHp}`}
        className={`h-3.5 overflow-hidden rounded-sm bg-hp-dim ${alarm ? "hero-alarm" : ""}`}
      >
        <div
          className="ml-auto h-full bg-hp transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between font-display text-sm uppercase tracking-wide text-ink drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
        <span>{heroName}</span>
        <span className="font-hud text-xs tabular-nums text-muted">
          {currentHp}/{maxHp} HP
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Vérifier le build**

Run: `npm run build`
Expected: build réussi.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css components/combat/FloatingText.tsx components/combat/HeroBar.tsx
git commit -m "feat: effet visuel Attaque Surprise (clignotement Héros, FloatingText ancré) (US-05)"
```

---

### Task 10: `VersusScene` — badge agrégé + prop d'alarme Héros

**Files:**
- Modify: `components/combat/VersusScene.tsx`

**Interfaces:**
- Consumes: `HeroBar.alarm` (Task 9).
- Produces: `VersusScene` props `heroAlarm?: boolean` (défaut `false`), `upcomingDeadlineCount?: number` (défaut `0`) — utilisés par `Arena.tsx` (Task 11).

- [ ] **Step 1: Modifier le composant**

Remplacer tout le fichier par :

```tsx
import Image from "next/image";
import IdleSprite from "./IdleSprite";
import HeroBar from "./HeroBar";
import BossBar from "./BossBar";
import MidnightTimer from "./MidnightTimer";

interface VersusSceneProps {
  heroName: string;
  heroFramePrefix: string;
  heroFrameCount: number;
  heroHp: number;
  heroMaxHp: number;
  heroAlarm?: boolean;
  bossName: string;
  bossFramePrefix: string;
  bossFrameCount: number;
  bossFlip: boolean;
  backgroundPath: string;
  currentHp: number;
  maxHp: number;
  upcomingDeadlineCount?: number;
  dimmed?: boolean;
}

// Décor + Boss dynamiques : le boss du jour et son décor cohérent sont tirés par
// resolveDailyBoss (cf. lib/bosses.ts, lib/backgrounds.ts, ASSETS.md).
// Héros : assets/MC/Elementals_* (licence non documentée localement, cf. ASSETS.md)
export default function VersusScene({
  heroName,
  heroFramePrefix,
  heroFrameCount,
  heroHp,
  heroMaxHp,
  heroAlarm = false,
  bossName,
  bossFramePrefix,
  bossFrameCount,
  bossFlip,
  backgroundPath,
  currentHp,
  maxHp,
  upcomingDeadlineCount = 0,
  dimmed = false,
}: VersusSceneProps) {
  return (
    <div
      className="relative h-48 w-full overflow-hidden rounded-lg border border-border"
      style={dimmed ? { filter: "saturate(0.5) brightness(0.7)" } : undefined}
    >
      <Image
        src={backgroundPath}
        alt=""
        fill
        sizes="336px"
        priority
        className="object-cover [image-rendering:pixelated]"
      />
      <div className="absolute inset-x-0 top-0 z-[5] h-24 bg-gradient-to-b from-black/70 via-black/35 to-transparent" />
      <div className="absolute inset-x-0 top-0 z-10 flex items-start gap-2 p-2">
        <div className="flex-1">
          <HeroBar heroName={heroName} currentHp={heroHp} maxHp={heroMaxHp} alarm={heroAlarm} />
        </div>
        <div className="flex flex-col items-center pt-1">
          <MidnightTimer />
        </div>
        <div className="flex-1">
          <BossBar bossName={bossName} currentHp={currentHp} maxHp={maxHp} />
          {upcomingDeadlineCount > 0 && (
            <p
              className="mt-0.5 text-right text-[0.65rem] uppercase tracking-wide text-alert drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
              aria-label={`${upcomingDeadlineCount} deadline${upcomingDeadlineCount > 1 ? "s" : ""} à venir aujourd'hui`}
            >
              ⏰ {upcomingDeadlineCount} à venir
            </p>
          )}
        </div>
      </div>
      <IdleSprite
        framePrefix={heroFramePrefix}
        frameCount={heroFrameCount}
        alt={`Ton héros : ${heroName}`}
        className="absolute bottom-2 left-4 h-28 w-auto [image-rendering:pixelated] drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)]"
      />
      <IdleSprite
        framePrefix={bossFramePrefix}
        frameCount={bossFrameCount}
        flip={bossFlip}
        alt={`Le Boss du jour : ${bossName}`}
        className="absolute bottom-2 right-4 h-28 w-auto [image-rendering:pixelated] drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)]"
      />
    </div>
  );
}
```

- [ ] **Step 2: Vérifier le build**

Run: `npm run build`
Expected: build réussi.

- [ ] **Step 3: Commit**

```bash
git add components/combat/VersusScene.tsx
git commit -m "feat: badge deadlines à venir + alarme Héros dans VersusScene (US-05)"
```

---

### Task 11: `Arena.tsx` — polling, pool HP combiné, toast "Repousser +1h"

**Files:**
- Modify: `components/combat/Arena.tsx`

**Interfaces:**
- Consumes: `missedDeadlineTasks`, `upcomingDeadlineCount`, `deadlineHpPenalties`, `HERO_DAMAGE_PER_MISSED_DEADLINE` (Task 2), `handleSetDeadline`/`setTaskDeadlineAction` (Task 7), `VersusScene.heroAlarm`/`upcomingDeadlineCount` (Task 10), `FloatingText.anchor="hero"` (Task 9).
- Produces: comportement complet de la feature (aucun autre fichier ne dépend de ce qui est ajouté ici).

- [ ] **Step 1: Étendre l'import de `@/lib/game-engine`**

Ajouter à l'import (déjà modifié en Task 4), juste après `overdueHpPenalties,` :

```ts
  overdueHpPenalties,
  deadlineHpPenalties,
  missedDeadlineTasks,
  upcomingDeadlineCount,
  HERO_DAMAGE_PER_MISSED_DEADLINE,
```

- [ ] **Step 2: Ajouter l'état et les refs du polling, juste après `const pulseTimeoutRef = ...` / `const xpPulseTimeoutRef = ...` (lignes 163-164)**

```ts
  // US-05 : horloge de polling (~45s) pendant que l'Arène est montée, pour
  // détecter le franchissement d'une deadline. Recalculée en `now` plutôt
  // qu'à chaque frame : cf. design (pas de replay au chargement).
  const [now, setNow] = useState(() => new Date());
  const knownMissedDeadlineIdsRef = useRef<Set<string>>(
    new Set(missedDeadlineTasks(initialTasks, new Date()).map((t) => t.id)),
  );
  const [heroPulse, setHeroPulse] = useState<{ key: number } | null>(null);
  const [deadlineAlert, setDeadlineAlert] = useState<{
    taskId: string;
    taskTitle: string;
  } | null>(null);
  const heroPulseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tasksRef = useRef(tasks);
```

- [ ] **Step 3: Garder `tasksRef` synchronisé + démarrer le polling — ajouter juste après le `useEffect` de nettoyage existant (lignes 208-214)**

```ts
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  // US-05 : polling léger (~45s) pendant que l'Arène est montée. Ne se
  // déclenche jamais rétroactivement pour une deadline déjà ratée avant le
  // montage (cf. knownMissedDeadlineIdsRef, initialisé au chargement).
  useEffect(() => {
    const timer = setInterval(() => {
      const tick = new Date();
      const missedNow = missedDeadlineTasks(
        tasksRef.current.filter((task) => !task.is_abandoned),
        tick,
      );
      const known = knownMissedDeadlineIdsRef.current;
      const freshlyMissed = missedNow.filter((task) => !known.has(task.id));

      if (freshlyMissed.length > 0) {
        for (const task of freshlyMissed) known.add(task.id);

        heroPulseCounter += 1;
        const key = heroPulseCounter;
        setHeroPulse({ key });
        setDeadlineAlert({ taskId: freshlyMissed[0].id, taskTitle: freshlyMissed[0].title });

        if (heroPulseTimeoutRef.current) clearTimeout(heroPulseTimeoutRef.current);
        heroPulseTimeoutRef.current = setTimeout(() => {
          setHeroPulse((current) => (current?.key === key ? null : current));
        }, 1400);
      }

      setNow(tick);
    }, 45_000);

    return () => clearInterval(timer);
  }, []);
```

- [ ] **Step 4: Ajouter le compteur `heroPulseCounter` en haut du fichier, à côté des autres compteurs de module (lignes 95-98)**

Remplacer :

```ts
let pulseCounter = 0;
let xpPulseCounter = 0;
let comboCounter = 0;
let optimisticIdCounter = 0;
```

par :

```ts
let pulseCounter = 0;
let xpPulseCounter = 0;
let comboCounter = 0;
let heroPulseCounter = 0;
let optimisticIdCounter = 0;
```

- [ ] **Step 5: Étendre le nettoyage des timeouts au démontage (lignes 208-214)**

Remplacer :

```ts
  useEffect(() => {
    return () => {
      if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
      if (xpPulseTimeoutRef.current) clearTimeout(xpPulseTimeoutRef.current);
      if (comboTimeoutRef.current) clearTimeout(comboTimeoutRef.current);
    };
  }, []);
```

par :

```ts
  useEffect(() => {
    return () => {
      if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
      if (xpPulseTimeoutRef.current) clearTimeout(xpPulseTimeoutRef.current);
      if (comboTimeoutRef.current) clearTimeout(comboTimeoutRef.current);
      if (heroPulseTimeoutRef.current) clearTimeout(heroPulseTimeoutRef.current);
    };
  }, []);
```

- [ ] **Step 6: Recalculer `heroHp` avec les deux pools combinés — remplacer la ligne (modifiée en Task 4)**

Remplacer :

```ts
  const heroHp = calculateHeroHp(overdueHpPenalties(overdueTasks));
```

par :

```ts
  const missedDeadlines = missedDeadlineTasks(activeTasks, now);
  const heroHp = calculateHeroHp([
    ...overdueHpPenalties(overdueTasks),
    ...deadlineHpPenalties(missedDeadlines),
  ]);
```

> Note : `activeTasks` est déjà défini juste après (`const activeTasks = tasks.filter((task) => !task.is_abandoned);`) — comme ce nouveau bloc le référence, le déplacer pour qu'il soit défini **avant** ce calcul. Concrètement, l'ordre final dans le composant doit être :

```ts
  const maxHp = calculateBossMaxHp(tasks);
  const currentHp = calculateBossCurrentHp(tasks);
  const activeTasks = tasks.filter((task) => !task.is_abandoned);
  const missedDeadlines = missedDeadlineTasks(activeTasks, now);
  const heroHp = calculateHeroHp([
    ...overdueHpPenalties(overdueTasks),
    ...deadlineHpPenalties(missedDeadlines),
  ]);
  // US-18 : héros affiché = celui équipé (fallback défaut si id inconnu).
  const equippedHero =
    getHero(profile.equipped_hero_id) ?? getHero(DEFAULT_HERO_ID)!;
  const isEmpty = activeTasks.length === 0;
```

(supprimer la ligne dupliquée `const activeTasks = ...` qui suivait `equippedHero` dans l'original, et l'ancienne ligne isolée `const isEmpty = activeTasks.length === 0;` reste à sa place logique ci-dessus).

- [ ] **Step 7: Ajouter le handler "Repousser +1h" — juste après `handleSetDeadline` (Task 7)**

```ts
  // US-05 : action rapide du toast "Attaque Surprise" — repousse la deadline
  // d'1h à partir de MAINTENANT (pas de l'ancienne deadline ratée).
  function handlePushDeadlineOneHour(id: string) {
    const nextDeadline = new Date(Date.now() + 3_600_000).toISOString();
    handleSetDeadline(id, nextDeadline);
    setDeadlineAlert(null);
  }
```

- [ ] **Step 8: Passer les nouvelles props à `VersusScene` dans le JSX**

Remplacer l'appel à `<VersusScene>` :

```tsx
          <VersusScene
            heroName={equippedHero.name}
            heroFramePrefix={equippedHero.idleFramePrefix}
            heroFrameCount={equippedHero.idleFrameCount}
            heroHp={heroHp}
            heroMaxHp={HERO_MAX_HP}
            bossName={bossName}
            bossFramePrefix={boss.idleFramePrefix}
            bossFrameCount={boss.idleFrameCount}
            bossFlip={boss.flip}
            backgroundPath={background.publicPath}
            currentHp={currentHp}
            maxHp={maxHp}
            dimmed={isEmpty}
          />
```

par :

```tsx
          <VersusScene
            heroName={equippedHero.name}
            heroFramePrefix={equippedHero.idleFramePrefix}
            heroFrameCount={equippedHero.idleFrameCount}
            heroHp={heroHp}
            heroMaxHp={HERO_MAX_HP}
            heroAlarm={heroPulse !== null}
            bossName={bossName}
            bossFramePrefix={boss.idleFramePrefix}
            bossFrameCount={boss.idleFrameCount}
            bossFlip={boss.flip}
            backgroundPath={background.publicPath}
            currentHp={currentHp}
            maxHp={maxHp}
            upcomingDeadlineCount={upcomingDeadlineCount(activeTasks, now)}
            dimmed={isEmpty}
          />
```

- [ ] **Step 9: Ajouter le `FloatingText` côté Héros, juste après `{pulse && <FloatingText amount={pulse.amount} kind={pulse.kind} />}`**

```tsx
          {pulse && <FloatingText amount={pulse.amount} kind={pulse.kind} />}
          {heroPulse && (
            <FloatingText
              amount={HERO_DAMAGE_PER_MISSED_DEADLINE}
              kind="damage"
              anchor="hero"
            />
          )}
```

- [ ] **Step 10: Ajouter le toast "Attaque Surprise", juste après le bloc `{undoState && (...)}`**

```tsx
      {deadlineAlert && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 rounded-md border border-alert bg-surface px-3 py-2 text-xs text-alert"
        >
          <span>
            ⏰ Attaque Surprise : « {deadlineAlert.taskTitle} » a raté sa deadline
            (−{HERO_DAMAGE_PER_MISSED_DEADLINE} HP).
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => handlePushDeadlineOneHour(deadlineAlert.taskId)}
              className="font-display uppercase tracking-wide text-xp underline underline-offset-2"
            >
              Repousser +1h
            </button>
            <button
              type="button"
              onClick={() => setDeadlineAlert(null)}
              className="underline"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
```

- [ ] **Step 11: Vérifier le build**

Run: `npm run build`
Expected: build réussi, sans erreur TypeScript.

- [ ] **Step 12: Vérifier la non-régression de la suite Vitest**

Run: `npm test`
Expected: PASS (toute la suite `lib/**`).

- [ ] **Step 13: Vérifier la non-régression e2e du combat de base**

Run: `npm run e2e -- e2e/combat-loop.spec.ts e2e/subtasks.spec.ts e2e/wake-up-ritual.spec.ts e2e/deadlines.spec.ts`
Expected: PASS.

- [ ] **Step 14: Commit**

```bash
git add components/combat/Arena.tsx
git commit -m "feat: polling deadlines + Attaque Surprise + Repousser +1h (US-05)"
```

---

### Task 12: Manuel du Dojo — documenter les deadlines

**Files:**
- Modify: `content/guide.json`

**Interfaces:**
- Consumes: rien (contenu statique).
- Produces: nouvelle section `id: "deadlines"`, lue génériquement par `app/guide/page.tsx` (aucun changement de code nécessaire côté rendu).

- [ ] **Step 1: Ajouter la section, juste après la section `"reveil"` et avant `"crepuscule"`**

Dans `content/guide.json`, insérer ce bloc entre la fermeture de la section `"reveil"` et l'ouverture de la section `"crepuscule"` :

```json
    {
      "id": "deadlines",
      "title": "Les Deadlines & Attaques Surprises",
      "blocks": [
        { "type": "p", "text": "L'icône ⏰ sur une tâche permet de lui fixer une heure limite dans la journée. Si l'heure passe sans que tu aies coché (ou abandonné) la tâche, le Boss tente une Attaque Surprise." },
        { "type": "ul", "items": ["Fixer/modifier/effacer : icône ⏰ sur la tâche, sélecteur d'heure", "Deadline ratée non résolue : -10 HP sur ta jauge, jauge qui clignote", "Cocher ou abandonner la tâche retire le malus immédiatement", "Un badge près du Boss annonce les deadlines à venir dans la journée", "Reporter une tâche au Rituel du Réveil efface sa deadline (pas de cumul de malus)"] }
      ]
    },
```

**Cross-check (2026-07-22)** : `updatedAt` est déjà passé à `"2026-07-22"` par US-20 (livrée avant celle-ci, même date de sprint) — ne pas retenter ce remplacement (le texte `"2026-07-21"` n'existera plus dans le fichier à ce stade), aucune action requise ici.

- [ ] **Step 2: Valider le JSON et le rendu**

Run: `node -e "JSON.parse(require('fs').readFileSync('content/guide.json','utf8')); console.log('JSON valide')"`
Expected: `JSON valide`

Run: `npm run build`
Expected: build réussi (la page `/guide` consomme `content/guide.json` de façon générique, aucun changement de code requis).

- [ ] **Step 3: Commit**

```bash
git add content/guide.json
git commit -m "docs: documenter les deadlines horaires dans le Manuel du Dojo (US-05)"
```

---

### Task 13: `CHANGELOG.md`

**Files:**
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: rien.
- Produces: rien.

- [ ] **Step 1: Ajouter la ligne Produit**

Dans `CHANGELOG.md`, sous `### Produit` (juste après la ligne `- US-29 : Onboarding (...)`), ajouter :

```markdown
- US-05 : Deadlines horaires (icône ⏰ sur chaque tâche — racine ou sous-tâche — pour fixer une heure limite via un sélecteur d'heure natif ; badge agrégé « N deadlines à venir aujourd'hui » près de la jauge Boss). Une deadline ratée et non résolue inflige -10 HP au pool Héros (distinct des -20 HP d'un retard reporté, US-08) et déclenche une « Attaque Surprise » (jauge Héros qui clignote, texte flottant -10 HP, bouton « Repousser +1h »). Auto-résolution en cochant/abandonnant la tâche ; deadline effacée automatiquement en cas de report via le Rituel du Réveil.
```

- [ ] **Step 2: Ajouter la ligne Technique**

Sous `### Technique`, tout en haut (juste après `## [Unreleased]` → `### Technique`, avant la ligne `- Colonne tasks.abandon_reason (...)`), ajouter :

```markdown
- `calculateHeroHp` (`lib/game-engine.ts`) accepte désormais un poids par tâche (`HeroHpPenaltyTask`, `overdueHpPenalties` -20 / `deadlineHpPenalties` -10) au lieu d'un poids fixe pour toute la liste ; nouvelles fonctions pures `missedDeadlineTasks`, `upcomingDeadlineCount`, `deadlineIso`/`localTimeFromIso` (conversion heure locale ↔ ISO, DST-aware, même trick d'offset que `dayKey`) ; détection du franchissement de deadline par polling client léger (~45s) pendant que l'Arène est montée, sans replay au chargement
```

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: ligne changelog US-05 (deadlines horaires)"
```

---

### Task 14: `CLAUDE.md` — compléter le piège "Jauge de HP du Héros" + nouveau piège deadlines

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: rien.
- Produces: rien.

- [ ] **Step 1: Compléter le paragraphe existant sur la jauge de HP du Héros**

Remplacer le paragraphe (dans la section « Pièges et décisions non-évidentes ») :

```markdown
**Jauge de HP du Héros — dette soldée par le Rituel du Réveil (US-08)** — La jauge de HP du Héros (`calculateHeroHp` dans `lib/game-engine.ts`, -20 HP par tâche en retard non résolue, plancher à 0) n'est plus purement décorative. Le Rituel du Réveil (`components/combat/WakeUpRitual.tsx`, US-08) traite les restes au démarrage via un overlay **bloquant** : Terminé / Reporter / Annihiler (+ actions groupées). Résoudre les restes fait remonter la jauge. La jauge ne peut donc plus rester à 0 indéfiniment sans action proposée. Voir le spec unifié `docs/superpowers/specs/2026-07-20-cycle-journee-design.md`.
```

par :

```markdown
**Jauge de HP du Héros — dette soldée par le Rituel du Réveil (US-08) + pool pondéré (US-05)** — La jauge de HP du Héros (`calculateHeroHp` dans `lib/game-engine.ts`) n'est plus purement décorative. **Depuis US-05, le pool accepte un poids par tâche** (`HeroHpPenaltyTask`, champ `weight`) au lieu d'un poids fixe -20 pour toute la liste : une tâche en retard reportée d'un jour précédent (`overdueHpPenalties`) pèse -20 HP, une deadline horaire ratée du jour courant et non résolue (`deadlineHpPenalties` + `missedDeadlineTasks`) pèse -10 HP — les deux pools se combinent dans un seul appel à `calculateHeroHp`, plancher à 0. Le Rituel du Réveil (`components/combat/WakeUpRitual.tsx`, US-08) traite les restes au démarrage via un overlay **bloquant** : Terminé / Reporter / Annihiler (+ actions groupées). Résoudre les restes (ou cocher/abandonner une tâche à deadline ratée) fait remonter la jauge instantanément (fonction pure recalculée à chaque rendu). La jauge ne peut donc plus rester à 0 indéfiniment sans action proposée. Voir le spec unifié `docs/superpowers/specs/2026-07-20-cycle-journee-design.md` et `docs/superpowers/specs/2026-07-22-us05-deadlines-design.md`.
```

- [ ] **Step 2: Ajouter un nouveau piège dédié aux deadlines, en fin de section (après le paragraphe "Perfect / K.O. en direct (US-16)")**

Ajouter ce paragraphe juste avant la ligne `---` qui précède `## URL de production` :

```markdown
**Deadlines horaires — détection par polling, pas de replay (US-05)** — L'icône ⏰ sur `TaskRow` (racine et sous-tâche) ouvre un popover `<input type="time">` (`components/combat/DeadlineControl.tsx`) qui fixe/modifie/efface `tasks.deadline_at` (colonne déjà existante en base, aucune migration). La conversion heure locale ↔ ISO passe par `deadlineIso`/`localTimeFromIso` (`lib/game-engine.ts`, même trick d'offset que `dayKey`, DST-aware). Le franchissement d'une deadline est détecté par un **polling client** (`Arena.tsx`, ~45s, uniquement pendant que l'Arène est montée) : `missedDeadlineTasks` recalcule à chaque tick, et seules les tâches **nouvellement** franchies (suivies via un `Set` de refs, pas de comparaison d'égalité de tableau) déclenchent l'animation « Attaque Surprise » (clignotement de la jauge Héros + `FloatingText` `anchor="hero"` + toast « Repousser +1h »). **Pas de replay au chargement** : les deadlines déjà ratées avant l'ouverture de l'app sont incluses dans le calcul HP dès le premier rendu mais ne redéclenchent jamais l'animation. **Le report du Réveil (US-08) efface la deadline** (`deferOverdueTask`/`deferAllOverdue` posent `deadline_at: null`) pour éviter de cumuler le malus -10 (deadline ratée) avec le malus -20 (retard reporté) déjà appliqué sur la même tâche.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: mettre à jour CLAUDE.md pour le pool HP pondéré et les deadlines (US-05)"
```

---

### Task 15: Vérification locale complète avant PR

**Files:** aucun (validation uniquement)

**Interfaces:**
- Consumes: tout ce qui précède.
- Produces: confiance que la CI passera.

- [ ] **Step 1: Lint**

Run: `npm run lint`
Expected: 0 erreur.

- [ ] **Step 2: Tests unitaires**

Run: `npm test`
Expected: PASS, toute la suite `lib/**` (y compris les nouveaux tests des Tasks 1-3).

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build Next.js réussi sans erreur.

- [ ] **Step 4: e2e complet**

Run: `npm run e2e`
Expected: PASS, l'intégralité de la suite (y compris `e2e/deadlines.spec.ts` et la non-régression des suites existantes).

- [ ] **Step 5: Commit (uniquement si un correctif a été nécessaire)**

```bash
git add -A
git commit -m "fix: corrections suite à la vérification locale complète (US-05)"
```

> Si aucune correction n'a été nécessaire, ne pas créer de commit vide — passer directement à la tâche suivante.

---

### Task 16: Bilan et clôture de l'issue GitHub #18

**Files:** aucun (GitHub uniquement)

**Interfaces:**
- Consumes: rien.
- Produces: rien.

- [ ] **Step 1: Poster un commentaire de bilan sur l'issue #18**

```bash
gh issue comment 18 --body "$(cat <<'EOF'
Implémenté (US-05 — Deadlines horaires / Attaques surprises du Boss) :

- Icône ⏰ sur chaque tâche (racine et sous-tâche) : popover `<input type="time">` pour fixer/modifier/effacer `tasks.deadline_at` (colonne déjà existante, aucune migration).
- `calculateHeroHp` (lib/game-engine.ts) accepte désormais un poids par tâche : -20 HP pour un retard reporté (US-08, inchangé), -10 HP pour une deadline horaire ratée et non résolue (nouveau).
- Détection du franchissement par polling client léger (~45s, uniquement pendant que l'Arène est montée) — pas de replay au chargement pour les deadlines déjà ratées avant l'ouverture de l'app.
- Animation "Attaque Surprise" : jauge Héros qui clignote + texte flottant "-10 HP" + bouton "Repousser +1h" (repousse à maintenant + 1h).
- Badge agrégé "N deadlines à venir aujourd'hui" près de la jauge Boss.
- Auto-résolution en cochant/abandonnant la tâche (recalcul pur, instantané).
- Le report d'une tâche via le Rituel du Réveil efface sa deadline pour éviter un cumul de malus.
- Manuel du Dojo, CHANGELOG et CLAUDE.md mis à jour.

Couverture de tests : Vitest exhaustif sur toute la logique pure (pool pondéré, détection, conversion heure ↔ ISO) + 2 tests e2e Playwright ciblés sur le flux UI du popover. Pas de test e2e sur le polling temps réel (fragile/temporisé), assumé et documenté dans le design.
EOF
)"
```

- [ ] **Step 2: Créer la PR avec `Closes #18`**

```bash
gh pr create --title "feat: US-05 Deadlines horaires (Attaques surprises du Boss)" --body "$(cat <<'EOF'
## Résumé
- Icône ⏰ sur chaque tâche (popover heure limite) ; deadline ratée non résolue = -10 HP au pool Héros existant (poids désormais distinct par tâche : -20 overdue / -10 deadline).
- Détection par polling client (~45s, Arène montée) → animation "Attaque Surprise" (jauge Héros clignote, FloatingText -10 HP, bouton "Repousser +1h").
- Badge agrégé des deadlines à venir près de la jauge Boss ; auto-résolution en cochant/abandonnant ; deadline effacée au report (Rituel du Réveil).

## Test plan
- [x] `npm run lint`
- [x] `npm test` (Vitest, lib/game-engine.test.ts étendu)
- [x] `npm run build`
- [x] `npm run e2e` (dont `e2e/deadlines.spec.ts`)

Closes #18
EOF
)"
```

- [ ] **Step 3: Confirmer la création**

Run: `gh pr view --json url,title`
Expected: la PR est bien créée, titre correct, `Closes #18` présent dans le corps.

---

## Self-Review (fait par l'auteur du plan)

**Couverture spec (design US-05) :**
- Icône ⏰ sur `TaskRow` racine et sous-tâche → Task 6, 7.
- Popover `<input type="time">`, fixer/modifier/effacer → Task 6.
- Badge agrégé "N deadlines à venir" → Task 2 (fonction pure), Task 10 (UI).
- -10 HP distinct de -20 HP, poids par tâche → Task 1.
- Auto-résolution (cocher/abandonner) → propriété intrinsèque de la fonction pure (Task 1/2), pas de code de restauration séparé nécessaire.
- Deadline effacée au report (Réveil) → Task 5.
- Détection polling ~30-60s, pas de replay au chargement → Task 11.
- Animation Attaque Surprise (clignotement jauge, FloatingText, bouton Repousser +1h) → Task 9, 11.
- Edge case sous-tâche → géré génériquement (DeadlineControl indépendant du niveau de nesting).
- Edge case tâche abandonnée → déjà filtré par `calculateHeroHp`/`missedDeadlineTasks` (`!is_abandoned`).
- Tests Vitest (overdue seul, deadline seule, combiné, plancher 0, résolution) → Task 1.
- Test Vitest détection deadline dépassée → Task 2.
- Test e2e ciblé popover (pas de test polling) → Task 8.
- Manuel du Dojo → Task 12.
- CHANGELOG → Task 13.
- CLAUDE.md (piège HP + nouveau piège deadlines) → Task 14.
- Bilan issue #18 + `Closes #18` → Task 16.

**Scan placeholders :** aucun "TBD"/"similaire à la tâche N" — chaque step contient le code complet.

**Cohérence des types :** `HeroHpPenaltyTask`, `OverdueTask`, `DeadlineTask`, `calculateHeroHp`, `overdueHpPenalties`, `deadlineHpPenalties`, `missedDeadlineTasks`, `upcomingDeadlineCount`, `deadlineIso`, `localTimeFromIso` utilisés avec la même signature partout où ils réapparaissent (Tasks 4, 7, 11).