# Issue #115 — Fixer le système de combo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Le combo ne monte que si deux tâches sont cochées à moins de 15 minutes d'intervalle (aujourd'hui il monte à chaque complétion, sans aucune fenêtre de temps). Le combo augmente légèrement l'XP réellement gagnée par palier (x2 = +5, x3 = +10, x4 = +15, etc., soit 30/35/40/45 XP).

**Architecture:** L'XP est aujourd'hui calculée **uniquement côté serveur** (`setTaskCompleted`, `app/actions/tasks.ts`) — le client ne fait que de l'optimistic UI, toujours écrasé par la réponse serveur. Le combo devient donc **server-authoritative** : deux colonnes persistées sur `profiles` (`combo_count`, `last_combo_completed_at`) et une colonne sur `tasks` (`xp_awarded`, pour que le décochage rembourse exactement ce qui a été gagné plutôt qu'un montant plat, ce qui désynchroniserait l'économie XP dès qu'un bonus combo est appliqué). Le client garde un état visuel optimiste (même fenêtre de 15 min, calculée localement) pour le "juice" instantané, puis se resynchronise silencieusement sur la valeur renvoyée par le serveur — même patron que `level`/`xp` aujourd'hui.

**Tech Stack:** TypeScript, Vitest, Supabase (Postgres migration), Next.js Server Actions.

## Global Constraints

- Tout algorithme de calcul de jeu réside dans `lib/game-engine.ts`, testé sans dépendance UI (règle de code n°2 du projet).
- Aucune suppression destructive — les deux nouvelles colonnes sont des compteurs/caches mutables, pas des données d'historique (RG-04 ne s'applique pas ici, comme `profiles.gold`/`profiles.streak_days` déjà des caches dérivés).
- Toute modification du comportement de calcul HP/XP doit mettre à jour `CLAUDE.md` dans le même commit (règle de mise à jour du fichier, section "Cas déclencheurs").
- Article Le Guide déjà existant sur le combo (`content/guide/combo.md`, slug stable `combo`) affirme aujourd'hui "ça ne change ni ton XP ni ton or" — **doit être corrigé dans la même PR** (comportement documenté qui change, cf. `CLAUDE.md` § Documentation utilisateur). `NOTION_TOKEN` absent de `.env.example` en local → édition directe du fichier Markdown (pas de passage par Notion), slug inchangé.
- Convention Commits : `fix: description courte`.
- Toujours nommer une migration avec un timestamp strictement postérieur à la dernière migration existante sur la branche au moment de la création du fichier (dernière en date : `20260728100000_add_tasks_deferred_at.sql`).
- **Note de coordination :** ce plan modifie `components/combat/Arena.tsx` (`handleToggle`), tout comme le plan de l'issue #111. Si les deux sont exécutés sur des branches séparées, la seconde mergée devra rebaser son diff.

---

### Task 1 : Migrations + types

**Files:**
- Create: `supabase/migrations/20260729090000_add_profile_combo_state.sql`
- Create: `supabase/migrations/20260729090100_add_tasks_xp_awarded.sql`
- Modify: `types/index.ts` (interfaces `Profile` et `Task`)

**Interfaces:**
- Produces: `Profile.combo_count: number`, `Profile.last_combo_completed_at: string | null`, `Task.xp_awarded: number | null`.

- [ ] **Step 1: Migration profils**

Créer `supabase/migrations/20260729090000_add_profile_combo_state.sql` :

```sql
-- Issue #115 : le combo (série de coups à moins de 15 min d'intervalle)
-- devient authoritative côté serveur pour pouvoir moduler l'XP réellement
-- persistée (auparavant purement visuel/client, jamais fiable pour un calcul
-- économique). `last_combo_completed_at` sert de fenêtre glissante (15 min) ;
-- `combo_count` est la série en cours, remise à 0 dès qu'on décoche, abandonne
-- (rage quit) ou que la fenêtre expire. Deux caches mutables (comme
-- `profiles.gold`/`streak_days`), pas un historique — RG-04 ne s'applique pas.
alter table if exists profiles
  add column if not exists combo_count integer not null default 0,
  add column if not exists last_combo_completed_at timestamptz null;
```

- [ ] **Step 2: Migration tâches**

Créer `supabase/migrations/20260729090100_add_tasks_xp_awarded.sql` :

```sql
-- Issue #115 : montant d'XP réellement accordé à la complétion de cette
-- tâche (peut inclure un bonus combo, cf. comboXpBonus dans
-- lib/game-engine.ts). Nécessaire pour que le décochage rembourse exactement
-- ce qui a été gagné plutôt qu'un flat XP_PER_TASK, qui désynchroniserait
-- l'économie XP dès qu'un bonus combo a été appliqué à la complétion.
-- Nullable : une tâche jamais complétée, ou complétée avant cette migration,
-- n'a pas de valeur (fallback flat XP_PER_TASK au décochage, cf. setTaskCompleted).
alter table if exists tasks
  add column if not exists xp_awarded integer null;
```

- [ ] **Step 3: Appliquer les migrations en local**

Run: `npx supabase db push` (ou la commande locale habituelle du projet pour appliquer les migrations à la base liée).
Expected: les deux migrations s'appliquent sans erreur.

Run: `npx supabase migration list --linked`
Expected: les deux nouvelles migrations apparaissent en Local ET Remote (colonnes alignées) — cf. piège documenté dans `CLAUDE.md` sur les migrations hors-ordre non signalées.

- [ ] **Step 4: Mettre à jour les types TypeScript**

Dans `types/index.ts`, `interface Profile` (après `webhook_token_last_used_at`, avant `created_at`) :

```ts
  webhook_token_last_used_at: string | null;
  // Issue #115 : combo server-authoritative — cf. lib/game-engine.ts (nextComboState).
  combo_count: number;
  last_combo_completed_at: string | null;
  created_at: string;
```

Dans `interface Task` (après `deferred_at`, avant `day_date`) :

```ts
  deferred_at: string | null;
  // Issue #115 : XP réellement accordée à la complétion (inclut le bonus
  // combo). Nullable : jamais complétée, ou complétée avant cette colonne.
  xp_awarded: number | null;
  day_date: string;
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260729090000_add_profile_combo_state.sql supabase/migrations/20260729090100_add_tasks_xp_awarded.sql types/index.ts
git commit -m "fix: migrations combo server-authoritative + xp_awarded (issue #115)"
```

---

### Task 2 : Fonctions pures combo/XP (`lib/game-engine.ts`)

**Files:**
- Modify: `lib/game-engine.ts` (ajouter après `applyXpDelta`, ligne ~473)
- Test: `lib/game-engine.test.ts`

**Interfaces:**
- Produces:
  - `export const COMBO_WINDOW_MS = 15 * 60 * 1000`
  - `export const COMBO_XP_BONUS_PER_TIER = 5`
  - `comboXpBonus(comboCount: number): number`
  - `xpForCompletion(comboCount: number): number`
  - `export interface ComboState { comboCount: number; lastCompletedAt: string | null }`
  - `nextComboState(current: ComboState, now: Date): ComboState`

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter dans `lib/game-engine.test.ts`, après le `describe("applyXpDelta (US-09)", ...)` (ligne ~829-870), et ajouter à l'import en haut du fichier : `comboXpBonus`, `xpForCompletion`, `nextComboState`, `COMBO_WINDOW_MS` :

```ts
describe("comboXpBonus / xpForCompletion (issue #115)", () => {
  test("aucun bonus tant que le combo n'affiche rien (< x2)", () => {
    expect(comboXpBonus(0)).toBe(0);
    expect(comboXpBonus(1)).toBe(0);
    expect(xpForCompletion(1)).toBe(XP_PER_TASK);
  });

  test("+5 XP par palier au-delà de x2 (x2=+5, x3=+10, x4=+15)", () => {
    expect(comboXpBonus(2)).toBe(5);
    expect(comboXpBonus(3)).toBe(10);
    expect(comboXpBonus(4)).toBe(15);
    expect(xpForCompletion(2)).toBe(35);
    expect(xpForCompletion(3)).toBe(40);
    expect(xpForCompletion(4)).toBe(45);
  });

  test("non cappé au-delà de x4", () => {
    expect(xpForCompletion(10)).toBe(30 + 5 * 9);
  });
});

describe("nextComboState (issue #115)", () => {
  test("première complétion (aucun historique) : combo=1", () => {
    const now = new Date("2026-07-29T10:00:00.000Z");
    const result = nextComboState({ comboCount: 0, lastCompletedAt: null }, now);
    expect(result).toEqual({ comboCount: 1, lastCompletedAt: now.toISOString() });
  });

  test("moins de 15 min depuis le dernier coup : la série continue", () => {
    const now = new Date("2026-07-29T10:14:59.000Z");
    const result = nextComboState(
      { comboCount: 2, lastCompletedAt: "2026-07-29T10:00:00.000Z" },
      now,
    );
    expect(result).toEqual({ comboCount: 3, lastCompletedAt: now.toISOString() });
  });

  test("exactement 15 min : la série continue encore (borne incluse)", () => {
    const now = new Date("2026-07-29T10:15:00.000Z");
    const result = nextComboState(
      { comboCount: 1, lastCompletedAt: "2026-07-29T10:00:00.000Z" },
      now,
    );
    expect(result.comboCount).toBe(2);
  });

  test("plus de 15 min depuis le dernier coup : la série repart de 1", () => {
    const now = new Date("2026-07-29T10:15:01.000Z");
    const result = nextComboState(
      { comboCount: 5, lastCompletedAt: "2026-07-29T10:00:00.000Z" },
      now,
    );
    expect(result).toEqual({ comboCount: 1, lastCompletedAt: now.toISOString() });
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test -- lib/game-engine.test.ts -t "issue #115"`
Expected: FAIL ("comboXpBonus is not defined" ou équivalent).

- [ ] **Step 3: Implémenter**

Ajouter dans `lib/game-engine.ts`, juste après la fonction `applyXpDelta` (après la ligne `473`) :

```ts
export const COMBO_WINDOW_MS = 15 * 60 * 1000;
export const COMBO_XP_BONUS_PER_TIER = 5;

// Issue #115 : bonus d'XP lié au palier de combo courant. 0 tant que le combo
// n'affiche rien (cohérent avec comboLabel, qui ne s'affiche qu'à partir de
// x2). +5 par palier au-delà : x2=+5, x3=+10, x4=+15, non cappé.
export function comboXpBonus(comboCount: number): number {
  return comboCount >= 2 ? COMBO_XP_BONUS_PER_TIER * (comboCount - 1) : 0;
}

export function xpForCompletion(comboCount: number): number {
  return XP_PER_TASK + comboXpBonus(comboCount);
}

export interface ComboState {
  comboCount: number;
  lastCompletedAt: string | null; // ISO
}

// Issue #115 : prochain état du combo après une complétion, à l'instant
// `now`. Fenêtre glissante de 15 min : si le dernier coup date de 15 min ou
// moins, la série continue (+1) ; sinon elle repart de 1 (ce coup compte
// comme le premier d'une nouvelle série, pas comme une rupture silencieuse).
export function nextComboState(current: ComboState, now: Date): ComboState {
  const withinWindow =
    current.lastCompletedAt !== null &&
    now.getTime() - new Date(current.lastCompletedAt).getTime() <= COMBO_WINDOW_MS;
  const comboCount = withinWindow ? current.comboCount + 1 : 1;
  return { comboCount, lastCompletedAt: now.toISOString() };
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test -- lib/game-engine.test.ts -t "issue #115"`
Expected: PASS.

Run: `npm test`
Expected: PASS, 0 échec.

- [ ] **Step 5: Commit**

```bash
git add lib/game-engine.ts lib/game-engine.test.ts
git commit -m "feat: fonctions pures combo (fenêtre 15min) et bonus XP par palier (issue #115)"
```

---

### Task 3 : Serveur authoritative (`app/actions/tasks.ts`)

**Files:**
- Modify: `app/actions/tasks.ts:5-14` (imports), `:28-35` (`TaskActionResult`), `:158-245` (`setTaskCompleted`), `:301-317` (`rageQuitTask`, bloc malus XP)

**Interfaces:**
- Consumes: `nextComboState`, `xpForCompletion`, `ComboState` (Task 2).
- Produces: `TaskActionResult.comboCount?: number`.

- [ ] **Step 1: Étendre les imports et `TaskActionResult`**

Dans `app/actions/tasks.ts`, l'import depuis `@/lib/game-engine` (lignes 5-14) :

```ts
import {
  applyRageQuitPenalty,
  applyXpDelta,
  collectAbandonCascade,
  dayKey,
  isNestableParent,
  nextComboState,
  nextSiblingPosition,
  RAGE_QUIT_XP_PENALTY,
  xpForCompletion,
  XP_PER_TASK,
} from "@/lib/game-engine";
```

`TaskActionResult` (lignes 28-35) :

```ts
export interface TaskActionResult {
  error: string | null;
  id?: string;
  level?: number;
  xp?: number;
  leveledUp?: boolean;
  deferredTasks?: Task[];
  comboCount?: number;
}
```

- [ ] **Step 2: Réécrire `setTaskCompleted`**

Remplacer entièrement la fonction `setTaskCompleted` (lignes 158-245) par :

```ts
export async function setTaskCompleted(
  id: string,
  isCompleted: boolean,
): Promise<TaskActionResult> {
  // Fix #95 : un id `optimistic-*` arrive ici si l'utilisateur toggle une
  // tâche dont la création n'est pas encore confirmée par le serveur (tap
  // rapide avant résolution de `addTask`). Sans cette garde, l'id forgé
  // remonte jusqu'à PostgREST `.eq("id", "optimistic-N")` → 0 ligne ou erreur
  // uuid incompréhensible côté client ("Le coup n'est pas passé"). Message
  // métier dédié plutôt que l'erreur générique UUID.
  if (!UUID_RE.test(id)) {
    return {
      error: isCompleted
        ? "La tâche n'est pas encore prête, réessaie dans un instant."
        : "Impossible d'annuler pour l'instant, réessaie dans un instant.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Session expirée. Reconnecte-toi." };
  }

  const { data: existingTask, error: fetchError } = await supabase
    .from("tasks")
    .select("is_completed, is_abandoned, xp_awarded")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchError || !existingTask) {
    return {
      error: isCompleted
        ? "Le coup n'est pas passé. Réessaie."
        : "Impossible d'annuler le coup. Réessaie.",
    };
  }

  const { error: updateError } = await supabase
    .from("tasks")
    .update({ is_completed: isCompleted, deferred_at: null })
    .eq("id", id)
    .eq("user_id", user.id);

  if (updateError) {
    return {
      error: isCompleted
        ? "Le coup n'est pas passé. Réessaie."
        : "Impossible d'annuler le coup. Réessaie.",
    };
  }

  const isRealTransition = existingTask.is_completed !== isCompleted;
  let level: number | undefined;
  let xp: number | undefined;
  let leveledUp = false;
  let comboCount: number | undefined;

  // Le profil n'est jamais absent en usage normal (onboarding le garantit) ;
  // si le fetch échoue quand même, on ne bloque pas la validation de la
  // tâche pour autant — seul le gain d'XP est perdu pour ce coup.
  if (isRealTransition && !existingTask.is_abandoned) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("level, xp, combo_count, last_combo_completed_at")
      .eq("id", user.id)
      .maybeSingle();

    if (!profileError && profile) {
      if (isCompleted) {
        // Issue #115 : combo server-authoritative — série de coups à moins de
        // 15 min d'intervalle, module l'XP réellement accordée à ce coup.
        const nextCombo = nextComboState(
          {
            comboCount: profile.combo_count,
            lastCompletedAt: profile.last_combo_completed_at,
          },
          new Date(),
        );
        const xpDelta = xpForCompletion(nextCombo.comboCount);
        const nextXp = applyXpDelta(profile, xpDelta);
        leveledUp = nextXp.level > profile.level;
        level = nextXp.level;
        xp = nextXp.xp;
        comboCount = nextCombo.comboCount;

        await supabase
          .from("profiles")
          .update({
            level: nextXp.level,
            xp: nextXp.xp,
            combo_count: nextCombo.comboCount,
            last_combo_completed_at: nextCombo.lastCompletedAt,
          })
          .eq("id", user.id);

        await supabase
          .from("tasks")
          .update({ xp_awarded: xpDelta })
          .eq("id", id)
          .eq("user_id", user.id);
      } else {
        // Décocher : rembourse exactement ce qui avait été accordé (fallback
        // flat XP_PER_TASK pour une tâche complétée avant cette migration,
        // donc sans xp_awarded stocké) et casse la série, comme un abandon.
        const refund = existingTask.xp_awarded ?? XP_PER_TASK;
        const nextXp = applyXpDelta(profile, -refund);
        leveledUp = nextXp.level > profile.level;
        level = nextXp.level;
        xp = nextXp.xp;
        comboCount = 0;

        await supabase
          .from("profiles")
          .update({
            level: nextXp.level,
            xp: nextXp.xp,
            combo_count: 0,
            last_combo_completed_at: null,
          })
          .eq("id", user.id);

        await supabase
          .from("tasks")
          .update({ xp_awarded: null })
          .eq("id", id)
          .eq("user_id", user.id);
      }
    }
  }

  revalidatePath("/");
  return { error: null, level, xp, leveledUp, comboCount };
}
```

- [ ] **Step 3: Casser le combo aussi au Rage Quit**

Dans `rageQuitTask` (`app/actions/tasks.ts`), le bloc qui applique le malus XP (repérer `applyRageQuitPenalty` puis le `.update` qui suit) :

```ts
  if (profile) {
    const next = applyRageQuitPenalty(profile);
    level = next.level;
    xp = next.xp;
    await supabase
      .from("profiles")
      .update({ level: next.level, xp: next.xp })
      .eq("id", user.id);
  }
```

devient :

```ts
  if (profile) {
    const next = applyRageQuitPenalty(profile);
    level = next.level;
    xp = next.xp;
    // Issue #115 : abandonner brise la série, comme décocher — le combo n'a
    // plus de raison d'être client-only "purement visuel" une fois qu'il
    // module l'XP réelle, il doit rester cohérent avec le serveur en toutes
    // circonstances.
    await supabase
      .from("profiles")
      .update({
        level: next.level,
        xp: next.xp,
        combo_count: 0,
        last_combo_completed_at: null,
      })
      .eq("id", user.id);
  }
```

- [ ] **Step 4: Vérification TypeScript**

Run: `npx tsc --noEmit`
Expected: 0 erreur.

- [ ] **Step 5: Commit**

```bash
git add app/actions/tasks.ts
git commit -m "fix: combo server-authoritative module l'XP réelle, remboursement exact au décochage (issue #115)"
```

---

### Task 4 : Client — combo optimiste resynchronisé (`components/combat/Arena.tsx`)

**Files:**
- Modify: `components/combat/Arena.tsx:39-40` (imports), `:170-176` (state combo), `:212` (refs), `:416-437` (`bumpCombo`/`resetCombo`), `:632-639` (invocation dans `handleToggle`), `:673-681` (reconciliation fin de `handleToggle`), `:785` (Rage Quit)

**Interfaces:**
- Consumes: `nextComboState`, `ComboState` (Task 2) ; `TaskActionResult.comboCount` (Task 3).

- [ ] **Step 1: Importer `nextComboState` et le type `ComboState`**

Ajouter à l'import `@/lib/game-engine` (ligne 39-40, à côté de `comboLabel`/`comboIntensity`) :

```ts
  comboLabel,
  comboIntensity,
  nextComboState,
  type ComboState,
```

- [ ] **Step 2: Ajouter une ref pour l'horodatage local du dernier coup**

À côté de `comboCounterRef` (`components/combat/Arena.tsx:212`), ajouter :

```ts
  const comboCounterRef = useRef(0);
  // Issue #115 : horodatage (ISO) du dernier coup, pour le calcul optimiste
  // local de la fenêtre de 15 min — resynchronisé par la réponse serveur
  // (source de vérité), jamais persisté seul côté client.
  const lastComboCompletedAtRef = useRef<string | null>(null);
```

- [ ] **Step 3: Réécrire `bumpCombo` en version optimiste basée sur la fenêtre de 15 min**

Remplacer la fonction `bumpCombo` actuelle (`components/combat/Arena.tsx:416-431`) :

```ts
  function bumpCombo(hits: number) {
    setComboCount((current) => {
      const next = current + hits;
      const label = comboLabel(next);
      if (label) {
        comboCounterRef.current += 1;
        const key = comboCounterRef.current;
        setComboFlash({ key, label, intensity: comboIntensity(next) });
        if (comboTimeoutRef.current) clearTimeout(comboTimeoutRef.current);
        comboTimeoutRef.current = setTimeout(() => {
          setComboFlash((c) => (c?.key === key ? null : c));
        }, 1200);
      }
      return next;
    });
  }
```

par :

```ts
  // Issue #115 : le combo module désormais l'XP réelle (calculée
  // server-authoritative dans setTaskCompleted). Ce guess optimiste applique
  // la même fenêtre de 15 min localement pour un feedback instantané ; il est
  // resynchronisé silencieusement sur `comboCount` renvoyé par le serveur une
  // fois la réponse arrivée (cf. fin de handleToggle), sans redéclencher le
  // flash si la valeur ne change pas.
  function bumpComboOptimistic(hits: number) {
    const now = new Date();
    let state: ComboState = {
      comboCount,
      lastCompletedAt: lastComboCompletedAtRef.current,
    };
    for (let i = 0; i < hits; i += 1) {
      state = nextComboState(state, now);
    }
    lastComboCompletedAtRef.current = state.lastCompletedAt;

    const label = comboLabel(state.comboCount);
    if (label) {
      comboCounterRef.current += 1;
      const key = comboCounterRef.current;
      setComboFlash({ key, label, intensity: comboIntensity(state.comboCount) });
      if (comboTimeoutRef.current) clearTimeout(comboTimeoutRef.current);
      comboTimeoutRef.current = setTimeout(() => {
        setComboFlash((c) => (c?.key === key ? null : c));
      }, 1200);
    }
    setComboCount(state.comboCount);
  }
```

- [ ] **Step 4: `resetCombo` efface aussi l'horodatage local**

`components/combat/Arena.tsx:433-437` :

```ts
  function resetCombo() {
    setComboCount(0);
    setComboFlash(null);
    if (comboTimeoutRef.current) clearTimeout(comboTimeoutRef.current);
  }
```

devient :

```ts
  function resetCombo() {
    setComboCount(0);
    setComboFlash(null);
    lastComboCompletedAtRef.current = null;
    if (comboTimeoutRef.current) clearTimeout(comboTimeoutRef.current);
  }
```

- [ ] **Step 5: Utiliser la version optimiste dans `handleToggle`, puis resynchroniser**

`components/combat/Arena.tsx:634-636` (appel actuel) :

```ts
    if (isCompleted) {
      const hits = cascade.filter((change) => change.isCompleted).length;
      if (hits > 0) bumpCombo(hits);
    } else {
      resetCombo();
    }
```

devient :

```ts
    if (isCompleted) {
      const hits = cascade.filter((change) => change.isCompleted).length;
      if (hits > 0) bumpComboOptimistic(hits);
    } else {
      resetCombo();
    }
```

Puis, dans la reconciliation de fin de fonction (`components/combat/Arena.tsx:678-681`) :

```ts
    const { level, xp } = lastResult ?? {};
    if (level !== undefined && xp !== undefined) {
      setProfile((current) => ({ ...current, level, xp }));
    }
```

devient (ajout de la resynchronisation silencieuse, sans redéclencher le flash) :

```ts
    const { level, xp, comboCount: serverComboCount } = lastResult ?? {};
    if (level !== undefined && xp !== undefined) {
      setProfile((current) => ({ ...current, level, xp }));
    }
    if (serverComboCount !== undefined) {
      setComboCount(serverComboCount);
    }
```

- [ ] **Step 6: Vérifications**

Run: `npm test`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: 0 erreur.

Dans `npm run dev` : cocher 2 tâches coup sur coup → "DOUBLE COUP !" + XP visible plus élevée au 2ᵉ coup (vérifier via le pulse XP ou un log réseau). Cocher une tâche, attendre >15 min (ou modifier temporairement `COMBO_WINDOW_MS` en dev pour tester plus vite), cocher une 2ᵉ tâche → pas de bannière combo, XP standard (30) sur ce coup.

- [ ] **Step 7: Commit**

```bash
git add components/combat/Arena.tsx
git commit -m "fix: combo client resynchronisé sur l'état serveur, fenêtre 15min (issue #115)"
```

---

### Task 5 : Documentation (CLAUDE.md, CHANGELOG, Le Guide)

**Files:**
- Modify: `CLAUDE.md` (section "Pièges et décisions non-évidentes")
- Modify: `CHANGELOG.md` (`## [Unreleased]`)
- Modify: `content/guide/combo.md`

**Interfaces:** aucune (documentation).

- [ ] **Step 1: Ajouter un piège dans `CLAUDE.md`**

Ajouter une nouvelle entrée dans la section "Pièges et décisions non-évidentes" (juste avant la ligne `## URL de production`) :

```markdown
**Combo server-authoritative, module l'XP réelle (issue #115)** — Le combo (`comboLabel`/`comboIntensity`, `lib/game-engine.ts`) n'est plus purement visuel : il ne monte que si deux tâches sont cochées à moins de 15 min d'intervalle (`nextComboState`, fenêtre glissante `COMBO_WINDOW_MS`) et ajoute un bonus d'XP par palier (`xpForCompletion`/`comboXpBonus` : x2=+5, x3=+10, x4=+15, non cappé). L'état (`profiles.combo_count`/`last_combo_completed_at`) est **server-authoritative** — cohérent avec le fait que l'XP est déjà calculée uniquement côté serveur (`setTaskCompleted`, le client ne fait que de l'optimistic UI toujours écrasé par la réponse serveur). Décocher une tâche **rembourse exactement** le montant réellement accordé à sa complétion (`tasks.xp_awarded`, nullable — fallback `XP_PER_TASK` pour une tâche complétée avant cette migration) plutôt qu'un flat `XP_PER_TASK`, pour ne jamais désynchroniser l'économie XP. Décocher et Rage Quit cassent tous les deux la série (`combo_count=0`). Le client garde un guess optimiste local (même fenêtre de 15 min, `lastComboCompletedAtRef`) pour le feedback instantané, resynchronisé silencieusement sur la valeur serveur après coup — même patron que `level`/`xp`.
```

- [ ] **Step 2: Changelog**

Ajouter dans `CHANGELOG.md` sous `## [Unreleased]` :

```markdown
- fix: le combo ne monte plus que si 2 tâches sont cochées à moins de 15 min d'intervalle, et augmente légèrement l'XP gagnée par palier (issue #115)
```

- [ ] **Step 3: Mettre à jour l'article Le Guide**

Remplacer le contenu de `content/guide/combo.md` :

```markdown
Enchaîne les tâches à moins de 15 minutes d'intervalle et le combo grimpe : DOUBLE COUP, COMBO ×N, jusqu'au M-M-MONSTER COMBO. À partir du double coup, chaque palier ajoute un petit bonus d'XP (+5 par palier). Décocher une tâche ou abandonner brise la série.
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md CHANGELOG.md content/guide/combo.md
git commit -m "docs: combo server-authoritative + bonus XP par palier (issue #115)"
```

---

## Self-Review

**Spec coverage :**
- "Le combo ne s'incrémente que si 2 tâches sont cochées à moins de 15 minutes d'intervalle" → Task 2 (`nextComboState`) + Task 3 (branché côté serveur, seule source de vérité pour l'XP).
- "Le système de combo augmente légèrement l'XP gagnée (x2 +35, x3 +40, x4 +45)" → Task 2 (`xpForCompletion`), vérifié par test explicite sur ces 3 valeurs exactes.
- Remboursement cohérent au décochage (implicite mais nécessaire pour ne pas casser l'économie XP existante) → Task 1 (`tasks.xp_awarded`) + Task 3.
- Doc utilisateur du comportement documenté qui change → Task 5.

**Placeholder scan :** aucun — chaque étape fournit le code/SQL/Markdown complet.

**Type consistency :** `ComboState` (Task 2) est utilisé identiquement côté serveur (`app/actions/tasks.ts`, à partir des colonnes `profiles.combo_count`/`last_combo_completed_at`) et côté client (`Arena.tsx`, à partir de l'état React + `lastComboCompletedAtRef`) — mêmes noms de champs (`comboCount`, `lastCompletedAt`) dans les deux. `TaskActionResult.comboCount` (Task 3) est bien le nom lu côté client (Task 4, Step 5).
