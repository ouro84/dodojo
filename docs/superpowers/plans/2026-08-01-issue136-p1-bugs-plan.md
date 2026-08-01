# Issue #136 — P1 bugs (#144, #145, #146) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corriger les 3 sub-issues P1 de l'issue #136 (Dodojo) — régression de l'ordre des tâches (#144), positionnement héros/boss incohérent mobile/desktop (#145), animations de combat jouées en double/incorrectes/overlay trop précoce (#146) — dans une seule PR.

**Architecture:** #144 introduit une file de sérialisation par clé (`lib/async-queue.ts`, module pur testable isolément) pour éliminer une race condition sur les écritures de position ; #145 remplace un positionnement CSS absolu par un layout flex dans `VersusScene.tsx` ; #146 combine un fix déjà déterminé (délai overlay), une hypothèse forte à vérifier en live (double-invocation React StrictMode dans `SpriteAnimator.tsx`) et une investigation ouverte (mauvaise anim au décochage).

**Tech Stack:** Next.js 16 (App Router), TypeScript strict, Tailwind CSS v4, Supabase, Vitest, Playwright.

## Global Constraints

- **Une seule PR pour les 3 issues** (décision explicite de l'utilisateur — déroge à la convention habituelle du repo, qui est 1 PR par sub-issue ; assumé, à mentionner dans la description de la PR).
- Branche unique : `fix/issue-144-145-146-p1-bugs` (déjà créée, contient uniquement le commit du spec design pour l'instant).
- **`main` est protégée. Aucun commit direct.** Tout le travail se fait sur la branche ci-dessus.
- **TypeScript strict, interdiction d'`any`.**
- **Aucune suppression destructive en base** (`is_abandoned`/`is_completed` uniquement, jamais de `DELETE` SQL) — non pertinent pour ce plan (aucune des 3 issues ne touche au schéma), mais à garder en tête si l'investigation #146 révèle un besoin de migration (peu probable).
- **Zéro merge si la CI est rouge. Zéro push tant que les tests (Vitest + Playwright e2e) n'ont pas été passés en local.**
- Toute PR qui livre un fix/feature ajoute sa ligne sous `## [Unreleased]` de `CHANGELOG.md`, dans le même commit que l'implémentation.
- Commits : Conventional Commits (`fix:`, `test:`, `docs:`, `chore:`).
- **Ne JAMAIS merger la PR automatiquement** — la création de la PR est le dernier livrable de ce plan, le merge nécessite une validation humaine explicite et séparée.
- Avant de commencer : lire en entier `CLAUDE.md` et `AGENTS.md` à la racine du repo (conventions projet, pièges déjà documentés — en particulier la section sur les sprites de combat, qui documente déjà des pièges réels sur `CharacterSprite.tsx`/`SpriteAnimator.tsx`), et le spec design complet : `docs/superpowers/specs/2026-08-01-issue136-p1-bugs-design.md`.

---

## Ordre de traitement

1. **Setup** (Task 0)
2. **#144** (Tasks 1-2) — diagnostic puis fix, isolé de #146 malgré le fichier partagé
3. **#146** (Tasks 3-5) — investigation, fix overlay (déterminé), fix double-anim (hypothèse à vérifier)
4. **#145** (Task 6) — refactor layout, indépendant des deux précédents
5. **Clôture** (Tasks 7-9) — CHANGELOG, tests complets, fermeture des issues + PR

#144 et #146 touchent tous les deux `components/combat/Arena.tsx` : traités en série (jamais en parallèle) pour éviter tout conflit. #145 ne touche que `components/combat/VersusScene.tsx`, peut être fait à tout moment de la séquence mais reste sur la même branche/PR.

---

### Task 0: Setup de session

**Files:** aucun fichier modifié dans cette tâche.

- [ ] **Step 1: Lire le contexte projet**

Lire dans l'ordre :
1. `CLAUDE.md` (racine du repo) — conventions, pièges déjà documentés, section "Sprites de combat" en particulier.
2. `AGENTS.md` (racine du repo) — rappel que ce Next.js diffère du Next.js standard, lire `node_modules/next/dist/docs/` si un doute apparaît sur une API.
3. `docs/superpowers/specs/2026-08-01-issue136-p1-bugs-design.md` — le spec complet que ce plan implémente.

- [ ] **Step 2: Checkout de la branche et vérification de l'état**

```bash
git status
git checkout fix/issue-144-145-146-p1-bugs
git log --oneline -3
```

Attendu : la branche existe déjà, `HEAD` pointe sur un commit `docs: plan d'investigation/design...`, working tree propre.

- [ ] **Step 3: Baseline — vérifier que la suite de tests passe avant toute modification**

```bash
npm run lint
npx tsc --noEmit
npm run test
```

Attendu : tout vert. Si quelque chose est déjà rouge sur cette branche avant tout changement, **s'arrêter et signaler** — ne pas continuer sur une base cassée sans en avertir l'utilisateur.

Ne PAS lancer la suite Playwright e2e complète à cette étape (elle build+démarre un serveur de prod, coûteux) — elle sera lancée une seule fois à la Task 8, une fois tous les fix en place.

---

### Task 1: #144 — Diagnostic ciblé avant fix

**Contexte :** Bug confirmé par l'utilisateur, 100% reproductible :
- Cocher une tâche racine : elle descend, mais pas nécessairement jusqu'en bas (comportement variable).
- Ajouter une tâche alors que des tâches racines sont déjà cochées : la nouvelle tâche atterrit **toujours en toute dernière position**, jamais insérée au-dessus des tâches terminées.

Le spec pose comme hypothèse principale une race condition sur les écritures de position (cf. section #144 du spec). Cette tâche vérifie d'abord un point précis avant d'implémenter le fix.

**Files:**
- Modifier temporairement (non commité) : `components/combat/Arena.tsx:791`

**Interfaces:**
- Consomme : rien (diagnostic manuel, pas de nouveau code de prod).
- Produit : une conclusion écrite (dans la description de la PR finale, Task 9) sur si le guard `completedRootIds.size > 0` se déclenche ou non dans le scénario de repro.

- [ ] **Step 1: Ajouter un log temporaire**

Dans `components/combat/Arena.tsx`, fonction `handleAdd`, juste avant la ligne (actuellement ~791) :

```ts
        const completedRootIds = new Set(
          roots.filter((task) => task.is_completed).map((task) => task.id),
        );
```

Ajouter juste après cette déclaration :

```ts
        console.log("[DEBUG #144] completedRootIds.size =", completedRootIds.size, "roots =", roots.map((r) => ({ id: r.id, title: r.title, is_completed: r.is_completed })));
```

- [ ] **Step 2: Lancer le serveur dev et reproduire**

```bash
npm run dev
```

Dans le navigateur (localhost:3000, connecté avec le compte de dev habituel) :
1. Créer 2 tâches racines : "Tâche A", "Tâche B".
2. Cocher "Tâche A" (elle doit passer en `is_completed = true`).
3. Ajouter une nouvelle tâche "Tâche C".
4. Observer la console du navigateur (DevTools) : chercher la ligne `[DEBUG #144] completedRootIds.size = ...`.

- [ ] **Step 3: Interpréter le résultat — point de décision**

- **Si `completedRootIds.size` vaut bien `1`** (ou plus, cohérent avec le nombre réel de tâches cochées) au moment de l'ajout : le guard se déclenche correctement. La cause de "toujours en bas" est donc bien en aval (écriture serveur écrasée par une race, comme dans le scénario de cochage) → passer directement à la Task 2, le même fix de sérialisation couvrira les deux symptômes.
- **Si `completedRootIds.size` vaut `0`** alors qu'une tâche est visiblement cochée à l'écran : le guard ne se déclenche jamais, cause différente et antérieure à la race condition (ex: `roots` ne reflète pas l'état réel, ou `is_completed` mal lu). Dans ce cas : **ne pas implémenter le fix de sérialisation de la Task 2 sans l'adapter** — investiguer `roots` (ligne ~748 de `Arena.tsx`, `const roots = tasks.filter((task) => task.parent_id === null && !task.is_abandoned);`) en loggant aussi `tasks.filter(t => t.parent_id === null)` juste avant, pour voir si `is_completed` y est bien à `true`. Documenter la conclusion réelle dans la description de PR (Task 9) — ce plan ne peut pas deviner à l'avance un fix pour une cause non confirmée.

- [ ] **Step 4: Retirer le log temporaire**

```bash
git diff components/combat/Arena.tsx
```

Vérifier qu'aucun `console.log("[DEBUG #144]"...)` ne reste, revert le fichier si besoin :

```bash
git checkout -- components/combat/Arena.tsx
```

(Rien n'est commité à cette étape — c'est un diagnostic pur, pas un step avec commit.)

---

### Task 2: #144 — Fix : sérialisation des écritures de position par groupe

**Prérequis :** Task 1 complétée, guard confirmé fonctionnel (cas attendu selon le spec). Si le Step 3 de la Task 1 a révélé un guard qui ne se déclenche pas, adapter cette tâche en conséquence avant de continuer (documenter l'écart dans la PR).

**Files:**
- Create: `lib/async-queue.ts`
- Create: `lib/async-queue.test.ts`
- Modify: `components/combat/Arena.tsx` (2 call-sites : `handleToggle` ~ligne 1289-1302, `handleAdd` ~ligne 814-824)

**Interfaces:**
- Produit par `lib/async-queue.ts` : `createKeyedQueue<K>(): { run<T>(key: K, fn: () => Promise<T>): Promise<T> }` — chaque appel `run` pour une même clé `K` attend la résolution (succès OU échec) de l'appel précédent pour cette même clé avant d'exécuter `fn`. Des clés différentes s'exécutent indépendamment, sans attendre l'une l'autre. La promesse retournée par `run` reflète le résultat réel de `fn` (résolution ou rejet), pas un wrapper qui avale les erreurs.
- Consommé par `Arena.tsx` : `reorderQueueRef.current.run(parentId, () => reorderSiblingsAction(parentId, orderedTaskIds))` remplace les deux appels directs `void reorderSiblingsAction(parentId, orderedTaskIds)`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `lib/async-queue.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import { createKeyedQueue } from "./async-queue";

describe("createKeyedQueue", () => {
  it("exécute les appels d'une même clé dans l'ordre de dispatch, même si leur résolution réseau arrive dans le désordre", async () => {
    const queue = createKeyedQueue<string>();
    const order: string[] = [];

    // Dispatché en premier, mais résout APRÈS le second (délai plus long) —
    // simule le cas où la requête réseau la plus ancienne arrive en dernier.
    const first = queue.run(
      "group-a",
      () =>
        new Promise<void>((resolve) => {
          setTimeout(() => {
            order.push("first");
            resolve();
          }, 50);
        }),
    );
    const second = queue.run(
      "group-a",
      () =>
        new Promise<void>((resolve) => {
          setTimeout(() => {
            order.push("second");
            resolve();
          }, 10);
        }),
    );

    await Promise.all([first, second]);
    expect(order).toEqual(["first", "second"]);
  });

  it("exécute les appels de clés différentes indépendamment (pas de blocage inter-clés)", async () => {
    const queue = createKeyedQueue<string>();
    const order: string[] = [];

    const a = queue.run(
      "group-a",
      () =>
        new Promise<void>((resolve) => {
          setTimeout(() => {
            order.push("a");
            resolve();
          }, 50);
        }),
    );
    const b = queue.run(
      "group-b",
      () =>
        new Promise<void>((resolve) => {
          setTimeout(() => {
            order.push("b");
            resolve();
          }, 10);
        }),
    );

    await Promise.all([a, b]);
    expect(order).toEqual(["b", "a"]);
  });

  it("continue la chaîne même si un appel précédent rejette", async () => {
    const queue = createKeyedQueue<string>();

    const failing = queue.run("group-a", () => Promise.reject(new Error("boom")));
    const after = queue.run("group-a", () => Promise.resolve("ok"));

    await expect(failing).rejects.toThrow("boom");
    await expect(after).resolves.toBe("ok");
  });
});
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

```bash
npx vitest run lib/async-queue.test.ts
```

Attendu : FAIL — `Cannot find module './async-queue'` (le fichier n'existe pas encore).

- [ ] **Step 3: Implémenter `lib/async-queue.ts`**

```ts
// File d'attente par clé : sérialise les appels asynchrones qui touchent la
// même ressource (ici, un groupe de fratrie de tâches), pour éviter qu'une
// réponse réseau plus lente écrase le résultat d'un appel plus récent.
export function createKeyedQueue<K>() {
  const tails = new Map<K, Promise<void>>();

  function run<T>(key: K, fn: () => Promise<T>): Promise<T> {
    const previousTail = tails.get(key) ?? Promise.resolve();
    const result = previousTail.then(fn, fn);
    // La queue interne ne doit jamais rejeter (sinon la chaîne s'arrête pour
    // les appels suivants) — on l'avale ici, mais `result` (retourné à
    // l'appelant) garde le vrai statut de `fn`.
    tails.set(
      key,
      result.then(
        () => undefined,
        () => undefined,
      ),
    );
    return result;
  }

  return { run };
}
```

- [ ] **Step 4: Lancer le test, vérifier qu'il passe**

```bash
npx vitest run lib/async-queue.test.ts
```

Attendu : PASS, 3 tests verts.

- [ ] **Step 5: Commit du module isolé**

```bash
git add lib/async-queue.ts lib/async-queue.test.ts
git commit -m "feat: ajoute createKeyedQueue pour sérialiser des appels async par clé"
```

- [ ] **Step 6: Wirer dans `Arena.tsx` — ajouter le ref**

Dans `components/combat/Arena.tsx`, localiser la zone des autres `useRef` (proche de `animKeyRef`/`bossAttackPendingRef`, cf. ligne ~260) et ajouter :

```ts
  // Issue #144 : sérialise les écritures de position par groupe de fratrie
  // (parentId) — deux reorderSiblingsAction concurrents sur le même groupe
  // ne doivent jamais s'écraser selon l'ordre d'arrivée réseau.
  const reorderQueueRef = useRef(createKeyedQueue<string | null>());
```

Ajouter l'import en haut du fichier, à côté des autres imports de `@/lib/game-engine` ou dans un import dédié :

```ts
import { createKeyedQueue } from "@/lib/async-queue";
```

- [ ] **Step 7: Remplacer l'appel dans `handleToggle`**

Remplacer (actuellement ~ligne 1289-1301) :

```ts
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

par :

```ts
    for (const plan of reorderPlans) {
      void reorderQueueRef.current
        .run(plan.parentId, () => reorderSiblingsAction(plan.parentId, plan.orderedTaskIds))
        .then((result) => {
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

- [ ] **Step 8: Remplacer l'appel dans `handleAdd`**

Remplacer (actuellement ~ligne 814-824) :

```ts
          void reorderSiblingsAction(null, orderedIds).then((reorderResult) => {
            if (reorderResult.error) {
              setTasks((prev) =>
                prev.map((task) =>
                  previousPositions.has(task.id)
                    ? { ...task, position: previousPositions.get(task.id)! }
                    : task,
                ),
              );
            }
          });
```

par :

```ts
          void reorderQueueRef.current
            .run(null, () => reorderSiblingsAction(null, orderedIds))
            .then((reorderResult) => {
              if (reorderResult.error) {
                setTasks((prev) =>
                  prev.map((task) =>
                    previousPositions.has(task.id)
                      ? { ...task, position: previousPositions.get(task.id)! }
                      : task,
                  ),
                );
              }
            });
```

- [ ] **Step 9: Vérifier le typecheck et le lint**

```bash
npx tsc --noEmit
npm run lint
```

Attendu : aucune erreur.

- [ ] **Step 10: Ajouter les tests e2e**

Créer `e2e/task-reorder-race.spec.ts` (nouveau fichier, modélisé sur `e2e/rafale-optimistic.spec.ts` pour le style et sur `e2e/toggle-cascade.spec.ts`/`e2e/nesting-dnd.spec.ts` pour la manipulation de tâches — lire `e2e/fixtures.ts` pour les helpers disponibles avant d'écrire, en particulier `login`, `abandonViaUi`) :

```ts
import { test, expect } from "@playwright/test";
import { abandonViaUi, login } from "./fixtures";

// Issue #144 : régression de l'ordre des tâches — vérifie qu'après un
// rechargement complet (donc en lisant l'état réellement persisté en base,
// pas seulement l'état optimiste), l'ordre attendu est bien celui obtenu.
test.describe("Ordre des tâches persiste après reorder (issue #144)", () => {
  const cleanupTitles: string[] = [];

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test.afterEach(async ({ page }) => {
    for (const title of cleanupTitles.splice(0)) {
      await abandonViaUi(page, title);
    }
  });

  test("cocher deux tâches racines rapprochées : les deux se retrouvent en bas après reload", async ({
    page,
  }) => {
    const titleA = `E2E ORD-A ${Date.now()}`;
    const titleB = `E2E ORD-B ${Date.now()}`;
    cleanupTitles.push(titleA, titleB);

    await page.getByLabel("Ajouter une tâche").fill(titleA);
    await page.getByRole("button", { name: "Ajouter" }).click();
    await page.getByLabel("Ajouter une tâche").fill(titleB);
    await page.getByRole("button", { name: "Ajouter" }).click();

    const rowA = page.locator("li", { hasText: titleA });
    const rowB = page.locator("li", { hasText: titleB });
    await expect(rowA.locator('input[type="checkbox"]')).toBeVisible();
    await expect(rowB.locator('input[type="checkbox"]')).toBeVisible();

    // Coche rapprochée (< 200ms d'intervalle) — le scénario qui déclenche la
    // race condition en l'absence de sérialisation.
    await rowA.locator('input[type="checkbox"]').check();
    await rowB.locator('input[type="checkbox"]').check();

    // Attend la résolution des deux mutations (drag handle réactivé).
    await expect(page.getByLabel(`Déplacer "${titleA}"`)).toBeEnabled({ timeout: 15_000 });
    await expect(page.getByLabel(`Déplacer "${titleB}"`)).toBeEnabled({ timeout: 15_000 });

    // Reload complet : on ne vérifie plus l'état optimiste, mais l'état
    // réellement persisté en base.
    await page.reload();

    const listItems = page.locator("main li");
    const count = await listItems.count();
    const lastTwoTitles = await Promise.all(
      [count - 2, count - 1].map((i) => listItems.nth(i).innerText()),
    );
    expect(lastTwoTitles.join(" ")).toContain(titleA.split(" ").pop());
    expect(lastTwoTitles.join(" ")).toContain(titleB.split(" ").pop());
  });

  test("ajouter une tâche alors qu'une racine est déjà cochée : elle s'insère au-dessus après reload", async ({
    page,
  }) => {
    const completedTitle = `E2E ORD-DONE ${Date.now()}`;
    const newTitle = `E2E ORD-NEW ${Date.now()}`;
    cleanupTitles.push(completedTitle, newTitle);

    await page.getByLabel("Ajouter une tâche").fill(completedTitle);
    await page.getByRole("button", { name: "Ajouter" }).click();
    const completedRow = page.locator("li", { hasText: completedTitle });
    await completedRow.locator('input[type="checkbox"]').check();
    await expect(page.getByLabel(`Déplacer "${completedTitle}"`)).toBeEnabled({
      timeout: 15_000,
    });

    await page.getByLabel("Ajouter une tâche").fill(newTitle);
    await page.getByRole("button", { name: "Ajouter" }).click();
    await expect(page.getByLabel(`Déplacer "${newTitle}"`)).toBeEnabled({ timeout: 15_000 });

    await page.reload();

    // La nouvelle tâche doit apparaître AVANT la tâche complétée dans le DOM.
    const newIndex = await page.locator("main li", { hasText: newTitle }).evaluate((el) =>
      Array.from(el.parentElement!.children).indexOf(el),
    );
    const completedIndex = await page
      .locator("main li", { hasText: completedTitle })
      .evaluate((el) => Array.from(el.parentElement!.children).indexOf(el));
    expect(newIndex).toBeLessThan(completedIndex);
  });
});
```

**Note pour l'exécutant :** avant de committer ce fichier, lancer ce spec seul (`npx playwright test e2e/task-reorder-race.spec.ts`) contre le serveur de prod buildé (cf. `playwright.config.ts`, démarrage automatique) et vérifier que les sélecteurs (`li`, `main li`, structure DOM réelle) correspondent bien au rendu actuel de `TaskList.tsx`/`TaskRow.tsx` — ajuster les sélecteurs si la structure DOM réelle diffère de ce qui est supposé ici (ce plan a été écrit sans exécuter Playwright).

- [ ] **Step 11: Lancer les tests Vitest + le nouveau spec e2e**

```bash
npm run test
npx playwright test e2e/task-reorder-race.spec.ts
```

Attendu : tout vert. Si le spec e2e échoue à cause d'un sélecteur incorrect (pas à cause du bug), corriger le sélecteur avant de conclure à un échec du fix.

- [ ] **Step 12: Commit**

```bash
git add lib/game-engine.ts components/combat/Arena.tsx e2e/task-reorder-race.spec.ts
git commit -m "fix(arene): sérialise les écritures de position par groupe pour éviter une race condition (issue #144)"
```

---

### Task 3: #146 — Fix déterminé : délai avant l'overlay de clôture

**Contexte :** Ce sous-bug (délai trop court entre la mort du Boss et `PerfectOverlay`) a une cause déjà identifiée avec certitude (pas d'investigation nécessaire) : `startKoSequence` (`components/combat/Arena.tsx:720-732`) attend déjà `DEATH_DURATION_MS + KO_FADE_MS` (1000 + 400 = 1400ms) avant d'ouvrir l'overlay, mais l'utilisateur rapporte que ce n'est pas suffisant. Demande explicite : ajouter 1s de marge.

**Files:**
- Modify: `lib/combat-animation.ts`
- Modify: `components/combat/Arena.tsx:730`

**Interfaces:**
- Produit par `lib/combat-animation.ts` : nouvelle constante exportée `KO_OVERLAY_EXTRA_DELAY_MS = 1000`.
- Consommé par `Arena.tsx` : `startKoSequence` utilise `DEATH_DURATION_MS + KO_FADE_MS + KO_OVERLAY_EXTRA_DELAY_MS` au lieu de `DEATH_DURATION_MS + KO_FADE_MS`.

- [ ] **Step 1: Ajouter la constante**

Dans `lib/combat-animation.ts`, à côté de `export const KO_FADE_MS = 400;` (ligne ~13), ajouter :

```ts
// Issue #146 : marge supplémentaire entre la fin visuelle de l'anim de mort
// du Boss (+ le slam K.O.) et l'ouverture de PerfectOverlay — sans cette
// marge, l'overlay pouvait s'ouvrir avant que l'animation n'ait fini de se
// jouer à l'écran.
export const KO_OVERLAY_EXTRA_DELAY_MS = 1000;
```

- [ ] **Step 2: Utiliser la constante dans `Arena.tsx`**

Ajouter `KO_OVERLAY_EXTRA_DELAY_MS` à l'import existant de `@/lib/combat-animation` (à côté de `DEATH_DURATION_MS`/`KO_FADE_MS`, ligne ~61-62).

Remplacer dans `startKoSequence` (ligne ~727-730) :

```ts
      setTimeout(() => {
        setKoSlam(false);
        setKoState(payload);
      }, DEATH_DURATION_MS + KO_FADE_MS),
```

par :

```ts
      setTimeout(() => {
        setKoSlam(false);
        setKoState(payload);
      }, DEATH_DURATION_MS + KO_FADE_MS + KO_OVERLAY_EXTRA_DELAY_MS),
```

Le early-return `if (reducedMotion) { setKoState(payload); return; }` (ligne 721-724) reste **inchangé** — sous reduced-motion, l'overlay doit rester instantané (cf. CLAUDE.md, aucun gating n'est appliqué dans ce mode).

- [ ] **Step 3: Vérifier qu'aucun test n'assume l'ancien timing**

```bash
grep -rn "KO_FADE_MS\|DEATH_DURATION_MS\|PerfectOverlay" e2e/ lib/*.test.ts
```

Si un test e2e ou Vitest attend l'overlay avec un timeout serré basé sur l'ancien délai (1400ms), ajuster son timeout pour tenir compte des +1000ms ajoutés. Ne pas retirer d'assertion existante sans comprendre pourquoi elle échoue.

- [ ] **Step 4: Lancer les tests concernés**

```bash
npm run test
```

Si un spec e2e touche le K.O. (chercher "K.O" ou "PerfectOverlay" dans `e2e/`), le lancer isolément contre le build de prod :

```bash
npx playwright test <fichier concerné>
```

- [ ] **Step 5: Commit**

```bash
git add lib/combat-animation.ts components/combat/Arena.tsx
git commit -m "fix(combat): ajoute 1s de marge avant l'overlay de clôture après la mort du Boss (issue #146)"
```

---

### Task 4: #146 — Investigation + fix : animation jouée deux fois

**Contexte :** Comportement confirmé par l'utilisateur : systématique, même sur le cas le plus simple (une tâche racine isolée, un seul coup) — écarte les hypothèses liées aux cascades/combos.

**Hypothèse forte identifiée en lecture de code** (à vérifier avant tout fix) : dans `components/combat/SpriteAnimator.tsx`, l'effet (ligne 65-83) a une branche `if (staticFrame) { onImpactRef.current?.(); onEndRef.current?.(); return; }` (ligne 66-71) qui appelle les callbacks **de façon synchrone, sans retourner de fonction de cleanup**. `staticFrame` est posé uniquement quand `reducedMotion` est vrai (`CharacterSprite.tsx`, prop `staticFrame={reducedMotion ? ... : undefined}`). React 18/19 **Strict Mode** (actif par défaut en développement, `next dev`) monte deux fois chaque effet (mount → cleanup → mount) pour détecter les effets non idempotents. Un effet SANS cleanup qui exécute un side-effect synchrone est donc rejoué deux fois par ce mécanisme — ce qui correspondrait exactement à "animation jouée 2 fois", **spécifiquement sous `prefers-reduced-motion`**. Or Strict Mode est un comportement de **développement uniquement** (`next dev`), jamais de production (`next build && next start`) — ce qui expliquerait pourquoi la suite e2e (qui tourne contre un serveur de prod, cf. CLAUDE.md) n'a jamais détecté ce doublon malgré le fait qu'elle force `reducedMotion: "reduce"` sur la quasi-totalité des specs.

Cette hypothèse n'explique pas nécessairement le 2e sous-bug (mauvaise anim au décochage) — celui-ci reste une investigation ouverte séparée (cf. Task 5).

**Files:**
- Modify: `components/combat/SpriteAnimator.tsx`
- Test: `e2e/combat-animations.spec.ts` (existant, à étendre) ou nouveau fichier `e2e/combat-double-anim.spec.ts`

**Interfaces:**
- Aucune interface publique ne change — le fix reste interne à `SpriteAnimator.tsx` (même props `onImpact`/`onEnd`/`staticFrame`).

- [ ] **Step 1: Confirmer l'hypothèse — comparer dev vs prod**

```bash
# Terminal 1 : mode dev (Strict Mode actif)
npm run dev
```

Dans le navigateur, activer `prefers-reduced-motion: reduce` (Chrome DevTools → Rendering tab → "Emulate CSS media feature prefers-reduced-motion" → "reduce" ; ou réglage OS accessibilité). Cocher une tâche, observer si l'animation (ou tout comportement lié à `onImpact`/`onEnd`) se déclenche visiblement deux fois — ajouter temporairement `console.count("sprite-onEnd")`/`console.count("sprite-onImpact")` dans le bloc `if (staticFrame)` de `SpriteAnimator.tsx` pour compter précisément les invocations (ne pas commiter ces logs).

```bash
# Terminal 2, une fois le test en dev terminé : build + prod
npm run build
npm run start
```

Refaire le même scénario (reduced motion + cocher une tâche) contre ce serveur de prod, observer les mêmes compteurs.

- [ ] **Step 2: Point de décision**

- **Si le compteur affiche 2 en dev et 1 en prod** : hypothèse confirmée, StrictMode double-invoke sur la branche `staticFrame` sans cleanup. Passer au Step 3 (fix).
- **Si le compteur affiche 1 dans les deux cas**, ou si le doublon apparaît aussi SANS reduced-motion : l'hypothèse est fausse. Ne pas appliquer le fix du Step 3 (qui ne résoudrait rien) — retirer les logs, documenter cette conclusion dans la description de la PR (Task 9), et ouvrir une investigation de suivi (nouvelle sub-issue si nécessaire) plutôt que de deviner un autre fix à l'aveugle.

- [ ] **Step 3: Fix (uniquement si l'hypothèse du Step 2 est confirmée)**

Dans `components/combat/SpriteAnimator.tsx`, remplacer (lignes 65-72) :

```ts
  useEffect(() => {
    if (staticFrame) {
      // Pas d'animation : l'impact et la fin sont immédiats pour ne jamais
      // faire attendre un utilisateur en reduced-motion (cf. spec §9).
      onImpactRef.current?.();
      onEndRef.current?.();
      return;
    }
```

par :

```ts
  useEffect(() => {
    if (staticFrame) {
      // Pas d'animation : l'impact et la fin sont immédiats pour ne jamais
      // faire attendre un utilisateur en reduced-motion (cf. spec §9).
      // Planifié en microtask + flag d'annulation (plutôt qu'un appel
      // synchrone sans cleanup) : React Strict Mode (dev) monte/nettoie/
      // remonte chaque effet une fois pour détecter les effets non
      // idempotents — un side-effect synchrone sans cleanup était donc
      // rejoué deux fois en dev (jamais en prod, d'où un doublon invisible
      // en e2e, qui tourne contre un build de prod). Issue #146.
      let cancelled = false;
      queueMicrotask(() => {
        if (cancelled) return;
        onImpactRef.current?.();
        onEndRef.current?.();
      });
      return () => {
        cancelled = true;
      };
    }
```

- [ ] **Step 4: Re-vérifier en dev avec Strict Mode**

Relancer `npm run dev`, refaire le scénario du Step 1 avec les compteurs temporaires : attendu = 1 seule invocation désormais, en dev comme en prod. Retirer ensuite les `console.count` temporaires (`git diff` doit être propre de tout log avant de commiter).

- [ ] **Step 5: Écrire un test e2e de non-régression**

Étendre `e2e/combat-animations.spec.ts` (qui force déjà `contextOptions: { reducedMotion: "no-preference" }` en tête de fichier — ajouter un test dédié qui force `reduce` pour CE test précis via une nouvelle `test.describe` avec son propre `test.use`) :

```ts
test.describe("Animations combat sous reduced-motion (issue #146)", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  let taskTitle: string | undefined;

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test.afterEach(async ({ page }) => {
    if (taskTitle) await abandonViaUi(page, taskTitle);
    taskTitle = undefined;
  });

  test("cocher une tâche sous reduced-motion ne déclenche l'état hurt qu'une seule fois", async ({
    page,
  }) => {
    taskTitle = `E2E RM ${Date.now()}`;
    const boss = page.getByTestId("character-sprite").last();

    let hurtCount = 0;
    await page.exposeFunction("__recordHurt", () => {
      hurtCount += 1;
    });
    await page.evaluate(() => {
      const target = document.querySelector('[data-testid="character-sprite"]:last-of-type');
      if (!target) return;
      new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (
            m.attributeName === "data-anim-state" &&
            (m.target as HTMLElement).getAttribute("data-anim-state") === "hurt"
          ) {
            (window as unknown as { __recordHurt: () => void }).__recordHurt();
          }
        }
      }).observe(target, { attributes: true });
    });

    await page.getByLabel("Ajouter une tâche").fill(taskTitle);
    await page.getByRole("button", { name: "Ajouter" }).click();
    await page.getByLabel(`Marquer "${taskTitle}" comme accomplie`).check();

    await page.waitForTimeout(1000);
    expect(hurtCount).toBeLessThanOrEqual(1);
    void boss;
  });
});
```

**Note pour l'exécutant :** ce test utilise un `MutationObserver` injecté car sous `reduced-motion`, la transition d'état est quasi instantanée (pas de fenêtre de temps confortable pour un simple `expect(...).toHaveAttribute(...)` séquentiel comme dans le test `no-preference` existant). Si cette approche s'avère fragile en pratique (flaky), une alternative plus simple est de compter les appels à la server action `setTaskCompleted` (déjà couvert ailleurs) et de se concentrer uniquement sur la vérification manuelle du Step 4 pour ce sous-bug précis — documenter le choix fait dans la PR.

- [ ] **Step 6: Lancer les tests**

```bash
npx playwright test e2e/combat-animations.spec.ts
npm run test
```

- [ ] **Step 7: Commit**

```bash
git add components/combat/SpriteAnimator.tsx e2e/combat-animations.spec.ts
git commit -m "fix(combat): évite le double-déclenchement onImpact/onEnd sous reduced-motion (issue #146)"
```

Si le Step 2 a infirmé l'hypothèse : commit uniquement le retrait des logs de debug (rien d'autre à committer pour ce sous-bug), et documenter l'état ouvert dans la PR.

---

### Task 5: #146 — Investigation ouverte : mauvaise animation au décochage

**Contexte :** Décocher une tâche devrait déclencher une attaque du Boss + `hurt` du héros, pas une attaque du héros. Lecture du code actuel (`handleToggle`, branche `hpDelta < 0`, cf. spec) montre qu'**aucun appel** à `triggerHeroAttack`/`triggerBossAttack` n'existe sur ce chemin — seul `triggerPulse(-hpDelta, "heal")` est appelé. Aucune cause confirmée à ce stade : ce sous-bug reste une investigation live, distincte de la Task 4.

**Files:** aucun fichier modifié tant que la cause n'est pas confirmée (diagnostic uniquement à cette étape).

- [ ] **Step 1: Reproduire avec React DevTools ouvert**

```bash
npm run dev
```

Installer/ouvrir l'extension React DevTools dans le navigateur. Cocher une tâche racine (observer `heroAnim`/`bossAnim` dans le state du composant `Arena` via l'onglet Components de React DevTools), attendre que l'animation revienne à `idle` (quelques secondes), puis **décocher** la même tâche. Observer en direct :
1. La valeur de `heroAnim.state` juste avant et juste après le décochage.
2. Si `heroAnim.state` passe à `"attack"` à un moment quelconque du décochage, ou s'il s'agit en fait de la fin tardive de l'anim précédente qui n'était pas encore retombée à `idle`.

- [ ] **Step 2: Si le state ne bouge jamais côté `heroAnim`/`bossAnim`**

Le bug est alors probablement dans `CharacterSprite.tsx` (dérivation de `rendered` depuis les props `state`/`stateKey`, lignes 77-84) ou dans un état résiduel visuel non lié au state React observé. Poser un `console.log` temporaire dans `CharacterSprite.tsx` juste après `if (state !== prevState || stateKey !== prevStateKey) { ... setRendered(state); }` pour tracer chaque changement de `rendered` avec un timestamp, et corréler avec le moment exact du clic de décochage.

- [ ] **Step 3: Documenter la conclusion**

Une fois la cause identifiée (ou non) : documenter précisément dans la description de la PR finale (Task 9) ce qui a été trouvé. Si une cause claire émerge et qu'un fix évident s'impose (ex: un appel manquant à réinitialiser `heroAnim` à `idle` explicitement au décochage), l'implémenter avec le même formalisme TDD que les tâches précédentes (test qui échoue → fix → test qui passe) avant de commiter. Si aucune cause claire n'émerge dans un temps raisonnable, **ne pas deviner un fix** — laisser ce sous-bug ouvert, le signaler explicitement dans la description de la PR et proposer de le traiter dans une sub-issue de suivi séparée plutôt que de merger un correctif non vérifié.

---

### Task 6: #145 — Refactor du positionnement héros/boss

**Contexte :** Décision de design déjà validée : héros à gauche, boss à droite, cohérent entre mobile et desktop, via un refactor du layout horizontal (flex `justify-between`) plutôt qu'un patch d'offsets CSS.

**Files:**
- Modify: `components/combat/VersusScene.tsx`

**Interfaces:** aucune prop de `VersusScene` ne change — uniquement la structure JSX/CSS interne.

- [ ] **Step 1: Localiser le JSX actuel**

Dans `components/combat/VersusScene.tsx`, les deux blocs actuels (lignes ~140-192) :

```tsx
      <div
        key={`hero-wrap-${heroStateKey}`}
        className={`absolute bottom-2 left-4 ${heroState === "hurt" ? "is-knockback" : ""}`}
        style={heroState === "hurt" ? ({ "--knockback-x": "-6px" } as CSSProperties) : undefined}
      >
        <CharacterSprite
          spriteBase={heroSpriteBase}
          meta={heroMeta}
          baseHeight={88}
          state={heroState}
          attackAnim={heroAttackAnim}
          stateKey={heroStateKey}
          frozen={frozen}
          reducedMotion={reducedMotion}
          onStateEnd={onHeroAttackEnd}
          alt={`Ton héros : ${heroName}`}
          className="[image-rendering:pixelated] drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)]"
        />
      </div>
      <div
        key={`boss-wrap-${bossStateKey}`}
        className={`absolute bottom-2 right-4 ${bossState === "hurt" ? "is-knockback" : ""}`}
        style={bossState === "hurt" ? ({ "--knockback-x": "6px" } as CSSProperties) : undefined}
      >
        <CharacterSprite
          spriteBase={bossSpriteBase}
          meta={bossMeta}
          baseHeight={96}
          state={bossState}
          stateKey={bossStateKey}
          frozen={frozen}
          fallbackHurtDeath={bossFallbackHurtDeath}
          reducedMotion={reducedMotion}
          danger={bossDanger}
          flip={bossFlip}
          onImpact={onBossImpact}
          alt={`Le Boss du jour : ${bossName}`}
          className="[image-rendering:pixelated] drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)]"
        />
        {vfxVariant && (
          <HeroVfx
            heroSlug={heroSlug}
            variant={vfxVariant}
            bossHeight={96 * bossMeta.renderScale}
            reducedMotion={reducedMotion}
          />
        )}
      </div>
```

- [ ] **Step 2: Remplacer par un conteneur flex englobant**

Remplacer l'ensemble ci-dessus par :

```tsx
      <div className="absolute inset-x-0 bottom-2 z-[6] flex items-end justify-between px-4">
        <div
          key={`hero-wrap-${heroStateKey}`}
          className={heroState === "hurt" ? "is-knockback" : ""}
          style={heroState === "hurt" ? ({ "--knockback-x": "-6px" } as CSSProperties) : undefined}
        >
          <CharacterSprite
            spriteBase={heroSpriteBase}
            meta={heroMeta}
            baseHeight={88}
            state={heroState}
            attackAnim={heroAttackAnim}
            stateKey={heroStateKey}
            frozen={frozen}
            reducedMotion={reducedMotion}
            onStateEnd={onHeroAttackEnd}
            alt={`Ton héros : ${heroName}`}
            className="[image-rendering:pixelated] drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)]"
          />
        </div>
        <div
          key={`boss-wrap-${bossStateKey}`}
          className={bossState === "hurt" ? "is-knockback" : ""}
          style={bossState === "hurt" ? ({ "--knockback-x": "6px" } as CSSProperties) : undefined}
        >
          <CharacterSprite
            spriteBase={bossSpriteBase}
            meta={bossMeta}
            baseHeight={96}
            state={bossState}
            stateKey={bossStateKey}
            frozen={frozen}
            fallbackHurtDeath={bossFallbackHurtDeath}
            reducedMotion={reducedMotion}
            danger={bossDanger}
            flip={bossFlip}
            onImpact={onBossImpact}
            alt={`Le Boss du jour : ${bossName}`}
            className="[image-rendering:pixelated] drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)]"
          />
          {vfxVariant && (
            <HeroVfx
              heroSlug={heroSlug}
              variant={vfxVariant}
              bossHeight={96 * bossMeta.renderScale}
              reducedMotion={reducedMotion}
            />
          )}
        </div>
      </div>
```

Notes sur ce changement :
- Le conteneur englobant porte `absolute inset-x-0 bottom-2` (positionné une seule fois par rapport à la scène) + `flex items-end justify-between px-4` (répartition gauche/droite proportionnelle, `px-4` reprend la marge des anciens `left-4`/`right-4`).
- `z-[6]` : la scène a déjà un dégradé en `z-[5]` (ligne 108) et le HUD (HeroBar/Timer/BossBar) en `z-10` (ligne 109) — `z-[6]` place les sprites au-dessus du dégradé mais sous le HUD, comme c'était implicitement le cas avant (les deux anciens wrappers n'avaient pas de z-index explicite, donc `auto` = ordre du DOM, situés après le dégradé et avant le HUD dans le JSX ; `z-[6]` restaure ce même ordre visuel explicitement).
- Les deux `key`/`style` de knockback restent identiques, seulement portés par un `div` qui n'est plus positionné en `absolute` individuellement (le flex du parent gère la position horizontale, le `transform: translateX(...)` du knockback — posé via la classe `is-knockback`, à vérifier dans le CSS global — reste relatif à sa propre position, donc inchangé).

- [ ] **Step 3: Vérifier qu'aucun style CSS global ne dépend de l'ancien positionnement**

```bash
grep -rn "is-knockback\|knockback-x" app/globals.css
```

Lire la règle CSS trouvée pour confirmer qu'elle utilise bien `transform: translateX(var(--knockback-x))` (ou équivalent) — un transform est relatif à l'élément lui-même, donc indépendant du fait que son parent soit en `absolute` ou en `flex`. Si la règle dépend d'une autre propriété liée au positionnement absolu (peu probable), l'adapter.

- [ ] **Step 4: Vérification manuelle**

```bash
npm run dev
```

Ouvrir l'app dans le navigateur avec DevTools responsive (viewport mobile, ex. 375×812) : vérifier que le héros est bien à gauche, le boss à droite, avec un espacement cohérent. Repasser en viewport desktop (ex. 1440×900) : vérifier la même chose. Vérifier aussi `/roster-preview-8f3a2c9d` (écran de calage boss, login requis) si le temps le permet — non bloquant pour ce fix mais bon signal de non-régression.

- [ ] **Step 5: Lancer les tests**

```bash
npm run test
npx playwright test e2e/combat-animations.spec.ts
```

(Ce spec exerce déjà `CharacterSprite`/`VersusScene` en conditions réelles — une régression de layout n'y ferait pas nécessairement échouer une assertion `data-anim-state`, mais vérifie au moins qu'aucune erreur de rendu ne survient.)

- [ ] **Step 6: Commit**

```bash
git add components/combat/VersusScene.tsx
git commit -m "fix(combat): repositionne héros/boss en flex justify-between, cohérent mobile/desktop (issue #145)"
```

---

### Task 7: CHANGELOG

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Lire le format existant**

```bash
head -40 CHANGELOG.md
```

- [ ] **Step 2: Ajouter les entrées sous `## [Unreleased]`**

Ajouter (adapter le libellé exact des sous-bugs #146 selon ce qui a réellement été corrigé à l'issue des Tasks 4-5 — ne pas lister un fix qui n'a finalement pas été appliqué si l'hypothèse a été infirmée) :

```markdown
### Fixed
- Régression de l'ordre des tâches (terminé en bas, ajout au-dessus des tâches terminées) causée par une race condition sur les écritures de position (issue #144).
- Positionnement héros/boss incohérent entre mobile et desktop dans l'Arène (issue #145).
- Animation de combat jouée deux fois sous "réduire les animations" (issue #146).
- Délai insuffisant entre la mort du Boss et l'overlay de clôture de journée (issue #146).
```

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog pour les fixes #144/#145/#146"
```

---

### Task 8: Suite de tests complète avant push

- [ ] **Step 1: Suite complète**

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run build
npm run start
```

Dans un autre terminal, une fois le serveur de prod démarré :

```bash
npx playwright test
```

- [ ] **Step 2: Si un test échoue**

Ne PAS pousser tant que tout n'est pas vert. Revenir à la tâche concernée, corriger, ré-committer (nouveau commit, ne jamais utiliser `--amend` sauf demande explicite de l'utilisateur), relancer la suite complète.

---

### Task 9: Push, fermeture des sub-issues, création de la PR

**Rappel : ne jamais merger automatiquement.** Cette tâche s'arrête à la création de la PR.

- [ ] **Step 1: Push de la branche**

```bash
git push -u origin fix/issue-144-145-146-p1-bugs
```

- [ ] **Step 2: Fermer les 3 sub-issues avec référence au travail effectué**

`#144` et `#145` ont un message fixe. `#146` a **deux variantes toutes prêtes** ci-dessous — choisir celle qui correspond au résultat réel de la Task 5 (ne jamais poster de texte entre crochets, ce ne sont que des instructions pour vous, pas du contenu à publier) :

```bash
gh issue comment 144 --repo ouro84/dodojo --body "Corrigé sur la branche fix/issue-144-145-146-p1-bugs : sérialisation des écritures de position par groupe de fratrie (race condition confirmée). Voir PR."
gh issue comment 145 --repo ouro84/dodojo --body "Corrigé sur la branche fix/issue-144-145-146-p1-bugs : refactor du layout en flex justify-between. Voir PR."
```

Si la Task 5 a confirmé et corrigé la cause du mauvais anim au décochage :

```bash
gh issue comment 146 --repo ouro84/dodojo --body "Corrigé sur la branche fix/issue-144-145-146-p1-bugs : délai overlay allongé, double-déclenchement sous reduced-motion corrigé (StrictMode + cleanup manquant dans SpriteAnimator), et mauvaise anim au décochage corrigée. Voir PR."
```

Si la Task 5 n'a PAS abouti à un fix confirmé pour le mauvais anim au décochage (cas le plus probable vu l'absence de cause connue à l'écriture de ce plan) :

```bash
gh issue comment 146 --repo ouro84/dodojo --body "Partiellement traité sur la branche fix/issue-144-145-146-p1-bugs : délai overlay allongé, double-déclenchement sous reduced-motion corrigé (StrictMode + cleanup manquant dans SpriteAnimator). Le 3e sous-bug (mauvaise anim au décochage) reste ouvert, cause non confirmée après investigation — cette issue reste ouverte pour ce point précis, voir PR pour le détail de ce qui a été trouvé."
```

**Ne pas fermer les issues avec `gh issue close` à cette étape** — les laisser ouvertes, elles se fermeront automatiquement au merge de la PR si celle-ci référence `Closes #144, Closes #145, Closes #146` dans sa description (cf. Step 3). Si le sous-bug du décochage reste ouvert (2e variante ci-dessus), ne PAS inclure `Closes #146` dans la description de la PR — laisser cette issue ouverte manuellement même après merge.

- [ ] **Step 3: Créer la PR**

**Si la Task 5 a confirmé et corrigé le mauvais anim au décochage** (les 3 sub-issues sont entièrement résolues) :

```bash
gh pr create --repo ouro84/dodojo --title "fix: ordre des tâches, positionnement combat, animations (issues #144, #145, #146)" --body "$(cat <<'EOF'
## Résumé

Corrige les 3 sub-issues P1 de l'issue #136 :

- **#144** — Régression de l'ordre des tâches : race condition sur les écritures de position (`reorderSiblingsAction` non sérialisé par groupe de fratrie). Fix : `lib/async-queue.ts` (file d'attente par clé).
- **#145** — Positionnement héros/boss incohérent mobile/desktop : refactor du layout en flex `justify-between` dans `VersusScene.tsx`.
- **#146** — Animations de combat : délai overlay de clôture allongé de 1s ; double-déclenchement onImpact/onEnd corrigé (React Strict Mode + effet sans cleanup dans `SpriteAnimator.tsx`, uniquement sous `prefers-reduced-motion`) ; mauvaise anim au décochage corrigée.

Une seule PR pour les 3 issues (décision assumée, déroge à la convention habituelle 1 PR par sub-issue de ce repo).

## Test plan
- [ ] Vitest : `npm run test` vert
- [ ] `npx tsc --noEmit` propre
- [ ] Playwright e2e complet vert contre un build de prod
- [ ] Vérification manuelle mobile + desktop du positionnement héros/boss

Closes #144, Closes #145, Closes #146.
EOF
)"
```

**Si la Task 5 n'a PAS abouti** (cas le plus probable à l'écriture de ce plan — le mauvais anim au décochage reste ouvert) :

```bash
gh pr create --repo ouro84/dodojo --title "fix: ordre des tâches, positionnement combat, animations (issues #144, #145, #146)" --body "$(cat <<'EOF'
## Résumé

Corrige 2 des 3 sub-issues P1 de l'issue #136, traite partiellement la 3e :

- **#144** — Régression de l'ordre des tâches : race condition sur les écritures de position (`reorderSiblingsAction` non sérialisé par groupe de fratrie). Fix : `lib/async-queue.ts` (file d'attente par clé).
- **#145** — Positionnement héros/boss incohérent mobile/desktop : refactor du layout en flex `justify-between` dans `VersusScene.tsx`.
- **#146** — Animations de combat : délai overlay de clôture allongé de 1s ; double-déclenchement onImpact/onEnd corrigé (React Strict Mode + effet sans cleanup dans `SpriteAnimator.tsx`, uniquement sous `prefers-reduced-motion`). Le 3e sous-bug de #146 (mauvaise anim au décochage) reste **ouvert** — cause non confirmée après investigation (cf. Task 5 du plan d'implémentation), pas de fix deviné à l'aveugle. #146 reste donc ouverte après ce merge.

Une seule PR pour les 3 issues (décision assumée, déroge à la convention habituelle 1 PR par sub-issue de ce repo).

## Test plan
- [ ] Vitest : `npm run test` vert
- [ ] `npx tsc --noEmit` propre
- [ ] Playwright e2e complet vert contre un build de prod
- [ ] Vérification manuelle mobile + desktop du positionnement héros/boss

Closes #144, Closes #145.
EOF
)"
```

- [ ] **Step 4: Rapporter l'URL de la PR à l'utilisateur**

Ne pas merger. Attendre une validation humaine explicite avant tout `gh pr merge`.
