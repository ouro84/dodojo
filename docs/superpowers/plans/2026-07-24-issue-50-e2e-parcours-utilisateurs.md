# Issue #50 — Parcours utilisateurs bout-en-bout (e2e) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Documenter la cartographie des écrans/parcours et ajouter des e2e Playwright qui traversent plusieurs écrans dans un seul test (parcours utilisateur réel), en complément — pas en remplacement — des e2e existants qui testent une feature isolée par fichier.

**Architecture:** Aucun code applicatif ne change (pas de bug, pas de feature manquante) : ce plan n'ajoute que (1) un document de référence Markdown listant écrans/liens/parcours et (2) des specs Playwright supplémentaires + l'extension d'une spec existante. Chaque tâche e2e est donc structurée en **Écrire → Lancer → Vérifier le succès → Commit** plutôt qu'en TDD rouge/vert classique (il n'y a pas d'implémentation à faire, le comportement testé existe déjà).

**Tech Stack:** Playwright (`e2e/*.spec.ts`, config `playwright.config.ts` — exécution série, compte e2e fixe ADR-04), fixtures `e2e/fixtures.ts`, Next.js App Router.

## Global Constraints

- Langue française pour tout commentaire/texte de commit (CLAUDE.md § Langue).
- Commits `Conventional Commits` (`test:` pour les nouveaux e2e, `docs:` pour la doc) — CLAUDE.md § Commits. Note : `test:` n'est pas dans la liste explicite du CLAUDE.md (`feat`/`fix`/`chore`/`docs`) ; on utilise `chore:` pour les commits e2e afin de rester strictement dans la liste validée.
- **Zéro PR poussée tant que Vitest + Playwright n'ont pas tourné en local** (CLAUDE.md § Workflow Git) — le Playwright complet (`npx playwright test`) doit être vert avant la PR, pas seulement les nouveaux fichiers.
- Exécution e2e **série uniquement** (`fullyParallel: false`, `workers: 1`, `playwright.config.ts`) — compte e2e fixe partagé (ADR-04). Toute nouvelle spec doit nettoyer son état en `finally`/`afterEach` (RG-04 : jamais de `DELETE` applicatif, seuls les utilitaires de `e2e/fixtures.ts` service-role peuvent hard-delete pour le nettoyage de test).
- Toute PR livrant une feature/doc met à jour `CHANGELOG.md` sous `[Unreleased]` dans le **même commit** (CLAUDE.md § Changelog).
- Toute modification des documents de référence (table CLAUDE.md) doit rester cohérente avec le fichier réellement créé.
- Cette PR est **techniquement pure infra de test** (pas de feature visible utilisateur) → pas de doc Notion "Guide Dodojo" requise (CLAUDE.md § Documentation utilisateur, dernier point).

---

## Contexte découvert (pour l'agent qui exécute ce plan)

- Écrans existants (routes réelles, `app/**/page.tsx`) : `/welcome`, `/login`, `/onboarding`, `/` (Arène), `/qg`, `/qg/entrainement`, `/echoppe`, `/pantheon`, `/guide`, `/guide/[slug]`, `/offline`. Deux écrans de debug interne non liés en UI (`/roster-preview-8f3a2c9d`, `/skins-preview-4c7a1e9b`) sont **hors périmètre parcours** (jamais atteignables par un vrai utilisateur).
- `BottomNav` (`components/ui/BottomNav.tsx`) est monté sur tous les écrans authentifiés, 3 liens accessibles par leur texte exact : `"Arène"` (`/`), `"QG"` (`/qg`), `"Échoppe"` (`/echoppe`).
- Le QG (`app/qg/page.tsx`) est le hub vers `/pantheon` (lien accessible `"Le Panthéon"`), `/qg/entrainement` (`"Mode Entraînement"`), `/echoppe` (`"L'Échoppe"`), `/guide` (`"Manuel du Dojo"`).
- **Aucun e2e n'existe aujourd'hui sur `/pantheon`** — trou de couverture comblé par la Tâche 2.
- **Aucun e2e ne vérifie que l'Échoppe change réellement le sprite affiché dans l'Arène** (`echoppe.spec.ts`/`echoppe-skins.spec.ts` restent scopés à `/echoppe`) — comblé par la Tâche 4.
- `e2e/fixtures.ts` fournit déjà tout ce dont ces parcours ont besoin (`login`, `abandonViaUi`, `resetShopState`, `seedOverdueTask`, `deleteTaskById`, `resetOnboardingUser`) — **aucune nouvelle fixture n'est nécessaire** (DRY).
- Compte e2e fixe (ADR-04) : `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD`. Compte onboarding dédié : `E2E_ONBOARDING_EMAIL`/`E2E_ONBOARDING_PASSWORD` (recréé à chaque run via `resetOnboardingUser`).
- Héros par défaut du compte fixe après `resetShopState()` : `fire_knight` ("Chevalier de Feu"), or disponible 500 (day_result seedé). `water_priestess` ("Prêtresse de l'Eau") coûte 200 (`lib/heroes.ts`).

---

### Task 1: Doc mind-map écrans + parcours (`PARCOURS_UTILISATEURS.md`)

**Files:**
- Create: `PARCOURS_UTILISATEURS.md`
- Modify: `CLAUDE.md:20-27` (table "Documents de référence")

**Interfaces:**
- Aucune (document Markdown pur, pas de code).

- [ ] **Step 1: Créer le document de cartographie**

Créer `PARCOURS_UTILISATEURS.md` à la racine du projet avec ce contenu exact :

```markdown
# Parcours utilisateurs & carte des écrans — Dodojo (issue #50)

> Dernière mise à jour : 2026-07-24
> Objectif : donner une vue d'ensemble des écrans réels de l'app et de comment
> ils sont reliés, pour choisir *quels parcours* mériteraient un e2e "bout en
> bout" (en plus des e2e "simplistes" par feature isolée, déjà nombreux dans
> `e2e/`). À tenir à jour si un écran ou un lien de navigation change
> (cf. règle de mise à jour de `CLAUDE.md`).

## Carte des écrans (liens réels, hors debug interne)

```
/welcome  --signup-->  /onboarding  --pseudo/avatar/ton-->  /  (Arène)
/login    --login-->   /  (Arène)

/  (Arène) <--BottomNav--> /qg <--BottomNav--> /echoppe
                            |
                            +--> /pantheon          (lien "Le Panthéon")
                            +--> /qg/entrainement   (lien "Mode Entraînement")
                            +--> /guide             (lien "Manuel du Dojo")
                            |      +--> /guide/[slug]  (article, retour via BackLink)
                            +--> /guide/or           (lien direct "Comment gagner de l'or ?")

/  (Arène) --tâches en retard--> Rituel du Réveil (overlay bloquant, au chargement)
/  (Arène) --clôture manuelle--> Rituel du Crépuscule (dialog non-bloquant)
```

Écrans **volontairement hors parcours** (jamais atteints par une vraie
navigation utilisateur) : `/roster-preview-8f3a2c9d`, `/skins-preview-4c7a1e9b`
(debug interne, `noindex`, non liés en UI — cf. `CLAUDE.md`), `/offline`
(fallback PWA hors-ligne).

## Parcours utilisateurs identifiés (bout en bout)

| # | Parcours | Écrans traversés | e2e correspondant |
|---|----------|-------------------|--------------------|
| 1 | Cycle complet d'une journée : résoudre les restes de la veille, se battre, clôturer, consulter son palmarès | Arène (Réveil) → Arène (combat) → Rituel du Crépuscule → Panthéon → QG | `e2e/journey-full-day.spec.ts` |
| 2 | Premier jour d'un nouvel utilisateur : inscription jusqu'à la découverte du QG et du Guide | Welcome → Onboarding → Arène (coach) → QG → Guide | `e2e/onboarding.spec.ts` |
| 3 | Progression économique : débloquer et équiper un héros, vérifier que ça se voit en combat | Arène → Échoppe (achat + équipement) → Arène (sprite mis à jour) | `e2e/journey-hero-economy.spec.ts` |

Ces parcours **complètent** la suite existante — les e2e "simplistes" listés
ci-dessous restent nécessaires pour verrouiller le comportement précis d'une
feature isolée (ils sont plus rapides à diagnostiquer en cas d'échec, un
parcours qui casse ne dit pas *où*) :

`combat-loop`, `subtasks`, `nesting-dnd`, `deadlines`, `mic-dictation`,
`wake-up-ritual`, `crepuscule-recap`, `echoppe`, `echoppe-skins`, `streaks`,
`dojo-gauge`, `guide`.

## Quand ajouter un nouveau parcours vs un nouvel e2e isolé

- **Nouvel e2e isolé** : la feature ne concerne qu'un seul écran, ou vérifie
  un détail de comportement (ex. calcul de HP, format d'un popover) déjà
  couvert unitairement mais qu'on veut sécuriser côté UI.
- **Nouveau parcours** : la feature introduit ou modifie un enchaînement
  d'écrans (nouveau lien de nav, nouvelle étape dans un tunnel existant), ou
  qu'un bug réel n'apparaît qu'en traversant plusieurs écrans (cf. bug #70,
  `WakeUpRitual` → Arène — un test isolé sur `/` seul ne l'aurait pas capté).
```

- [ ] **Step 2: Ajouter la ligne dans la table CLAUDE.md**

Dans `CLAUDE.md`, table "Documents de référence — à lire avant tout code"
(actuellement lignes 20-27), ajouter une ligne après celle d'`ASSETS.md` :

```markdown
| `PARCOURS_UTILISATEURS.md` | Cartographie des écrans (liens réels) et des parcours utilisateurs bout-en-bout testés en e2e (issue #50) — à consulter avant d'ajouter un nouvel e2e pour savoir s'il s'agit d'un parcours ou d'une feature isolée. |
```

- [ ] **Step 3: Commit**

```bash
git add PARCOURS_UTILISATEURS.md CLAUDE.md
git commit -m "docs: cartographie des écrans et parcours utilisateurs (issue #50)"
```

---

### Task 2: Parcours "cycle complet d'une journée"

**Files:**
- Create: `e2e/journey-full-day.spec.ts`

**Interfaces:**
- Consomme (`e2e/fixtures.ts`) : `login(page): Promise<void>`, `abandonViaUi(page, title): Promise<void>`, `seedOverdueTask(title, daysAgo?): Promise<string>`, `deleteTaskById(id): Promise<void>`.

- [ ] **Step 1: Écrire le parcours complet**

Créer `e2e/journey-full-day.spec.ts` :

```ts
import { test, expect } from "@playwright/test";
import { abandonViaUi, deleteTaskById, login, seedOverdueTask } from "./fixtures";

// Issue #50 : parcours de bout en bout traversant Réveil → Arène → Crépuscule
// → Panthéon → QG, en plus des e2e "simplistes" existants (une feature
// isolée par fichier — cf. wake-up-ritual.spec.ts / crepuscule-recap.spec.ts,
// et aucune couverture Panthéon jusqu'ici). Compte e2e fixe partagé (ADR-04).
test.describe("Parcours : cycle complet d'une journée (issue #50)", () => {
  test("Réveil (reste résolu) → combat → Crépuscule → Panthéon → QG", async ({ page }) => {
    const overdueTitle = `E2E parcours reste ${Date.now()}`;
    const taskTitle = `E2E parcours tâche ${Date.now()}`;
    const overdueId = await seedOverdueTask(overdueTitle);

    try {
      // 1. Connexion → Rituel du Réveil bloquant (reste de la veille présent).
      await login(page);
      const ritual = page.getByRole("alertdialog", { name: "Rituel du Réveil" });
      await expect(ritual).toBeVisible();
      await expect(ritual.getByText(overdueTitle)).toBeVisible();
      await ritual.getByLabel(`Terminé "${overdueTitle}"`).click();
      await expect(ritual).toBeHidden();

      // 2. Arène : combat du jour (ajout puis validation d'une tâche).
      const bossBar = page.getByRole("progressbar", { name: /Vie du Boss/ });
      const initialMaxHp = Number(await bossBar.getAttribute("aria-valuemax"));
      const initialCurrentHp = Number(await bossBar.getAttribute("aria-valuenow"));

      await page.getByLabel("Ajouter une tâche").fill(taskTitle);
      await page.getByRole("button", { name: "Ajouter" }).click();
      await expect(bossBar).toHaveAttribute("aria-valuemax", String(initialMaxHp + 20));

      await page.getByLabel(`Marquer "${taskTitle}" comme accomplie`).check();
      await expect(bossBar).toHaveAttribute("aria-valuenow", String(initialCurrentHp));

      // 3. Rituel du Crépuscule : clôture manuelle non-bloquante → day_result.
      await page.getByRole("button", { name: "Rituel du Crépuscule" }).click();
      const recap = page.getByRole("dialog", { name: "Rituel du Crépuscule" });
      await expect(recap).toBeVisible();
      const outcome = await recap.getAttribute("data-outcome");
      await recap.getByRole("button", { name: "Continuer" }).click();

      // 4. QG → Panthéon : le jour clos apparaît en tête du Journal de combat,
      // avec la même issue que celle affichée par le récap du Crépuscule.
      await page.getByRole("link", { name: "QG" }).click();
      await page.waitForURL("/qg");
      await expect(page.getByRole("heading", { name: "Le QG" })).toBeVisible();

      await page.getByRole("link", { name: "Le Panthéon" }).click();
      await page.waitForURL("/pantheon");
      await expect(page.getByRole("heading", { name: "Le Panthéon" })).toBeVisible();

      const outcomeIcon = { victory: "✓", retreat: "↩", defeat: "✗" }[
        outcome as "victory" | "retreat" | "defeat"
      ];
      const firstEntry = page.locator("li", { hasText: /dégâts/ }).first();
      await expect(firstEntry).toContainText(outcomeIcon!);

      // 5. Retour QG (BottomNav) : la navigation reste cohérente en fin de parcours.
      await page.getByRole("link", { name: "QG" }).click();
      await page.waitForURL("/qg");
    } finally {
      await deleteTaskById(overdueId);
      await page.goto("/");
      await abandonViaUi(page, taskTitle);
    }
  });
});
```

- [ ] **Step 2: Lancer le parcours seul et vérifier qu'il passe**

Run: `npx playwright test e2e/journey-full-day.spec.ts --project=chromium`
Expected: `1 passed`. Si le test échoue sur l'étape Réveil, vérifier d'abord
qu'aucun autre run e2e n'est en cours sur le même compte fixe (série
obligatoire, cf. Global Constraints).

- [ ] **Step 3: Commit**

```bash
git add e2e/journey-full-day.spec.ts
git commit -m "chore: e2e parcours bout-en-bout Réveil→Arène→Crépuscule→Panthéon→QG (issue #50)"
```

---

### Task 3: Parcours "premier jour d'un nouvel utilisateur" (extension de `onboarding.spec.ts`)

**Files:**
- Modify: `e2e/onboarding.spec.ts` (fichier actuel, 45 lignes — s'arrête après le coach du 1er combat)

**Interfaces:**
- Ne change rien à `e2e/fixtures.ts`. Réutilise `resetOnboardingUser()` déjà importé dans le fichier.

Le tunnel Welcome → Onboarding → Arène (coach) existe déjà dans ce fichier
(US-29). On **étend le même test** (pas de nouveau fichier — éviterait de
refaire un signup complet en double, DRY) pour continuer le parcours jusqu'au
QG et au Guide, ce qui couvre en plus la régression du bug #70 (le ton "Street"
choisi à l'onboarding doit se refléter dans la Dojo Gauge du QG).

- [ ] **Step 1: Ajouter la suite du parcours à la fin du test existant**

Dans `e2e/onboarding.spec.ts`, remplacer les 2 dernières lignes du test
(actuellement lignes 41-44) :

```ts
  // Coach étape "strike" : cocher la tâche termine le tuto.
  await page.getByLabel(/Marquer "Prendre en main Dodojo" comme accomplie/).check();
  await expect(page.getByText(/Coche-la pour frapper/)).toBeHidden();
});
```

par :

```ts
  // Coach étape "strike" : cocher la tâche termine le tuto.
  await page.getByLabel(/Marquer "Prendre en main Dodojo" comme accomplie/).check();
  await expect(page.getByText(/Coche-la pour frapper/)).toBeHidden();

  // Issue #50 : le parcours d'un nouvel utilisateur ne s'arrête pas au 1er
  // combat — il continue vers le QG (où le ton "Street" choisi plus haut doit
  // déjà être reflété, régression bug #70) puis le Manuel du Dojo, avant de
  // revenir à l'Arène.
  await page.getByRole("link", { name: "QG" }).click();
  await page.waitForURL("/qg");
  const dojoGaugeSection = page.locator("section", { hasText: "Dojo Gauge" });
  await expect(
    dojoGaugeSection.getByRole("button", { name: /Street/ }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("link", { name: /Manuel du Dojo/ }).click();
  await page.waitForURL("/guide");
  await expect(page.getByRole("heading", { name: "Manuel du Dojo" })).toBeVisible();

  await page.getByRole("link", { name: "Arène" }).click();
  await page.waitForURL("/");
  await expect(page.getByText(/Prendre en main Dodojo/)).toBeHidden();
});
```

- [ ] **Step 2: Lancer le parcours seul et vérifier qu'il passe**

Run: `npx playwright test e2e/onboarding.spec.ts --project=chromium`
Expected: `1 passed`.

- [ ] **Step 3: Commit**

```bash
git add e2e/onboarding.spec.ts
git commit -m "chore: étend le parcours onboarding jusqu'au QG et au Guide (issue #50)"
```

---

### Task 4: Parcours "économie du héros"

**Files:**
- Create: `e2e/journey-hero-economy.spec.ts`

**Interfaces:**
- Consomme (`e2e/fixtures.ts`) : `login(page): Promise<void>`, `resetShopState(): Promise<void>`.

- [ ] **Step 1: Écrire le parcours complet**

Créer `e2e/journey-hero-economy.spec.ts` :

```ts
import { expect, test } from "@playwright/test";
import { login, resetShopState } from "./fixtures";

// Issue #50 : parcours bout-en-bout Arène → Échoppe → Arène, vérifiant que
// l'achat/équipement d'un héros dans l'Échoppe se reflète réellement dans
// l'Arène — jusqu'ici seul le comportement interne à /echoppe était couvert
// (echoppe.spec.ts), jamais le retour visuel côté combat.
test.describe("Parcours : équiper un héros depuis l'Échoppe se reflète dans l'Arène (issue #50)", () => {
  test.beforeEach(async () => {
    await resetShopState();
  });

  test.afterEach(async () => {
    await resetShopState();
  });

  test("Arène (Chevalier de Feu) → Échoppe (achat Prêtresse de l'Eau) → Arène (sprite mis à jour)", async ({
    page,
  }) => {
    await login(page);
    await expect(page.getByAltText("Ton héros : Chevalier de Feu")).toBeVisible();

    await page.getByRole("link", { name: "Échoppe" }).click();
    await page.waitForURL("/echoppe");

    await page.locator('[data-hero-cell="water_priestess"]').click();
    await page.getByRole("button", { name: /Débloquer/ }).click();
    await page.getByRole("button", { name: "Confirmer" }).click();
    await expect(page.getByRole("button", { name: "Équiper" })).toBeVisible();
    await page.getByRole("button", { name: "Équiper" }).click();
    await expect(page.getByRole("button", { name: /Équipé/ })).toBeVisible();

    await page.getByRole("link", { name: "Arène" }).click();
    await page.waitForURL("/");
    await expect(page.getByAltText("Ton héros : Prêtresse de l'Eau")).toBeVisible();
  });
});
```

- [ ] **Step 2: Lancer le parcours seul et vérifier qu'il passe**

Run: `npx playwright test e2e/journey-hero-economy.spec.ts --project=chromium`
Expected: `1 passed`.

- [ ] **Step 3: Commit**

```bash
git add e2e/journey-hero-economy.spec.ts
git commit -m "chore: e2e parcours Arène→Échoppe→Arène, équipement de héros (issue #50)"
```

---

### Task 5: Changelog, suite complète, PR

**Files:**
- Modify: `CHANGELOG.md:65` (section `### Technique`, sous `[Unreleased]`)

**Interfaces:** Aucune.

- [ ] **Step 1: Ajouter l'entrée changelog**

Dans `CHANGELOG.md`, sous `### Technique` (ligne 65), ajouter en première
puce de la section :

```markdown
### Technique
- Issue #50 : 3 e2e "parcours" traversant plusieurs écrans en un seul test (`journey-full-day`, extension de `onboarding`, `journey-hero-economy`), en complément des e2e "simplistes" existants (une feature isolée par fichier). Comble au passage deux trous de couverture : aucun e2e ne touchait `/pantheon`, aucun ne vérifiait que l'Échoppe change réellement le sprite affiché dans l'Arène. Doc de cartographie des écrans/parcours : `PARCOURS_UTILISATEURS.md`.
```

- [ ] **Step 2: Lancer toute la suite Playwright (pas seulement les 3 nouveaux fichiers)**

Run: `npx playwright test --project=chromium`
Expected: tous les tests passent (les nouveaux + les existants, aucune
régression introduite par les parcours partagés sur le compte e2e fixe).

- [ ] **Step 3: Lancer Vitest (garde-fou obligatoire avant toute PR)**

Run: `npm run test` (ou la commande Vitest configurée dans `package.json`)
Expected: tous les tests unitaires passent (aucun changé par ce plan, mais
CLAUDE.md l'exige avant toute PR).

- [ ] **Step 4: Commit changelog**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog e2e parcours utilisateurs (issue #50)"
```

- [ ] **Step 5: Créer la branche, pousser, ouvrir la PR**

```bash
git checkout -b chore/issue-50-e2e-parcours-utilisateurs
git push -u origin chore/issue-50-e2e-parcours-utilisateurs
gh pr create --title "chore: e2e parcours utilisateurs bout-en-bout (issue #50)" --body "$(cat <<'EOF'
## Résumé
- Doc de cartographie des écrans + parcours identifiés : `PARCOURS_UTILISATEURS.md`
- 3 e2e "parcours" traversant plusieurs écrans (Réveil→Arène→Crépuscule→Panthéon→QG, Onboarding→QG→Guide, Arène→Échoppe→Arène), en plus des e2e "simplistes" existants
- Comble 2 trous de couverture : aucun e2e sur `/pantheon`, aucun ne vérifiait le retour visuel Échoppe→Arène

## Test plan
- [x] `npx playwright test --project=chromium` vert (suite complète)
- [x] `npm run test` (Vitest) vert

Closes #50

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

**Ne pas exécuter `gh pr merge`** — le merge requiert une confirmation
explicite de l'utilisateur à chaque fois (cf. mémoire de session).

---

## Self-Review

**Couverture de l'issue #50** : (1) mind-map écrans/parcours → Task 1. (2)
e2e sur de vrais parcours bout-en-bout, en plus des e2e isolés existants →
Tasks 2-4 (3 parcours distincts, réutilisant les fixtures existantes, aucune
duplication de logique). Aucun gap identifié.

**Scan placeholders** : aucun "TBD"/"à compléter" — chaque étape contient le
fichier complet ou le diff exact à appliquer, avec les sélecteurs Playwright
vérifiés contre le code source réel (`BottomNav.tsx`, `WakeUpRitual.tsx`,
`CombatJournal.tsx`, `VersusScene.tsx`, `lib/heroes.ts`, `app/qg/page.tsx`,
`app/pantheon/page.tsx`).

**Cohérence des types/sélecteurs** : `outcome` (`data-outcome` du récap de
Crépuscule) prend l'une des 3 valeurs de `DayOutcome` (`victory`/`retreat`/
`defeat`), mappées aux icônes exactes définies dans `CombatJournal.tsx`
(`OUTCOME_LABEL`) — cohérent entre Task 2 et le composant réel. Les noms de
héros (`"Chevalier de Feu"`/`"Prêtresse de l'Eau"`) et leur prix (200 or,
solde de départ 500 via `resetShopState`) sont repris tels quels de
`lib/heroes.ts`, cohérents avec `echoppe.spec.ts` qui exploite déjà cette
même économie.
