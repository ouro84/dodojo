# Planifier tâche du lendemain (issue #116) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Laisser l'utilisateur, après une heure seuil réglable (12h-23h), créer des tâches pour demain et reporter des tâches du jour vers demain, sans jamais impacter le Boss/Héros du jour courant.

**Architecture:** Aucun nouveau statut de tâche — une tâche "pour demain" est une ligne `tasks` normale avec `day_date` = jour local suivant. L'Arène garde deux states client distincts (`tasks` = aujourd'hui, `tomorrowTasks` = demain) ; les actions de report/retour déplacent des lignes entre les deux, jamais de fusion. Nouvelle colonne `profiles.plan_tomorrow_after_hour` gate l'apparition de toute l'UI.

**Tech Stack:** Next.js 16 App Router, Supabase (migrations SQL), TypeScript strict, Vitest (fonctions pures `lib/game-engine.ts`, `lib/copy/*`, `lib/task-insertion.ts`), Playwright (`e2e/*.spec.ts`, `page.clock` pour le temps déterministe).

## Global Constraints

- TypeScript strict, jamais de `any` (cf. CLAUDE.md règle de code n°1).
- Toute logique de calcul de jeu (dates, HP) vit dans `lib/game-engine.ts`, pure et testée Vitest — jamais dans un composant.
- RG-04 : jamais de `DELETE` SQL. Tout abandon passe par `is_abandoned=true` + `abandon_reason`.
- Français partout côté UI/copy ; identifiants/code en anglais comme le reste du repo.
- `deferred_at` (malus -20 HP "reste reporté", US-08) ne doit **jamais** être posé par les nouvelles actions de ce plan — toujours explicitement remis à `null` sur tout changement de `day_date` qu'elles opèrent (cf. spec § Feature B).
- Toute mutation faite depuis un composant client déjà monté doit soit renvoyer les lignes affectées pour merge explicite du state (jamais un simple `revalidatePath` seul, cf. bug #70 documenté dans CLAUDE.md), soit être un aller simple sans besoin de merge.
- Borne produit `plan_tomorrow_after_hour` : 12-23 (UI **et** `CHECK` SQL).
- Commits Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`), un commit par tâche de ce plan.
- Spec de référence : `docs/superpowers/specs/2026-07-31-issue116-planifier-lendemain-design.md`.
- **Simplification assumée par rapport au spec** (à valider/objecter avant exécution si besoin) : le spec prévoyait une action `undoReportToTomorrow` dédiée restaurant position/deadline exacts. Ce plan **fusionne** cette annulation avec l'action permanente `bringToToday` (même effet serveur : jour → aujourd'hui, deadline effacée, position en fin de fratrie) — la perte (position exacte restaurée) est mineure face au gain (une seule action pour les deux usages, moins de code à maintenir) sur une fenêtre d'annulation de ~5s. Voir Task 4.

---

## Task 1: Migration — `profiles.plan_tomorrow_after_hour`

**Files:**
- Create: `supabase/migrations/20260731200000_add_profile_plan_tomorrow_after_hour.sql`
- Modify: `types/index.ts:1-29` (interface `Profile`)

**Interfaces:**
- Produces: colonne `profiles.plan_tomorrow_after_hour: int` (12-23, défaut 18, not null) ; champ `Profile.plan_tomorrow_after_hour: number`.

- [ ] **Step 1: Écrire la migration SQL**

```sql
-- Issue #116 : heure locale (bornée 12-23) à partir de laquelle l'Arène
-- propose de planifier une tâche pour demain / reporter une tâche du jour
-- vers demain (section "Demain"). Défaut 18 (fin de journée typique).
alter table profiles
  add column plan_tomorrow_after_hour int not null default 18
  check (plan_tomorrow_after_hour between 12 and 23);

comment on column profiles.plan_tomorrow_after_hour is
  'Heure locale (12-23) à partir de laquelle la section "Demain" de l''Arène se débloque (issue #116).';
```

- [ ] **Step 2: Appliquer la migration en local**

Run: `npx supabase db push` (ou la commande locale déjà utilisée par le projet pour appliquer les migrations à la base de dev).
Expected: colonne `plan_tomorrow_after_hour` visible sur `profiles` (`npx supabase migration list --linked` doit montrer cette migration en Local **et** Remote une fois poussée — cf. piège CLAUDE.md sur les migrations hors-ordre).

- [ ] **Step 3: Ajouter le champ au type `Profile`**

Dans `types/index.ts`, juste après `reminder_offset_minutes: number;` (ligne 27) :

```ts
  // Issue #116 : heure locale (12-23) de déblocage de la section "Demain".
  plan_tomorrow_after_hour: number;
```

- [ ] **Step 4: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune nouvelle erreur (le type `Profile` est utilisé avec `.select("*")` dans `app/page.tsx`, donc aucun autre site à corriger à ce stade).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260731200000_add_profile_plan_tomorrow_after_hour.sql types/index.ts
git commit -m "feat: ajoute profiles.plan_tomorrow_after_hour (issue #116)"
```

---

## Task 2: `lib/game-engine.ts` — `nextDayKey` + `isPlanningUnlocked`

**Files:**
- Modify: `lib/game-engine.ts` (ajouter après `dayKey`, ligne ~635)
- Test: `lib/game-engine.test.ts` (ajouter après le bloc de tests `dayKey` existant)

**Interfaces:**
- Produces: `nextDayKey(dayDate: string): string`, `isPlanningUnlocked(now: Date, timezone: string, thresholdHour: number): boolean`.

- [ ] **Step 1: Écrire les tests (échouent — fonctions non définies)**

Dans `lib/game-engine.test.ts`, ajouter (imports `nextDayKey, isPlanningUnlocked` à ajouter en haut du fichier avec les autres imports nommés de `./game-engine`) :

```ts
describe("nextDayKey (issue #116)", () => {
  test("jour suivant dans le même mois", () => {
    expect(nextDayKey("2026-07-31".slice(0, 7) + "-15")).toBe("2026-07-16");
  });

  test("bascule de mois", () => {
    expect(nextDayKey("2026-07-31")).toBe("2026-08-01");
  });

  test("bascule d'année", () => {
    expect(nextDayKey("2026-12-31")).toBe("2027-01-01");
  });

  test("insensible au fuseau — arithmétique sur le calendrier, pas sur un instant (cf. deadlineIso DST)", () => {
    // 2026-03-29 : jour de passage à l'heure d'été en Europe (transition 01h00 UTC).
    // nextDayKey n'a pas à connaître de fuseau : la date suivante est toujours
    // simplement "le jour calendaire d'après", quelle que soit la transition DST
    // qui s'y produit dans tel ou tel fuseau.
    expect(nextDayKey("2026-03-29")).toBe("2026-03-30");
  });
});

describe("isPlanningUnlocked (issue #116)", () => {
  // 2026-01-15T17:00:00Z = 18h00 à Paris (UTC+1, hors DST — 15 janvier).
  test("heure locale >= seuil → true", () => {
    expect(isPlanningUnlocked(new Date("2026-01-15T17:00:00.000Z"), "Europe/Paris", 18)).toBe(true);
  });

  test("heure locale juste avant le seuil → false", () => {
    expect(isPlanningUnlocked(new Date("2026-01-15T16:59:00.000Z"), "Europe/Paris", 18)).toBe(false);
  });

  test("seuil à la borne haute (23) : débloqué seulement à 23h locale", () => {
    expect(isPlanningUnlocked(new Date("2026-01-15T22:00:00.000Z"), "Europe/Paris", 23)).toBe(true); // 23h locale
    expect(isPlanningUnlocked(new Date("2026-01-15T21:59:00.000Z"), "Europe/Paris", 23)).toBe(false); // 22h59 locale
  });

  test("seuil à la borne basse (12) : débloqué dès midi locale", () => {
    expect(isPlanningUnlocked(new Date("2026-01-15T11:00:00.000Z"), "Europe/Paris", 12)).toBe(true); // 12h locale
    expect(isPlanningUnlocked(new Date("2026-01-15T10:59:00.000Z"), "Europe/Paris", 12)).toBe(false); // 11h59 locale
  });
});
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `npx vitest run lib/game-engine.test.ts -t "nextDayKey|isPlanningUnlocked"`
Expected: FAIL — `nextDayKey is not defined` / `isPlanningUnlocked is not defined`.

- [ ] **Step 3: Implémenter les deux fonctions**

Dans `lib/game-engine.ts`, juste après la fonction `dayKey` (après la ligne `}` qui la ferme, ~ligne 635) :

```ts
// Issue #116 : jour calendaire suivant `dayDate` (format YYYY-MM-DD). Arithmétique
// ancrée en UTC sur la date elle-même (pas sur un instant local) — un day_date
// est une étiquette calendaire, pas un horodatage ; ajouter 24h en UTC et
// reformater en UTC donne toujours "le jour d'après", indépendamment de toute
// transition DST qui se produirait ce jour-là dans le fuseau de l'utilisateur
// (même piège que documenté pour deadlineIso, évité ici en ne touchant jamais
// à un fuseau non-UTC).
export function nextDayKey(dayDate: string): string {
  return dayKey(new Date(Date.parse(`${dayDate}T00:00:00Z`) + 86_400_000), "UTC");
}

// Issue #116 : la section "Demain" (et l'icône de report) ne se débloquent
// qu'à partir de `thresholdHour` (heure LOCALE, cf. profiles.plan_tomorrow_after_hour,
// borné 12-23). Recalculée à chaque rendu depuis le `now` déjà existant du
// polling deadline (~45s, US-05) — pas de timer dédié.
export function isPlanningUnlocked(
  now: Date,
  timezone: string,
  thresholdHour: number,
): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const localHour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  return localHour >= thresholdHour;
}
```

- [ ] **Step 4: Lancer les tests, vérifier le succès**

Run: `npx vitest run lib/game-engine.test.ts -t "nextDayKey|isPlanningUnlocked"`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/game-engine.ts lib/game-engine.test.ts
git commit -m "feat: ajoute nextDayKey et isPlanningUnlocked (issue #116)"
```

---

## Task 3: `lib/task-insertion.ts` — jour cible explicite

**Files:**
- Modify: `lib/task-insertion.ts`
- Test: `lib/task-insertion.test.ts`

**Interfaces:**
- Consumes: `nextDayKey` n'est PAS utilisé ici (l'appelant calcule le jour cible et le passe déjà résolu).
- Produces: `InsertTaskParams.dayDate?: string` — si fourni, remplace `dayKey(new Date(), timezone)` comme jour cible de l'insertion. Défaut inchangé pour tout appelant existant (`addTask`, webhook Siri, MCP Gemini) qui omet ce champ.

- [ ] **Step 1: Écrire le test (échoue — le champ n'existe pas encore)**

Ajouter dans `lib/task-insertion.test.ts`, dans le `describe` existant :

```ts
  test("dayDate explicite (issue #116) : ignore dayKey(now), insère sur le jour fourni", async () => {
    const tables: Record<string, Row[]> = { tasks: [] };

    const outcome = await insertTaskForUser(fakeSupabase(tables), {
      userId: "u1",
      title: "Préparer demain",
      timezone: "Europe/Paris",
      dayDate: "2026-07-23",
    });

    expect(outcome.dayDate).toBe("2026-07-23");
    expect(tables.tasks[0]).toMatchObject({ day_date: "2026-07-23" });
  });
```

- [ ] **Step 2: Lancer le test, vérifier l'échec**

Run: `npx vitest run lib/task-insertion.test.ts -t "dayDate explicite"`
Expected: FAIL — le résultat contient `dayDate: "2026-07-22"` (calculé depuis `NOW`, le paramètre `dayDate` est ignoré silencieusement par TypeScript structurel... en réalité le test échoue sur `outcome.dayDate` qui vaut la date de `NOW`, pas `"2026-07-23"`).

- [ ] **Step 3: Implémenter**

Dans `lib/task-insertion.ts`, remplacer :

```ts
export interface InsertTaskParams {
  userId: string;
  title: string;
  timezone: string;
}
```

par :

```ts
export interface InsertTaskParams {
  userId: string;
  title: string;
  timezone: string;
  // Issue #116 : jour cible explicite (ex. demain, pour la section "Demain").
  // Omis = comportement inchangé (aujourd'hui, dérivé de timezone).
  dayDate?: string;
}
```

Puis remplacer la ligne :

```ts
  const dayDate = dayKey(new Date(), timezone);
```

par :

```ts
  const dayDate = params.dayDate ?? dayKey(new Date(), timezone);
```

Et adapter la signature de la fonction (déstructuration) en conséquence — remplacer :

```ts
export async function insertTaskForUser(
  supabase: SupabaseClient,
  { userId, title, timezone }: InsertTaskParams,
): Promise<InsertTaskOutcome> {
  const dayDate = dayKey(new Date(), timezone);
```

par :

```ts
export async function insertTaskForUser(
  supabase: SupabaseClient,
  params: InsertTaskParams,
): Promise<InsertTaskOutcome> {
  const { userId, title, timezone } = params;
  const dayDate = params.dayDate ?? dayKey(new Date(), timezone);
```

- [ ] **Step 4: Lancer tous les tests du fichier, vérifier le succès**

Run: `npx vitest run lib/task-insertion.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/task-insertion.ts lib/task-insertion.test.ts
git commit -m "feat: insertTaskForUser accepte un day_date explicite (issue #116)"
```

---

## Task 4: `app/actions/tasks.ts` — fix `addSubtask` + nouvelles actions

**Files:**
- Modify: `app/actions/tasks.ts`
- Test: `app/actions/tasks.test.ts`

**Interfaces:**
- Consumes: `nextDayKey` (Task 2), `nextSiblingPosition`, `dayKey` (déjà importés), `insertTaskForUser` avec `dayDate` (Task 3).
- Produces: `addTomorrowTask(title: string): Promise<TaskActionResult>`, `reportToTomorrow(id: string): Promise<TaskActionResult>` (résultat porte `reportedTasks?: Task[]`), `bringToToday(id: string): Promise<TaskActionResult>` (résultat porte `broughtBackTasks?: Task[]`). `addSubtask` corrigé pour hériter du `day_date` du parent au lieu de toujours "aujourd'hui".

**Bug corrigé au passage** : `addSubtask` utilisait systématiquement `userToday(...)` comme `day_date` de la sous-tâche, quel que soit le `day_date` du parent. Sans correction, ajouter une sous-tâche à une tâche de la section "Demain" créerait une sous-tâche datée d'aujourd'hui — incohérence parent/enfant qui casserait le filtre RG-03 (la sous-tâche apparaîtrait dans le combat du jour alors que son parent est encore "demain").

- [ ] **Step 1: Écrire les tests des nouvelles actions (guards UUID — échouent, fonctions non définies)**

Ajouter dans `app/actions/tasks.test.ts`, dans le `describe("Server actions — guards UUID (issues #95/#96)")` existant :

```ts
  test("reportToTomorrow rejette un id optimistic sans appeler Supabase", async () => {
    const { reportToTomorrow } = await import("./tasks");
    const result = await reportToTomorrow("optimistic-6");
    expect(result.error).toMatch(/pas encore prête/);
    expect(fakeClient.calls).toBe(0);
    expect(revalidateCalls).toBe(0);
  });

  test("bringToToday rejette un id optimistic sans appeler Supabase", async () => {
    const { bringToToday } = await import("./tasks");
    const result = await bringToToday("optimistic-7");
    expect(result.error).toMatch(/pas encore prête/);
    expect(fakeClient.calls).toBe(0);
    expect(revalidateCalls).toBe(0);
  });
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `npx vitest run app/actions/tasks.test.ts -t "reportToTomorrow|bringToToday"`
Expected: FAIL — `reportToTomorrow`/`bringToToday` ne sont pas exportées de `./tasks`.

- [ ] **Step 3: Étendre `TaskActionResult` et importer `nextDayKey`**

Dans `app/actions/tasks.ts`, remplacer l'import de `@/lib/game-engine` :

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

par (ajout de `nextDayKey`) :

```ts
import {
  applyRageQuitPenalty,
  applyXpDelta,
  collectAbandonCascade,
  dayKey,
  isNestableParent,
  nextComboState,
  nextDayKey,
  nextSiblingPosition,
  RAGE_QUIT_XP_PENALTY,
  xpForCompletion,
  XP_PER_TASK,
} from "@/lib/game-engine";
```

Puis étendre `TaskActionResult` :

```ts
export interface TaskActionResult {
  error: string | null;
  id?: string;
  level?: number;
  xp?: number;
  leveledUp?: boolean;
  deferredTasks?: Task[];
  comboCount?: number;
  newAchievements?: string[];
  // Issue #116 : lignes déplacées vers demain / ramenées à aujourd'hui, pour
  // fusion explicite côté client (même besoin que deferredTasks, cf. bug #70).
  reportedTasks?: Task[];
  broughtBackTasks?: Task[];
}
```

- [ ] **Step 4: Corriger `addSubtask` (hérite du `day_date` du parent)**

Remplacer le bloc (lignes 114-150 environ) :

```ts
  const { data: parent, error: parentError } = await supabase
    .from("tasks")
    .select("id, parent_id, is_abandoned")
    .eq("id", parentId)
    .eq("user_id", user.id)
    .maybeSingle();
```

par :

```ts
  const { data: parent, error: parentError } = await supabase
    .from("tasks")
    // Issue #116 : `day_date` du parent lu ici pour que la sous-tâche hérite
    // du bon jour (une sous-tâche de la section "Demain" doit rester "demain",
    // pas retomber sur "aujourd'hui" comme avant ce correctif).
    .select("id, parent_id, is_abandoned, day_date")
    .eq("id", parentId)
    .eq("user_id", user.id)
    .maybeSingle();
```

Puis remplacer :

```ts
  const today = await userToday(supabase, user.id);
  const { data: inserted, error } = await supabase
    .from("tasks")
    .insert({
      user_id: user.id,
      parent_id: parentId,
      title: trimmed,
      day_date: today,
      position: nextSiblingPosition(siblings ?? []),
    })
```

par :

```ts
  const { data: inserted, error } = await supabase
    .from("tasks")
    .insert({
      user_id: user.id,
      parent_id: parentId,
      title: trimmed,
      day_date: parent.day_date,
      position: nextSiblingPosition(siblings ?? []),
    })
```

(`userToday` reste utilisée ailleurs dans le fichier — ne pas supprimer la fonction elle-même, seulement cet appel devenu inutile dans `addSubtask`.)

- [ ] **Step 5: Ajouter `addTomorrowTask`, `reportToTomorrow`, `bringToToday`**

Ajouter à la fin de `app/actions/tasks.ts` :

```ts
// Issue #116 : crée une tâche directement pour demain (section "Demain" de
// l'Arène, visible après l'heure seuil réglable). Ne soigne jamais le Boss
// d'aujourd'hui : calculateBossMaxHp/CurrentHp ne reçoivent que les tâches
// filtrées day_date == aujourd'hui côté client, l'exclusion est automatique.
export async function addTomorrowTask(title: string): Promise<TaskActionResult> {
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .maybeSingle();

  const timezone = profile?.timezone ?? "UTC";
  const today = dayKey(new Date(), timezone);
  const tomorrow = nextDayKey(today);

  let outcome;
  try {
    outcome = await insertTaskForUser(supabase, {
      userId: user.id,
      title: validation.title,
      timezone,
      dayDate: tomorrow,
    });
  } catch {
    return { error: "Le monstre a résisté à l'invocation. Réessaie." };
  }

  revalidatePath("/");
  return { error: null, id: outcome.taskId };
}

// Issue #116 : reporte une tâche active du jour (+ sous-tâches actives) vers
// demain — sens inverse de deferOverdueTask (US-08). Jamais de malus Hero HP :
// contrairement à un reste (procrastination avérée), c'est une planification
// proactive avant la fin du jour courant. `deferred_at` est explicitement remis
// à null (jamais posé), y compris si la tâche le portait déjà (ex. reste
// reporté par Le Réveil plus tôt aujourd'hui, repoussé encore par cette
// action) — sinon le malus -20 HP réapparaîtrait à tort demain matin alors que
// la tâche ne serait plus "en retard" (son day_date == le "aujourd'hui" de demain).
export async function reportToTomorrow(id: string): Promise<TaskActionResult> {
  if (!UUID_RE.test(id)) {
    return { error: "Cette tâche n'est pas encore prête, réessaie dans un instant." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const today = await userToday(supabase, user.id);
  const tomorrow = nextDayKey(today);

  const { data: tomorrowRoots } = await supabase
    .from("tasks")
    .select("position")
    .eq("user_id", user.id)
    .eq("day_date", tomorrow)
    .is("parent_id", null);

  const { data: updated, error } = await supabase
    .from("tasks")
    .update({
      day_date: tomorrow,
      position: nextSiblingPosition(tomorrowRoots ?? []),
      deadline_at: null,
      deferred_at: null,
    })
    .or(`id.eq.${id},parent_id.eq.${id}`)
    .eq("user_id", user.id)
    .eq("day_date", today)
    .eq("is_completed", false)
    .eq("is_abandoned", false)
    .select();

  if (error) return { error: "Impossible de reporter cette tâche à demain. Réessaie." };
  revalidatePath("/");
  return { error: null, reportedTasks: (updated ?? []) as Task[] };
}

// Issue #116 : ramène une tâche de la section "Demain" à aujourd'hui —
// changement d'avis, OU annulation (~5s) juste après un reportToTomorrow (une
// seule action sert les deux usages, cf. Global Constraints du plan).
// Simplification assumée : pas de restauration exacte de la position/deadline
// d'origine, la tâche revient en fin de fratrie du jour, deadline effacée.
export async function bringToToday(id: string): Promise<TaskActionResult> {
  if (!UUID_RE.test(id)) {
    return { error: "Cette tâche n'est pas encore prête, réessaie dans un instant." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const today = await userToday(supabase, user.id);

  const { data: todayRoots } = await supabase
    .from("tasks")
    .select("position")
    .eq("user_id", user.id)
    .eq("day_date", today)
    .is("parent_id", null);

  const { data: updated, error } = await supabase
    .from("tasks")
    .update({
      day_date: today,
      position: nextSiblingPosition(todayRoots ?? []),
      deadline_at: null,
      deferred_at: null,
    })
    .or(`id.eq.${id},parent_id.eq.${id}`)
    .eq("user_id", user.id)
    .eq("is_abandoned", false)
    .select();

  if (error) return { error: "Impossible de ramener cette tâche à aujourd'hui. Réessaie." };
  revalidatePath("/");
  return { error: null, broughtBackTasks: (updated ?? []) as Task[] };
}
```

- [ ] **Step 6: Lancer tout le fichier de test, vérifier le succès**

Run: `npx vitest run app/actions/tasks.test.ts`
Expected: PASS (tous les tests, y compris les 2 nouveaux).

- [ ] **Step 7: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 8: Commit**

```bash
git add app/actions/tasks.ts app/actions/tasks.test.ts
git commit -m "feat: reportToTomorrow/bringToToday/addTomorrowTask + fix addSubtask day_date (issue #116)"
```

---

## Task 5: `app/actions/profile.ts` — `updatePlanTomorrowAfterHour`

**Files:**
- Modify: `app/actions/profile.ts`

**Interfaces:**
- Produces: `updatePlanTomorrowAfterHour(hour: number): Promise<{ error: string | null }>`.

Pas de test Vitest dédié pour cette action (même précédent que `updateAggressivityLevel`, non testée en unitaire dans ce fichier — couverte par e2e, cf. Task 12).

- [ ] **Step 1: Ajouter l'action**

Ajouter à la fin de `app/actions/profile.ts` :

```ts
// Issue #116 : réglable à tout moment depuis Le Vestiaire (pas one-shot comme
// le pseudo). Borné 12-23 (cf. spec — évite une section "Demain" quasi
// permanente) : le CHECK en base est la garde ultime, rejet précoce ici pour
// un message d'erreur clair côté UI.
export async function updatePlanTomorrowAfterHour(
  hour: number,
): Promise<{ error: string | null }> {
  if (!Number.isInteger(hour) || hour < 12 || hour > 23) {
    return { error: "Heure de planification invalide." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const { error } = await supabase
    .from("profiles")
    .update({ plan_tomorrow_after_hour: hour })
    .eq("id", user.id);

  if (error) return { error: "Dodojo n'a pas pu enregistrer ce réglage. Réessaie." };
  return { error: null };
}
```

- [ ] **Step 2: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add app/actions/profile.ts
git commit -m "feat: updatePlanTomorrowAfterHour (issue #116)"
```

---

## Task 6: `lib/copy/planning.ts` — ligne de La Voix au déblocage

**Files:**
- Create: `lib/copy/planning.ts`
- Test: `lib/copy/planning.test.ts`

**Interfaces:**
- Consumes: `pickVariant`, `randomSeed` (`lib/copy/variant.ts`), `AggressivityLevel` (`types/index.ts`).
- Produces: `planningUnlockedLine(level: AggressivityLevel, seed?: number): string`.

- [ ] **Step 1: Écrire le test (échoue — module inexistant)**

Créer `lib/copy/planning.test.ts` :

```ts
import { describe, expect, test } from "vitest";
import { planningUnlockedLine } from "./planning";

const FORBIDDEN_DOUX = /putain|bordel|merde|\bcon\b|connard|foutre/;

describe("Ligne de La Voix — déblocage section Demain (issue #116)", () => {
  test("pool d'au moins 5 variantes, seed stable", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 5; seed++) seen.add(planningUnlockedLine("direct", seed));
    expect(seen.size).toBeGreaterThanOrEqual(5);
    expect(planningUnlockedLine("direct", 2)).toBe(planningUnlockedLine("direct", 2));
  });

  test("doux reste sans juron, brut élargit sur tout le pool", () => {
    for (let seed = 0; seed < 5; seed++) {
      expect(planningUnlockedLine("doux", seed)).not.toMatch(FORBIDDEN_DOUX);
    }
    const jurons = Array.from({ length: 5 }, (_, seed) => planningUnlockedLine("brut", seed)).some(
      (line) => /merde|connard/i.test(line),
    );
    expect(jurons).toBe(true);
  });
});
```

- [ ] **Step 2: Lancer le test, vérifier l'échec**

Run: `npx vitest run lib/copy/planning.test.ts`
Expected: FAIL — `Cannot find module './planning'`.

- [ ] **Step 3: Implémenter**

Créer `lib/copy/planning.ts` :

```ts
import type { AggressivityLevel } from "../../types";
import { pickVariant, randomSeed } from "./variant";

// Issue #116 : ligne de La Voix affichée une seule fois par déblocage
// journalier de la section "Demain" (heure seuil franchie) — seed figé côté
// Arena.tsx à la transition (même patron que PerfectOverlay/emptyState).
export function planningUnlockedLine(
  level: AggressivityLevel,
  seed: number = randomSeed(),
): string {
  const pools: Record<AggressivityLevel, string[]> = {
    doux: [
      "La nuit approche. Si tu veux, prépare doucement demain.",
      "Le jour se referme bientôt. Demain peut déjà t'attendre, sans pression.",
      "Un peu de calme avant la nuit : et si demain se préparait maintenant ?",
      "Rien ne t'oblige, mais demain peut déjà prendre forme ici.",
      "Le soir s'installe. Demain a le temps d'être pensé, doucement.",
    ],
    direct: [
      "La journée touche à sa fin. Prépare demain pendant que c'est frais.",
      "Il se fait tard — pose déjà ce que demain devra affronter.",
      "Fin de journée : le moment de planifier la suite.",
      "Demain n'attend pas. Pose tes prochaines cibles ici.",
      "La section Demain est ouverte. Prépare le prochain combat.",
    ],
    brut: [
      "La journée crève, merde. Prépare demain avant de t'effondrer.",
      "Bouge-toi, il est tard : balance déjà ce qui attend demain.",
      "Demain va te tomber dessus. Prépare le terrain, maintenant.",
      "T'as fini de glander aujourd'hui ? Pose demain, tout de suite.",
      "La nuit approche, connard — demain se prépare pas tout seul.",
    ],
  };
  return pickVariant(pools[level], seed);
}
```

- [ ] **Step 4: Lancer le test, vérifier le succès**

Run: `npx vitest run lib/copy/planning.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/copy/planning.ts lib/copy/planning.test.ts
git commit -m "feat: copy leveled planningUnlockedLine (issue #116)"
```

---

## Task 7: Vestiaire — réglage `PlanTomorrowSection`

**Files:**
- Create: `components/qg/PlanTomorrowSection.tsx`
- Modify: `app/vestiaire/page.tsx`

**Interfaces:**
- Consumes: `updatePlanTomorrowAfterHour` (Task 5).
- Produces: composant `<PlanTomorrowSection initialHour={number} />`.

- [ ] **Step 1: Créer le composant**

Créer `components/qg/PlanTomorrowSection.tsx` (calqué sur `components/qg/AggressivityLevelSection.tsx`) :

```tsx
"use client";

import { useState, useTransition } from "react";
import { updatePlanTomorrowAfterHour } from "@/app/actions/profile";

interface PlanTomorrowSectionProps {
  initialHour: number;
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 12); // 12..23

// Issue #116 : heure locale à partir de laquelle l'Arène propose de
// planifier/reporter des tâches vers demain. Bornée 12-23 (cf. spec) pour
// éviter un réglage qui rendrait la section "Demain" quasi permanente.
export default function PlanTomorrowSection({ initialHour }: PlanTomorrowSectionProps) {
  const [hour, setHour] = useState(initialHour);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function select(next: number) {
    const previous = hour;
    setHour(next);
    setError(null);
    startTransition(async () => {
      const result = await updatePlanTomorrowAfterHour(next);
      if (result.error) {
        setHour(previous);
        setError(result.error);
      }
    });
  }

  return (
    <section className="flex w-full max-w-sm flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <p className="font-display text-xs uppercase tracking-wide text-muted">Planifier demain</p>
      <label htmlFor="plan-tomorrow-hour" className="text-xs text-muted">
        À partir de quelle heure proposer de préparer demain ?
      </label>
      <select
        id="plan-tomorrow-hour"
        value={hour}
        disabled={isPending}
        onChange={(event) => select(Number(event.target.value))}
        className="rounded border border-border bg-transparent px-2 py-1 text-sm text-ink disabled:opacity-50"
      >
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {String(h).padStart(2, "0")}h00
          </option>
        ))}
      </select>
      {error && (
        <p role="alert" className="text-xs text-alert">
          {error}
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Câbler dans `app/vestiaire/page.tsx`**

Ajouter l'import en haut du fichier, à côté de `AggressivityLevelSection` :

```ts
import PlanTomorrowSection from "@/components/qg/PlanTomorrowSection";
```

Étendre le `.select(...)` du profil (actuellement `"best_streak, timezone, webhook_token_hash, webhook_token_last_used_at, aggressivity_level"`) pour inclure `plan_tomorrow_after_hour` :

```ts
    supabase
      .from("profiles")
      .select(
        "best_streak, timezone, webhook_token_hash, webhook_token_last_used_at, aggressivity_level, plan_tomorrow_after_hour",
      )
      .eq("id", user.id)
      .maybeSingle(),
```

Ajouter le composant juste après `<AggressivityLevelSection ... />` :

```tsx
      <AggressivityLevelSection initialLevel={resolveAggressivityLevel(profile?.aggressivity_level)} />
      <PlanTomorrowSection initialHour={profile?.plan_tomorrow_after_hour ?? 18} />
```

- [ ] **Step 3: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 4: Vérification manuelle**

Run: `npm run dev`, se connecter, aller sur `/vestiaire`, changer la valeur du select "Planifier demain", recharger la page, vérifier que la valeur choisie persiste.
Expected: le select affiche la valeur enregistrée après reload, aucune erreur affichée.

- [ ] **Step 5: Commit**

```bash
git add components/qg/PlanTomorrowSection.tsx app/vestiaire/page.tsx
git commit -m "feat: réglage Vestiaire pour l'heure de planification demain (issue #116)"
```

---

## Task 8: `app/page.tsx` — fetch des tâches de demain

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `nextDayKey` (Task 2).
- Produces: prop `Arena.initialTomorrowTasks: Task[]` (câblée en Task 12).

- [ ] **Step 1: Calculer le jour de demain et ajouter la requête**

Dans `app/page.tsx`, ajouter l'import de `nextDayKey` :

```ts
import { dayKey, nextDayKey } from "@/lib/game-engine";
```

Juste après `const today = dayKey(new Date(), profile.timezone ?? "UTC");`, ajouter :

```ts
  const tomorrow = nextDayKey(today);
```

Étendre le `Promise.all` existant avec une 4e requête (garder le même ordre de déstructuration) :

```ts
  const [
    { data: tasks, error: tasksError },
    { data: overdueTasks, error: overdueError },
    { data: dayResults },
    { data: tomorrowTasks },
  ] = await Promise.all([
    supabase
      .from("tasks")
      .select("*")
      .eq("user_id", user.id)
      .eq("day_date", today)
      .order("position", { ascending: true }),
    supabase
      .from("tasks")
      .select("*")
      .eq("user_id", user.id)
      .lt("day_date", today)
      .eq("is_completed", false)
      .eq("is_abandoned", false),
    supabase
      .from("day_results")
      .select("day_date, outcome")
      .eq("user_id", user.id)
      .order("day_date", { ascending: false })
      .limit(120),
    // Issue #116 : tâches déjà planifiées pour demain (section "Demain").
    supabase
      .from("tasks")
      .select("*")
      .eq("user_id", user.id)
      .eq("day_date", tomorrow)
      .order("position", { ascending: true }),
  ]);
```

- [ ] **Step 2: Passer la nouvelle prop à `Arena`**

Ajouter `initialTomorrowTasks={tomorrowTasks ?? []}` dans le JSX de `<Arena ... />` (ex. juste après `initialTasks={tasks ?? []}`).

- [ ] **Step 3: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: une erreur attendue à ce stade — `Arena` ne connaît pas encore `initialTomorrowTasks` (résolu par Task 12). C'est acceptable temporairement ; si l'exécuteur du plan préfère ne pas laisser le build rouge entre deux tâches, permuter l'ordre : faire Task 12 (props `Arena`) avant ce Step 3, ou committer ce Step avec un commentaire `// TODO Task 12` — **à éviter** (règle "No Placeholders" du plan) : préférer enchaîner directement sur Task 12 dans la même session avant de committer ce fichier isolément. Ce plan liste les tâches dans un ordre logique de lecture, pas un ordre de commit rigide — un exécuteur humain/agent peut committer Task 8 et Task 12 ensemble.

- [ ] **Step 4: Commit** (uniquement une fois Task 12 également faite — cf. Step 3)

```bash
git add app/page.tsx
git commit -m "feat: charge les tâches de demain pour l'Arène (issue #116)"
```

---

## Task 9: `TomorrowTaskRow` + `TomorrowSection`

**Files:**
- Create: `components/combat/TomorrowTaskRow.tsx`
- Create: `components/combat/TomorrowSection.tsx`

**Interfaces:**
- Consumes: `Task` (`types/index.ts`), `isNestableParent`, `sortTasksHierarchically` (`lib/game-engine.ts`), `DeadlineControl`, `SubtaskForm`, `AddTaskForm` (existants, `AddTaskForm` étendu au Step 0 ci-dessous), `planningUnlockedLine` (Task 6).
- Produces: `<TomorrowTaskRow>`, `<TomorrowSection>` (props détaillées ci-dessous), consommés par `Arena.tsx` en Task 12.

- [ ] **Step 0: Étendre `AddTaskForm` pour un id/libellé distincts (préalable nécessaire)**

`TomorrowSection` (Step 2 ci-dessous) réutilise `AddTaskForm` tel quel pour l'ajout dans la section "Demain". Or `components/combat/AddTaskForm.tsx` code en dur `id="new-task"` et le libellé "Ajouter une tâche" — monter ce composant deux fois sur le même écran (formulaire du jour + formulaire "Demain") produirait un **id HTML dupliqué** (invalide, casse l'association `label[for]`) et deux libellés accessibles identiques (ambigu pour les lecteurs d'écran et pour les tests). Corriger `components/combat/AddTaskForm.tsx` :

Remplacer :

```tsx
interface AddTaskFormProps {
  onAdd: (title: string) => void;
  pending?: boolean;
}

export default function AddTaskForm({ onAdd, pending = false }: AddTaskFormProps) {
  const [title, setTitle] = useState("");
```

par :

```tsx
interface AddTaskFormProps {
  onAdd: (title: string) => void;
  pending?: boolean;
  // Issue #116 : AddTaskForm est réutilisé par TomorrowSection sur le même
  // écran que le formulaire du jour — id/libellé distincts obligatoires
  // (sinon id HTML dupliqué + deux labels "Ajouter une tâche" ambigus).
  inputId?: string;
  label?: string;
}

export default function AddTaskForm({
  onAdd,
  pending = false,
  inputId = "new-task",
  label = "Ajouter une tâche",
}: AddTaskFormProps) {
  const [title, setTitle] = useState("");
```

Puis remplacer le JSX du `<label>`/`<input>` :

```tsx
      <label htmlFor="new-task" className="sr-only">
        Ajouter une tâche
      </label>
      <input
        id="new-task"
```

par :

```tsx
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <input
        id={inputId}
```

Vérifier la compilation (`npx tsc --noEmit`) : aucune erreur, tout appelant existant omet ces deux props optionnelles et garde le comportement actuel.

- [ ] **Step 1: Créer `TomorrowTaskRow.tsx`**

```tsx
"use client";

import type { Task } from "@/types";
import { isNestableParent } from "@/lib/game-engine";
import SubtaskForm from "./SubtaskForm";
import DeadlineControl from "./DeadlineControl";

interface TomorrowTaskRowProps {
  task: Task;
  timezone: string;
  onAddSubtask: (parentId: string, title: string) => void;
  onSetDeadline: (id: string, deadlineAt: string | null) => void;
  onAnnihilate: (id: string) => void;
  onBringToToday: (id: string) => void;
  isAddingSubtask: boolean;
  isMutating?: boolean;
}

// Issue #116 : ligne de la section "Demain" — volontairement plus simple que
// TaskRow (pas de checkbox : rien n'est "complétable" avant que le jour
// n'arrive ; pas de drag & drop : YAGNI pour une première version). L'abandon
// est toujours une annihilation directe (jamais de Rage Quit — pas de combat
// en cours sur une tâche pas encore "aujourd'hui").
export default function TomorrowTaskRow({
  task,
  timezone,
  onAddSubtask,
  onSetDeadline,
  onAnnihilate,
  onBringToToday,
  isAddingSubtask,
  isMutating = false,
}: TomorrowTaskRowProps) {
  return (
    <div
      className={`flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm ${
        task.parent_id ? "ml-6" : ""
      }`}
    >
      <span className="min-w-0 flex-1 break-words text-ink">
        {task.is_recurring && (
          <span aria-label="Quête récurrente" title="Quête récurrente" className="mr-1">
            🔁
          </span>
        )}
        {task.title}
      </span>
      {isNestableParent(task) && (
        <SubtaskForm
          onAdd={(title) => onAddSubtask(task.id, title)}
          pending={isAddingSubtask}
          disabled={isMutating}
        />
      )}
      <DeadlineControl
        taskId={task.id}
        taskTitle={task.title}
        deadlineAt={task.deadline_at}
        dayDate={task.day_date}
        timezone={timezone}
        disabled={isMutating}
        onSave={(deadlineAt) => onSetDeadline(task.id, deadlineAt)}
      />
      <button
        type="button"
        onClick={() => onBringToToday(task.id)}
        disabled={isMutating}
        aria-label={`Ramener "${task.title}" à aujourd'hui`}
        className="shrink-0 rounded px-2 py-2.5 text-xs text-faint hover:text-ink focus-visible:text-ink disabled:cursor-wait disabled:opacity-40"
      >
        ← Aujourd'hui
      </button>
      <button
        type="button"
        onClick={() => onAnnihilate(task.id)}
        disabled={isMutating}
        aria-label={`Annihiler "${task.title}"`}
        className="shrink-0 rounded px-2.5 py-2.5 text-xs text-faint hover:text-alert focus-visible:text-alert disabled:cursor-wait disabled:opacity-40"
      >
        ×
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Créer `TomorrowSection.tsx`**

```tsx
"use client";

import type { Task } from "@/types";
import type { AggressivityLevel } from "@/types";
import { sortTasksHierarchically } from "@/lib/game-engine";
import { planningUnlockedLine } from "@/lib/copy/planning";
import TomorrowTaskRow from "./TomorrowTaskRow";
import AddTaskForm from "./AddTaskForm";

interface TomorrowSectionProps {
  tasks: Task[];
  timezone: string;
  aggressivityLevel: AggressivityLevel;
  voiceSeed: number;
  onAdd: (title: string) => void;
  onAddSubtask: (parentId: string, title: string) => void;
  onSetDeadline: (id: string, deadlineAt: string | null) => void;
  onAnnihilate: (id: string) => void;
  onBringToToday: (id: string) => void;
  addingSubtaskParentId: string | null;
  isAdding: boolean;
  pendingMutationIds: Set<string>;
}

// Issue #116 : section "Demain", visible après l'heure seuil réglable
// (profiles.plan_tomorrow_after_hour). Pas de fetch propre à ce composant
// (les données arrivent déjà chargées via Arena/app/page.tsx) — pas d'état
// Loading/Error dédié nécessaire ici, seul l'état Empty a du sens localement.
export default function TomorrowSection({
  tasks,
  timezone,
  aggressivityLevel,
  voiceSeed,
  onAdd,
  onAddSubtask,
  onSetDeadline,
  onAnnihilate,
  onBringToToday,
  addingSubtaskParentId,
  isAdding,
  pendingMutationIds,
}: TomorrowSectionProps) {
  const orderedTasks = sortTasksHierarchically(tasks);

  return (
    <section
      aria-label="Demain"
      className="flex flex-col gap-2 rounded-lg border border-border bg-surface/50 p-3"
    >
      <p className="font-display text-xs uppercase tracking-wide text-muted">Demain</p>
      <p className="text-xs text-faint">{planningUnlockedLine(aggressivityLevel, voiceSeed)}</p>

      {orderedTasks.length === 0 ? (
        <p className="text-xs text-faint">Rien de prévu encore pour demain.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {orderedTasks.map((task) => (
            <li key={task.id}>
              <TomorrowTaskRow
                task={task}
                timezone={timezone}
                onAddSubtask={onAddSubtask}
                onSetDeadline={onSetDeadline}
                onAnnihilate={onAnnihilate}
                onBringToToday={onBringToToday}
                isAddingSubtask={addingSubtaskParentId === task.id}
                isMutating={pendingMutationIds.has(task.id)}
              />
            </li>
          ))}
        </ul>
      )}

      <AddTaskForm
        onAdd={onAdd}
        pending={isAdding}
        inputId="new-task-tomorrow"
        label="Ajouter une tâche pour demain"
      />
    </section>
  );
}
```

- [ ] **Step 3: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: pas de nouvelle erreur liée à ces deux fichiers (des erreurs sur `Arena.tsx` liées aux props non encore câblées sont attendues et résolues en Task 12).

- [ ] **Step 4: Commit**

```bash
git add components/combat/AddTaskForm.tsx components/combat/TomorrowTaskRow.tsx components/combat/TomorrowSection.tsx
git commit -m "feat: composants TomorrowTaskRow/TomorrowSection (issue #116)"
```

---

## Task 10: `TaskRow`/`TaskList` — icône "reporter à demain"

**Files:**
- Modify: `components/combat/TaskRow.tsx`
- Modify: `components/combat/TaskList.tsx`

**Interfaces:**
- Produces: nouvelle prop `TaskRow.onReportTomorrow: (id: string) => void` + `TaskRow.showReportTomorrow: boolean` ; `TaskList.onReportTomorrow`, `TaskList.showReportTomorrow` (threading identique aux autres props).

- [ ] **Step 1: Étendre `TaskRowProps` et le rendu**

Dans `components/combat/TaskRow.tsx`, ajouter aux props (après `onSetDeadline`) :

```ts
  onSetDeadline: (id: string, deadlineAt: string | null) => void;
  // Issue #116 : report proactif vers demain, gated par l'heure seuil
  // (profiles.plan_tomorrow_after_hour) — calculé côté Arena.
  onReportTomorrow: (id: string) => void;
  showReportTomorrow?: boolean;
```

Dans la signature du composant, ajouter `onReportTomorrow` et `showReportTomorrow = false` à la déstructuration.

Ajouter le bouton juste avant le bouton "×" existant (avant `<button type="button" onClick={() => onAbandon(task.id)} ...>`) :

```tsx
      {showReportTomorrow && (
        <button
          type="button"
          onClick={() => onReportTomorrow(task.id)}
          disabled={isLocked}
          aria-label={`Reporter "${task.title}" à demain`}
          className="shrink-0 rounded px-2 py-2.5 text-xs text-faint hover:text-ink focus-visible:text-ink disabled:cursor-wait disabled:opacity-40"
        >
          →
        </button>
      )}
```

- [ ] **Step 2: Étendre `TaskListProps` et le passage de props**

Dans `components/combat/TaskList.tsx`, ajouter aux props :

```ts
  onSetDeadline: (id: string, deadlineAt: string | null) => void;
  onReportTomorrow: (id: string) => void;
  showReportTomorrow?: boolean;
```

Ajouter à la déstructuration et au rendu de `<TaskRow ... />` :

```tsx
export default function TaskList({
  tasks,
  timezone,
  onToggle,
  onAbandon,
  onAddSubtask,
  onSetDeadline,
  onReportTomorrow,
  showReportTomorrow = false,
  addingSubtaskParentId = null,
  pendingMutationIds,
  missedDeadlineIds,
  overdueRestIds,
  dragOverInfo = null,
}: TaskListProps) {
```

```tsx
          <TaskRow
            task={task}
            timezone={timezone}
            onToggle={onToggle}
            onAbandon={onAbandon}
            onAddSubtask={onAddSubtask}
            onSetDeadline={onSetDeadline}
            onReportTomorrow={onReportTomorrow}
            showReportTomorrow={showReportTomorrow}
            isAddingSubtask={addingSubtaskParentId === task.id}
            isMutating={pendingMutationIds?.has(task.id) ?? false}
            isMissedDeadline={missedDeadlineIds?.has(task.id) ?? false}
            isOverdueRest={overdueRestIds?.has(task.id) ?? false}
            dropIndicator={dragOverInfo?.overTaskId === task.id ? dragOverInfo : null}
          />
```

- [ ] **Step 3: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: erreur attendue sur `Arena.tsx` (n'appelle pas encore `<TaskList>` avec les nouvelles props obligatoires) — résolue en Task 12, même remarque que Task 8/Step 3.

- [ ] **Step 4: Commit** (avec Task 12, cf. remarque Task 8)

```bash
git add components/combat/TaskRow.tsx components/combat/TaskList.tsx
git commit -m "feat: icône de report vers demain sur TaskRow (issue #116)"
```

---

## Task 11: `PerfectOverlay`/`CrepusculeRecap` — CTA "Planifier demain"

**Files:**
- Modify: `components/combat/PerfectOverlay.tsx`
- Modify: `components/combat/CrepusculeRecap.tsx`

**Interfaces:**
- Produces: prop optionnelle `onPlanTomorrow?: () => void` sur les deux composants — rendue comme bouton secondaire uniquement si fournie.

- [ ] **Step 1: `PerfectOverlay.tsx`**

Ajouter à `PerfectOverlayProps` (après `onContinue: () => void;`) :

```ts
  // Issue #116 : CTA contextuel vers la section "Demain", fourni par Arena
  // uniquement si l'heure seuil est déjà franchie (sinon la section n'existe
  // pas encore à cibler).
  onPlanTomorrow?: () => void;
```

Ajouter à la déstructuration : `onPlanTomorrow,` (après `onContinue,`).

Localiser le bloc de boutons existant (CTA "Terminer la journée" / "continuer" — vers la fin du fichier, après le `<ShareButton ... />`) et ajouter un bouton conditionnel juste avant la fermeture du bloc de boutons :

```tsx
      {onPlanTomorrow && (
        <button
          type="button"
          onClick={onPlanTomorrow}
          className="text-xs text-muted underline underline-offset-2"
        >
          Planifier demain
        </button>
      )}
```

(Placer ce bouton dans le même conteneur flex que les CTA existants "Terminer la journée"/"Continuer" — l'exécuteur du plan doit lire le JSX final du fichier autour de ces deux boutons pour l'insérer au bon niveau d'imbrication, en gardant le style secondaire/discret indiqué ci-dessus.)

- [ ] **Step 2: `CrepusculeRecap.tsx`**

Même traitement : ajouter `onPlanTomorrow?: () => void;` à `CrepusculeRecapProps` (après `onDismiss: () => void;`), déstructurer, et ajouter le même bouton conditionnel près du CTA `onDismiss` existant en fin de composant.

- [ ] **Step 3: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur (props optionnelles, aucun appelant existant ne casse).

- [ ] **Step 4: Commit**

```bash
git add components/combat/PerfectOverlay.tsx components/combat/CrepusculeRecap.tsx
git commit -m "feat: CTA optionnel Planifier demain sur PerfectOverlay/CrepusculeRecap (issue #116)"
```

---

## Task 12: `Arena.tsx` — câblage complet

**Files:**
- Modify: `components/combat/Arena.tsx`

**Interfaces:**
- Consumes: tout ce qui précède (Tasks 2, 4, 6, 9, 10, 11) + `initialTomorrowTasks` (Task 8).
- Produces: prop `ArenaProps.initialTomorrowTasks: Task[]` consommée par `app/page.tsx` (Task 8).

- [ ] **Step 1: Imports**

Dans `components/combat/Arena.tsx`, étendre l'import de `@/lib/game-engine` (ligne ~20-51) en ajoutant `nextDayKey` et `isPlanningUnlocked` à la liste des noms importés.

Ajouter l'import de la copy :

```ts
import { planningUnlockedLine } from "@/lib/copy/planning";
```

Étendre l'import des server actions `@/app/actions/tasks` (lignes 77-85) :

```ts
import {
  addTask as addTaskAction,
  addSubtask as addSubtaskAction,
  addTomorrowTask as addTomorrowTaskAction,
  reportToTomorrow as reportToTomorrowAction,
  bringToToday as bringToTodayAction,
  annihilateOverdueTask as annihilateTaskAction,
  rageQuitTask as rageQuitTaskAction,
  undoRageQuit as undoRageQuitAction,
  reorderSiblings as reorderSiblingsAction,
  setTaskCompleted as setTaskCompletedAction,
  setTaskDeadline as setTaskDeadlineAction,
} from "@/app/actions/tasks";
```

Ajouter l'import du nouveau composant :

```ts
import TomorrowSection from "./TomorrowSection";
```

- [ ] **Step 2: Prop `initialTomorrowTasks`**

Dans `ArenaProps` (lignes 104-114), ajouter après `initialTasks: Task[];` :

```ts
  initialTomorrowTasks: Task[];
```

Ajouter `initialTomorrowTasks,` à la déstructuration des props de la fonction `Arena` (lignes 142-152).

- [ ] **Step 3: Nouveaux states**

Juste après `const [tasks, setTasks] = useState<Task[]>(initialTasks);` (ligne 162), ajouter :

```ts
  // Issue #116 : section "Demain" — state client distinct de `tasks`, jamais
  // fusionné (garantit que calculateBossMaxHp/calculateHeroHp, qui ne lisent
  // que `tasks`, ne voient jamais une tâche de demain).
  const [tomorrowTasks, setTomorrowTasks] = useState<Task[]>(initialTomorrowTasks);
  const [isAddingTomorrow, setIsAddingTomorrow] = useState(false);
  const [addingTomorrowSubtaskParentId, setAddingTomorrowSubtaskParentId] = useState<string | null>(null);
  const [reportUndo, setReportUndo] = useState<{ id: string; taskTitle: string } | null>(null);
  const tomorrowSectionRef = useRef<HTMLDivElement>(null);
  const [wasPlanningUnlocked, setWasPlanningUnlocked] = useState(false);
  const [planningVoiceSeed, setPlanningVoiceSeed] = useState(randomSeed);
  const optimisticTomorrowIdCounterRef = useRef(0);
```

- [ ] **Step 4: Valeurs dérivées**

Juste après le bloc `const overdueRestIds = new Set([...]);` (ligne ~361, avant `const equippedHero = ...`), ajouter :

```ts
  // Issue #116 : jour de demain + gate heure seuil. `now`/`profile.timezone`
  // sont déjà recalculés par le polling ~45s existant (US-05) — pas de timer
  // dédié pour ce gate.
  const tomorrowDayDate = nextDayKey(today);
  const planningUnlocked = isPlanningUnlocked(now, profile.timezone, profile.plan_tomorrow_after_hour);
  const activeTomorrowTasks = tomorrowTasks.filter((task) => !task.is_abandoned);
```

- [ ] **Step 5: Seed de la ligne de La Voix (une fois par déblocage journalier)**

Juste après le bloc `if (isEmpty !== wasEmpty) { ... }` (lignes 376-379), ajouter le même patron pour la section Demain :

```ts
  // Issue #116 : nouvelle punchline uniquement à la transition false→true (pas
  // à chaque re-rendu pendant le poll ~45s) — même patron que wasEmpty.
  if (planningUnlocked !== wasPlanningUnlocked) {
    setWasPlanningUnlocked(planningUnlocked);
    if (planningUnlocked) setPlanningVoiceSeed(randomSeed());
  }
```

- [ ] **Step 6: Handlers**

Ajouter les fonctions suivantes juste après `handleAddSubtask` (après la fermeture de sa fonction, avant `async function handleToggle`) :

```ts
  // Issue #116 : ajout direct dans la section "Demain".
  function handleAddTomorrow(title: string) {
    optimisticTomorrowIdCounterRef.current += 1;
    const roots = tomorrowTasks.filter((task) => task.parent_id === null && !task.is_abandoned);
    const optimisticTask: Task = {
      id: `optimistic-tomorrow-${optimisticTomorrowIdCounterRef.current}`,
      user_id: profile.id,
      parent_id: null,
      title,
      is_completed: false,
      is_abandoned: false,
      abandon_reason: null,
      is_recurring: false,
      recurring_template_id: null,
      deadline_at: null,
      deferred_at: null,
      xp_awarded: null,
      reminder_offset_minutes: null,
      day_date: tomorrowDayDate,
      position: nextSiblingPosition(roots),
      created_at: new Date().toISOString(),
    };

    setTomorrowTasks((prev) => [...prev, optimisticTask]);
    setIsAddingTomorrow(true);

    void addTomorrowTaskAction(title).then((result) => {
      setIsAddingTomorrow(false);
      if (result.error) {
        setTomorrowTasks((prev) => prev.filter((task) => task.id !== optimisticTask.id));
        setBanner(result.error);
        return;
      }
      if (result.id) {
        const realId = result.id;
        setTomorrowTasks((prev) =>
          prev.map((task) => (task.id === optimisticTask.id ? { ...task, id: realId } : task)),
        );
      }
    });
  }

  // Issue #116 : sous-tâche dans la section "Demain" (même mécanisme serveur
  // addSubtask que l'Arène du jour — hérite désormais du day_date du parent).
  function handleAddTomorrowSubtask(parentId: string, title: string) {
    optimisticTomorrowIdCounterRef.current += 1;
    const siblings = tomorrowTasks.filter(
      (task) => task.parent_id === parentId && !task.is_abandoned,
    );
    const optimisticTask: Task = {
      id: `optimistic-tomorrow-${optimisticTomorrowIdCounterRef.current}`,
      user_id: profile.id,
      parent_id: parentId,
      title,
      is_completed: false,
      is_abandoned: false,
      abandon_reason: null,
      is_recurring: false,
      recurring_template_id: null,
      deadline_at: null,
      deferred_at: null,
      xp_awarded: null,
      reminder_offset_minutes: null,
      day_date: tomorrowDayDate,
      position: nextSiblingPosition(siblings),
      created_at: new Date().toISOString(),
    };

    setTomorrowTasks((prev) => [...prev, optimisticTask]);
    setAddingTomorrowSubtaskParentId(parentId);

    void addSubtaskAction(parentId, title).then((result) => {
      setAddingTomorrowSubtaskParentId(null);
      if (result.error) {
        setTomorrowTasks((prev) => prev.filter((task) => task.id !== optimisticTask.id));
        setBanner(result.error);
        return;
      }
      if (result.id) {
        const realId = result.id;
        setTomorrowTasks((prev) =>
          prev.map((task) => (task.id === optimisticTask.id ? { ...task, id: realId } : task)),
        );
      }
    });
  }

  // Issue #116 : deadline sur une tâche de la section "Demain" (même action
  // serveur setTaskDeadline, générique sur id+deadlineAt).
  function handleSetTomorrowDeadline(id: string, deadlineAt: string | null) {
    if (isOptimisticId(id)) return;
    const previousSnapshot = tomorrowTasks;
    setTomorrowTasks((prev) =>
      prev.map((task) => (task.id === id ? { ...task, deadline_at: deadlineAt } : task)),
    );
    markPending(id);
    void setTaskDeadlineAction(id, deadlineAt).then((result) => {
      unmarkPending(id);
      if (result.error) {
        setTomorrowTasks(previousSnapshot);
        setBanner(result.error);
      }
    });
  }

  // Issue #116 : abandon d'une tâche "Demain" — toujours annihilated, jamais
  // de Rage Quit (pas de combat en cours sur une tâche pas encore
  // "aujourd'hui"). Réutilise l'action serveur annihilateOverdueTask
  // (comportement identique : is_abandoned=true, cascade sous-tâches, aucun
  // filtre de day_date côté serveur).
  function handleAnnihilateTomorrow(id: string) {
    const cascadeIds = new Set([
      id,
      ...tomorrowTasks.filter((task) => task.parent_id === id).map((task) => task.id),
    ]);
    const previousSnapshot = tomorrowTasks;
    setTomorrowTasks((prev) =>
      prev.map((task) =>
        cascadeIds.has(task.id)
          ? { ...task, is_abandoned: true, abandon_reason: "annihilated" as const }
          : task,
      ),
    );
    for (const cid of cascadeIds) markPending(cid);
    void annihilateTaskAction(id).then((result) => {
      for (const cid of cascadeIds) unmarkPending(cid);
      if (result.error) {
        setTomorrowTasks(previousSnapshot);
        setBanner(result.error);
      }
    });
  }

  // Issue #116 : report proactif d'une tâche du jour vers demain. Jamais de
  // malus (≠ Le Réveil) : la tâche sort simplement du pool du jour, le Boss
  // rétrécit automatiquement (calculateBossMaxHp ne lit plus cette tâche).
  function handleReportToTomorrow(id: string) {
    if (isOptimisticId(id)) return;
    const cascadeIds = new Set([
      id,
      ...tasks.filter((task) => task.parent_id === id).map((task) => task.id),
    ]);
    const tasksSnapshot = tasks;
    const tomorrowSnapshot = tomorrowTasks;
    const reportedTitle = tasks.find((task) => task.id === id)?.title ?? "";

    const moved = tasks
      .filter((task) => cascadeIds.has(task.id))
      .map((task) => ({ ...task, day_date: tomorrowDayDate, deadline_at: null, deferred_at: null }));

    setTasks((prev) => prev.filter((task) => !cascadeIds.has(task.id)));
    setTomorrowTasks((prev) => [...prev, ...moved]);
    setReportUndo({ id, taskTitle: reportedTitle });

    for (const cid of cascadeIds) markPending(cid);
    void reportToTomorrowAction(id).then((result) => {
      for (const cid of cascadeIds) unmarkPending(cid);
      if (result.error) {
        setTasks(tasksSnapshot);
        setTomorrowTasks(tomorrowSnapshot);
        setReportUndo(null);
        setBanner(result.error);
        return;
      }
      if (result.reportedTasks?.length) {
        const byId = new Map(result.reportedTasks.map((task) => [task.id, task]));
        setTomorrowTasks((prev) => prev.map((task) => byId.get(task.id) ?? task));
      }
    });
  }

  // Issue #116 : ramène une tâche à aujourd'hui — depuis la section "Demain"
  // (changement d'avis) OU via "Annuler" juste après un report (même action,
  // cf. Global Constraints du plan).
  function handleBringToToday(id: string) {
    const cascadeIds = new Set([
      id,
      ...tomorrowTasks.filter((task) => task.parent_id === id).map((task) => task.id),
    ]);
    const tasksSnapshot = tasks;
    const tomorrowSnapshot = tomorrowTasks;

    const moved = tomorrowTasks
      .filter((task) => cascadeIds.has(task.id))
      .map((task) => ({ ...task, day_date: today, deadline_at: null, deferred_at: null }));

    setTomorrowTasks((prev) => prev.filter((task) => !cascadeIds.has(task.id)));
    setTasks((prev) => [...prev, ...moved]);
    if (reportUndo?.id === id) setReportUndo(null);

    for (const cid of cascadeIds) markPending(cid);
    void bringToTodayAction(id).then((result) => {
      for (const cid of cascadeIds) unmarkPending(cid);
      if (result.error) {
        setTasks(tasksSnapshot);
        setTomorrowTasks(tomorrowSnapshot);
        setBanner(result.error);
        return;
      }
      if (result.broughtBackTasks?.length) {
        const byId = new Map(result.broughtBackTasks.map((task) => [task.id, task]));
        setTasks((prev) => prev.map((task) => byId.get(task.id) ?? task));
      }
    });
  }

  function scrollToTomorrowSection() {
    tomorrowSectionRef.current?.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "start",
    });
  }
```

- [ ] **Step 7: Rendu — icône de report sur `TaskList`**

Dans le JSX, sur le `<TaskList ... />` existant (dans le bloc `DndContext`), ajouter deux props :

```tsx
          <TaskList
            tasks={activeTasks}
            timezone={profile.timezone}
            onToggle={handleToggle}
            onAbandon={handleAbandon}
            onAddSubtask={handleAddSubtask}
            onSetDeadline={handleSetDeadline}
            onReportTomorrow={handleReportToTomorrow}
            showReportTomorrow={planningUnlocked}
            addingSubtaskParentId={addingSubtaskParentId}
            pendingMutationIds={pendingMutationIds}
            missedDeadlineIds={missedDeadlineIds}
            overdueRestIds={overdueRestIds}
            dragOverInfo={dragOverInfo}
          />
```

- [ ] **Step 8: Rendu — CTA sur `PerfectOverlay`/`CrepusculeRecap`**

Sur `<PerfectOverlay ... />`, ajouter :

```tsx
              onPlanTomorrow={planningUnlocked ? scrollToTomorrowSection : undefined}
```

(juste avant `onCrepuscule={...}`, par exemple). Même ajout sur `<CrepusculeRecap ... />` :

```tsx
          onPlanTomorrow={planningUnlocked ? scrollToTomorrowSection : undefined}
```

- [ ] **Step 9: Rendu — toast d'annulation du report**

Juste après le bloc `{deadlineAlert && ( ... )}` (avant `{isEmpty ? ( ... ) : ( ... )}`), ajouter :

```tsx
      {reportUndo && (
        <div
          role="status"
          className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs text-muted"
        >
          <span>« {reportUndo.taskTitle} » repoussée à demain.</span>
          <button
            type="button"
            onClick={() => handleBringToToday(reportUndo.id)}
            className="shrink-0 font-display uppercase tracking-wide text-xp-text underline underline-offset-2"
          >
            Annuler
          </button>
        </div>
      )}
```

- [ ] **Step 10: Rendu — section "Demain"**

Juste après le bouton `"Terminer la journée"` (`{!isEmpty && ( <button ...> Terminer la journée </button> )}`) et avant `{coachStep && ( ... )}`, ajouter :

```tsx
      {planningUnlocked && (
        <div ref={tomorrowSectionRef}>
          <TomorrowSection
            tasks={activeTomorrowTasks}
            timezone={profile.timezone}
            aggressivityLevel={level}
            voiceSeed={planningVoiceSeed}
            onAdd={handleAddTomorrow}
            onAddSubtask={handleAddTomorrowSubtask}
            onSetDeadline={handleSetTomorrowDeadline}
            onAnnihilate={handleAnnihilateTomorrow}
            onBringToToday={handleBringToToday}
            addingSubtaskParentId={addingTomorrowSubtaskParentId}
            isAdding={isAddingTomorrow}
            pendingMutationIds={pendingMutationIds}
          />
        </div>
      )}
```

- [ ] **Step 11: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur (toutes les props ajoutées dans les Tasks 8/10/11 sont maintenant fournies).

- [ ] **Step 12: Lancer toute la suite Vitest**

Run: `npx vitest run`
Expected: PASS, aucune régression.

- [ ] **Step 13: Vérification manuelle**

Run: `npm run dev`. Sur `/vestiaire`, régler "Planifier demain" à une heure proche de l'heure actuelle (dans les 5 prochaines minutes si possible, sinon utiliser une heure déjà passée aujourd'hui pour un test immédiat). Retourner sur `/`, patienter jusqu'au polling (~45s) ou recharger la page une fois l'heure seuil dépassée.
Expected : la section "Demain" apparaît avec sa ligne de La Voix, un champ d'ajout fonctionnel ; l'icône "→" apparaît sur les `TaskRow` du jour ; cliquer dessus déplace la tâche vers "Demain" avec un toast "Annuler" ; le Boss/Héros du jour ne changent pas suite à ce déplacement (vérifier visuellement HP inchangés hors le retrait de cette tâche du calcul, cf. `calculateBossMaxHp`).

- [ ] **Step 14: Commit**

```bash
git add app/page.tsx components/combat/Arena.tsx components/combat/TaskRow.tsx components/combat/TaskList.tsx
git commit -m "feat: câble la section Demain dans l'Arène (issue #116)"
```

---

## Task 13: Tests e2e (Playwright)

**Files:**
- Create: `e2e/planifier-demain.spec.ts`
- Modify: `e2e/fixtures.ts`

**Interfaces:**
- Consumes: `login`, `abandonViaUi` (existants, `e2e/fixtures.ts`), `deadlineIso` (`lib/game-engine.ts`, réutilisé pour calculer un instant fixe déterministe).
- Produces: `setPlanTomorrowAfterHour(hour: number): Promise<void>`, `resetPlanTomorrowAfterHour(): Promise<void>` (nouveaux fixtures).

Playwright `@playwright/test` est en version `^1.61.1` dans ce repo : l'API `page.clock` (mock déterministe du temps navigateur, sans dépendre de l'heure réelle d'exécution de la CI) est disponible. On l'utilise pour fixer une heure locale connue (20h00, fuseau du profil test) AVANT que l'Arène ne monte, plutôt que de dépendre de l'heure réelle du run — sinon ce test serait flaky selon le moment où la CI tourne.

- [ ] **Step 1: Ajouter les fixtures de réglage d'heure**

Dans `e2e/fixtures.ts`, ajouter (à la suite des autres fixtures admin, même patron que `seedMissedDeadlineTask`) :

```ts
// Issue #116 : règle profiles.plan_tomorrow_after_hour pour le compte e2e fixe
// (ADR-04). Combiné à page.clock côté test pour un gate déterministe, quelle
// que soit l'heure réelle d'exécution de la CI.
export async function setPlanTomorrowAfterHour(hour: number): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PRIVATE_KEY_SUPABASE;
  const email = process.env.E2E_TEST_EMAIL;
  if (!url || !key || !email) {
    throw new Error(
      "setPlanTomorrowAfterHour : NEXT_PUBLIC_SUPABASE_URL / NEXT_PRIVATE_KEY_SUPABASE / E2E_TEST_EMAIL manquants.",
    );
  }
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const users = await listUsersRetrying(admin);
  const uid = users.find((u) => u.email === email)?.id;
  if (!uid) throw new Error("setPlanTomorrowAfterHour : utilisateur test introuvable.");

  const { error } = await admin
    .from("profiles")
    .update({ plan_tomorrow_after_hour: hour })
    .eq("id", uid);
  if (error) throw new Error(`setPlanTomorrowAfterHour a échoué : ${error.message}`);
}

// Remet le défaut (18) pour ne pas polluer les autres tests du compte partagé.
export async function resetPlanTomorrowAfterHour(): Promise<void> {
  await setPlanTomorrowAfterHour(18);
}
```

- [ ] **Step 2: Écrire le spec e2e**

Créer `e2e/planifier-demain.spec.ts` :

```ts
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { deadlineIso } from "../lib/game-engine";
import {
  login,
  setPlanTomorrowAfterHour,
  resetPlanTomorrowAfterHour,
  listUsersRetrying,
} from "./fixtures";

// Issue #116 : lit le fuseau du compte e2e fixe pour calculer un instant
// déterministe correspondant à 20h00 locale, quel que soit le fuseau réel du
// compte de test (évite de le supposer en dur).
async function fixedTimeAt20hLocal(): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PRIVATE_KEY_SUPABASE!;
  const email = process.env.E2E_TEST_EMAIL!;
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const users = await listUsersRetrying(admin);
  const uid = users.find((u) => u.email === email)?.id;
  const { data: profile } = await admin
    .from("profiles")
    .select("timezone")
    .eq("id", uid!)
    .maybeSingle();
  const timezone = profile?.timezone ?? "UTC";
  const today = new Date().toISOString().slice(0, 10);
  return deadlineIso(today, "20:00", timezone);
}

test.describe("Planifier demain (issue #116)", () => {
  test.afterEach(async () => {
    await resetPlanTomorrowAfterHour();
  });

  test("section Demain masquée avant l'heure seuil, visible après", async ({ page }) => {
    await setPlanTomorrowAfterHour(21); // seuil au-delà de l'heure fixée (20h) : masquée
    const fixedTime = await fixedTimeAt20hLocal();
    await page.clock.install({ time: new Date(fixedTime) });

    await login(page);
    await expect(page.getByRole("region", { name: "Demain" })).toHaveCount(0);

    await setPlanTomorrowAfterHour(18); // seuil avant l'heure fixée (20h) : visible
    await page.reload();
    await expect(page.getByRole("region", { name: "Demain" })).toBeVisible();
  });

  test("créer une tâche dans la section Demain, puis la ramener à aujourd'hui", async ({ page }) => {
    await setPlanTomorrowAfterHour(18);
    const fixedTime = await fixedTimeAt20hLocal();
    await page.clock.install({ time: new Date(fixedTime) });
    await login(page);

    const title = `E2E demain ${Date.now()}`;
    const demainSection = page.getByRole("region", { name: "Demain" });
    await expect(demainSection).toBeVisible();

    // Libellé distinct du formulaire du jour (cf. Task 9, Step 0) — pas
    // d'ambiguïté même si les deux formulaires sont montés simultanément.
    await demainSection.getByLabel("Ajouter une tâche pour demain").fill(title);
    await demainSection.getByRole("button", { name: "Ajouter" }).click();
    await expect(demainSection.getByText(title)).toBeVisible();

    // La tâche de demain ne doit jamais apparaître dans la liste du jour.
    await expect(page.locator("li", { hasText: title }).first()).toContainText(title);
    const todayList = page.getByRole("list").first();
    await expect(todayList.getByText(title)).toHaveCount(0);

    await demainSection.getByRole("button", { name: `Ramener "${title}" à aujourd'hui` }).click();
    await expect(demainSection.getByText(title)).toHaveCount(0);
    await expect(page.locator("li", { hasText: title })).toBeVisible();

    // Nettoyage : abandon direct de la tâche ramenée aujourd'hui.
    await page.locator("li", { hasText: title }).getByLabel(`Abandonner "${title}"`).click();
    await page.getByRole("button", { name: "Abandonner", exact: true }).click();
  });

  test("reporter une tâche du jour vers demain, puis annuler via le toast", async ({ page }) => {
    await setPlanTomorrowAfterHour(18);
    const fixedTime = await fixedTimeAt20hLocal();
    await page.clock.install({ time: new Date(fixedTime) });
    await login(page);

    const title = `E2E report ${Date.now()}`;
    // La section Demain est déjà visible (seuil 18h, horloge fixée à 20h) :
    // "Ajouter une tâche" (exact) matche aussi le formulaire du jour ET,
    // en sous-chaîne, celui de demain ("Ajouter une tâche pour demain") —
    // .first() cible le formulaire du jour, monté en premier dans le DOM
    // (avant la section Demain, cf. Arena.tsx Task 12 Step 10).
    await page.getByLabel("Ajouter une tâche", { exact: true }).first().fill(title);
    await page.getByRole("button", { name: "Ajouter", exact: true }).first().click();
    const row = page.locator("li", { hasText: title });
    await expect(row).toBeVisible();

    await row.getByLabel(`Reporter "${title}" à demain`).click();
    await expect(row).toHaveCount(0);
    const demainSection = page.getByRole("region", { name: "Demain" });
    await expect(demainSection.getByText(title)).toBeVisible();

    await page.getByRole("button", { name: "Annuler" }).click();
    await expect(demainSection.getByText(title)).toHaveCount(0);
    await expect(page.locator("li", { hasText: title })).toBeVisible();

    // Nettoyage.
    await page.locator("li", { hasText: title }).getByLabel(`Abandonner "${title}"`).click();
    await page.getByRole("button", { name: "Abandonner", exact: true }).click();
  });
});
```

- [ ] **Step 3: Ajouter `role="region"` à la section Demain**

`TomorrowSection.tsx` (Task 9) utilise déjà `<section aria-label="Demain">` — un `<section>` avec `aria-label` expose déjà le rôle ARIA implicite `region`, donc `page.getByRole("region", { name: "Demain" })` fonctionne sans modification supplémentaire. Vérifier ce point en Step 4 plutôt que de modifier le composant à l'aveugle.

- [ ] **Step 4: Lancer la suite e2e ciblée**

Run: `npx playwright test e2e/planifier-demain.spec.ts --project=chromium` (adapter le nom de projet Playwright si différent dans `playwright.config.ts`)
Expected: 3 tests PASS. Si `getByRole("region", { name: "Demain" })` ne matche pas, remplacer par `page.locator("section", { hasText: "Demain" })` (même contournement que `volume-interieur.spec.ts` pour un problème de rôle ARIA similaire) et relancer.

- [ ] **Step 5: Lancer toute la suite e2e (régression)**

Run: `npm run build && npx playwright test`
Expected: tous les tests PASS (build prod obligatoire, cf. CLAUDE.md — `playwright.config.ts` démarre un serveur prod, pas `next dev`).

- [ ] **Step 6: Commit**

```bash
git add e2e/planifier-demain.spec.ts e2e/fixtures.ts
git commit -m "test: e2e planifier/reporter une tâche vers demain (issue #116)"
```

**Note de couverture (pas de silence sur ce qui n'est pas testé)** : la spec (§8, "Cas limites à couvrir en tests") liste plus de scénarios que ce que ce plan couvre explicitement. Répartition assumée :
- Couverts par Vitest (Task 2/3/4) : `nextDayKey` (bascules mois/année/DST), `isPlanningUnlocked` (bornes 12/23), `insertTaskForUser` avec `dayDate` explicite, guards UUID de `reportToTomorrow`/`bringToToday`.
- Couverts par e2e (ce Task) : gate heure seuil (section masquée/visible), créer + ramener une tâche "Demain", reporter + annuler via toast.
- **Non couverts par un test automatisé, à vérifier manuellement avant de clore l'issue** : cascade sous-tâches sur `reportToTomorrow`/`bringToToday`/annihilation (2 niveaux RG-01), effacement de la deadline au report (pas de double malus -10/-20), anti-doublon récurrence (`planRecurringGeneration`) sur une instance de routine reportée manuellement vers demain. Ajouter des tests dédiés pour ces cas si une régression y est un jour constatée, plutôt que de les couvrir préventivement ici (proportionnalité — cf. Global Constraints).

---

## Task 14: Documentation (CLAUDE.md, CHANGELOG.md, Le Guide)

**Files:**
- Modify: `CLAUDE.md`
- Modify: `CHANGELOG.md`
- Create/Modify: `content/guide/planifier-demain.md`, `content/guide/index.json`

Pas de nouvelle entrée dans `SPECS_FONCTIONNELLES.md` : les features livrées depuis Sprint 3 (issues #101, #111, #115, #119, #112, #72, #74, #122, #48) sont documentées directement par numéro d'issue dans `CHANGELOG.md`, sans registre `US-XX` dédié — ce plan suit la même convention.

- [ ] **Step 1: `CLAUDE.md` — nouvelle entrée « Pièges et décisions non-évidentes »**

Ajouter, à la suite des autres entrées de cette section (avant la ligne `## URL de production`) :

```markdown
**Planifier demain — `deferred_at` toujours effacé, jamais un nouveau pool HP (issue #116)** — La section "Demain" de l'Arène (visible après `profiles.plan_tomorrow_after_hour`, borné 12-23) crée/déplace des tâches en changeant simplement leur `day_date` — aucun nouveau statut, aucune nouvelle table. `reportToTomorrow`/`bringToToday` (`app/actions/tasks.ts`) effacent systématiquement `deferred_at` à chaque changement de `day_date` qu'ils opèrent, y compris quand ce flag était déjà posé (reste reporté par Le Réveil plus tôt le même jour) — sans ça, le malus -20 HP "reste reporté" (`deferredRestHpPenalties`) réapparaîtrait à tort le lendemain matin sur une tâche qui n'est pourtant plus en retard. `bringToToday` sert à la fois d'action permanente (bouton "← Aujourd'hui" dans la section Demain) et d'annulation du toast affiché juste après un report (~5s) — simplification assumée : pas de restauration exacte de la position/deadline d'origine, la tâche revient en fin de fratrie du jour. `addSubtask` (`app/actions/tasks.ts`) a été corrigé à cette occasion pour hériter du `day_date` du **parent** au lieu de toujours "aujourd'hui" — un vrai bug latent qui, avant ce correctif, aurait daté "aujourd'hui" toute sous-tâche ajoutée à une tâche de la section Demain. L'Arène garde deux states client distincts (`tasks` = aujourd'hui, `tomorrowTasks` = demain) : `calculateBossMaxHp`/`calculateHeroHp` ne lisent jamais `tomorrowTasks`, donc une tâche de demain ne peut structurellement jamais affecter le Boss/Héros du jour courant, sans garde supplémentaire à écrire. `nextDayKey` (`lib/game-engine.ts`) calcule le jour suivant par arithmétique UTC sur le `day_date` lui-même (jamais sur un instant local) — volontairement différent de `deadlineIso` : un `day_date` est une étiquette calendaire, pas un horodatage, donc aucun risque DST à gérer ici.
```

- [ ] **Step 2: `CHANGELOG.md`**

Ajouter sous `## [Unreleased]` → `### Produit` (en tête de liste ou à la suite, cohérent avec l'ordre déjà en place — les entrées les plus récentes sont ajoutées en tête dans ce fichier, à vérifier en lisant les 2-3 dernières lignes ajoutées avant de choisir la position exacte) :

```markdown
- Issue #116 : section "Demain" dans l'Arène (réglable, 12h-23h) — créer une tâche directement pour demain, reporter une tâche du jour vers demain sans malus, ou la ramener à aujourd'hui. Réglage dans Le Vestiaire, ligne de La Voix au premier déblocage du jour.
```

- [ ] **Step 3: Le Guide — nouvel article**

Feature visible utilisateur (nouvel écran/mécanique) → nouvel article, catégorie "Journée" (cf. `ORDRE_SECTIONS`, `lib/guide.ts`). Choisir `ordre` : lire les entrées existantes de la section "Journée" dans `content/guide/index.json` (`grep -B1 -A6 '"section": "Journée"' content/guide/index.json`) et prendre `max(ordre) + 10`.

Créer `content/guide/planifier-demain.md` :

```markdown
# Planifier demain

En fin de journée, une section "Demain" apparaît sous ton combat du jour. Tu peux y ajouter directement des tâches pour demain, ou reporter une tâche du jour vers demain d'un clic — sans jamais perdre de HP, ni pour toi, ni pour le Boss du jour.

## À partir de quand ?

Par défaut, la section "Demain" s'ouvre à 18h (heure locale). Tu peux régler cette heure dans Le Vestiaire, section "Planifier demain", entre midi et 23h.

## Ce que ça change

- Une tâche ajoutée dans "Demain" n'affecte jamais le Boss d'aujourd'hui.
- Reporter une tâche du jour vers demain retire simplement cette tâche du combat en cours — aucun malus, ni pour toi ni pour ton Boss.
- Tu peux changer d'avis à tout moment : "← Aujourd'hui" ramène une tâche de "Demain" dans ton combat du jour.
- Demain, ces tâches deviennent normalement les tâches de ta nouvelle journée.
```

Ajouter l'entrée correspondante dans `content/guide/index.json` (respecter l'ordre alphabétique/positionnel déjà en place dans le tableau, section "Journée") :

```json
  {
    "titre": "Planifier demain",
    "slug": "planifier-demain",
    "section": "Journée",
    "ordre": 40,
    "resume": "Créer une tâche pour demain ou reporter une tâche du jour, sans malus.",
    "motsCles": ["planification", "demain"],
    "majLe": "2026-07-31T00:00:00.000Z"
  },
```

(Remplacer `"ordre": 40` par la valeur réellement calculée au Step 3 ci-dessus si différente.)

- [ ] **Step 4: Vérifier le build du Guide**

Run: `npm run build`
Expected: build réussi — `generateStaticParams` (`app/guide/[slug]/page.tsx`) résout le nouveau slug `planifier-demain` sans erreur 404 au routage.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md CHANGELOG.md content/guide/planifier-demain.md content/guide/index.json
git commit -m "docs: documente la section Demain (issue #116)"
```

---

## Récapitulatif des fichiers touchés

| Fichier | Nature |
|---|---|
| `supabase/migrations/20260731200000_add_profile_plan_tomorrow_after_hour.sql` | Créé |
| `types/index.ts` | Modifié |
| `lib/game-engine.ts` / `.test.ts` | Modifié |
| `lib/task-insertion.ts` / `.test.ts` | Modifié |
| `app/actions/tasks.ts` / `.test.ts` | Modifié |
| `app/actions/profile.ts` | Modifié |
| `lib/copy/planning.ts` / `.test.ts` | Créé |
| `components/qg/PlanTomorrowSection.tsx` | Créé |
| `app/vestiaire/page.tsx` | Modifié |
| `app/page.tsx` | Modifié |
| `components/combat/AddTaskForm.tsx` | Modifié |
| `components/combat/TomorrowTaskRow.tsx` | Créé |
| `components/combat/TomorrowSection.tsx` | Créé |
| `components/combat/TaskRow.tsx` / `TaskList.tsx` | Modifié |
| `components/combat/PerfectOverlay.tsx` / `CrepusculeRecap.tsx` | Modifié |
| `components/combat/Arena.tsx` | Modifié |
| `e2e/planifier-demain.spec.ts`, `e2e/fixtures.ts` | Créé/Modifié |
| `CLAUDE.md`, `CHANGELOG.md`, `content/guide/*` | Modifié |
