# Issue #111 — Tâche cochée déplacée en dernière position — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quand une tâche est cochée, elle passe automatiquement en dernière position parmi les tâches de sa fratrie (évite de scroller sur une longue liste). Une nouvelle tâche s'ajoute en dernière position **parmi les non-cochées** (au-dessus des complétées). Le drag & drop manuel reste inchangé et prioritaire sur ces deux règles automatiques.

**Architecture:** Aucune migration, aucune nouvelle colonne. Le champ `tasks.position` existe déjà et est déjà réordonné en masse par l'action serveur `reorderSiblings` (utilisée aujourd'hui par le drag & drop). On réutilise cette même action : deux nouvelles fonctions pures dans `lib/game-engine.ts` calculent le nouvel ordre d'une fratrie (liste d'ids déjà triée) après un changement d'état de complétion ou un ajout, en ne déplaçant **que** l'élément concerné — tout le reste de l'ordre existant (y compris un réordonnancement manuel antérieur) est préservé tel quel. Le résultat est passé à `reorderSiblingsAction`, exactement comme le fait déjà `handleDragEnd`.

**Tech Stack:** TypeScript, Vitest, Next.js Server Actions (Supabase).

## Global Constraints

- RG-01 : une sous-tâche ne peut jamais recevoir d'enfant (déjà géré par `isNestableParent`/`reorderSiblings`, non affecté ici).
- Toute logique de calcul de jeu/ordre réside dans `lib/game-engine.ts`, testée sans dépendance UI (règle de code n°2 du projet).
- Zéro DELETE, zéro perte de données — cette feature ne touche que `position`, jamais `is_completed`/`is_abandoned`.
- Convention Commits : `feat: description courte`.
- Toute PR livrant un changement visible utilisateur ajoute une ligne sous `## [Unreleased]` de `CHANGELOG.md` dans le même commit.
- **Note de coordination :** ce plan et celui de l'issue #115 modifient tous les deux `components/combat/Arena.tsx` (fonction `handleToggle`). S'ils sont exécutés sur des branches séparées, la seconde branche mergée devra rebaser son diff sur `handleToggle` en tenant compte des deux changements.

---

### Task 1 : Fonctions pures de réordonnancement (`lib/game-engine.ts`)

**Files:**
- Modify: `lib/game-engine.ts` (ajouter après `planReorder`, ligne ~131)
- Test: `lib/game-engine.test.ts` (ajouter après le `describe("nextSiblingPosition (US-04/US-19)", ...)`, ligne ~630)

**Interfaces:**
- Consumes : `ToggleCascadeEntry` (déjà défini `lib/game-engine.ts:133-136`), `CascadeTask`/`Task` fields `id`/`parent_id`/`position`/`is_completed`/`is_abandoned`.
- Produces :
  - `reorderAfterCompletionToggle(orderedIds: string[], toggledId: string, isCompleted: boolean, completedIds: Set<string>): string[]`
  - `insertNewActiveTaskId(orderedIds: string[], newId: string, completedIds: Set<string>): string[]`
  - `export interface CompletionReorderPlan { parentId: string | null; orderedTaskIds: string[] }`
  - `planCompletionReorder(allTasks: ReorderableCompletionTask[], cascade: ToggleCascadeEntry[]): CompletionReorderPlan[]`
  - `export type ReorderableCompletionTask = Pick<Task, "id" | "parent_id" | "position" | "is_completed" | "is_abandoned">`

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter dans `lib/game-engine.test.ts`, après le bloc `describe("nextSiblingPosition (US-04/US-19)", ...)` (ligne ~630), et ajouter les noms à l'import en haut du fichier (`reorderAfterCompletionToggle`, `insertNewActiveTaskId`, `planCompletionReorder`) :

```ts
describe("reorderAfterCompletionToggle (issue #111)", () => {
  test("cocher : la tâche part en toute dernière position", () => {
    const result = reorderAfterCompletionToggle(
      ["a", "b", "c"],
      "a",
      true,
      new Set(["a"]),
    );
    expect(result).toEqual(["b", "c", "a"]);
  });

  test("cocher : préserve l'ordre relatif des autres tâches, y compris un réordonnancement manuel préexistant", () => {
    // "c" (complétée) a déjà été manuellement placée en tête par un drag.
    const result = reorderAfterCompletionToggle(
      ["c", "a", "b"],
      "b",
      true,
      new Set(["c", "b"]),
    );
    expect(result).toEqual(["c", "a", "b"]);
  });

  test("décocher : revient en dernière position parmi les actives (juste avant la première complétée)", () => {
    const result = reorderAfterCompletionToggle(
      ["a", "b", "c"],
      "b",
      false,
      new Set(["c"]),
    );
    expect(result).toEqual(["a", "b", "c"]);
  });

  test("décocher : s'insère avant la première complétée même si elle n'est pas en dernière position (override drag préexistant)", () => {
    // "c" (complétée) a été draguée manuellement au-dessus de "a" (active).
    const result = reorderAfterCompletionToggle(
      ["c", "a", "b"],
      "b",
      false,
      new Set(["c"]),
    );
    expect(result).toEqual(["c", "b", "a"]);
  });

  test("décocher sans aucune tâche complétée restante : va en toute fin", () => {
    const result = reorderAfterCompletionToggle(["a", "b"], "a", false, new Set());
    expect(result).toEqual(["b", "a"]);
  });
});

describe("insertNewActiveTaskId (issue #111)", () => {
  test("aucune tâche complétée : la nouvelle tâche va en toute fin (comportement inchangé)", () => {
    const result = insertNewActiveTaskId(["a", "b"], "new", new Set());
    expect(result).toEqual(["a", "b", "new"]);
  });

  test("des tâches complétées existent : la nouvelle tâche s'insère juste avant la première", () => {
    const result = insertNewActiveTaskId(["a", "b"], "new", new Set(["b"]));
    expect(result).toEqual(["a", "new", "b"]);
  });
});

describe("planCompletionReorder (issue #111)", () => {
  test("toggle d'une racine sans enfants : un seul plan, pour le groupe racine", () => {
    const tasks: ReorderableCompletionTask[] = [
      { id: "a", parent_id: null, position: 0, is_completed: false, is_abandoned: false },
      { id: "b", parent_id: null, position: 1, is_completed: true, is_abandoned: false },
    ];
    const cascade = [{ taskId: "a", isCompleted: true }];
    const plans = planCompletionReorder(tasks, cascade);
    expect(plans).toEqual([{ parentId: null, orderedTaskIds: ["b", "a"] }]);
  });

  test("toggle d'une racine avec cascade sur ses enfants : deux plans (groupe racine + groupe enfants)", () => {
    const tasks: ReorderableCompletionTask[] = [
      { id: "root", parent_id: null, position: 0, is_completed: false, is_abandoned: false },
      { id: "sibling", parent_id: null, position: 1, is_completed: true, is_abandoned: false },
      { id: "child1", parent_id: "root", position: 0, is_completed: false, is_abandoned: false },
      { id: "child2", parent_id: "root", position: 1, is_completed: false, is_abandoned: false },
    ];
    const cascade = [
      { taskId: "root", isCompleted: true },
      { taskId: "child1", isCompleted: true },
      { taskId: "child2", isCompleted: true },
    ];
    const plans = planCompletionReorder(tasks, cascade);
    expect(plans).toContainEqual({ parentId: null, orderedTaskIds: ["sibling", "root"] });
    expect(plans).toContainEqual({ parentId: "root", orderedTaskIds: ["child1", "child2"] });
  });

  test("cascade vide : aucun plan", () => {
    expect(planCompletionReorder([], [])).toEqual([]);
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test -- lib/game-engine.test.ts -t "issue #111"`
Expected: FAIL avec "reorderAfterCompletionToggle is not defined" (ou équivalent import manquant).

- [ ] **Step 3: Implémenter les fonctions**

Ajouter dans `lib/game-engine.ts`, juste après la fonction `planReorder` (après la ligne `130` / avant l'accolade fermante actuelle de `planReorder`, donc après tout le bloc `planReorder` existant) :

```ts
// Issue #111 : déplace UNE SEULE tâche (celle qui vient de changer d'état)
// dans la liste ordonnée de sa fratrie, sans toucher à l'ordre relatif des
// autres — y compris un réordonnancement manuel préexistant (drag & drop),
// qui reste donc toujours prioritaire sur cette règle automatique. Cocher =
// va en toute dernière position. Décocher = revient juste avant la première
// tâche encore complétée (ou en toute fin s'il n'y en a plus).
function spliceBeforeFirstCompleted(
  ids: string[],
  insertId: string,
  completedIds: Set<string>,
): string[] {
  const firstCompletedIndex = ids.findIndex((id) => completedIds.has(id));
  const insertAt = firstCompletedIndex === -1 ? ids.length : firstCompletedIndex;
  return [...ids.slice(0, insertAt), insertId, ...ids.slice(insertAt)];
}

export function reorderAfterCompletionToggle(
  orderedIds: string[],
  toggledId: string,
  isCompleted: boolean,
  completedIds: Set<string>,
): string[] {
  const withoutToggled = orderedIds.filter((id) => id !== toggledId);
  if (isCompleted) {
    return [...withoutToggled, toggledId];
  }
  return spliceBeforeFirstCompleted(withoutToggled, toggledId, completedIds);
}

// Issue #111 : position d'une tâche nouvellement créée — dernière position
// parmi les non-cochées (juste avant la première tâche complétée). Identique
// au comportement existant (ajout en toute fin) quand la fratrie n'a aucune
// tâche complétée.
export function insertNewActiveTaskId(
  orderedIds: string[],
  newId: string,
  completedIds: Set<string>,
): string[] {
  return spliceBeforeFirstCompleted(orderedIds, newId, completedIds);
}

export type ReorderableCompletionTask = Pick<
  Task,
  "id" | "parent_id" | "position" | "is_completed" | "is_abandoned"
>;

export interface CompletionReorderPlan {
  parentId: string | null;
  orderedTaskIds: string[];
}

// Issue #111 : à partir d'une cascade de complétion (`computeToggleCascade`),
// calcule le nouvel ordre de chaque fratrie touchée (le groupe racine et/ou
// le groupe des sous-tâches d'un parent précis — une cascade ne peut toucher
// que ces deux groupes au maximum, RG-01). Chaque tâche de la cascade est
// déplacée une à une (dans l'ordre de la cascade) via
// `reorderAfterCompletionToggle`, ce qui préserve l'ordre relatif de tout le
// reste de la fratrie.
export function planCompletionReorder(
  allTasks: ReorderableCompletionTask[],
  cascade: ToggleCascadeEntry[],
): CompletionReorderPlan[] {
  if (cascade.length === 0) return [];

  const byId = new Map(allTasks.map((task) => [task.id, task]));
  const nextCompletedById = new Map(cascade.map((c) => [c.taskId, c.isCompleted]));
  const isCompletedAfter = (task: ReorderableCompletionTask) =>
    nextCompletedById.get(task.id) ?? task.is_completed;

  const groupsTouched = new Set<string | null>();
  for (const change of cascade) {
    const task = byId.get(change.taskId);
    if (task) groupsTouched.add(task.parent_id);
  }

  const plans: CompletionReorderPlan[] = [];
  for (const parentId of groupsTouched) {
    const groupTasks = allTasks.filter(
      (task) => task.parent_id === parentId && !task.is_abandoned,
    );
    let orderedIds = [...groupTasks]
      .sort((a, b) => a.position - b.position)
      .map((task) => task.id);

    const completedIds = new Set(
      groupTasks.filter(isCompletedAfter).map((task) => task.id),
    );

    for (const change of cascade) {
      const task = byId.get(change.taskId);
      if (!task || task.parent_id !== parentId) continue;
      orderedIds = reorderAfterCompletionToggle(
        orderedIds,
        change.taskId,
        change.isCompleted,
        completedIds,
      );
    }

    plans.push({ parentId, orderedTaskIds: orderedIds });
  }

  return plans;
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test -- lib/game-engine.test.ts -t "issue #111"`
Expected: PASS.

Run: `npm test`
Expected: PASS, 0 échec (aucune fonction existante modifiée).

- [ ] **Step 5: Commit**

```bash
git add lib/game-engine.ts lib/game-engine.test.ts
git commit -m "feat: fonctions pures de réordonnancement auto des tâches cochées (issue #111)"
```

---

### Task 2 : Auto-repositionnement au check/uncheck (`components/combat/Arena.tsx`)

**Files:**
- Modify: `components/combat/Arena.tsx:47` (imports depuis `@/lib/game-engine`), `:588-666` (fonction `handleToggle`)

**Interfaces:**
- Consumes: `planCompletionReorder`, `reorderAfterCompletionToggle` (Task 1) ; `reorderSiblingsAction` (déjà importé `Arena.tsx:64`, signature `(parentId: string | null, orderedTaskIds: string[]) => Promise<TaskActionResult>`).
- Produces: aucune nouvelle fonction exportée — comportement de `handleToggle` étendu.

- [ ] **Step 1: Importer les nouvelles fonctions**

Dans `components/combat/Arena.tsx`, ajouter `planCompletionReorder` à l'import existant depuis `@/lib/game-engine` (ligne 41, à côté de `nextSiblingPosition`) :

```ts
  nextSiblingPosition,
  planCompletionReorder,
  planReorder,
```

- [ ] **Step 2: Appliquer le nouvel ordre en optimiste, puis persister en best-effort après la complétion**

Dans `handleToggle` (`components/combat/Arena.tsx`), la section actuelle (lignes 588-594) :

```ts
    const nextCompletionById = new Map(cascade.map((c) => [c.taskId, c.isCompleted]));
    const nextTasks = tasks.map((task) => {
      const nextCompleted = nextCompletionById.get(task.id);
      return nextCompleted === undefined ? task : { ...task, is_completed: nextCompleted };
    });

    setTasks(nextTasks);
```

devient (calcule les plans de réordonnancement AVANT de construire `nextTasks`, pour appliquer position ET is_completed en un seul `setTasks`, sans flash intermédiaire) :

```ts
    const reorderPlans = planCompletionReorder(tasks, cascade);
    const positionByTaskId = new Map<string, number>();
    for (const plan of reorderPlans) {
      plan.orderedTaskIds.forEach((id, index) => positionByTaskId.set(id, index));
    }

    const nextCompletionById = new Map(cascade.map((c) => [c.taskId, c.isCompleted]));
    const nextTasks = tasks.map((task) => {
      const nextCompleted = nextCompletionById.get(task.id);
      const nextPosition = positionByTaskId.get(task.id);
      return {
        ...task,
        is_completed: nextCompleted === undefined ? task.is_completed : nextCompleted,
        position: nextPosition === undefined ? task.position : nextPosition,
      };
    });

    setTasks(nextTasks);
```

Puis, juste après le bloc qui gère le résultat serveur de la cascade de complétion — repérer dans `handleToggle` la section (vers la ligne 662-681 dans le fichier actuel) :

```ts
    let lastResult: Awaited<ReturnType<typeof setTaskCompletedAction>> | null = null;
    for (const change of cascade) {
      lastResult = await setTaskCompletedAction(change.taskId, change.isCompleted);
      if (lastResult.error) break;
    }

    if (lastResult?.error) {
      setTasks(previousTasksSnapshot);
      setProfile(previousProfileSnapshot);
      setLevelUpValue(null);
      if (hpDelta > 0) setKoState(null);
      resetCombo();
      setBanner(lastResult.error);
      return;
    }

    const { level, xp } = lastResult ?? {};
    if (level !== undefined && xp !== undefined) {
      setProfile((current) => ({ ...current, level, xp }));
    }
```

Ajouter juste après ce bloc (avant le `} finally {`), le déclenchement best-effort du réordonnancement persistant — une erreur ici ne doit ni bloquer ni faire rollback de la complétion déjà confirmée (c'est un "bonus" au sens de l'issue), seule la position optimiste est annulée si l'appel échoue :

```ts
    // Issue #111 : persistance best-effort du nouvel ordre. Un échec ici ne
    // remet pas en cause la complétion déjà confirmée (c'est un bonus visuel,
    // pas une règle métier critique) — seule la position optimiste de ce
    // groupe est restaurée si l'appel échoue.
    for (const plan of reorderPlans) {
      void reorderSiblingsAction(plan.parentId, plan.orderedTaskIds).then((result) => {
        if (result.error) {
          setTasks((current) =>
            current.map((task) => {
              const previous = previousTasksSnapshot.find((t) => t.id === task.id);
              return previous && task.parent_id === plan.parentId
                ? { ...task, position: previous.position }
                : task;
            }),
          );
        }
      });
    }
```

- [ ] **Step 3: Lancer la suite de tests existante (non-régression)**

Run: `npm test`
Expected: PASS, 0 échec.

Run: `npx tsc --noEmit`
Expected: 0 erreur.

- [ ] **Step 4: Vérification manuelle en dev**

Run: `npm run dev`
Dans le navigateur : ajouter 3 tâches, cocher la première → elle doit passer en dernière position sans scroll. Décocher-la → elle revient juste avant les autres tâches complétées (ou en fin de liste si aucune). Ajouter une 4ᵉ tâche pendant qu'une est cochée → elle doit apparaître au-dessus de la tâche cochée. Vérifier qu'un drag & drop manuel d'une tâche cochée au-dessus d'une active reste bien en place après un nouveau cochage/décochage d'une autre tâche du même groupe.

- [ ] **Step 5: Commit**

```bash
git add components/combat/Arena.tsx
git commit -m "feat: déplace automatiquement une tâche cochée en dernière position (issue #111)"
```

---

### Task 3 : Nouvelle tâche insérée au-dessus des complétées

**Files:**
- Modify: `components/combat/Arena.tsx:466-550` (`handleAdd`, `handleAddSubtask`)

**Interfaces:**
- Consumes: `insertNewActiveTaskId` (Task 1), `reorderSiblingsAction` (déjà importé).
- Produces: aucune nouvelle fonction exportée.

- [ ] **Step 1: Importer `insertNewActiveTaskId`**

Ajouter à l'import `@/lib/game-engine` (à côté de `nextSiblingPosition`) :

```ts
  insertNewActiveTaskId,
```

- [ ] **Step 2: Après confirmation serveur de l'ajout, réordonner si des tâches complétées existent déjà**

Dans `handleAdd` (`components/combat/Arena.tsx:490-507`), la fin de la fonction :

```ts
    void addTaskAction(title).then((result) => {
      setIsAdding(false);
      if (result.error) {
        setTasks((prev) => prev.filter((task) => task.id !== optimisticTask.id));
        setBanner(result.error);
        return;
      }
      // Remplace l'id optimiste par l'id réel : toute action ultérieure sur
      // cette tâche (sous-tâche, drag & drop) a besoin du vrai UUID côté serveur.
      if (result.id) {
        const realId = result.id;
        setTasks((prev) =>
          prev.map((task) =>
            task.id === optimisticTask.id ? { ...task, id: realId } : task,
          ),
        );
      }
    });
```

devient (on ne réordonne que s'il y a au moins une tâche racine déjà complétée — sinon la position par défaut, déjà en toute fin, est déjà correcte et on évite un aller-retour réseau inutile) :

```ts
    void addTaskAction(title).then((result) => {
      setIsAdding(false);
      if (result.error) {
        setTasks((prev) => prev.filter((task) => task.id !== optimisticTask.id));
        setBanner(result.error);
        return;
      }
      // Remplace l'id optimiste par l'id réel : toute action ultérieure sur
      // cette tâche (sous-tâche, drag & drop) a besoin du vrai UUID côté serveur.
      if (result.id) {
        const realId = result.id;
        setTasks((prev) =>
          prev.map((task) =>
            task.id === optimisticTask.id ? { ...task, id: realId } : task,
          ),
        );

        // Issue #111 : si des tâches racines sont déjà complétées, place la
        // nouvelle tâche juste au-dessus d'elles plutôt qu'en toute fin.
        const completedRootIds = new Set(
          roots.filter((task) => task.is_completed).map((task) => task.id),
        );
        if (completedRootIds.size > 0) {
          const orderedIds = insertNewActiveTaskId(
            roots.map((task) => task.id),
            realId,
            completedRootIds,
          );
          const previousSnapshot = tasks;
          setTasks((prev) => {
            const positionByTaskId = new Map(orderedIds.map((id, index) => [id, index]));
            return prev.map((task) => {
              const position = positionByTaskId.get(task.id);
              return position === undefined ? task : { ...task, position };
            });
          });
          void reorderSiblingsAction(null, orderedIds).then((reorderResult) => {
            if (reorderResult.error) setTasks(previousSnapshot);
          });
        }
      }
    });
```

- [ ] **Step 3: Même traitement pour les sous-tâches**

Dans `handleAddSubtask` (`components/combat/Arena.tsx:534-549`), appliquer le même changement, en remplaçant `roots`/`null` par `siblings`/`parentId` (variables déjà présentes dans `handleAddSubtask`, cf. ligne 512 `const siblings = tasks.filter((task) => task.parent_id === parentId)`) :

```ts
    void addSubtaskAction(parentId, title).then((result) => {
      setAddingSubtaskParentId(null);
      if (result.error) {
        setTasks((prev) => prev.filter((task) => task.id !== optimisticTask.id));
        setBanner(result.error);
        return;
      }
      if (result.id) {
        const realId = result.id;
        setTasks((prev) =>
          prev.map((task) =>
            task.id === optimisticTask.id ? { ...task, id: realId } : task,
          ),
        );

        const completedSiblingIds = new Set(
          siblings.filter((task) => task.is_completed).map((task) => task.id),
        );
        if (completedSiblingIds.size > 0) {
          const orderedIds = insertNewActiveTaskId(
            siblings.map((task) => task.id),
            realId,
            completedSiblingIds,
          );
          const previousSnapshot = tasks;
          setTasks((prev) => {
            const positionByTaskId = new Map(orderedIds.map((id, index) => [id, index]));
            return prev.map((task) => {
              const position = positionByTaskId.get(task.id);
              return position === undefined ? task : { ...task, position };
            });
          });
          void reorderSiblingsAction(parentId, orderedIds).then((reorderResult) => {
            if (reorderResult.error) setTasks(previousSnapshot);
          });
        }
      }
    });
```

- [ ] **Step 4: Lancer la suite de tests + vérification manuelle**

Run: `npm test`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: 0 erreur.

Dans `npm run dev` : cocher une tâche, puis ajouter une nouvelle tâche → elle doit apparaître au-dessus de la tâche cochée, pas en dessous.

- [ ] **Step 5: Changelog + commit**

Ajouter dans `CHANGELOG.md` sous `## [Unreleased]` :

```markdown
- feat: une tâche cochée est déplacée en dernière position, une nouvelle tâche s'ajoute au-dessus des tâches déjà complétées (issue #111)
```

```bash
git add components/combat/Arena.tsx CHANGELOG.md
git commit -m "feat: nouvelle tâche insérée au-dessus des tâches complétées (issue #111)"
```

---

## Self-Review

**Spec coverage :**
- "Tâche cochée → dernière position" → Task 2.
- "Nouvelle tâche → dernière position parmi les non cochées" → Task 3.
- "Drag & drop toujours possible, override tout" → garanti par construction (Task 1 : `reorderAfterCompletionToggle`/`insertNewActiveTaskId` ne déplacent que l'élément concerné, jamais les autres — un ordre issu d'un drag manuel antérieur est donc toujours respecté pour tout le reste de la fratrie), testé explicitement (test "override drag préexistant").

**Placeholder scan :** aucun — code complet fourni à chaque étape.

**Type consistency :** `CompletionReorderPlan` a la même forme que `ReorderPlan` (`parentId`/`orderedTaskIds`) déjà utilisée par `reorderSiblingsAction`, donc directement compatible sans adaptateur. `ReorderableCompletionTask` reprend exactement les champs `Pick<Task, ...>` déjà utilisés par `CascadeTask`/`ReorderableTask` dans le fichier.
