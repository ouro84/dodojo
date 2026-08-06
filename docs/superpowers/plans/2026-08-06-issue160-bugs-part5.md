# Issue #160 — "les bugs part5" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corriger 5 bugs indépendants de l'issue #160 : course à l'écriture sur le boss du jour, jokers de série consommés à tort, timeline VS/FIGHT trop courte, orientation du boss incohérente entre l'intro et le combat, et unité erronée (+ wording à revoir) dans le rappel push quotidien.

**Architecture:** Cinq correctifs ciblés, chacun dans son propre fichier/couche : `app/actions/boss.ts` (server action), `app/page.tsx` (chargement de page), `components/combat/VsIntroOverlay.tsx` (2 tâches distinctes sur le même composant), `lib/copy/notifications.ts` + `lib/inngest/functions/send-reminder.ts` (copy + call site). Aucune migration SQL, aucun changement de schéma.

**Tech Stack:** Next.js 16 App Router, Server Actions, TypeScript strict, Vitest + @testing-library/react (jsdom, fake timers), Playwright e2e, Supabase (mocké dans les tests unitaires).

## Global Constraints

- TypeScript strict : jamais de `any` (règle projet n°1).
- Logique de jeu pure dans `lib/` (règle projet n°2) — les correctifs qui touchent des server actions non pures (`boss.ts`, `day.ts`) sont testés via mock Supabase (unitaire) ou e2e (comportemental), jamais en prétendant les rendre "purs".
- Commits `type: description courte` (Conventional Commits) — un commit par tâche.
- `CHANGELOG.md` (`[Unreleased]`) mis à jour dans le même commit que l'implémentation (dernière tâche de ce plan).
- Chaque bug corrigé porte au moins un test qui échoue avant le correctif et passe après (cf. spec §7, matrice de couverture).
- Zéro merge si `npm run lint`, `npm test`, `tsc --noEmit`, `npm run build` ne passent pas ; e2e complet (`npm run e2e`) passé en local avant toute PR poussée.
- Travail effectué sur la branche `fix/issue-160-bugs-part5` (déjà créée, basée sur `origin/main` à jour — ne pas la baser sur une `main` locale potentiellement désynchronisée).

---

### Task 1: `resolveDailyBoss` — upsert atomique + relecture inconditionnelle

**Files:**
- Modify: `app/actions/boss.ts:61-98`
- Test: `app/actions/boss.test.ts` (nouveau)

**Interfaces:**
- Consumes : `pickDailyBoss(recentBossIds: string[]): Boss`, `pickBackgroundId(boss: Boss): string`, `getBoss(id: string): Boss | undefined` (tous déjà existants, `@/lib/bosses`).
- Produces : `resolveDailyBoss(): Promise<DailyBossSelection>` — signature inchangée, consommée par `app/page.tsx` (Task 2) et déjà par le reste de l'app.

- [ ] **Step 1: Write the failing test**

Créer `app/actions/boss.test.ts` :

```ts
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

type Row = Record<string, unknown>;

let selectCallCount = 0;
const seededWinner: Row = { boss_id: "boss-winner", background_id: "bg-winner" };

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { timezone: "UTC" } }) }),
          }),
        };
      }
      // table === "daily_boss" : un seul builder partagé, chaînable dans
      // n'importe quel ordre (eq/lt/order renvoient le même objet). Seul
      // maybeSingle() incrémente le compteur : 1er appel = "déjà tiré
      // aujourd'hui ?" (rien), 2e appel = relecture après upsert (le
      // "gagnant" simulé de la course).
      const builder: Row = {};
      builder.eq = () => builder;
      builder.lt = () => builder;
      builder.order = () => builder;
      builder.limit = async () => ({ data: [] });
      builder.then = (resolve: (v: unknown) => void) => resolve({ data: [] });
      builder.maybeSingle = async () => {
        selectCallCount += 1;
        return { data: selectCallCount === 1 ? null : seededWinner };
      };
      return {
        select: () => builder,
        // insert() présent pour que le code PRE-fix (qui appelle .insert(),
        // pas .upsert()) s'exécute sans planter sur "insert is not a
        // function" — sans lui, le test rouge échouerait sur une erreur non
        // liée plutôt que sur l'assertion réellement visée.
        insert: async () => ({ error: null }),
        upsert: async () => ({ error: null }),
      };
    },
  }),
}));

vi.mock("@/lib/bosses", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bosses")>();
  return {
    ...actual,
    pickDailyBoss: () => actual.getBoss("frost-guardian")!,
    pickBackgroundId: () => "bg-local",
  };
});

vi.mock("@/app/actions/achievements", () => ({
  assembleAchievementContext: async () => ({}),
  applyNewAchievements: async () => [],
}));

beforeEach(() => {
  selectCallCount = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("resolveDailyBoss — course à l'écriture (issue #160 bug #1)", () => {
  test("renvoie toujours la ligne persistée, jamais le pick local en cas de course perdue", async () => {
    const { resolveDailyBoss } = await import("./boss");
    const result = await resolveDailyBoss();
    // pickDailyBoss (mocké) renvoie "frost-guardian" pour CET appel, mais la
    // relecture après upsert renvoie "boss-winner" (simulant un appel
    // concurrent qui a gagné la course pendant que celui-ci tournait). La
    // fonction doit faire confiance à la relecture, jamais à son pick local.
    expect(result.bossId).toBe("boss-winner");
    expect(result.backgroundId).toBe("bg-winner");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/actions/boss.test.ts`
Expected: FAIL — avec le code actuel (`app/actions/boss.ts`), le 2e appel `maybeSingle()` n'a lieu que dans la branche `raced` (après un échec d'`insert`, qui n'est jamais déclenché ici puisque le mock n'a pas de contrainte d'unicité à violer). Le test échoue sur `result.bossId` valant `"frost-guardian"` (le pick local) au lieu de `"boss-winner"`.

- [ ] **Step 3: Write minimal implementation**

Dans `app/actions/boss.ts`, remplacer le bloc `else` (lignes 61-98, de `// Boss des 2 derniers jours...` jusqu'à la fermeture du `else`) par :

```ts
    // Boss des 2 derniers jours enregistrés (à exclure).
    const { data: recent } = await supabase
      .from("daily_boss")
      .select("boss_id, day_date")
      .eq("user_id", user.id)
      .lt("day_date", today)
      .order("day_date", { ascending: false })
      .limit(2);
    const recentBossIds = (recent ?? []).map((r) => r.boss_id);

    const boss = pickDailyBoss(recentBossIds);
    const backgroundId = pickBackgroundId(boss);

    // Upsert idempotent (conflit = no-op silencieux, jamais d'erreur 23505 à
    // intercepter) suivi d'une relecture SYSTÉMATIQUE : que cet appel ait
    // gagné ou perdu une course contre un autre chargement concurrent (ex.
    // le revalidatePath("/") d'addTask), la relecture renvoie toujours la
    // ligne réellement persistée — les deux appels convergent nécessairement
    // vers la même valeur. Jamais de pick local en fallback tant que la
    // relecture réussit (issue #160 bug #1).
    await supabase.from("daily_boss").upsert(
      { user_id: user.id, day_date: today, boss_id: boss.id, background_id: backgroundId },
      { onConflict: "user_id,day_date", ignoreDuplicates: true },
    );

    const { data: persisted } = await supabase
      .from("daily_boss")
      .select("boss_id, background_id")
      .eq("user_id", user.id)
      .eq("day_date", today)
      .maybeSingle();

    selection = persisted
      ? { bossId: persisted.boss_id, backgroundId: persisted.background_id }
      : getBoss(boss.id)
        ? { bossId: boss.id, backgroundId }
        : { bossId: fallback.bossId, backgroundId: fallback.backgroundId };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/actions/boss.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full unit suite to check for regressions**

Run: `npm test`
Expected: PASS (aucun autre test ne dépend du détail d'implémentation de `resolveDailyBoss`).

- [ ] **Step 6: Commit**

```bash
git add app/actions/boss.ts app/actions/boss.test.ts
git commit -m "fix: resolveDailyBoss upsert atomique + relecture systématique (issue #160)"
```

---

### Task 2: `backfillMissedDays` appelée en inconditionnel au chargement de l'Arène

**Files:**
- Modify: `app/page.tsx`
- Modify: `e2e/fixtures.ts` (ajout de 2 helpers)
- Modify: `e2e/streaks.spec.ts` (ajout d'un test)

**Interfaces:**
- Consumes : `backfillMissedDays(): Promise<{ error: string | null }>` (déjà exporté, `@/app/actions/day`, signature inchangée).
- Produces : rien de nouveau exposé — comportement observable uniquement (`day_results` backfillé au chargement).

- [ ] **Step 1: Write the failing e2e test**

Dans `e2e/fixtures.ts`, ajouter ces deux helpers (même patron que `seedOverdueTask`/`getTaskById` déjà présents dans ce fichier) :

```ts
// Issue #160 (bug #2) : simule un jour gagné (tâche complétée) mais jamais
// clôturé manuellement — pour reproduire le trou permanent qui consommait un
// joker à tort sur un compte sans aucun retard (Le Réveil, seul déclencheur
// historique de backfillMissedDays, ne se monte jamais dans ce cas).
export async function seedWonPastDayWithoutResult(daysAgo: number): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PRIVATE_KEY_SUPABASE;
  const email = process.env.E2E_TEST_EMAIL;
  if (!url || !key || !email) {
    throw new Error(
      "Seed won past day : NEXT_PUBLIC_SUPABASE_URL / NEXT_PRIVATE_KEY_SUPABASE / E2E_TEST_EMAIL manquants.",
    );
  }
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const users = await listUsersRetrying(admin);
  const uid = users.find((u) => u.email === email)?.id;
  if (!uid) throw new Error("Seed won past day : utilisateur test introuvable.");

  const dayDate = new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);
  await admin.from("day_results").delete().eq("user_id", uid).eq("day_date", dayDate);
  const { data, error } = await admin
    .from("tasks")
    .insert({ user_id: uid, title: `E2E won day ${dayDate}`, day_date: dayDate, is_completed: true })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`Seed won past day : insert échoué (${error?.message ?? "inconnu"}).`);
  }
  return dayDate;
}

// Issue #160 (bug #2) : lit l'outcome day_results pour une date donnée (ou
// null si la ligne n'existe pas encore — le "trou" que ce bug produisait).
export async function getDayResultOutcome(dayDate: string): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PRIVATE_KEY_SUPABASE;
  const email = process.env.E2E_TEST_EMAIL;
  if (!url || !key || !email) {
    throw new Error(
      "Get day result : NEXT_PUBLIC_SUPABASE_URL / NEXT_PRIVATE_KEY_SUPABASE / E2E_TEST_EMAIL manquants.",
    );
  }
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const users = await listUsersRetrying(admin);
  const uid = users.find((u) => u.email === email)?.id;
  if (!uid) throw new Error("Get day result : utilisateur test introuvable.");

  const { data } = await admin
    .from("day_results")
    .select("outcome")
    .eq("user_id", uid)
    .eq("day_date", dayDate)
    .maybeSingle();
  return (data?.outcome as string | undefined) ?? null;
}
```

Dans `e2e/streaks.spec.ts`, ajouter l'import (`seedWonPastDayWithoutResult, getDayResultOutcome` en plus de `seedStreak`) et ce test :

```ts
test("un jour gagné mais jamais clôturé n'est pas compté comme joker (issue #160)", async ({ page }) => {
  const dayDate = await seedWonPastDayWithoutResult(2);
  expect(await getDayResultOutcome(dayDate)).toBeNull(); // trou confirmé avant le chargement

  await login(page); // charge "/" — doit backfiller ce jour au passage

  expect(await getDayResultOutcome(dayDate)).toBe("victory");

  await page.goto("/vestiaire");
  await expect(page.getByText(/jokers de la semaine épuisés/)).toHaveCount(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test e2e/streaks.spec.ts`
Expected: FAIL sur `expect(await getDayResultOutcome(dayDate)).toBe("victory")` — avec le code actuel, `login()` charge `/` sans jamais appeler `backfillMissedDays()` (aucune tâche en retard puisque la tâche seedée est déjà `is_completed: true`, donc Le Réveil ne se monte pas), la ligne reste `null`.

- [ ] **Step 3: Write minimal implementation**

Dans `app/page.tsx`, ajouter l'import et l'appel juste après `resolveDailyBoss()` et avant le `Promise.all` qui fetche `dayResults` (l'ordre est important : le backfill doit être terminé avant cette lecture, sinon la ligne fraîchement écrite n'apparaît pas dans les props passées à `Arena`) :

```ts
import { backfillMissedDays } from "@/app/actions/day";
```

```ts
  // Roster : boss + décor du jour (tiré une fois puis figé, exclut les 2 derniers jours).
  const daily = await resolveDailyBoss();

  // Issue #160 (bug #2) : filet supplémentaire au chargement — backfille tout
  // jour passé ayant des tâches mais aucune ligne day_results. Sans cet appel
  // eager, un compte qui n'a jamais de tâche en retard ne monte jamais Le
  // Réveil, seul déclencheur historique de backfillMissedDays() — un jour
  // gagné mais jamais clôturé manuellement restait alors un trou permanent,
  // invisible du Tableau de Chasse (winRate ne compte que les lignes
  // existantes) mais compté comme joker consommé par currentStreak. Appel
  // lazy et idempotent (no-op si aucun jour passé sans ligne), même patron
  // que resolveDailyBoss()/generateRecurringInstances() ci-dessus. Reste
  // aussi appelée en fin de Réveil (WakeUpRitual) : nécessaire pour qu'un
  // "Terminé" ait pu transformer un jour en victory avant son backfill.
  await backfillMissedDays();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test e2e/streaks.spec.ts`
Expected: PASS

- [ ] **Step 5: Run the full e2e suite to check for regressions**

Run: `npm run e2e`
Expected: PASS — en particulier `e2e/wake-up-ritual.spec.ts` (Le Réveil doit toujours se monter et fonctionner normalement quand il y a des tâches en retard) et tout spec qui touche `day_results`/streaks.

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx e2e/fixtures.ts e2e/streaks.spec.ts
git commit -m "fix: backfillMissedDays appelée en inconditionnel au chargement (issue #160)"
```

---

### Task 3: `VsIntroOverlay` — timeline +2s

**Files:**
- Modify: `components/combat/VsIntroOverlay.tsx:46-57`
- Modify: `components/combat/VsIntroOverlay.test.tsx`

**Interfaces:**
- Consumes : rien de nouveau.
- Produces : rien de nouveau — comportement temporel uniquement.

- [ ] **Step 1: Update the existing tests to the new timeline (they must fail against current code)**

Dans `components/combat/VsIntroOverlay.test.tsx`, remplacer les 3 tests qui dépendent des constantes de temps :

```ts
  it("affiche les portraits, puis VS, puis FIGHT! dans l'ordre scripté", () => {
    vi.useFakeTimers();
    render(<VsIntroOverlay {...base} onDone={() => {}} />);
    expect(screen.getByTestId("vs-intro-overlay")).toBeInTheDocument();
    expect(screen.queryByText("VS")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(450);
    });
    expect(screen.getByText("VS")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2150); // cumulé 2600ms
    });
    expect(screen.getByText("FIGHT!")).toBeInTheDocument();
    expect(screen.queryByText("VS")).not.toBeInTheDocument();
  });

  it("appelle onDone une fois après la séquence complète (~5s)", () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<VsIntroOverlay {...base} onDone={onDone} />);
    vi.advanceTimersByTime(4999);
    expect(onDone).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("n'appelle onDone qu'une seule fois même après 7s pleines (garde-fou sans double appel)", () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<VsIntroOverlay {...base} onDone={onDone} />);
    vi.advanceTimersByTime(7000);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
```

(Les 3 autres tests du fichier — dismiss anticipé, badge première rencontre, ligne d'enjeu — restent inchangés, ils n'assertent qu'à 450ms, déjà stable.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/combat/VsIntroOverlay.test.tsx`
Expected: FAIL — le code actuel bascule en `fight` à 1600ms (pas 2600ms) et appelle `onDone` à 3000ms (pas 5000ms).

- [ ] **Step 3: Write minimal implementation**

Dans `components/combat/VsIntroOverlay.tsx`, remplacer le tableau `timers` :

```ts
    const timers = [
      setTimeout(() => setPhase("vs"), 450),
      setTimeout(() => setPhase("fight"), 2600),
      setTimeout(() => setFading(true), 4500),
      setTimeout(finish, 5000),
      // Garde-fou : démontage forcé à 7s même si le déroulé scripté a été
      // perturbé (`firedRef` empêche un double appel si les deux tirent).
      setTimeout(finish, 7000),
    ];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run components/combat/VsIntroOverlay.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/combat/VsIntroOverlay.tsx components/combat/VsIntroOverlay.test.tsx
git commit -m "fix: rallonge la timeline VS/FIGHT de 2s (issue #160)"
```

---

### Task 4: `VsIntroOverlay` — orientation du boss cohérente avec le combat

**Files:**
- Modify: `components/combat/VsIntroOverlay.tsx`
- Modify: `components/combat/Arena.tsx:1834` (site de montage)
- Modify: `components/combat/VsIntroOverlay.test.tsx`
- Modify: `e2e/vs-intro.spec.ts`

**Interfaces:**
- Consumes : `boss.flip: boolean` (déjà sur `Boss`, `@/lib/bosses`), déjà en scope dans `Arena.tsx` via `const boss = getBoss(bossId) ?? ...` (ligne 173).
- Produces : `VsIntroOverlayProps.bossFlip: boolean` (nouvelle prop, obligatoire — un appelant qui l'omet échoue à la compilation plutôt que d'afficher un boss mal orienté sans le savoir).

- [ ] **Step 1: Write the failing test**

Dans `components/combat/VsIntroOverlay.test.tsx`, ajouter `bossFlip: false` à l'objet `base` (sinon TypeScript refuse la compilation dès l'ajout de la prop obligatoire à l'étape 3) :

```ts
const base = {
  heroBustSrc: "/sprites/mc/fire-knight/bust.png",
  bossBustSrc: "/sprites/bosses/minotaur/bust.png",
  bossName: "Minotaure",
  bossFlip: false,
  isFirstEncounter: false,
  stakesLine: null as string | null,
};
```

Puis ajouter les deux nouveaux tests :

```ts
  it("miroite le bust du boss quand bossFlip est vrai, jamais le bust du héros", () => {
    vi.useFakeTimers();
    render(<VsIntroOverlay {...base} bossFlip onDone={() => {}} />);
    const heroImg = document.querySelector<HTMLImageElement>(`img[src="${base.heroBustSrc}"]`)!;
    const bossImg = document.querySelector<HTMLImageElement>(`img[src="${base.bossBustSrc}"]`)!;
    expect(heroImg).not.toHaveStyle({ transform: "scaleX(-1)" });
    expect(bossImg).toHaveStyle({ transform: "scaleX(-1)" });
  });

  it("n'applique aucun transform au bust du boss quand bossFlip est faux", () => {
    vi.useFakeTimers();
    render(<VsIntroOverlay {...base} bossFlip={false} onDone={() => {}} />);
    const bossImg = document.querySelector<HTMLImageElement>(`img[src="${base.bossBustSrc}"]`)!;
    expect(bossImg.style.transform).toBe("");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/combat/VsIntroOverlay.test.tsx`
Expected: FAIL — d'abord une erreur de compilation TypeScript (`bossFlip` n'existe pas encore sur `VsIntroOverlayProps`, absent de l'objet `base` avant l'étape suivante), puis, une fois `bossFlip` ajouté à `base` sans être consommé par le composant, le `bossImg` n'a aucun `transform` dans les deux cas.

- [ ] **Step 3: Write minimal implementation**

Dans `components/combat/VsIntroOverlay.tsx`, ajouter la prop :

```ts
interface VsIntroOverlayProps {
  heroBustSrc: string;
  bossBustSrc: string;
  bossName: string;
  bossFlip: boolean;
  isFirstEncounter: boolean;
  stakesLine: string | null;
  onDone: () => void;
}
```

```ts
export default function VsIntroOverlay({
  heroBustSrc,
  bossBustSrc,
  bossName,
  bossFlip,
  isFirstEncounter,
  stakesLine,
  onDone,
}: VsIntroOverlayProps) {
```

Puis remplacer le bloc des deux `<img>` (portraits) :

```tsx
      {phase !== "fight" && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- sprite pixel-art fixe, next/image inutile */}
          <img
            src={heroBustSrc}
            alt=""
            className="vs-slide-in-left absolute left-4 w-[38vw] max-w-[220px] [image-rendering:pixelated]"
          />
          {/* Piège transform : `.vs-slide-in-right` porte déjà une animation
              CSS qui anime `transform` (translateX, fill-mode forwards) —
              poser un `scaleX(-1)` inline sur ce MÊME élément serait
              silencieusement écrasé pour toute la durée de vie du nœud.
              Le miroir doit vivre sur un wrapper distinct de celui qui
              porte l'animation de slide (même règle que l'ancrage des
              sprites de combat, cf. CLAUDE.md § Sprites de combat). */}
          <div className="vs-slide-in-right absolute right-4 w-[38vw] max-w-[220px]">
            {/* eslint-disable-next-line @next/next/no-img-element -- sprite pixel-art fixe, next/image inutile */}
            <img
              src={bossBustSrc}
              alt=""
              className="w-full [image-rendering:pixelated]"
              style={{ transform: bossFlip ? "scaleX(-1)" : undefined }}
            />
          </div>
        </>
      )}
```

Dans `components/combat/Arena.tsx`, au site de montage (`VsIntroOverlay` ligne ~1834), ajouter la prop :

```tsx
            <VsIntroOverlay
              heroBustSrc={heroBustSrc}
              bossBustSrc={bossBustSrc}
              bossName={bossName}
              bossFlip={boss.flip}
              isFirstEncounter={isFirstEncounter}
              stakesLine={vsStakesLine}
              onDone={() => setShowVsIntro(false)}
            />
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run components/combat/VsIntroOverlay.test.tsx`
Expected: PASS

- [ ] **Step 5: Run `tsc --noEmit` to confirm the obligatory prop is wired everywhere**

Run: `npx tsc --noEmit`
Expected: PASS (aucun autre site de montage de `VsIntroOverlay` dans le code que celui d'`Arena.tsx`).

- [ ] **Step 6: Add the e2e regression test**

Dans `e2e/vs-intro.spec.ts`, ajouter (le compte e2e affronte un boss `idler` (Pan) déterminé par le roster du jour — comme le boss du jour est tiré aléatoirement par compte/jour, ce test vérifie la cohérence quel que soit le boss du jour, pas un boss spécifique) :

```ts
  test("le bust du boss en intro a la même orientation que son sprite en combat", async ({ page }) => {
    await login(page);
    const introBoss = page.locator('[data-testid="vs-intro-overlay"] img').nth(1);
    const introTransform = await introBoss.evaluate((el) => getComputedStyle(el).transform);

    await page.reload(); // fait disparaître l'intro (déjà jouée aujourd'hui), révèle la scène de combat
    // Le flip vit sur le nœud `role="img"` interne au SpriteAnimator
    // (`transform: scaleX(±1)`), pas sur le wrapper `character-sprite`
    // (celui-ci ne porte que `translateY`, cf. CharacterSprite.tsx).
    const combatBoss = page.locator('[data-testid="character-sprite"] [role="img"]').last();
    const combatTransform = await combatBoss.evaluate((el) => getComputedStyle(el).transform);

    // matrix(-1,0,0,1,0,0) si flip, matrix(1,0,0,1,0,0)/"none" sinon — on ne
    // compare pas le sprite gagnant lui-même (la scène de combat mélange
    // d'autres transforms de positionnement), seul le signe de l'axe X compte.
    const isFlipped = (t: string) => t.includes("-1,") || t.startsWith("matrix(-1");
    expect(isFlipped(introTransform)).toBe(isFlipped(combatTransform));
  });
```

- [ ] **Step 7: Run the e2e suite to check for regressions**

Run: `npx playwright test e2e/vs-intro.spec.ts e2e/combat-animations.spec.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add components/combat/VsIntroOverlay.tsx components/combat/VsIntroOverlay.test.tsx components/combat/Arena.tsx e2e/vs-intro.spec.ts
git commit -m "fix: applique le flip du boss au bust de l'intro VS/FIGHT (issue #160)"
```

---

### Task 5: Rappel push — métriques séparées + wording sans pluriel-monstre

**Files:**
- Modify: `lib/copy/notifications.ts` (réécriture complète)
- Modify: `lib/inngest/functions/send-reminder.ts:118-127`
- Modify: `lib/copy/notifications.test.ts` (réécriture)

**Interfaces:**
- Consumes : `HpTask` (`@/lib/game-engine`, déjà utilisé par `candidate.todayTasks`), `calculateBossCurrentHp(tasks: HpTask[]): number` (déjà exporté, inchangée).
- Produces : `buildReminderPayload(metrics: ReminderMetrics, level: AggressivityLevel, pickIndex?: (n: number) => number): PushReminderPayload` — **signature changée** (1er paramètre passe de `number` à `ReminderMetrics`). Seul consommateur en prod : `send-reminder.ts` (modifié dans cette même tâche). `ReminderMetrics = { remainingTaskCount: number; remainingHp: number }`, exportée par `lib/copy/notifications.ts`.

- [ ] **Step 1: Write the failing tests (full rewrite)**

Remplacer entièrement `lib/copy/notifications.test.ts` :

```ts
import { describe, expect, test } from "vitest";
import { buildReminderPayload } from "./notifications";

const metrics = { remainingTaskCount: 3, remainingHp: 30 };

describe("buildReminderPayload — direct", () => {
  test("titre et deep-link fixes, quel que soit le gabarit tiré", () => {
    const payload = buildReminderPayload(metrics, "direct", () => 0);
    expect(payload.title).toBe("Dodojo — Le Boss t'attend");
    expect(payload.url).toBe("/");
  });

  test("un gabarit 'tasks' utilise remainingTaskCount, jamais remainingHp", () => {
    const payload = buildReminderPayload({ remainingTaskCount: 1, remainingHp: 99 }, "direct", () => 0);
    expect(payload.body).toContain("1 tâche");
    expect(payload.body).not.toContain("99");
  });

  test("un gabarit 'hp' utilise remainingHp, jamais remainingTaskCount", () => {
    const payload = buildReminderPayload({ remainingTaskCount: 99, remainingHp: 1 }, "direct", () => 1);
    expect(payload.body).toContain("1 point de vie");
    expect(payload.body).not.toContain("99");
  });

  test("accorde au singulier quand il reste 1 unité", () => {
    const payload = buildReminderPayload({ remainingTaskCount: 1, remainingHp: 1 }, "direct", () => 0);
    expect(payload.body).toContain("1 tâche");
    expect(payload.body).not.toContain("tâches");
  });

  test("accorde au pluriel quand il reste plusieurs unités", () => {
    const payload = buildReminderPayload({ remainingTaskCount: 4, remainingHp: 4 }, "direct", () => 0);
    expect(payload.body).toContain("4 tâches");
  });

  test("pickIndex sélectionne le gabarit correspondant (index 2)", () => {
    const payload = buildReminderPayload(metrics, "direct", () => 2);
    expect(payload.body).toContain("La journée s'achève");
  });

  test("pickIndex hors bornes retombe sur le premier gabarit", () => {
    const payload = buildReminderPayload(metrics, "direct", () => 99);
    expect(payload.body).toContain("Le Boss ricane");
  });
});

describe("buildReminderPayload — niveaux", () => {
  test("doux reste sans juron sur tous les gabarits", () => {
    for (let i = 0; i < 6; i++) {
      const payload = buildReminderPayload(metrics, "doux", () => i);
      expect(payload.body).not.toMatch(/putain|bordel|merde|\bcon\b|connard|foutre/);
    }
  });

  test("brut élargit le vocabulaire", () => {
    const payload = buildReminderPayload(metrics, "brut", () => 0);
    expect(payload.body).toMatch(/marre/);
  });

  test("6 gabarits disponibles par niveau, tous distincts", () => {
    const bodies = new Set<string>();
    for (let i = 0; i < 6; i++) bodies.add(buildReminderPayload(metrics, "direct", () => i).body);
    expect(bodies.size).toBe(6);
  });
});

describe("buildReminderPayload — fiction : un seul Boss par jour (issue #160)", () => {
  test("aucun gabarit, à aucun niveau, ne personnifie plusieurs monstres/adversaires", () => {
    for (const level of ["doux", "direct", "brut"] as const) {
      for (let i = 0; i < 6; i++) {
        const payload = buildReminderPayload(metrics, level, () => i);
        expect(payload.body).not.toMatch(/monstres?\b/i);
        expect(payload.body).not.toMatch(/adversaires?\b/i);
      }
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/copy/notifications.test.ts`
Expected: FAIL — erreur de compilation (`buildReminderPayload` attend encore un `number` en 1er paramètre, pas un objet `metrics`).

- [ ] **Step 3: Write minimal implementation**

Remplacer entièrement `lib/copy/notifications.ts` :

```ts
import type { AggressivityLevel } from "../../types";

export interface PushReminderPayload {
  title: string;
  body: string;
  url: string;
  // Issue #114 (amélioration C) : présents uniquement pour un rappel de
  // deadline (jamais pour le rappel quotidien générique) — permet au service
  // worker d'ajouter l'action "snooze15" et de savoir quoi envoyer à la route
  // de snooze.
  taskId?: string;
  userId?: string;
}

// Issue #160 (bug #5) : deux métriques distinctes, jamais mélangées — le
// nombre de tâches restantes et les HP du Boss racontent des choses
// différentes (une tâche à 20 HP de poids "vaut" plus qu'une tâche à 5 HP).
export interface ReminderMetrics {
  remainingTaskCount: number;
  remainingHp: number;
}

function pluralize(n: number, singular: string, plural: string): string {
  return n <= 1 ? singular : plural;
}

type ReminderUnit = "tasks" | "hp";

interface ReminderTemplate {
  unit: ReminderUnit;
  pools: Record<AggressivityLevel, (n: number) => string>;
}

// Un seul Boss par jour (fiction "Le Démon Intérieur", CLAUDE.md) : aucun
// gabarit ne doit personnifier plusieurs monstres/adversaires distincts.
const REMINDER_TEMPLATES: ReminderTemplate[] = [
  {
    unit: "tasks",
    pools: {
      doux: (n) => `Il te reste ${n} ${pluralize(n, "tâche", "tâches")} avant la fin de la journée. À ton rythme.`,
      direct: (n) => `Le Boss ricane, il te reste ${n} ${pluralize(n, "tâche", "tâches")} avant ce soir !`,
      brut: (n) => `Le Boss se marre, il te reste ${n} ${pluralize(n, "tâche", "tâches")} avant ce soir, bouge-toi !`,
    },
  },
  {
    unit: "hp",
    pools: {
      doux: (n) =>
        `Ta tête t'attend, sans te presser : le Boss a encore ${n} ${pluralize(n, "point de vie", "points de vie")}.`,
      direct: (n) =>
        `Ta tête t'attend : le Boss tient encore avec ${n} ${pluralize(n, "point de vie", "points de vie")}.`,
      brut: (n) =>
        `Ta tête t'attend, putain : le Boss tient encore avec ${n} ${pluralize(n, "point de vie", "points de vie")}.`,
    },
  },
  {
    unit: "tasks",
    pools: {
      doux: (n) =>
        `La journée s'achève. ${n} ${pluralize(n, "tâche restante", "tâches restantes")}, quand tu es prêt.`,
      direct: (n) =>
        `La journée s'achève et ton Boss respire encore (${n} ${pluralize(n, "tâche restante", "tâches restantes")}).`,
      brut: (n) =>
        `La journée s'achève et ton Boss respire encore, merde (${n} ${pluralize(n, "tâche restante", "tâches restantes")}).`,
    },
  },
  {
    unit: "hp",
    pools: {
      doux: (n) =>
        `${n} ${pluralize(n, "point de vie", "points de vie")} encore à récupérer aujourd'hui, si le cœur t'en dit.`,
      direct: (n) =>
        `Termine-le : ${n} ${pluralize(n, "point de vie", "points de vie")} planqué${n <= 1 ? "" : "s"} dans tes tâches du jour.`,
      brut: (n) =>
        `Termine-le, bordel : ${n} ${pluralize(n, "point de vie", "points de vie")} planqué${n <= 1 ? "" : "s"} dans tes tâches du jour.`,
    },
  },
  {
    unit: "tasks",
    pools: {
      doux: (n) =>
        `Une petite pensée pour ${n} ${pluralize(n, "tâche", "tâches")} qui patiente${n <= 1 ? "" : "nt"} encore aujourd'hui.`,
      direct: (n) =>
        `Petit rappel : ${n} ${pluralize(n, "tâche", "tâches")} encore debout${n <= 1 ? "e" : "s"} avant ce soir.`,
      brut: (n) => `Yo, rappel : ${n} ${pluralize(n, "tâche", "tâches")} encore debout${n <= 1 ? "e" : "s"}, bouge ton cul.`,
    },
  },
  {
    unit: "tasks",
    pools: {
      doux: (n) =>
        `La fin de journée approche doucement. ${n} ${pluralize(n, "tâche", "tâches")} attend${n <= 1 ? "" : "ent"} ta décision.`,
      direct: (n) =>
        `La fin de journée approche à grands pas : ${n} ${pluralize(n, "tâche", "tâches")} encore en jeu.`,
      brut: (n) => `La journée se ferme, merde : ${n} ${pluralize(n, "tâche", "tâches")} encore en jeu. Grouille.`,
    },
  },
];

export function buildReminderPayload(
  metrics: ReminderMetrics,
  level: AggressivityLevel,
  pickIndex: (templateCount: number) => number = (count) => Math.floor(Math.random() * count),
): PushReminderPayload {
  const index = pickIndex(REMINDER_TEMPLATES.length);
  const template = REMINDER_TEMPLATES[index] ?? REMINDER_TEMPLATES[0];
  const n = template.unit === "hp" ? metrics.remainingHp : metrics.remainingTaskCount;
  return {
    title: "Dodojo — Le Boss t'attend",
    body: template.pools[level](n),
    url: "/",
  };
}
```

Dans `lib/inngest/functions/send-reminder.ts`, remplacer :

```ts
    const remaining = calculateBossCurrentHp(candidate.todayTasks);
    const payload = JSON.stringify(
      buildReminderPayload(remaining, profile.aggressivity_level, () => event.data.variantIndex),
    );
```

par :

```ts
    const remainingTaskCount = candidate.todayTasks.filter(
      (t) => !t.is_completed && !t.is_abandoned,
    ).length;
    const remainingHp = calculateBossCurrentHp(candidate.todayTasks);
    const payload = JSON.stringify(
      buildReminderPayload(
        { remainingTaskCount, remainingHp },
        profile.aggressivity_level,
        () => event.data.variantIndex,
      ),
    );
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/copy/notifications.test.ts lib/inngest/functions/send-reminder.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full unit suite to check for regressions**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/copy/notifications.ts lib/copy/notifications.test.ts lib/inngest/functions/send-reminder.ts
git commit -m "fix: rappel push — métriques séparées tâches/HP, retire le pluriel-monstre (issue #160)"
```

---

### Task 6: Documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `CHANGELOG.md`

**Interfaces:** aucune — tâche documentaire.

- [ ] **Step 1: `CLAUDE.md` — entrée « Cycle de la Journée & table `day_results` »**

Localiser le paragraphe commençant par `**Cycle de la Journée & table \`day_results\`**` et se terminant par :

```
**Aucune policy DELETE** sur `day_results` (RG-04). "Annihiler" un reste = `is_abandoned = true`, jamais un DELETE.
```

Ajouter juste après (nouvelle phrase, même paragraphe) :

```
**Issue #160 (bug #2)** : `backfillMissedDays()` est désormais aussi appelée en inconditionnel au chargement d'`app/page.tsx` (même patron lazy/idempotent que `resolveDailyBoss()`), pas seulement en fin de Réveil — un compte qui n'a jamais de tâche en retard ne montait jamais Le Réveil, seul déclencheur historique de ce backfill, laissant tout jour gagné mais jamais clôturé manuellement comme un trou permanent en base (invisible du Tableau de Chasse, qui ne compte que les lignes existantes, mais consommé comme joker par `currentStreak`, qui parcourt le calendrier jour par jour).
```

- [ ] **Step 2: `CLAUDE.md` — entrée « Roster de Boss & décors dynamiques »**

Localiser la fin du paragraphe se terminant par :

```
⚠️ L'orientation `flip` des boss a été posée par hypothèse (réels=false, low boss=true) — **à confirmer visuellement** via l'écran de test.
```

Ajouter juste après :

```
**Issue #160 (bug #4)** : `boss.flip` s'applique aussi au bust affiché par `VsIntroOverlay` (intro VS/FIGHT!, issue #135), pas seulement au sprite de combat de `VersusScene` — sans ça, un boss à `flip=true` apparaît non miroité en intro puis miroité l'instant suivant en combat. Piège rencontré : l'élément qui porte l'animation CSS de slide-in (`vs-slide-in-right`, `transform: translateX`, fill-mode `forwards`) écrase silencieusement tout `transform` inline posé sur ce même nœud — le miroir `scaleX(-1)` doit vivre sur un wrapper distinct, jamais sur l'élément animé lui-même (même règle que l'ancrage horizontal des sprites de combat ci-dessus).
```

- [ ] **Step 3: `CHANGELOG.md`**

Ajouter sous `## [Unreleased]`, section `### Corrections` (créer la section si absente, sinon ajouter à la liste existante) :

```markdown
### Corrections
- Issue #160 : le boss affiché ne change plus en cours de journée à l'ajout d'une tâche (course à l'écriture corrigée) ; les jokers de série ne sont plus consommés à tort pour un compte sans aucun retard ; l'écran VS/FIGHT dure 2s de plus ; le boss est désormais orienté de façon cohérente entre l'intro et le combat ; le rappel push quotidien affiche la bonne unité (tâches restantes ou HP du Boss selon le message, jamais l'un pour l'autre) et ne parle plus de plusieurs monstres/adversaires alors qu'il n'y a qu'un seul Boss par jour.
```

- [ ] **Step 4: Verify the full gate before opening the PR**

Run: `npm run lint && npm test && npx tsc --noEmit && npm run build && npm run e2e`
Expected: tout passe (règle projet : zéro PR poussée sans cette vérification locale complète).

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md CHANGELOG.md
git commit -m "docs: documente les 5 correctifs de l'issue #160"
```
