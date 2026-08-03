# Issue #156 — bugs part4 — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corriger en une PR les neuf bugs de l'[issue #156](https://github.com/ouro84/dodojo/issues/156), chacun couvert par au moins un test de non-régression.

**Architecture :** Six causes racines indépendantes. Le HUD de l'Arène passe en grille explicite pour garantir des jauges de largeur égale ; les sprites gagnent une métadonnée d'ancrage horizontal (`idleAnchorX`) qui aligne la silhouette idle au lieu de la tuile ; les VFX d'impact sont remplacés par un flash blanc CSS ; la génération des routines devient idempotente via index unique + upsert ; les noms de héros sont dérivés du catalogue.

**Tech Stack :** Next.js 16 (App Router), Supabase (PostgreSQL), Tailwind CSS v4, TypeScript strict, Vitest, Playwright.

**Spec de référence :** `docs/superpowers/specs/2026-08-02-issue156-bugs-part4-design.md`

---

## Global Constraints

- **Langue** : toute la communication avec l'utilisateur en français. Les commentaires de code, messages de commit et noms de tests suivent l'usage existant du repo (français pour les descriptions, anglais pour les identifiants techniques).
- **TypeScript strict** : `any` interdit. Tout type explicitement déclaré.
- **RG-04** : jamais de `DELETE` SQL sur les données de combat. Utiliser `is_abandoned` / `is_completed`.
- **Règle projet n° 2** : toute logique de jeu calculable réside dans `lib/`, testable sans rendu.
- **Commits** : Conventional Commits (`feat:` / `fix:` / `chore:` / `docs:`), avec la ligne finale `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- **Branche** : `fix/issue-156-bugs-part4`. `main` est protégée, aucun commit direct.
- **Aucune PR poussée avant** que `npm run lint`, `npm test`, `npx tsc --noEmit`, `npm run build` et `npm run e2e` soient verts en local.
- **Migrations** : timestamp strictement postérieur à `20260731200000`. Lancer `npx supabase migration list --linked` avant merge.
- **`assets/` est gitignoré** (présent en local, absent de la CI). `npm run generate:sprites` ne peut tourner qu'en local ; les fichiers produits (`public/sprites/**`, `lib/sprite-metadata.generated.json`) sont committés.
- **Alias `@/`** : disponible dans Vitest (`vitest.config.ts` définit `resolve.alias`), sauf pour les fichiers chargés directement par un test de `lib/` qui importent en relatif — suivre le style du fichier voisin.
- **`e2e/fixtures.ts`** : ne jamais appeler `admin.auth.admin.listUsers()` / `deleteUser()` directement, toujours passer par `listUsersRetrying` / `deleteUserRetrying`.

---

## File Structure

**Créés**

| Fichier | Responsabilité |
|---|---|
| `supabase/migrations/20260802120000_fix_recurring_duplicates.sql` | Solde des doublons, index unique partiel, colonne `last_recurring_gen_day` |
| `components/combat/VersusScene.test.tsx` | Ancrage horizontal : formule et gestion du `flip` |
| `components/combat/HeroIdle.test.tsx` | Cadre de taille constante pour les 7 héros |
| `e2e/arena-hud-layout.spec.ts` | Égalité des jauges, badge combo non superposé |
| `e2e/ko-overlay-viewport.spec.ts` | Overlay K.O. entièrement dans le viewport |
| `e2e/versus-anchoring.spec.ts` | Position du héros/Boss constante entre héros |
| `e2e/recurring-no-duplicate.spec.ts` | Non-duplication sous concurrence et via Le Réveil |

**Modifiés**

| Fichier | Changement |
|---|---|
| `components/combat/VersusScene.tsx` | Grille du HUD, badge combo, ancrage des sprites, suppression `HeroVfx`, flash blanc |
| `components/combat/BossBar.tsx` | `min-w-0 truncate` sur le nom du Boss |
| `components/combat/Arena.tsx` | Badge combo déplacé, `PerfectOverlay` sorti de la scène, `vfxVariant` supprimé, transition d'anim extraite |
| `components/combat/PerfectOverlay.tsx` | Passage en modal plein écran |
| `components/combat/CharacterSprite.tsx` | Prop `whiteFlash`, flash blanc à la place de `hit-flash-overlay` |
| `components/combat/HeroIdle.tsx` | Cadre fixe + ancrage |
| `components/combat/RosterPreview.tsx` | Ancrage aligné sur `VersusScene` |
| `components/combat/WakeUpRitual.tsx` | Régénération des routines en fin de rituel, propagation des lignes créées |
| `lib/sprite-metadata.ts` | `idleAnchorX` / `idleWidthRatio`, suppression `VfxMeta` / `heroVfxVariants` / `vfxMeta` |
| `lib/combat-animation.ts` | `nextAnimStateAfterEnd` (fonction pure) |
| `lib/game-engine.ts` | `planRecurringGeneration` : argument `overdueTemplateIds` |
| `lib/achievements.ts` | Descriptions dérivées de `hero.name` |
| `app/actions/recurring.ts` | Upsert, restes actifs, `force`, `createdTasks`, cache de saut |
| `app/globals.css` | Keyframes `white-flash` |
| `app/sw.ts` | Retrait du préfixe `/vfx/` |
| `scripts/build-sprite-sheets.mjs` | Ancres horizontales, suppression de `buildVfx` |
| `types/index.ts` | `Profile.last_recurring_gen_day` |

**Supprimés :** `components/combat/HeroVfx.tsx`, `public/vfx/`.

---

## Task 1 : jauges du HUD de largeur égale

**Files:**
- Modify: `components/combat/VersusScene.tsx:112-143`
- Modify: `components/combat/BossBar.tsx:35-40`
- Test: `e2e/arena-hud-layout.spec.ts` (créer)

**Interfaces:**
- Consumes: rien.
- Produces: rien de nouveau. Le fichier `e2e/arena-hud-layout.spec.ts` sera complété par la Task 2.

**Contexte.** Les trois colonnes du HUD sont déclarées `flex-1` / auto / `flex-1`, donc censément symétriques. Mais aucune colonne latérale ne porte `min-w-0` : leur `min-width` reste à `auto` et se résout sur la largeur de contenu minimale. Le pied de `HeroBar` contient un `<span>` avec `truncate` (donc `white-space: nowrap`), dont la largeur minimale est celle du **texte entier non tronqué** « pseudo - titre ». Ce plancher (~190 px CSS) dépasse la part équitable (~150 px) et affame la colonne Boss (~85 px observés contre 190 px côté héros).

- [ ] **Step 1: Écrire le test e2e qui échoue**

Créer `e2e/arena-hud-layout.spec.ts` :

```ts
import { expect, test } from "@playwright/test";
import { login } from "./fixtures";

test.describe("HUD de l'Arène (issue #156)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("les jauges Héros et Boss ont exactement la même largeur", async ({ page }) => {
    const heroBar = page.getByRole("progressbar", { name: /Vie du héros/ });
    const bossBar = page.getByRole("progressbar", { name: /Vie du Boss/ });

    await expect(heroBar).toBeVisible();
    await expect(bossBar).toBeVisible();

    const heroBox = await heroBar.boundingBox();
    const bossBox = await bossBar.boundingBox();
    if (!heroBox || !bossBox) throw new Error("Jauge sans boîte englobante");

    // Tolérance 1 px : arrondi sub-pixel du moteur de rendu. Au-delà, c'est
    // une colonne qui a mangé l'espace de l'autre (régression #139/#152).
    expect(Math.abs(heroBox.width - bossBox.width)).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
npx playwright test e2e/arena-hud-layout.spec.ts --reporter=list
```

Attendu : ÉCHEC. L'écart mesuré doit être largement supérieur à 1 px (de l'ordre de 100 px CSS). Noter la valeur exacte dans le message d'échec — elle sert de référence.

Si l'écart est déjà ≤ 1 px, c'est que le compte e2e n'a pas de titre équipé : équiper un titre sur ce compte via `/tableau-de-chasse/succes` avant de recommencer, sinon le test ne prouve rien.

- [ ] **Step 3: Passer le HUD en grille explicite**

Dans `components/combat/VersusScene.tsx`, remplacer la ligne 112 :

```tsx
      <div className="absolute inset-x-0 top-0 z-10 flex items-start gap-2 p-2">
```

par :

```tsx
      {/* Issue #156 : grille explicite plutôt qu'un flex à trois `flex-1`.
          Les deux `1fr` DÉCLARENT l'égalité de largeur au lieu de la laisser
          émerger d'un calcul d'espace libre — et surtout, `min-w-0` ramène à 0
          le `min-width:auto` des colonnes latérales. Sans lui, le `truncate`
          (donc `white-space: nowrap`) du pseudo+titre de HeroBar fait remonter
          le plancher de la colonne héros à la largeur du texte ENTIER non
          tronqué, qui affame alors la colonne Boss. C'est la régression
          introduite par l'ajout du titre équipé (#139, PR #152). */}
      <div className="absolute inset-x-0 top-0 z-10 grid grid-cols-[1fr_auto_1fr] items-start gap-2 p-2">
```

Puis remplacer les deux `<div className="flex-1">` (lignes 113 et 132) par `<div className="min-w-0">`.

Ne pas toucher au conteneur du timer (ligne 129) : en grille, sa colonne `auto` prend déjà sa largeur de contenu.

- [ ] **Step 4: Tronquer proprement le nom du Boss**

Dans `components/combat/BossBar.tsx`, remplacer les lignes 35-40 :

```tsx
      <div className="flex items-center justify-between font-display text-sm uppercase tracking-wide text-ink drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
        <span className="font-hud text-xs tabular-nums text-muted">
          {currentHp}/{maxHp} HP
        </span>
        <span>{bossName}</span>
      </div>
```

par :

```tsx
      <div className="flex items-center justify-between gap-2 font-display text-sm uppercase tracking-wide text-ink drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
        <span className="shrink-0 font-hud text-xs tabular-nums text-muted">
          {currentHp}/{maxHp} HP
        </span>
        {/* Issue #156 : sans truncate, « MINOTAURE ANCESTRAL » revenait à la
            ligne puis se faisait couper net au bord du conteneur. */}
        <span className="min-w-0 truncate" title={bossName}>
          {bossName}
        </span>
      </div>
```

- [ ] **Step 5: Lancer le test pour vérifier qu'il passe**

```bash
npx playwright test e2e/arena-hud-layout.spec.ts --reporter=list
```

Attendu : SUCCÈS.

- [ ] **Step 6: Vérifier que rien d'autre n'a cassé**

```bash
npm test -- HeroBar
npx playwright test e2e/hero-bar-tooltip.spec.ts --reporter=list
```

Attendu : tout vert. `hero-bar-tooltip.spec.ts` ouvre le popover de la jauge héros, qui vit dans la colonne redimensionnée.

- [ ] **Step 7: Commit**

```bash
git add components/combat/VersusScene.tsx components/combat/BossBar.tsx e2e/arena-hud-layout.spec.ts
git commit -m "fix(arene): jauges Heros et Boss de largeur egale (issue #156)

Le HUD passe d'un flex a trois colonnes a une grille [1fr auto 1fr] avec
min-w-0 sur les colonnes laterales. Sans min-w-0, le truncate du pseudo +
titre equipe faisait remonter le min-width:auto de la colonne heros a la
largeur du texte entier, affamant la colonne Boss (regression #139/#152).

Le nom du Boss se tronque desormais en ellipse au lieu de deborder.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2 : badge combo hors de la jauge du Boss

**Files:**
- Modify: `components/combat/VersusScene.tsx` (props + colonne Boss)
- Modify: `components/combat/Arena.tsx:1668-1675`
- Test: `e2e/arena-hud-layout.spec.ts` (compléter)

**Interfaces:**
- Consumes: la grille du HUD posée en Task 1.
- Produces: `VersusSceneProps.comboCount?: number` (défaut `0`).

**Contexte.** `Arena.tsx:1668-1675` rend le badge en `absolute right-2 top-2 z-30` par-dessus la scène — soit exactement sur la jauge du Boss, qui disparaît dessous dès qu'un combo est actif.

- [ ] **Step 1: Écrire le test e2e qui échoue**

Ajouter dans `e2e/arena-hud-layout.spec.ts`, à l'intérieur du `test.describe` existant :

```ts
  test("le badge combo ne recouvre jamais la jauge du Boss", async ({ page }) => {
    const titles = [`E2E combo A ${Date.now()}`, `E2E combo B ${Date.now()}`];

    for (const title of titles) {
      await page.getByLabel("Ajouter une tâche").fill(title);
      await page.getByRole("button", { name: "Ajouter" }).click();
      await expect(page.getByText(title)).toBeVisible();
    }

    // Deux complétions rapprochées (< 15 min) montent le combo à x2.
    for (const title of titles) {
      await page.getByRole("checkbox", { name: new RegExp(title) }).click();
    }

    const badge = page.getByLabel(/Combo en cours/);
    await expect(badge).toBeVisible({ timeout: 10_000 });

    const badgeBox = await badge.boundingBox();
    const bossBox = await page
      .getByRole("progressbar", { name: /Vie du Boss/ })
      .boundingBox();
    if (!badgeBox || !bossBox) throw new Error("Badge ou jauge sans boîte englobante");

    const overlaps =
      badgeBox.x < bossBox.x + bossBox.width &&
      badgeBox.x + badgeBox.width > bossBox.x &&
      badgeBox.y < bossBox.y + bossBox.height &&
      badgeBox.y + badgeBox.height > bossBox.y;

    expect(overlaps, "le badge combo recouvre la jauge du Boss").toBe(false);
  });
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
npx playwright test e2e/arena-hud-layout.spec.ts -g "badge combo" --reporter=list
```

Attendu : ÉCHEC sur `expected false, received true`.

- [ ] **Step 3: Ajouter la prop à VersusScene**

Dans `components/combat/VersusScene.tsx`, ajouter à l'interface `VersusSceneProps`, juste après `upcomingDeadlineCount?: number;` (ligne 40) :

```tsx
  /** Issue #156 : combo affiché sous la jauge du Boss, plus par-dessus. */
  comboCount?: number;
```

Ajouter au destructuring des props, après `upcomingDeadlineCount = 0,` (ligne 80) :

```tsx
  comboCount = 0,
```

- [ ] **Step 4: Rendre le badge dans la colonne Boss**

Dans le même fichier, à l'intérieur du `<div className="min-w-0">` de la colonne Boss, juste après le bloc `{upcomingDeadlineCount > 0 && (...)}` (ligne 141) :

```tsx
          {comboCount >= 2 && (
            <p
              aria-label={`Combo en cours : ${comboCount} coups`}
              className="mt-0.5 text-right font-display text-xs uppercase tracking-wider text-gold/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
            >
              combo ×{comboCount}
            </p>
          )}
```

- [ ] **Step 5: Retirer le badge d'Arena et brancher la prop**

Dans `components/combat/Arena.tsx`, supprimer intégralement le bloc lignes 1668-1675 :

```tsx
          {comboCount >= 2 && (
            <span
              aria-label={`Combo en cours : ${comboCount} coups`}
              className="pointer-events-none absolute right-2 top-2 z-30 font-display text-xs uppercase tracking-wider text-gold/90"
            >
              combo ×{comboCount}
            </span>
          )}
```

Puis ajouter la prop à l'appel de `<VersusScene>`, après `upcomingDeadlineCount={upcomingDeadlineCount(activeTasks, now)}` (ligne 1647) :

```tsx
            comboCount={comboCount}
```

- [ ] **Step 6: Lancer les tests**

```bash
npx playwright test e2e/arena-hud-layout.spec.ts --reporter=list
npx tsc --noEmit
```

Attendu : les deux tests du fichier passent, aucune erreur de typage.

- [ ] **Step 7: Commit**

```bash
git add components/combat/VersusScene.tsx components/combat/Arena.tsx e2e/arena-hud-layout.spec.ts
git commit -m "fix(arene): sortir le badge combo de la jauge du Boss (issue #156)

Le badge etait rendu en absolute right-2 top-2 par-dessus la scene, soit
exactement sur la jauge du Boss. Il descend dans la colonne Boss du HUD,
sous la jauge, au meme emplacement que le compteur des deadlines a venir.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3 : overlay K.O. en modal plein écran

**Files:**
- Modify: `components/combat/PerfectOverlay.tsx:60-67`
- Modify: `components/combat/Arena.tsx:1694-1730` (déplacement du bloc)
- Test: `e2e/ko-overlay-viewport.spec.ts` (créer)

**Interfaces:**
- Consumes: rien.
- Produces: rien. `PerfectOverlayProps` est inchangé.

**Contexte.** `PerfectOverlay` est rendu en `absolute inset-0` dans le wrapper `relative` de `VersusScene`, haut de `h-48` (192 px), alors que son contenu dépasse 330 px. Avec `justify-center`, le débordement se répartit des deux côtés : le titre sort par le haut hors de l'écran.

- [ ] **Step 1: Écrire le test e2e qui échoue**

Créer `e2e/ko-overlay-viewport.spec.ts` :

```ts
import { expect, test, type Page } from "@playwright/test";
import { abandonViaUi, login } from "./fixtures";

// Vide le Boss : on coche toutes les tâches actives du jour jusqu'au K.O.
async function knockOutBoss(page: Page, title: string): Promise<void> {
  await page.getByLabel("Ajouter une tâche").fill(title);
  await page.getByRole("button", { name: "Ajouter" }).click();
  await expect(page.getByText(title)).toBeVisible();

  const checkboxes = page.getByRole("checkbox");
  const count = await checkboxes.count();
  for (let i = 0; i < count; i += 1) {
    const box = checkboxes.nth(i);
    if (!(await box.isChecked())) await box.click();
  }
}

test.describe("Overlay K.O. (issue #156)", () => {
  let title: string | undefined;

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test.afterEach(async ({ page }) => {
    if (title) await abandonViaUi(page, title);
    title = undefined;
  });

  test("le titre et tous les contrôles tiennent dans le viewport", async ({ page }) => {
    title = `E2E ko overlay ${Date.now()}`;
    await knockOutBoss(page, title);

    const overlay = page.getByRole("alertdialog", { name: /Boss vaincu/ });
    await expect(overlay).toBeVisible({ timeout: 15_000 });

    const viewport = page.viewportSize();
    if (!viewport) throw new Error("Viewport indéfini");

    const targets = [
      overlay.getByText(/PERFECT|K\.?O\.?/i).first(),
      overlay.getByRole("button", { name: /Terminer la journée/ }),
      overlay.getByRole("button", { name: /Continuer le combat/ }),
    ];

    for (const target of targets) {
      const box = await target.boundingBox();
      if (!box) throw new Error("Élément de l'overlay sans boîte englobante");
      expect(box.y, "élément coupé en haut du viewport").toBeGreaterThanOrEqual(0);
      expect(
        box.y + box.height,
        "élément coupé en bas du viewport",
      ).toBeLessThanOrEqual(viewport.height);
    }

    await overlay.getByRole("button", { name: /Continuer le combat/ }).click();
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
npx playwright test e2e/ko-overlay-viewport.spec.ts --reporter=list
```

Attendu : ÉCHEC sur `élément coupé en haut du viewport` (le `y` du titre est négatif).

- [ ] **Step 3: Passer l'overlay en modal plein écran**

Dans `components/combat/PerfectOverlay.tsx`, remplacer la ligne 66 :

```tsx
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-lg bg-[oklch(0.08_0_0_/_78%)] px-4 text-center"
```

par :

```tsx
      // Issue #156 : modal plein écran (même patron que WakeUpRitual et
      // TomorrowSheet). En `absolute inset-0` sur la scène de combat, haute de
      // 192 px seulement, le contenu (~330 px) débordait des DEUX côtés à cause
      // de justify-center : le titre sortait par le haut, hors écran.
      // `overflow-y-auto` couvre les écrans très courts en paysage.
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 overflow-y-auto bg-[oklch(0.08_0_0_/_92%)] px-4 py-6 text-center"
```

- [ ] **Step 4: Sortir l'overlay du wrapper de la scène**

Dans `components/combat/Arena.tsx`, déplacer le bloc `{koState && (<PerfectOverlay ... />)}` (lignes 1694 à sa fermeture) hors du `<div className="relative">` qui contient `VersusScene`, pour le placer juste après le bloc `{showWakeUp && (...)}` qui se termine ligne 1575.

Le contenu du bloc reste **strictement identique**, seule sa position dans l'arbre change. Vérifier que l'accolade fermante du `<div className="relative">` est bien restée à sa place.

- [ ] **Step 5: Fermer l'overlay avant d'ouvrir la sheet « Demain »**

Toujours dans `Arena.tsx`, dans les props de `<PerfectOverlay>`, remplacer :

```tsx
              onPlanTomorrow={planningUnlocked ? openTomorrowSheet : undefined}
```

par :

```tsx
              // Issue #156 : les deux sont désormais des modaux plein écran de
              // même rang — sans fermeture préalable ils se superposeraient
              // (même piège que la sheet « Demain » de l'issue #147, qui
              // occulte physiquement tout ce qui est derrière elle).
              onPlanTomorrow={
                planningUnlocked
                  ? () => {
                      setKoState(null);
                      openTomorrowSheet();
                    }
                  : undefined
              }
```

- [ ] **Step 6: Lancer les tests**

```bash
npx playwright test e2e/ko-overlay-viewport.spec.ts --reporter=list
npx playwright test e2e/crepuscule-recap.spec.ts e2e/journey-full-day.spec.ts e2e/planifier-demain.spec.ts --reporter=list
npx tsc --noEmit
```

Attendu : tout vert. Ces trois specs touchent l'overlay K.O. ou la sheet « Demain », dont le contexte d'empilement vient de changer.

- [ ] **Step 7: Commit**

```bash
git add components/combat/PerfectOverlay.tsx components/combat/Arena.tsx e2e/ko-overlay-viewport.spec.ts
git commit -m "fix(arene): overlay K.O. en modal plein ecran (issue #156)

L'overlay etait absolute inset-0 dans la scene de combat, haute de 192 px,
pour un contenu de ~330 px : justify-center repartissait le debordement des
deux cotes et le titre PERFECT sortait par le haut, hors ecran.

Il passe en fixed inset-0 z-50, comme WakeUpRitual et TomorrowSheet, et se
ferme explicitement avant d'ouvrir la sheet Demain.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4 : métadonnées d'ancrage horizontal des sprites

**Files:**
- Modify: `scripts/build-sprite-sheets.mjs:240-256` (héros), `:405-416` (boss)
- Modify: `lib/sprite-metadata.ts:9-18`
- Modify: `lib/sprite-metadata.generated.json` (régénéré)
- Test: `lib/sprite-metadata.test.ts`

**Interfaces:**
- Consumes: `unionBox(frames)` qui retourne `{ left, top, width, height }`.
- Produces: `CharacterSpriteMeta.idleAnchorX: number` et `CharacterSpriteMeta.idleWidthRatio: number`, tous deux dans `]0, 1]`, disponibles pour les héros et les boss via `heroSpriteMeta()` / `bossSpriteMeta()`.

**Contexte.** La tuile d'un personnage est l'union alpha de **toutes** ses animations (décision documentée dans `CLAUDE.md` § Sprites de combat). La silhouette idle y occupe une fraction variable, à une position horizontale variable. Le code aligne aujourd'hui la tuile, pas le personnage : `wind-hashashin` rend une boîte de 497 px de large dans l'Arène, `ground-monk` 274 px, pour une zone d'accueil de ~172 px sur mobile.

L'équivalent vertical existe déjà : `groundOffset` est dérivé de `idleBox`, calculé aux lignes 227 (héros) et 390 (boss). Il ne manque que le pendant horizontal.

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter à la fin de `lib/sprite-metadata.test.ts`, dans le `describe("sprite-metadata.generated.json", ...)` existant :

```ts
  it("expose une ancre horizontale d'idle pour chaque héros et chaque boss", () => {
    const all = [
      ...Object.entries(raw.heroes).map(([slug, m]) => [`héros ${slug}`, m] as const),
      ...Object.entries(raw.bosses).map(([slug, m]) => [`boss ${slug}`, m] as const),
    ];

    for (const [label, meta] of all) {
      expect(typeof meta.idleAnchorX, `${label} : idleAnchorX manquant`).toBe("number");
      expect(typeof meta.idleWidthRatio, `${label} : idleWidthRatio manquant`).toBe("number");

      // L'ancre est le centre de la silhouette idle, en fraction de tuile.
      expect(meta.idleAnchorX, `${label} : ancre hors tuile`).toBeGreaterThan(0);
      expect(meta.idleAnchorX, `${label} : ancre hors tuile`).toBeLessThan(1);

      // La silhouette idle ne peut pas être plus large que la tuile (qui est
      // l'union de toutes les anims, donc toujours au moins aussi large).
      expect(meta.idleWidthRatio, `${label} : largeur idle nulle`).toBeGreaterThan(0);
      expect(meta.idleWidthRatio, `${label} : largeur idle > tuile`).toBeLessThanOrEqual(1);

      // Cohérence : la silhouette centrée sur l'ancre reste dans la tuile.
      const half = meta.idleWidthRatio / 2;
      expect(meta.idleAnchorX - half, `${label} : silhouette débordant à gauche`)
        .toBeGreaterThanOrEqual(-1e-9);
      expect(meta.idleAnchorX + half, `${label} : silhouette débordant à droite`)
        .toBeLessThanOrEqual(1 + 1e-9);
    }
  });
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
npm test -- sprite-metadata
```

Attendu : ÉCHEC sur `héros crystal-mauler : idleAnchorX manquant` (`expected "undefined" to be "number"`).

- [ ] **Step 3: Étendre le type**

Dans `lib/sprite-metadata.ts`, ajouter à l'interface `CharacterSpriteMeta`, après `groundOffset` :

```ts
  /**
   * Position du centre de la silhouette idle dans la tuile, en fraction de
   * `tileW`. Pendant horizontal de `groundOffset` (issue #156) : la tuile est
   * l'union alpha de TOUTES les anims, donc bien plus large que la silhouette
   * idle, et de façon très variable selon le personnage. Aligner la tuile
   * revient à placer chaque personnage à un endroit différent.
   */
  idleAnchorX: number;
  /** Largeur de la silhouette idle, en fraction de `tileW`. */
  idleWidthRatio: number;
```

Champs **obligatoires**, pas optionnels : un personnage sans ancre doit échouer à la compilation plutôt que se rendre au mauvais endroit.

- [ ] **Step 4: Produire les ancres dans le script de build**

Dans `scripts/build-sprite-sheets.mjs`, fonction `buildHeroes`, dans l'objet `meta[slug] = { ... }`, ajouter après la ligne `groundOffset: ...` :

```js
      // Issue #156 : pendant horizontal de groundOffset. Centre de la
      // silhouette idle dans la tuile, en fraction de largeur — permet
      // d'ancrer le PERSONNAGE et non la boîte, dont le ratio varie du
      // simple au double selon le pack source.
      idleAnchorX: (idleBox.left - box.left + idleBox.width / 2) / box.width,
      idleWidthRatio: idleBox.width / box.width,
```

Faire exactement le même ajout dans `emitBoss`, dans l'objet `return { ... }`, après sa ligne `groundOffset: ...`.

- [ ] **Step 5: Régénérer les métadonnées**

```bash
npm run generate:sprites
```

Attendu : le script parcourt les 7 héros et 27 boss et réécrit `lib/sprite-metadata.generated.json`.

- [ ] **Step 6: Vérifier que seul le JSON a changé**

```bash
git status --porcelain
```

Attendu : **uniquement** `lib/sprite-metadata.generated.json` et `scripts/build-sprite-sheets.mjs` en modifiés.

Si des PNG de `public/sprites/**` apparaissent modifiés, ne pas continuer : les feuilles doivent être binairement identiques puisque ni `box` ni l'ordre des frames n'ont changé. Un diff sur un PNG signale un effet de bord à comprendre avant d'aller plus loin (`git diff --stat public/sprites` pour l'ampleur).

- [ ] **Step 7: Lancer les tests**

```bash
npm test -- sprite-metadata
npx tsc --noEmit
```

Attendu : tout vert, y compris l'invariant `tileH / renderScale === LEGACY_IDLE_HEIGHTS[slug]` déjà présent dans ce fichier.

- [ ] **Step 8: Relever la largeur d'idle maximale (nécessaire à la Task 6)**

```bash
node -e "const m=require('./lib/sprite-metadata.generated.json');const w=Object.entries(m.heroes).map(([s,v])=>[s,Math.ceil(112*v.renderScale*v.tileW/v.tileH*v.idleWidthRatio)]);w.sort((a,b)=>b[1]-a[1]);console.log(w);"
```

Noter la première valeur : c'est la largeur en px de la plus large silhouette idle à `baseHeight=112`. Elle sert à dimensionner le cadre du Marché Noir en Task 6.

- [ ] **Step 9: Commit**

```bash
git add scripts/build-sprite-sheets.mjs lib/sprite-metadata.ts lib/sprite-metadata.generated.json lib/sprite-metadata.test.ts
git commit -m "feat(sprites): ancre horizontale de la silhouette idle (issue #156)

idleAnchorX (centre de la silhouette idle dans la tuile) et idleWidthRatio
(sa largeur), tous deux en fraction de tileW. Pendant horizontal exact de
groundOffset, deja derive du meme idleBox.

La tuile etant l'union alpha de toutes les anims, son ratio varie du simple
au double selon le pack source : aligner la tuile place chaque personnage a
un endroit different. Aucune spritesheet n'est retouchee, seules deux cles
s'ajoutent au JSON.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5 : ancrage du héros et du Boss dans l'Arène

**Files:**
- Modify: `components/combat/VersusScene.tsx:159-216`
- Test: `components/combat/VersusScene.test.tsx` (créer), `e2e/versus-anchoring.spec.ts` (créer)

**Interfaces:**
- Consumes: `heroMeta.idleAnchorX`, `bossMeta.idleAnchorX` (Task 4).
- Produces: chaque sprite est enveloppé dans un positionneur portant `data-testid="sprite-anchor-hero"` / `data-testid="sprite-anchor-boss"`, avec `left: 25%` / `left: 75%` et un `transform: translateX(...)`.

**Piège du `flip`.** Le Boss est rendu avec `transform: scaleX(-1)` quand `bossFlip` est vrai (le sprite regarde alors le héros). Ce miroir s'applique à la tuile entière : l'ancre effective devient `1 - idleAnchorX`. Sans cette correction, tous les boss « flippés » — la majorité du roster — seraient décalés.

- [ ] **Step 1: Écrire le test unitaire qui échoue**

Créer `components/combat/VersusScene.test.tsx` :

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import VersusScene from "./VersusScene";
import { heroSpriteMeta, bossSpriteMeta } from "@/lib/sprite-metadata";

afterEach(cleanup);

const base = {
  heroName: "Gardien des Lames",
  heroSpriteBase: "/sprites/mc/metal-bladekeeper",
  heroSlug: "metal-bladekeeper",
  heroHp: 100,
  heroMaxHp: 100,
  bossName: "Baron",
  bossSpriteBase: "/sprites/bosses/mob-baron",
  bossSlug: "mob-baron",
  bossFlip: false,
  backgroundPath: "/backgrounds/dummy.png",
  currentHp: 100,
  maxHp: 140,
};

function anchorPercent(el: HTMLElement): number {
  // "translateX(-41.2345%)" -> 41.2345
  const match = /translateX\((-?[\d.]+)%\)/.exec(el.style.transform);
  if (!match) throw new Error(`transform inattendu : ${el.style.transform}`);
  return -Number(match[1]);
}

describe("VersusScene — ancrage horizontal (issue #156)", () => {
  it("décale le héros de son propre idleAnchorX, pas d'une valeur fixe", () => {
    render(<VersusScene {...base} />);
    const anchor = screen.getByTestId("sprite-anchor-hero");
    expect(anchorPercent(anchor)).toBeCloseTo(
      heroSpriteMeta("metal-bladekeeper").idleAnchorX * 100,
      3,
    );
  });

  it("applique une ancre différente à un héros de tuile différente", () => {
    const { rerender } = render(<VersusScene {...base} />);
    const first = anchorPercent(screen.getByTestId("sprite-anchor-hero"));

    rerender(
      <VersusScene
        {...base}
        heroSlug="wind-hashashin"
        heroSpriteBase="/sprites/mc/wind-hashashin"
      />,
    );
    const second = anchorPercent(screen.getByTestId("sprite-anchor-hero"));

    // Deux tuiles très différentes (189×58 vs 209×112) : si le décalage était
    // identique, c'est que l'ancre n'est pas lue par personnage.
    expect(second).not.toBeCloseTo(first, 2);
  });

  it("miroite l'ancre du Boss quand il est flippé", () => {
    const meta = bossSpriteMeta("mob-baron");

    const { rerender } = render(<VersusScene {...base} bossFlip={false} />);
    expect(anchorPercent(screen.getByTestId("sprite-anchor-boss"))).toBeCloseTo(
      meta.idleAnchorX * 100,
      3,
    );

    rerender(<VersusScene {...base} bossFlip />);
    expect(anchorPercent(screen.getByTestId("sprite-anchor-boss"))).toBeCloseTo(
      (1 - meta.idleAnchorX) * 100,
      3,
    );
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
npm test -- VersusScene
```

Attendu : ÉCHEC sur `Unable to find an element by: [data-testid="sprite-anchor-hero"]`.

- [ ] **Step 3: Remplacer le conteneur des sprites**

Dans `components/combat/VersusScene.tsx`, remplacer intégralement le bloc lignes 144-216 (le commentaire de l'issue #145 et le `<div className="absolute inset-x-0 bottom-2 z-[6] flex items-end px-4">` avec ses deux zones) par :

```tsx
      {/* Issue #156 : on ancre la SILHOUETTE, plus la tuile. La tuile est
          l'union alpha de toutes les anims (cf. CLAUDE.md § Sprites de
          combat) : sa largeur va de 274 px (ground-monk) à 497 px
          (wind-hashashin) dans l'Arène, pour une demi-scène de ~172 px sur
          mobile. Aligner ses bords — ce que faisaient les deux zones flex de
          l'issue #145 — plaçait donc chaque héros à un endroit différent.

          `left: 25%` / `left: 75%` pose le point d'ancrage, le
          `translateX(-idleAnchorX × 100%)` recule le sprite de la position de
          sa silhouette dans sa propre tuile. Le pourcentage d'un translateX se
          rapporte à la largeur de l'élément — ici la largeur rendue du sprite,
          donc le calcul est exact sans la connaître en JavaScript.

          Trois niveaux imbriqués, chacun portant déjà un transform qui
          s'écraserait sinon : positionneur (translateX) → wrapper de recul
          (animation knockback) → CharacterSprite (translateY du groundOffset). */}
      <div
        data-testid="sprite-anchor-hero"
        className="absolute bottom-2 z-[6]"
        style={{
          left: "25%",
          transform: `translateX(-${heroMeta.idleAnchorX * 100}%)`,
        }}
      >
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
      </div>
      <div
        data-testid="sprite-anchor-boss"
        className="absolute bottom-2 z-[6]"
        style={{
          left: "75%",
          // Le flip applique scaleX(-1) à la tuile entière : l'ancre se
          // miroite avec elle. Sans cette correction, la majorité du roster
          // (qui est flippée pour regarder le héros) serait décalée.
          transform: `translateX(-${(bossFlip ? 1 - bossMeta.idleAnchorX : bossMeta.idleAnchorX) * 100}%)`,
        }}
      >
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
        </div>
      </div>
```

Le bloc `{vfxVariant && (<HeroVfx ... />)}` disparaît ici : il est retiré en Task 8, mais comme le conteneur est réécrit, ne pas le reporter. Retirer aussi l'import `HeroVfx` (ligne 9), la prop `vfxVariant` de l'interface (ligne 43) et du destructuring (ligne 82) — sinon `tsc` signalera une variable inutilisée.

- [ ] **Step 4: Lancer le test unitaire**

```bash
npm test -- VersusScene
npx tsc --noEmit
```

Attendu : les trois tests passent. `tsc` peut encore signaler `vfxVariant` inutilisé dans `Arena.tsx` — le laisser, il est traité en Task 8.

- [ ] **Step 5: Écrire le test e2e**

Créer `e2e/versus-anchoring.spec.ts` :

```ts
import { expect, test } from "@playwright/test";
import { login } from "./fixtures";

// Ancres cibles posées par VersusScene (issue #156).
const HERO_TARGET = 0.25;
const BOSS_TARGET = 0.75;
// Tolérance : la silhouette n'est pas parfaitement symétrique dans son idleBox
// et le drop-shadow élargit légèrement la boîte mesurée.
const TOLERANCE = 0.03;

test.describe("Ancrage des sprites dans l'Arène (issue #156)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("héros à 25 % et Boss à 75 % de la scène, quel que soit le héros", async ({ page }) => {
    const scene = page.getByRole("img", { name: /Le Boss du jour/ }).locator("xpath=ancestor::div[contains(@class,'h-48')][1]");
    const sceneBox = await scene.boundingBox();
    if (!sceneBox) throw new Error("Scène sans boîte englobante");

    for (const [testid, target] of [
      ["sprite-anchor-hero", HERO_TARGET],
      ["sprite-anchor-boss", BOSS_TARGET],
    ] as const) {
      const box = await page.getByTestId(testid).boundingBox();
      if (!box) throw new Error(`${testid} sans boîte englobante`);

      // Le positionneur est ancré : son bord gauche + idleAnchorX × largeur
      // tombe sur la cible. On vérifie l'invariant observable équivalent —
      // le point cible est bien à l'intérieur de la boîte du sprite.
      const targetX = sceneBox.x + sceneBox.width * target;
      expect(targetX, `${testid} : cible avant le sprite`).toBeGreaterThanOrEqual(box.x);
      expect(targetX, `${testid} : cible après le sprite`).toBeLessThanOrEqual(box.x + box.width);

      // Et l'ancre calculée retombe bien sur la cible.
      const anchorRatio = (targetX - sceneBox.x) / sceneBox.width;
      expect(Math.abs(anchorRatio - target)).toBeLessThanOrEqual(TOLERANCE);
    }
  });
});
```

- [ ] **Step 6: Lancer le test e2e**

```bash
npx playwright test e2e/versus-anchoring.spec.ts --reporter=list
```

Attendu : SUCCÈS.

- [ ] **Step 7: Vérifier visuellement sur l'écran de calage**

```bash
npm run dev
```

Ouvrir `http://localhost:3000/roster-preview-8f3a2c9d`, se connecter, et vérifier qu'aucun boss n'est coupé ni décentré. Cet écran n'est pas encore réaligné (Task 7), il sert ici de contrôle de non-régression sur les sprites eux-mêmes.

- [ ] **Step 8: Commit**

```bash
git add components/combat/VersusScene.tsx components/combat/VersusScene.test.tsx e2e/versus-anchoring.spec.ts
git commit -m "fix(arene): ancrer la silhouette du heros et du Boss, pas leur tuile (issue #156)

Les deux zones flex de l'issue #145 alignaient les bords de la tuile, qui
est l'union alpha de toutes les anims : sa largeur va de 274 px a 497 px
selon le personnage, pour une demi-scene de ~172 px sur mobile. Chaque
heros se retrouvait donc a un endroit different.

Le centre de la silhouette idle est desormais pose a 25 % (heros) et 75 %
(Boss) de la scene via idleAnchorX. L'ancre du Boss est miroitee quand il
est flippe, sinon la majorite du roster serait decalee.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 6 : cadre de taille constante au Marché Noir

**Files:**
- Modify: `components/combat/HeroIdle.tsx`
- Test: `components/combat/HeroIdle.test.tsx` (créer)

**Interfaces:**
- Consumes: `heroSpriteMeta(hero.slug).idleAnchorX` (Task 4).
- Produces: `HeroIdle` rend un conteneur `data-testid="hero-idle-frame"` de dimensions identiques quel que soit le héros.

**Contexte.** `HeroIdle` rend le sprite à `baseHeight = 112`, soit une boîte de 633 px de large pour `wind-hashashin` contre 348 px pour `ground-monk`. Le « cadre » de la carte suit cette boîte, d'où le cadre démesuré de l'Assassin du Vent signalé dans l'issue.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `components/combat/HeroIdle.test.tsx` :

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import HeroIdle from "./HeroIdle";
import { HEROES } from "@/lib/heroes";

afterEach(cleanup);

describe("HeroIdle — cadre constant (issue #156)", () => {
  it("rend un cadre de dimensions identiques pour les 7 héros", () => {
    const sizes = HEROES.map((hero) => {
      cleanup();
      render(<HeroIdle hero={hero} />);
      const frame = screen.getByTestId("hero-idle-frame");
      return `${frame.style.width}×${frame.style.height}`;
    });

    expect(new Set(sizes).size, `tailles trouvées : ${sizes.join(", ")}`).toBe(1);
  });

  it("ancre chaque héros sur son propre idleAnchorX", () => {
    render(<HeroIdle hero={HEROES[0]} />);
    const anchor = screen.getByTestId("hero-idle-anchor");
    expect(anchor.style.transform).toMatch(/translateX\(-[\d.]+%\)/);
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
npm test -- HeroIdle
```

Attendu : ÉCHEC sur `Unable to find an element by: [data-testid="hero-idle-frame"]`.

- [ ] **Step 3: Réécrire HeroIdle**

Remplacer intégralement `components/combat/HeroIdle.tsx` :

```tsx
import CharacterSprite from "./CharacterSprite";
import type { Hero } from "@/types";
import { getHeroSpriteBase } from "@/lib/hero-skins";
import { heroSpriteMeta } from "@/lib/sprite-metadata";

// Issue #156 : la tuile d'un héros est l'union alpha de toutes ses anims, donc
// large et de ratio très variable (633 px pour wind-hashashin contre 348 px
// pour ground-monk à baseHeight 112). Sans cadre fixe, chaque carte du Marché
// Noir avait une taille différente. Le cadre est dimensionné sur la plus large
// silhouette idle du roster, avec marge ; la silhouette y est ancrée au centre
// via idleAnchorX et alignée en bas, le débordement des anims étant coupé.
// Valeur relevée par : npm run generate:sprites puis le one-liner du plan #156.
const FRAME_WIDTH_AT_112 = 160;

export default function HeroIdle({
  hero,
  skinId = null,
  locked = false,
  baseHeight = 112,
  className,
}: {
  hero: Hero;
  skinId?: string | null;
  locked?: boolean;
  baseHeight?: number;
  className?: string;
}) {
  const meta = heroSpriteMeta(hero.slug);
  const frameWidth = (FRAME_WIDTH_AT_112 * baseHeight) / 112;
  const frameHeight = baseHeight * meta.renderScale;

  return (
    <div
      className={className}
      style={locked ? { filter: "grayscale(1) brightness(0.4)" } : undefined}
      data-hero={hero.id}
      data-locked={locked}
    >
      <div
        data-testid="hero-idle-frame"
        className="relative overflow-hidden"
        style={{ width: `${frameWidth}px`, height: `${frameHeight}px` }}
      >
        <div
          data-testid="hero-idle-anchor"
          className="absolute bottom-0"
          style={{
            left: "50%",
            transform: `translateX(-${meta.idleAnchorX * 100}%)`,
          }}
        >
          <CharacterSprite
            spriteBase={getHeroSpriteBase(hero.id, skinId)}
            meta={meta}
            baseHeight={baseHeight}
            state="idle"
            alt={locked ? `${hero.name} (verrouillé)` : hero.name}
            className="[image-rendering:pixelated]"
          />
        </div>
      </div>
    </div>
  );
}
```

Le premier test échouera encore si `frameHeight` dépend de `renderScale`, qui varie par héros. C'est volontairement traité à l'étape suivante.

- [ ] **Step 4: Fixer aussi la hauteur du cadre**

Remplacer la ligne :

```tsx
  const frameHeight = baseHeight * meta.renderScale;
```

par :

```tsx
  // La hauteur rendue vaut baseHeight × renderScale et varie donc aussi par
  // héros (le haut de la tuile contient l'espace des anims d'attaque). La
  // silhouette idle, elle, fait toujours baseHeight de haut par construction
  // de renderScale (cf. LEGACY_IDLE_HEIGHTS) : le cadre se cale dessus.
  const frameHeight = baseHeight;
```

- [ ] **Step 5: Ajuster la constante de largeur**

Remplacer `160` par la valeur relevée à la Task 4 Step 8, arrondie à la dizaine supérieure et augmentée de 16 px de marge. Mettre à jour le commentaire pour citer la valeur brute mesurée et le héros concerné.

- [ ] **Step 6: Lancer les tests**

```bash
npm test -- HeroIdle
npx tsc --noEmit
```

Attendu : les deux tests passent.

- [ ] **Step 7: Vérifier visuellement**

Ouvrir `http://localhost:3000/marche-noir` et `http://localhost:3000/onboarding` (les deux consommateurs de `HeroIdle`, via `CharacterSelect` et `OnboardingAvatarPicker`). Vérifier qu'aucun héros n'est coupé aux épaules ni tronqué latéralement. Si un héros dépasse, augmenter `FRAME_WIDTH_AT_112` plutôt que de rogner.

- [ ] **Step 8: Lancer les specs e2e de la boutique**

```bash
npx playwright test e2e/echoppe.spec.ts e2e/echoppe-skins.spec.ts e2e/onboarding.spec.ts --reporter=list
```

Attendu : tout vert.

- [ ] **Step 9: Commit**

```bash
git add components/combat/HeroIdle.tsx components/combat/HeroIdle.test.tsx
git commit -m "fix(marche-noir): cadre de heros de taille constante (issue #156)

HeroIdle suivait la boite du sprite, qui est l'union alpha de toutes les
anims : 633 px de large pour wind-hashashin contre 348 px pour ground-monk.
D'ou le cadre demesure de l'Assassin du Vent.

Le cadre est desormais fixe, dimensionne sur la plus large silhouette idle
du roster, avec la silhouette ancree au centre via idleAnchorX.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 7 : aligner les écrans de calage internes

**Files:**
- Modify: `components/combat/RosterPreview.tsx:236-250`

**Interfaces:**
- Consumes: `heroSpriteMeta` / `bossSpriteMeta` avec `idleAnchorX` (Task 4).
- Produces: rien.

**Contexte.** `/roster-preview-8f3a2c9d` sert à valider chaque boss avant merge (extraction du sprite, cohérence du décor, orientation du flip). Il rend aujourd'hui les sprites en `absolute bottom-2 left-4` / `right-6`, c'est-à-dire l'ancien alignement par bord de tuile. Laissé tel quel, il mentirait sur le rendu réel de l'Arène. Ces écrans internes n'ont pas de test dédié — leur non-régression est visuelle.

`SkinsPreview` rend les tenues côte à côte dans une liste, sans notion de position dans une scène : il n'a pas besoin d'ancrage et n'est pas modifié.

- [ ] **Step 1: Aligner le rendu de la scène de prévisualisation**

Dans `components/combat/RosterPreview.tsx`, remplacer le rendu du héros (lignes ~234-241) :

```tsx
              {hero && (
                <CharacterSprite
                  spriteBase={hero.spriteBase}
                  meta={heroSpriteMeta(hero.slug)}
                  baseHeight={88}
                  state="idle"
                  alt={hero.name}
                  className="absolute bottom-2 left-4 [image-rendering:pixelated] drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)]"
                />
              )}
```

par :

```tsx
              {/* Issue #156 : même ancrage que VersusScene (25 % / 75 % sur la
                  silhouette idle). Sans ça cet écran de calage mentirait sur
                  le rendu réel de l'Arène et ne pourrait plus servir à valider
                  un ajout de boss. */}
              {hero && (
                <div
                  className="absolute bottom-2"
                  style={{
                    left: "25%",
                    transform: `translateX(-${heroSpriteMeta(hero.slug).idleAnchorX * 100}%)`,
                  }}
                >
                  <CharacterSprite
                    spriteBase={hero.spriteBase}
                    meta={heroSpriteMeta(hero.slug)}
                    baseHeight={88}
                    state="idle"
                    alt={hero.name}
                    className="[image-rendering:pixelated] drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)]"
                  />
                </div>
              )}
```

- [ ] **Step 2: Aligner le rendu du Boss**

Remplacer le bloc suivant (lignes ~243-252) :

```tsx
              <CharacterSprite
                spriteBase={boss.spriteBase}
                meta={bossMeta}
                baseHeight={96}
                state="idle"
                flip={flips[boss.id]}
                alt={boss.name}
                className="absolute bottom-2 right-6 [image-rendering:pixelated] drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)]"
              />
```

par :

```tsx
              <div
                className="absolute bottom-2"
                style={{
                  left: "75%",
                  transform: `translateX(-${(flips[boss.id] ? 1 - bossMeta.idleAnchorX : bossMeta.idleAnchorX) * 100}%)`,
                }}
              >
                <CharacterSprite
                  spriteBase={boss.spriteBase}
                  meta={bossMeta}
                  baseHeight={96}
                  state="idle"
                  flip={flips[boss.id]}
                  alt={boss.name}
                  className="[image-rendering:pixelated] drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)]"
                />
              </div>
```

- [ ] **Step 3: Vérifier visuellement**

Ouvrir `http://localhost:3000/roster-preview-8f3a2c9d`. Basculer le toggle flip sur au moins trois boss et vérifier que le personnage reste centré sur le même point à chaque bascule — c'est le contrôle direct de la correction du miroir d'ancre.

- [ ] **Step 4: Vérifier la compilation**

```bash
npx tsc --noEmit
npm run lint
```

- [ ] **Step 5: Commit**

```bash
git add components/combat/RosterPreview.tsx
git commit -m "fix(roster-preview): aligner l'ancrage sur celui de l'Arene (issue #156)

L'ecran de calage rendait encore les sprites par bord de tuile. Il aurait
menti sur le rendu reel et n'aurait plus permis de valider un ajout de boss.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 8 : flash blanc à la place des VFX d'impact

**Files:**
- Delete: `components/combat/HeroVfx.tsx`, `public/vfx/`
- Modify: `components/combat/CharacterSprite.tsx`, `components/combat/VersusScene.tsx`, `components/combat/Arena.tsx`, `lib/sprite-metadata.ts`, `lib/sprite-metadata.test.ts`, `scripts/build-sprite-sheets.mjs`, `app/globals.css`, `app/sw.ts`, `ASSETS.md`
- Test: `components/combat/CharacterSprite.test.tsx`, `e2e/combat-animations.spec.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `CharacterSpriteProps.whiteFlash?: boolean` (défaut `false`). Un nœud **dédié**, `data-testid="character-flash"`, enveloppe le `SpriteAnimator` et porte la classe `white-flash` quand le flash est actif. Le nœud `data-testid="character-sprite"` reste le parent, inchangé.

**Contexte.** Demande produit de l'issue : supprimer les VFX d'impact et essayer un flash blanc façon Street Fighter. `filter: brightness(0) invert(1)` rend blanc tout pixel non transparent en préservant le canal alpha — exactement la silhouette pleine recherchée, sans masque ni asset.

Le filtre doit vivre sur un nœud dédié : `CharacterSprite` porte déjà un `filter` **inline** conditionnel pour l'état `danger`, et les déclarations d'une animation CSS l'emporteraient silencieusement dessus.

- [ ] **Step 1: Écrire les tests unitaires qui échouent**

Ajouter à la fin du `describe("CharacterSprite", ...)` de `components/combat/CharacterSprite.test.tsx` :

```tsx
  it("pose le flash blanc sur l'état hurt", () => {
    render(<CharacterSprite {...base} state="hurt" whiteFlash />);
    expect(screen.getByTestId("character-flash")).toHaveClass("white-flash");
  });

  it("ne pose aucun flash sans whiteFlash", () => {
    render(<CharacterSprite {...base} state="hurt" />);
    expect(screen.getByTestId("character-flash")).not.toHaveClass("white-flash");
  });

  it("ne pose aucun flash sous reduced-motion", () => {
    render(<CharacterSprite {...base} state="hurt" whiteFlash reducedMotion />);
    expect(screen.getByTestId("character-flash")).not.toHaveClass("white-flash");
  });
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
npm test -- CharacterSprite
```

Attendu : ÉCHEC sur `Unable to find an element by: [data-testid="character-flash"]`.

- [ ] **Step 3: Ajouter les keyframes**

Dans `app/globals.css`, ajouter juste après la règle `.hit-flash-overlay { ... }` (ligne ~262) :

```css
/* Issue #156 : flash blanc à l'impact, façon Street Fighter II, en
   remplacement des VFX d'impact par héros. brightness(0) rend noir tout pixel
   non transparent, invert(1) le passe en blanc — le canal alpha est préservé,
   donc on obtient la silhouette pleine sans masque ni asset supplémentaire.
   Trois clignotements sur la durée de l'anim hurt (HURT_DURATION_MS = 350 ms). */
@keyframes white-flash {
  0%,
  22%,
  44% {
    filter: brightness(0) invert(1);
  }
  11%,
  33%,
  100% {
    filter: none;
  }
}
.white-flash {
  animation: white-flash 350ms steps(1, end);
}
```

Puis ajouter dans le bloc `@media (prefers-reduced-motion: reduce)` (ligne ~383), à côté de `.hit-flash-overlay` :

```css
  .white-flash {
    animation: none;
    filter: none;
  }
```

- [ ] **Step 4: Ajouter la prop à CharacterSprite**

Dans `components/combat/CharacterSprite.tsx`, ajouter à l'interface `CharacterSpriteProps`, après `reducedMotion?: boolean;` :

```tsx
  /** Issue #156 : flash blanc à l'impact (remplace les VFX par héros). */
  whiteFlash?: boolean;
```

Ajouter `whiteFlash = false,` au destructuring, après `reducedMotion = false,`.

Remplacer ensuite le corps du `return` (lignes 119-158) par :

```tsx
  return (
    <div
      data-testid="character-sprite"
      data-anim-state={rendered}
      data-anim-fallback={available ? undefined : "true"}
      // `relative` obligatoire : le flash de fallback est en absolute inset-0.
      className={`relative ${className ?? ""}`}
      style={{
        transform: `translateY(${groundOffsetPx}px)`,
        filter: danger ? "saturate(1.15) brightness(0.92)" : undefined,
      }}
    >
      {/* Issue #156 : nœud dédié au flash blanc. Il ne peut pas vivre sur le
          parent, qui porte déjà un `filter` inline conditionnel (danger) —
          l'animation CSS l'écraserait silencieusement. */}
      <div
        data-testid="character-flash"
        className={whiteFlash && !reducedMotion ? "white-flash" : ""}
        key={whiteFlash ? `flash-${stateKey}` : "no-flash"}
      >
        <SpriteAnimator
          sheetSrc={`${spriteBase}/anim/${animName}.png`}
          frames={anim.frames}
          tileW={meta.tileW}
          tileH={meta.tileH}
          renderedHeight={renderedHeight}
          durationMs={duration}
          loop={loop}
          animKey={`${animName}-${stateKey}`}
          flip={flip}
          frozen={frozen}
          extraDelayMs={extraDelayMs}
          impactFrame={anim.impactFrame}
          ariaLabel={alt}
          staticFrame={
            reducedMotion ? (rendered === "death" ? "last" : "first") : undefined
          }
          onImpact={onImpact}
          onEnd={() => {
            if (rendered !== "death") setRendered("idle");
            onStateEnd?.();
          }}
        />
      </div>
    </div>
  );
```

Le `key` sur le nœud de flash est nécessaire pour la même raison que celui de `SpriteAnimator` : relancer une animation CSS déjà en cours sur le même nœud ne la remet pas à zéro.

Supprimer enfin le bloc `fallbackHurtDeath` en fin de composant (lignes 154-156) — le minotaure utilise désormais le même flash blanc que tout le monde :

```tsx
      {fallbackHurtDeath && !available && rendered === "hurt" && (
        <div className="hit-flash-overlay pointer-events-none absolute inset-0" />
      )}
```

La prop `fallbackHurtDeath` reste : elle continue de piloter le repli sur l'idle quand l'anim n'existe pas.

- [ ] **Step 5: Lancer les tests unitaires**

```bash
npm test -- CharacterSprite
```

Attendu : les trois nouveaux tests passent, les anciens aussi. Le test existant `retombe sur l'idle + flash CSS pour un pack sans hurt` (ligne 70) va échouer s'il cible `hit-flash-overlay` : le mettre à jour pour vérifier `data-anim-fallback="true"` et l'absence de `hit-flash-overlay`.

- [ ] **Step 6: Brancher le flash dans VersusScene**

Dans `components/combat/VersusScene.tsx`, ajouter `whiteFlash={heroState === "hurt"}` aux props du `CharacterSprite` du héros, et `whiteFlash={bossState === "hurt"}` à celui du Boss.

- [ ] **Step 7: Supprimer les VFX**

```bash
git rm components/combat/HeroVfx.tsx
git rm -r public/vfx
```

Dans `components/combat/Arena.tsx` :
- supprimer l'import ligne 112 : `import { pickVfxVariant } from "./HeroVfx";`
- supprimer l'état ligne 254 : `const [vfxVariant, setVfxVariant] = useState<string | null>(null);`
- supprimer la ligne 645 : `setVfxVariant(pickVfxVariant(equippedHero.slug));`
- supprimer la prop ligne 1649 : `vfxVariant={vfxVariant}`

Dans `lib/sprite-metadata.ts` : supprimer l'interface `VfxMeta` (lignes 21-25), la constante `VFX_META` (ligne 27) et les fonctions `heroVfxVariants` / `vfxMeta` (lignes 42-49).

Dans `lib/sprite-metadata.test.ts` : retirer `VfxMeta` de l'import de types et la clé `vfx` du recadrage `raw` (lignes 11-15).

Dans `scripts/build-sprite-sheets.mjs` : supprimer la constante `HERO_VFX`, la fonction `buildVfx`, l'appel `const vfx = await buildVfx();` dans `main`, l'entrée `vfx` de l'objet écrit dans le JSON (`{ heroes, bosses, vfx }` → `{ heroes, bosses }`) et `buildVfx` de la liste d'exports en fin de fichier.

Dans `app/sw.ts` ligne 20 : `["/sprites/", "/backgrounds/", "/vfx/"]` → `["/sprites/", "/backgrounds/"]`.

Dans `ASSETS.md` : supprimer la ligne du tableau VFX correspondant à chaque héros (autour de la ligne 134) et la section VFX associée.

- [ ] **Step 8: Ajouter le test de non-régression du nettoyage**

Ajouter dans `lib/sprite-metadata.test.ts`, dans le `describe` existant :

```ts
  it("ne contient plus de VFX (issue #156 : remplacés par le flash blanc)", () => {
    expect(rawJson).not.toHaveProperty("vfx");
  });
```

- [ ] **Step 9: Régénérer les métadonnées et lancer les tests**

```bash
npm run generate:sprites
npm test
npx tsc --noEmit
npm run lint
```

Attendu : `lib/sprite-metadata.generated.json` perd sa clé `vfx`, tous les tests passent, aucune référence morte.

- [ ] **Step 10: Ajouter le cas e2e du flash**

Ajouter dans `e2e/combat-animations.spec.ts`, dans le `test.describe` existant :

```ts
  test("le Boss flashe en blanc quand il encaisse (issue #156)", async ({ page }) => {
    taskTitle = `E2E flash ${Date.now()}`;
    await page.getByLabel("Ajouter une tâche").fill(taskTitle);
    await page.getByRole("button", { name: "Ajouter" }).click();
    await expect(page.getByText(taskTitle)).toBeVisible();

    const bossFlash = page
      .getByRole("img", { name: /Le Boss du jour/ })
      .locator("xpath=ancestor::div[@data-testid='character-flash'][1]");

    await expect(bossFlash).not.toHaveClass(/white-flash/);
    await page.getByRole("checkbox", { name: new RegExp(taskTitle) }).click();
    await expect(bossFlash).toHaveClass(/white-flash/, { timeout: 3000 });
    await expect(bossFlash).not.toHaveClass(/white-flash/, { timeout: 3000 });
  });
```

- [ ] **Step 11: Lancer le spec d'animations**

```bash
npx playwright test e2e/combat-animations.spec.ts --reporter=list
```

Attendu : les trois tests passent (les deux existants et le nouveau).

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat(combat): flash blanc a l'impact, suppression des VFX par heros (issue #156)

Les VFX d'impact (HeroVfx, public/vfx, section buildVfx du script de build,
helpers heroVfxVariants/vfxMeta) sont supprimes au profit d'un flash blanc
facon Street Fighter II : filter brightness(0) invert(1) rend blanc tout
pixel non transparent en preservant l'alpha, donc la silhouette pleine sans
masque ni asset.

Le filtre vit sur un noeud dedie : CharacterSprite porte deja un filter
inline conditionnel (danger) qu'une animation CSS ecraserait.

Le fallback du minotaure (pack sans anim hurt) bascule du voile rouge
hit-flash-overlay au meme flash blanc que tous les autres personnages.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 9 : la génération de routines cède le pas au Réveil

**Files:**
- Modify: `lib/game-engine.ts:944-958`
- Modify: `app/actions/recurring.ts:34-110`
- Test: `lib/game-engine.test.ts:481-502`

**Interfaces:**
- Consumes: rien.
- Produces: `planRecurringGeneration(templates, today, existingTemplateIdsToday, restDayTemplateIds?, overdueTemplateIds?)` — le 5ᵉ argument est un `Set<string>` optionnel (défaut `new Set()`) des templates ayant un reste actif sur un jour antérieur.

**Contexte (chemin P2 de la spec).** Au chargement, la génération crée l'instance du jour. Puis « Reporter » dans Le Réveil (`deferOverdueTask`, `app/actions/tasks.ts:563`) ramène le reste de la veille de la **même** routine sur `day_date = today`. Deux lignes, sans aucune concurrence. Vérifié : `completeOverdueTask` et `annihilateOverdueTask` ne touchent pas `day_date`, seul `deferOverdueTask` le déplace.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter dans `lib/game-engine.test.ts`, à l'intérieur du `describe("planRecurringGeneration (US-17)", ...)` :

```ts
  test("saute si un reste actif de cette routine traîne sur un jour passé (#156 P2)", () => {
    expect(
      planRecurringGeneration(templates, monday, new Set(), new Set(), new Set(["A"])),
    ).toEqual([]);
  });

  test("génère si le reste concerne une autre routine (#156 P2)", () => {
    expect(
      planRecurringGeneration(templates, monday, new Set(), new Set(), new Set(["B"])),
    ).toEqual(["A"]);
  });

  test("génère quand aucun reste n'est signalé (#156 P2)", () => {
    expect(
      planRecurringGeneration(templates, monday, new Set(), new Set(), new Set()),
    ).toEqual(["A"]);
  });
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

```bash
npm test -- game-engine -t "P2"
```

Attendu : le premier test ÉCHOUE (`expected [ 'A' ] to deeply equal []`), les deux autres passent déjà (l'argument est ignoré).

- [ ] **Step 3: Étendre la fonction pure**

Dans `lib/game-engine.ts`, remplacer `planRecurringGeneration` :

```ts
// US-17 : décide, en pur (sans I/O), quels templates instancier pour `today`.
// Applique l'anti-doublon (D5 : une instance déjà présente — fraîche OU reste
// reporté de cette routine — fait sauter la génération) et le no-rétroactif (D6 :
// seul `today` génère, jamais un jour passé). `existingTemplateIdsToday` = set des
// template_id ayant déjà une tâche sur `today`.
//
// Issue #156 (chemin P2) : `overdueTemplateIds` = templates ayant un reste
// ACTIF sur un jour antérieur. On ne génère pas pour eux — Le Réveil va les
// traiter, et « Reporter » ramènerait le reste sur `today` en doublon de
// l'instance fraîche. La génération est relancée en fin de Réveil : si le
// reste a été coché ou annihilé (son `day_date` restant au jour passé),
// l'instance du jour est alors créée normalement.
export function planRecurringGeneration(
  templates: RecurringTemplateRule[],
  today: string,
  existingTemplateIdsToday: Set<string>,
  restDayTemplateIds: Set<string> = new Set(),
  overdueTemplateIds: Set<string> = new Set(),
): string[] {
  return templates
    .filter(
      (t) =>
        shouldGenerate(t, today, restDayTemplateIds) &&
        !existingTemplateIdsToday.has(t.id) &&
        !overdueTemplateIds.has(t.id),
    )
    .map((t) => t.id);
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

```bash
npm test -- game-engine
```

Attendu : tout vert, y compris les trois tests existants du `describe`.

- [ ] **Step 5: Alimenter le set depuis la server action**

Dans `app/actions/recurring.ts`, dans `generateRecurringInstances`, ajouter après la requête `restDays` (ligne 65-69) :

```ts
  // Issue #156 (P2) : restes actifs d'un jour antérieur portés par une routine.
  // Le Réveil va les traiter ; générer une instance fraîche maintenant créerait
  // un doublon dès que l'utilisateur clique « Reporter ».
  const { data: overdueRecurring } = await supabase
    .from("tasks")
    .select("recurring_template_id")
    .eq("user_id", user.id)
    .lt("day_date", today)
    .eq("is_completed", false)
    .eq("is_abandoned", false)
    .not("recurring_template_id", "is", null);
```

Ajouter le set après `restIds` (ligne 74) :

```ts
  const overdueIds = new Set(
    (overdueRecurring ?? []).map((r) => r.recurring_template_id as string),
  );
```

Et passer l'argument à l'appel (ligne 76-81) :

```ts
  const toCreate = planRecurringGeneration(
    templates as RecurringTemplateRule[],
    today,
    existingIds,
    restIds,
    overdueIds,
  );
```

- [ ] **Step 6: Vérifier la compilation**

```bash
npx tsc --noEmit
npm run lint
```

- [ ] **Step 7: Commit**

```bash
git add lib/game-engine.ts lib/game-engine.test.ts app/actions/recurring.ts
git commit -m "fix(routines): ne pas generer quand un reste de la routine traine (issue #156)

Chemin de duplication deterministe : la generation creait l'instance du jour
au chargement, puis Reporter au Reveil ramenait le reste de la veille de la
MEME routine sur day_date = today. Deux lignes, sans concurrence.

planRecurringGeneration recoit desormais les templates ayant un reste actif
sur un jour anterieur et les saute. La generation est relancee en fin de
Reveil (tache suivante).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 10 : régénérer les routines en fin de Réveil et propager au client

**Files:**
- Modify: `app/actions/recurring.ts` (signature de retour + `force`)
- Modify: `components/combat/WakeUpRitual.tsx:25-97`
- Modify: `components/combat/Arena.tsx:1559-1575`
- Test: `e2e/recurring-no-duplicate.spec.ts` (créer)

**Interfaces:**
- Consumes: `planRecurringGeneration` avec `overdueTemplateIds` (Task 9).
- Produces:
  - `generateRecurringInstances(options?: { force?: boolean }): Promise<{ error: string | null; created: number; createdTasks: Task[] }>`
  - `WakeUpRitualProps.onResolved: (resolved: { deferredTasks: Task[]; createdTasks: Task[] }) => void`

**Contexte.** Sans relance en fin de rituel, une routine dont le reste a été coché ou annihilé n'aurait plus d'instance du jour. Et sans propagation explicite des lignes créées, elles resteraient invisibles jusqu'au prochain rechargement : `WakeUpRitual` est un overlay client bloquant, `revalidatePath` n'atteint pas un state déjà hydraté, et `Arena` initialise `tasks` une seule fois depuis les props serveur. C'est exactement le bug #70.

- [ ] **Step 1: Écrire le test e2e qui échoue**

Créer `e2e/recurring-no-duplicate.spec.ts` :

```ts
import { expect, test } from "@playwright/test";
import { login } from "./fixtures";

// Le compte e2e fixe n'a pas forcément de routine : on en crée une, on la
// vérifie, on la désactive en fin de test.
async function createRoutine(page: import("@playwright/test").Page, title: string) {
  await page.goto("/vestiaire/entrainement");
  await page.getByLabel(/Nom de la quête récurrente|Nouvelle routine/).fill(title);
  // Tous les jours cochés : la routine matche à coup sûr aujourd'hui.
  for (const day of ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]) {
    const box = page.getByRole("checkbox", { name: day });
    if (!(await box.isChecked())) await box.click();
  }
  await page.getByRole("button", { name: /Créer/ }).click();
  await expect(page.getByText(title)).toBeVisible();
}

test.describe("Routines sans doublon (issue #156)", () => {
  let routineTitle: string | undefined;

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test.afterEach(async ({ page }) => {
    if (routineTitle) {
      await page.goto("/vestiaire/entrainement");
      const row = page.getByRole("listitem").filter({ hasText: routineTitle });
      await row.getByRole("button", { name: /Désactiver/ }).click();
    }
    routineTitle = undefined;
  });

  test("deux chargements concurrents de l'Arène ne créent qu'une instance", async ({
    page,
    context,
  }) => {
    routineTitle = `E2E routine ${Date.now()}`;
    await createRoutine(page, routineTitle);

    // Deux onglets chargent / en même temps : c'est la course reproduite par
    // le prefetch RSC de BottomNav en usage réel.
    const second = await context.newPage();
    await Promise.all([page.goto("/"), second.goto("/")]);
    await second.close();

    await page.reload();
    await expect(page.getByText(routineTitle, { exact: false })).toHaveCount(1);
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
npx playwright test e2e/recurring-no-duplicate.spec.ts --reporter=list
```

Attendu : ÉCHEC intermittent avec `Expected: 1, Received: 2`. Si le test passe du premier coup, le relancer trois fois — la course n'est pas déterministe. Elle sera fermée définitivement par la Task 11 ; ce test sert de sonde.

Note : ce test peut rester rouge jusqu'à la Task 11. C'est attendu, il est écrit ici parce qu'il partage le fichier et les helpers avec le test de la Step 6.

- [ ] **Step 3: Faire renvoyer les lignes créées**

Dans `app/actions/recurring.ts`, remplacer la signature et le corps de `generateRecurringInstances` :

```ts
export async function generateRecurringInstances(
  options: { force?: boolean } = {},
): Promise<{ error: string | null; created: number; createdTasks: Task[] }> {
```

Adapter tous les `return` de sortie anticipée pour inclure `createdTasks: []`, par exemple :

```ts
  if (!user) return { error: null, created: 0, createdTasks: [] };
```

Remplacer l'insertion finale (lignes 106-109) par :

```ts
  // Bug #70 : les lignes créées sont renvoyées explicitement. WakeUpRitual est
  // un overlay client bloquant — revalidatePath n'atteint pas le state déjà
  // hydraté d'Arena, qui initialise `tasks` une seule fois depuis les props
  // serveur. Sans ce retour, une routine régénérée en fin de rituel resterait
  // invisible jusqu'au prochain rechargement complet.
  const { data: inserted, error } = await supabase
    .from("tasks")
    .insert(rows)
    .select();

  if (error) {
    return {
      error: "Impossible de générer les quêtes du jour.",
      created: 0,
      createdTasks: [],
    };
  }

  return {
    error: null,
    created: inserted?.length ?? 0,
    createdTasks: (inserted ?? []) as Task[],
  };
```

Ajouter l'import du type en tête de fichier :

```ts
import type { Task } from "@/types";
```

Le paramètre `options.force` n'est pas encore utilisé — il le sera en Task 11. Le déclarer dès maintenant évite de modifier deux fois les appelants.

- [ ] **Step 4: Élargir le contrat d'onResolved**

Dans `components/combat/WakeUpRitual.tsx`, remplacer la ligne 32 :

```tsx
  onResolved: (deferredTasks: Task[]) => void;
```

par :

```tsx
  // Issue #156 : les routines régénérées en fin de rituel voyagent par le même
  // canal que les restes reportés — même raison (bug #70), même contrainte.
  onResolved: (resolved: { deferredTasks: Task[]; createdTasks: Task[] }) => void;
```

Puis remplacer les lignes 93-96 :

```tsx
    if (remaining.length === 0) {
      await backfillMissedDays();
      onResolved(deferredAccumulatorRef.current);
    }
```

par :

```tsx
    if (remaining.length === 0) {
      await backfillMissedDays();
      // Issue #156 : les routines dont un reste traînait n'ont pas été
      // générées au chargement (cf. planRecurringGeneration, overdueTemplateIds).
      // Maintenant que les restes sont soldés, on relance — `force` court-circuite
      // le cache de saut, déjà posé par le chargement de l'Arène.
      const generated = await generateRecurringInstances({ force: true });
      onResolved({
        deferredTasks: deferredAccumulatorRef.current,
        createdTasks: generated.createdTasks,
      });
    }
```

Ajouter l'import :

```tsx
import { generateRecurringInstances } from "@/app/actions/recurring";
```

- [ ] **Step 5: Fusionner les deux listes dans Arena**

Dans `components/combat/Arena.tsx`, remplacer le handler `onResolved` (lignes 1564-1573) :

```tsx
          onResolved={({ deferredTasks, createdTasks }) => {
            setShowWakeUp(false);
            // Bug #70 : "Reporter" ramenait la tâche en base (day_date du
            // jour) mais l'Arène gardait son state initial (fetché avant
            // l'ouverture du Réveil) — la tâche restait invisible, comme si
            // elle avait été annihilée. On la fusionne explicitement ici.
            // Issue #156 : même traitement pour les routines régénérées en
            // fin de rituel, qui n'existaient pas non plus au fetch initial.
            const merged = [...deferredTasks, ...createdTasks];
            if (merged.length > 0) {
              setTasks((previous) => [...previous, ...merged]);
            }
          }}
```

- [ ] **Step 6: Ajouter le test e2e du cycle complet**

Ajouter dans `e2e/recurring-no-duplicate.spec.ts`, à l'intérieur du `test.describe` :

```ts
  test("Reporter un reste de routine au Réveil ne crée pas de doublon", async ({ page }) => {
    routineTitle = `E2E routine reveil ${Date.now()}`;
    await createRoutine(page, routineTitle);

    // L'instance du jour vient d'être générée : on la déplace sur hier pour
    // fabriquer un reste, via l'API admin (impossible depuis l'UI).
    const { seedOverdueRecurringInstance } = await import("./fixtures");
    await seedOverdueRecurringInstance(routineTitle);

    await page.goto("/");
    const ritual = page.getByRole("alertdialog", { name: "Le Réveil" });
    await expect(ritual).toBeVisible();
    await ritual.getByRole("button", { name: /Reporter/ }).first().click();
    await expect(ritual).toBeHidden({ timeout: 10_000 });

    // Sans rechargement : couvre à la fois D1 et la propagation createdTasks.
    await expect(page.getByText(routineTitle, { exact: false })).toHaveCount(1);
  });
```

Puis ajouter le helper dans `e2e/fixtures.ts`, en suivant exactement le patron de `seedOverdueTask` (lignes 210-234) :

```ts
// Issue #156 : transforme l'instance du jour d'une routine en reste de la
// veille, pour reproduire le chemin de duplication P2 (Réveil + Reporter).
export async function seedOverdueRecurringInstance(title: string): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PRIVATE_KEY_SUPABASE;
  const email = process.env.E2E_TEST_EMAIL;
  if (!url || !key || !email) {
    throw new Error(
      "Seed overdue recurring : NEXT_PUBLIC_SUPABASE_URL / NEXT_PRIVATE_KEY_SUPABASE / E2E_TEST_EMAIL manquants.",
    );
  }
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const users = await listUsersRetrying(admin);
  const uid = users.find((u) => u.email === email)?.id;
  if (!uid) throw new Error("Seed overdue recurring : utilisateur test introuvable.");

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const { error } = await admin
    .from("tasks")
    .update({ day_date: yesterday })
    .eq("user_id", uid)
    .eq("title", title)
    .not("recurring_template_id", "is", null);
  if (error) {
    throw new Error(`Seed overdue recurring : update échoué (${error.message}).`);
  }
}
```

- [ ] **Step 7: Lancer les tests**

```bash
npx playwright test e2e/recurring-no-duplicate.spec.ts -g "Reveil" --reporter=list
npx playwright test e2e/wake-up-ritual.spec.ts --reporter=list
npx tsc --noEmit
```

Attendu : le test du Réveil passe, `wake-up-ritual.spec.ts` reste vert. Le test de concurrence (Step 1) peut encore échouer — il est fermé par la Task 11.

- [ ] **Step 8: Commit**

```bash
git add app/actions/recurring.ts components/combat/WakeUpRitual.tsx components/combat/Arena.tsx e2e/recurring-no-duplicate.spec.ts e2e/fixtures.ts
git commit -m "fix(routines): regenerer en fin de Reveil et propager au client (issue #156)

Une routine dont le reste etait coche ou annihile n'avait plus d'instance du
jour, la generation l'ayant sautee au chargement. Elle est relancee en fin de
rituel avec force.

Les lignes creees remontent explicitement au parent via onResolved, comme les
restes reportes : WakeUpRitual est un overlay client bloquant et revalidatePath
n'atteint pas le state deja hydrate d'Arena (bug #70).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 11 : index unique, upsert et cache de saut

**Files:**
- Create: `supabase/migrations/20260802120000_fix_recurring_duplicates.sql`
- Modify: `app/actions/recurring.ts`
- Modify: `types/index.ts` (interface `Profile`)
- Test: `e2e/recurring-no-duplicate.spec.ts` (le test de concurrence de la Task 10 passe enfin)

**Interfaces:**
- Consumes: `generateRecurringInstances(options?: { force?: boolean })` (Task 10).
- Produces: `Profile.last_recurring_gen_day: string | null`.

**Contexte (chemin P1).** `generateRecurringInstances()` mute à chaque GET de `/` (`app/page.tsx:39`), en lecture-puis-écriture non atomique, sur une table sans contrainte d'unicité. `/` est préfetchée par le `<Link href="/">` de `BottomNav` : un prefetch RSC exécute le composant serveur, donc la mutation.

- [ ] **Step 1: Prévisualiser les doublons à solder**

Avant d'écrire la migration, vérifier ce qu'elle va toucher sur la base liée :

```bash
npx supabase migration list --linked
```

Puis, depuis le SQL editor Supabase, exécuter la requête de prévisualisation :

```sql
with ranked as (
  select id, user_id, day_date, recurring_template_id, title, is_completed, created_at,
         row_number() over (
           partition by user_id, day_date, recurring_template_id
           order by is_completed desc, created_at asc, id asc
         ) as rn
  from tasks
  where recurring_template_id is not null and is_abandoned = false
)
select * from ranked where rn > 1 order by day_date desc;
```

Lire la liste retournée : ce sont exactement les lignes qui seront annihilées. Vérifier qu'aucune n'est cochée (`is_completed = true`) — la règle de tri garantit qu'une ligne cochée est toujours conservée en priorité, donc une ligne cochée en `rn > 1` signifierait plusieurs doublons cochés, cas à examiner avant de continuer.

- [ ] **Step 2: Écrire la migration**

Créer `supabase/migrations/20260802120000_fix_recurring_duplicates.sql` :

```sql
-- Issue #156 : les instances de routines pouvaient se dupliquer.
--
-- Deux chemins identifiés :
--   P1 — generateRecurringInstances() mute a chaque GET de /, en lecture-puis-
--        ecriture non atomique. La route est prefetchee par le <Link href="/">
--        de BottomNav : un prefetch RSC execute le composant serveur, donc la
--        mutation. Deux executions concurrentes lisent un ensemble vide et
--        inserent chacune la leur.
--   P2 — la generation creait l'instance du jour, puis « Reporter » au Reveil
--        ramenait le reste de la veille de la meme routine sur day_date = today.
--
-- P2 est traite cote application (planRecurringGeneration + overdueTemplateIds).
-- P1 est ferme ici par une contrainte d'unicite.

-- 1. Solde des doublons existants. Aucun DELETE (RG-04) : les surnumeraires
--    passent en annihiles. On conserve la ligne cochee s'il y en a une — le
--    travail deja accompli n'est jamais efface — sinon la plus ancienne.
--    L'id departage les egalites pour rendre la migration reproductible.
with ranked as (
  select id,
         row_number() over (
           partition by user_id, day_date, recurring_template_id
           order by is_completed desc, created_at asc, id asc
         ) as rn
  from tasks
  where recurring_template_id is not null
    and is_abandoned = false
)
update tasks
set is_abandoned = true,
    abandon_reason = 'annihilated'
where id in (select id from ranked where rn > 1);

-- 2. Contrainte d'unicite. Partielle sur is_abandoned = false : les doublons
--    soldes ci-dessus ne bloquent pas la creation de l'index, et une routine
--    annihilee n'empeche jamais une regeneration ulterieure.
create unique index if not exists tasks_recurring_unique_per_day
  on tasks (user_id, day_date, recurring_template_id)
  where recurring_template_id is not null
    and is_abandoned = false;

-- 3. Cache de saut : evite de rejouer les requetes de generation a chaque GET
--    de / (prefetch RSC compris). Ce n'est PAS un verrou — la valeur est ecrite
--    APRES un passage reussi, jamais avant. Reserver la journee en amont ferait
--    qu'un prefetch annule consommerait la reservation sans rien creer, et la
--    routine manquerait jusqu'au lendemain. La garantie vient de l'index.
alter table profiles
  add column if not exists last_recurring_gen_day date;
```

- [ ] **Step 3: Appliquer la migration**

```bash
npx supabase db push --linked
npx supabase migration list --linked
```

Attendu : la nouvelle migration apparaît dans les colonnes Local **et** Remote. Si `db push` refuse en signalant des migrations à insérer avant la dernière distante, ne pas passer `--include-all` à l'aveugle : vérifier d'abord quel fichier est hors-ordre (c'est la cause racine du bug #70).

- [ ] **Step 4: Déclarer la colonne côté TypeScript**

Dans `types/index.ts`, ajouter à l'interface `Profile`, après `plan_tomorrow_after_hour: number;` :

```ts
  // Issue #156 : dernier jour local pour lequel les routines ont été générées.
  // Cache de saut, pas un verrou (cf. migration 20260802120000).
  last_recurring_gen_day: string | null;
```

- [ ] **Step 5: Passer l'insertion en upsert**

Dans `app/actions/recurring.ts`, remplacer l'insertion posée en Task 10 :

```ts
  const { data: inserted, error } = await supabase
    .from("tasks")
    .insert(rows)
    .select();
```

par :

```ts
  // Issue #156 (P1) : upsert plutôt qu'insert. Sous l'index unique partiel
  // tasks_recurring_unique_per_day, une exécution concurrente devient un no-op
  // silencieux au lieu de produire un doublon ou de lever une 23505.
  const { data: inserted, error } = await supabase
    .from("tasks")
    .upsert(rows, {
      onConflict: "user_id,day_date,recurring_template_id",
      ignoreDuplicates: true,
    })
    .select();
```

- [ ] **Step 6: Brancher le cache de saut**

Toujours dans `generateRecurringInstances`, remplacer la fonction `userToday` (lignes 17-27) par une lecture qui rapporte aussi le drapeau :

```ts
async function userDayAndGenFlag(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<{ today: string; lastGenDay: string | null }> {
  const { data } = await supabase
    .from("profiles")
    .select("timezone, last_recurring_gen_day")
    .eq("id", userId)
    .maybeSingle();
  return {
    today: dayKey(new Date(), data?.timezone ?? "UTC"),
    lastGenDay: (data?.last_recurring_gen_day as string | null) ?? null,
  };
}
```

Conserver l'ancienne `userToday` : `toggleRestDay` (ligne 227) l'utilise toujours.

Dans `generateRecurringInstances`, remplacer `const today = await userToday(supabase, user.id);` par :

```ts
  const { today, lastGenDay } = await userDayAndGenFlag(supabase, user.id);

  // Cache de saut (issue #156) : évite de rejouer six requêtes à chaque GET de
  // /, prefetch RSC de BottomNav compris. `force` court-circuite ce cache pour
  // les appels déclenchés par une action utilisateur (création de routine, fin
  // du Réveil), qui doivent produire leur effet le jour même.
  if (!options.force && lastGenDay === today) {
    return { error: null, created: 0, createdTasks: [] };
  }
```

Puis, juste avant le `return` final de succès, poser le drapeau :

```ts
  await supabase
    .from("profiles")
    .update({ last_recurring_gen_day: today })
    .eq("id", user.id);
```

Poser également ce drapeau dans la branche `if (toCreate.length === 0)` (ligne 82), avant son `return` : un passage sans rien à créer est un passage réussi.

- [ ] **Step 7: Forcer la génération à la création d'une routine**

Dans la même fichier, `createRecurringTemplate` ligne 153 : remplacer `await generateRecurringInstances();` par :

```ts
  // force : le cache de saut a déjà été posé au chargement de l'Arène ce matin,
  // sans quoi créer une routine à 14 h ne produirait aucune instance le jour même.
  await generateRecurringInstances({ force: true });
```

- [ ] **Step 8: Lancer les tests**

```bash
npx playwright test e2e/recurring-no-duplicate.spec.ts --reporter=list
```

Attendu : les **deux** tests passent, y compris celui de concurrence resté rouge à la Task 10. Le relancer trois fois d'affilée pour s'assurer qu'il n'est pas intermittent.

```bash
npm test
npx tsc --noEmit
npm run lint
```

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/20260802120000_fix_recurring_duplicates.sql app/actions/recurring.ts types/index.ts
git commit -m "fix(routines): index unique et upsert contre les doublons (issue #156)

generateRecurringInstances mutait a chaque GET de /, en lecture-puis-ecriture
non atomique, sur une table sans contrainte d'unicite. La route etant
prefetchee par le <Link href=\"/\"> de BottomNav, deux executions concurrentes
lisaient un ensemble vide et inseraient chacune la leur.

Index unique partiel sur (user_id, day_date, recurring_template_id) ou
is_abandoned = false, insertion passee en upsert ignoreDuplicates. Les
doublons existants sont soldes par la migration en is_abandoned (aucun
DELETE, RG-04) en conservant la ligne cochee, sinon la plus ancienne.

profiles.last_recurring_gen_day evite de rejouer les requetes a chaque GET.
Cache de lecture ecrit APRES succes, jamais un verrou pris en amont : une
reservation prealable qu'un prefetch annule consommerait ferait manquer la
routine toute la journee.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 12 : durcir la machine à états d'animation

**Files:**
- Modify: `lib/combat-animation.ts`
- Modify: `components/combat/Arena.tsx:714-736`
- Test: `lib/combat-animation.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `nextAnimStateAfterEnd(current: AnimState): AnimState` où `interface AnimState { state: "idle" | "attack" | "hurt" | "death"; key: number; anim?: string }`.

`"death"` fait partie de l'union dès le départ : `bossAnim` (`Arena.tsx:247`) le déclare, et un `AnimState` plus étroit forcerait un élargissement en cours de route. La fonction traite `"death"` comme `"idle"` — elle retourne l'objet inchangé, le Boss mort ne se relève pas de lui-même (seule la renaissance le remet debout, cf. `koOutcome`).

**Contexte.** `onHeroAttackEnd` ne remet l'état à `idle` que si l'état courant est `attack` (`Arena.tsx:726`). Après un `hurt`, `heroAnim` reste figé sur `hurt` pour le reste de la session. Les gardes anti-chevauchement qui lisent `heroAnimRef` raisonnent donc sur un état périmé — c'est la même classe de bug que #149, qui n'avait traité que le cas `attack`.

**Pourquoi les tests existants ne le voient pas.** `e2e/combat-animations.spec.ts` vérifie déjà le retour à l'idle, mais via `data-anim-state`, qui expose `rendered`, l'état **interne** à `CharacterSprite` — lequel se réinitialise correctement tout seul. Le test observe la bonne variable au mauvais niveau. C'est l'angle mort par lequel #149 est passé.

**Ce que cette tâche ne fait pas.** Elle ne prétend pas corriger le symptôme « hurt joué en double » de l'issue. Voir la Task 13.

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter à `lib/combat-animation.test.ts` :

```ts
import { nextAnimStateAfterEnd } from "./combat-animation";

describe("nextAnimStateAfterEnd (issue #156)", () => {
  it("ramène une attaque terminée à l'idle en incrémentant la clé", () => {
    expect(nextAnimStateAfterEnd({ state: "attack", key: 7, anim: "atk2" })).toEqual({
      state: "idle",
      key: 8,
    });
  });

  it("ramène AUSSI un hurt terminé à l'idle", () => {
    // #149 n'avait traité que le cas "attack" : après un hurt, l'état d'Arena
    // restait figé et les gardes anti-chevauchement lisaient une valeur périmée.
    expect(nextAnimStateAfterEnd({ state: "hurt", key: 3 })).toEqual({
      state: "idle",
      key: 4,
    });
  });

  it("laisse un état déjà idle inchangé", () => {
    const idle = { state: "idle" as const, key: 5 };
    expect(nextAnimStateAfterEnd(idle)).toBe(idle);
  });

  it("laisse un Boss mort inchangé", () => {
    // Le Boss mort ne se relève pas de lui-même : seule la renaissance le
    // remet debout (cf. koOutcome, garde prevBossHp === 0).
    const dead = { state: "death" as const, key: 9 };
    expect(nextAnimStateAfterEnd(dead)).toBe(dead);
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
npm test -- combat-animation
```

Attendu : ÉCHEC à l'import (`nextAnimStateAfterEnd` n'est pas exporté).

- [ ] **Step 3: Écrire la fonction pure**

Ajouter à la fin de `lib/combat-animation.ts` :

```ts
/** État d'animation piloté par l'Arène (distinct de l'état interne du sprite). */
export interface AnimState {
  state: "idle" | "attack" | "hurt" | "death";
  key: number;
  anim?: string;
}

/**
 * Issue #156 : état suivant à la fin d'une animation non bouclée, quel que soit
 * l'état qui vient de s'achever.
 *
 * L'issue #149 n'avait traité que le cas « fin d'attaque du héros ». Après un
 * `hurt`, l'état restait figé pour le reste de la session, et les gardes
 * anti-chevauchement (qui lisent `heroAnimRef` / `bossAnimRef`) raisonnaient
 * sur une valeur périmée.
 *
 * Attention : `data-anim-state` du DOM expose l'état INTERNE de
 * CharacterSprite, qui revient bien à l'idle tout seul. C'est l'état côté
 * Arène — celui-ci — qui restait bloqué, et qu'aucun test e2e ne voyait.
 *
 * `death` est traité comme `idle` : le Boss mort ne se relève pas de lui-même,
 * seule la renaissance le remet debout (cf. `koOutcome`).
 *
 * Retourne l'objet d'origine (identité préservée) si rien ne change, pour
 * qu'un appelant puisse éviter un re-render inutile.
 */
export function nextAnimStateAfterEnd(current: AnimState): AnimState {
  if (current.state === "idle" || current.state === "death") return current;
  return { state: "idle", key: current.key + 1 };
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

```bash
npm test -- combat-animation
```

Attendu : les trois tests passent.

- [ ] **Step 5: Brancher la fonction dans Arena**

Dans `components/combat/Arena.tsx`, remplacer le corps de `onHeroAttackEnd` (lignes 714-736) :

```tsx
  // Rejoue une attaque du Boss mise en attente pendant que le héros frappait.
  function onHeroAttackEnd() {
    // Issue #149 puis #156 : rien ne remettait `heroAnim` à "idle" après une
    // anim — d'abord jamais du tout, puis seulement après une attaque. Après un
    // `hurt`, l'état restait donc figé pour le reste de la session, et le garde
    // anti-chevauchement de `triggerBossAttack` lisait une valeur périmée.
    // La transition est désormais une fonction pure de lib/combat-animation.ts
    // (règle projet n° 2), appliquée quel que soit l'état qui s'achève.
    //
    // Mutation directe de `heroAnimRef` en plus de `setHeroAnim` : le miroir de
    // l'effet ne se met à jour qu'au rendu suivant, or `triggerBossAttack` est
    // appelée juste en dessous et doit voir l'état à jour tout de suite.
    const current = heroAnimRef.current;
    if (current) {
      const next = nextAnimStateAfterEnd(current);
      if (next !== current) {
        heroAnimRef.current = next;
        setHeroAnim(next);
      }
    }
    if (bossAttackPendingRef.current) {
      const reason = bossAttackPendingRef.current;
      bossAttackPendingRef.current = null;
      triggerBossAttack(reason);
    }
  }
```

Ajouter `nextAnimStateAfterEnd` à l'import existant depuis `@/lib/combat-animation`.

- [ ] **Step 6: Faire de même côté Boss**

Dans le même fichier, ajouter un handler symétrique juste après `onHeroAttackEnd` :

```tsx
  // Issue #156 : symétrique de onHeroAttackEnd. `bossAnim` restait bloqué sur
  // "attack" ou "hurt" après la première contre-attaque, pour la même raison.
  // Le cas "death" est géré par nextAnimStateAfterEnd, qui laisse l'état tel
  // quel : le Boss mort ne se relève pas de lui-même.
  function onBossStateEnd() {
    const current = bossAnimRef.current;
    if (!current) return;
    const next = nextAnimStateAfterEnd(current);
    if (next !== current) {
      bossAnimRef.current = next;
      setBossAnim(next);
    }
  }
```

Cela suppose un `bossAnimRef` miroir. L'ajouter à côté de `heroAnimRef` (ligne 272) :

```tsx
  const bossAnimRef = useRef(bossAnim);
```

et son effet de synchronisation à côté de celui de `heroAnim` (lignes 470-472) :

```tsx
  useEffect(() => {
    bossAnimRef.current = bossAnim;
  }, [bossAnim]);
```

Puis passer `onBossStateEnd` à `VersusScene` : ajouter la prop `onBossStateEnd?: () => void;` à `VersusSceneProps`, la destructurer, et la brancher en `onStateEnd={onBossStateEnd}` sur le `CharacterSprite` du Boss.

Vérifier au passage que les états locaux `heroAnim` (ligne 239) et `bossAnim` (ligne 247) sont bien typés par l'interface `AnimState` importée plutôt que par leurs unions inline actuelles — sinon `nextAnimStateAfterEnd` recevra un type structurellement compatible mais divergent au prochain changement. `heroAnim` est `AnimState | null` (il démarre à `null`), `bossAnim` est `AnimState` (il démarre à `{ state: "idle", key: 0 }`).

- [ ] **Step 7: Lancer les tests**

```bash
npm test
npx playwright test e2e/combat-animations.spec.ts --reporter=list
npx tsc --noEmit
npm run lint
```

Attendu : tout vert.

- [ ] **Step 8: Commit**

```bash
git add lib/combat-animation.ts lib/combat-animation.test.ts components/combat/Arena.tsx components/combat/VersusScene.tsx
git commit -m "fix(combat): ramener l'etat d'anime a idle quel que soit l'etat termine (issue #156)

L'issue #149 n'avait traite que la fin d'attaque du heros. Apres un hurt,
heroAnim restait fige pour le reste de la session et le garde anti-
chevauchement de triggerBossAttack lisait une valeur perimee. Meme defaut
cote bossAnim, jamais remis a idle du tout.

La transition devient une fonction pure de lib/combat-animation.ts, testee
en isolation. Les specs e2e existantes ne pouvaient pas attraper ce bug :
data-anim-state expose l'etat INTERNE de CharacterSprite, qui se
reinitialise correctement, pas l'etat cote Arene.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 13 : reproduire et corriger le hurt joué en double

**Files:** à déterminer par la reproduction.

**Interfaces:**
- Consumes: `nextAnimStateAfterEnd` (Task 12).
- Produces: à déterminer.

**Cette tâche ne suit pas le cycle TDD standard** : elle commence par une phase d'investigation. C'est le troisième passage sur cette famille de bugs (#146, #149, maintenant #156) et les deux précédents ont été résolus en reproduisant, pas en lisant. Ne pas deviner le scénario.

**REQUIRED SUB-SKILL :** utiliser `superpowers:systematic-debugging` pour cette tâche.

**Piste déjà écartée.** L'`impactFrame` de l'anim `idle` vaut `null` pour les 7 héros et les 27 boss (vérifiable via `node -e "const m=require('./lib/sprite-metadata.generated.json'); console.log(Object.values(m.heroes).every(h=>h.anims.idle.impactFrame===null))"`). Le garde posé par #146 tient : le retour à l'idle en fin d'animation ne rappelle pas `onImpact`.

**Candidats restants, par ordre de suspicion :**

1. **`triggerHeroAttack` (`Arena.tsx:630`) ne vérifie pas si le Boss attaque déjà.** Le garde n'existe que dans l'autre sens : `triggerBossAttack` (ligne 687) consulte `heroAnimRef`, l'inverse n'est pas vrai. Une attaque du héros lancée pendant une attaque du Boss laisse le timer d'impact du Boss (`SpriteAnimator`, ligne 80-84) aboutir en plein milieu.
2. **Rafale de décochages non coalescée.** `triggerBossAttack("uncheck")` (`Arena.tsx:1252`) n'a pas d'équivalent d'`addPendingHit` / `shouldForceFlush`, qui coalescent les coups du héros (`triggerHeroAttack`, lignes 637-658). Deux décochages rapprochés produisent deux attaques du Boss qui se chevauchent.

- [ ] **Step 1: Reproduire**

Lancer l'app en local (`npm run dev`), se connecter avec le compte e2e, et tenter les deux scénarios en observant le sprite du héros :

- cocher une tâche puis, **pendant** l'animation d'attaque (< 600 ms, `ATTACK_DURATION_MS`), en décocher une autre ;
- décocher deux tâches à moins de 300 ms d'intervalle.

Filmer ou capturer l'écran si le double n'est pas évident à l'œil. Instrumenter au besoin avec un `console.log` horodaté dans `onBossImpact` (`Arena.tsx:696`) : deux appels rapprochés pour une seule action utilisateur confirment le diagnostic.

- [ ] **Step 2: Écrire le test de non-régression à partir du scénario reproduit**

Une fois la séquence exacte identifiée, l'encoder soit en test unitaire sur une fonction pure extraite (préférable, cf. règle projet n° 2), soit en test e2e dans `e2e/combat-animations.spec.ts` en comptant les déclenchements observables.

Ne pas écrire ce test avant la Step 1 : deviner le scénario est précisément ce qui a fait déclarer #146 et #149 résolus alors qu'un cas subsistait.

- [ ] **Step 3: Corriger**

Selon le candidat confirmé. Pour le candidat 1, le correctif attendu est un garde symétrique dans `triggerHeroAttack`. Pour le candidat 2, une coalescence des attaques du Boss sur le modèle d'`addPendingHit`.

- [ ] **Step 4: Vérifier**

```bash
npm test
npx playwright test e2e/combat-animations.spec.ts --reporter=list
```

- [ ] **Step 5: Si la reproduction n'aboutit pas**

Ne pas livrer de correctif spéculatif. Documenter dans l'issue #156 : les scénarios testés, ce qui a été observé, et le fait que le durcissement structurel de la Task 12 est livré sans que le symptôme soit confirmé résolu. Laisser ce point ouvert dans l'issue plutôt que la clore intégralement.

- [ ] **Step 6: Commit (si correctif il y a)**

```bash
git add -A
git commit -m "fix(combat): <cause racine reelle constatee> (issue #156)

<Scenario de reproduction exact, ce qui se passait, pourquoi.>

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 14 : noms de héros dérivés du catalogue

**Files:**
- Modify: `lib/achievements.ts:33-41`
- Test: `lib/achievements.test.ts`

**Interfaces:**
- Consumes: `HEROES` de `lib/heroes.ts` (déjà importé par `achievements.ts`).
- Produces: rien de nouveau. `ACHIEVEMENTS` conserve ses codes et titres.

**Contexte.** `HERO_TITLES` duplique les noms des héros en dur, désynchronisés du catalogue :

| Catalogue (`heroes.ts`) | Succès (`achievements.ts`) |
|---|---|
| Assassin du Vent | Hashashin du Vent |
| Rôdeur des Feuilles | Rôdeu**se** des Feuilles |
| Broyeur de Cristal | Massacreur de Cristal |
| Gardien des Lames | Gardien de Lame |

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter à `lib/achievements.test.ts` :

```ts
import { HEROES } from "./heroes";
import { ALL_ACHIEVEMENT_DEFS } from "./achievements";

describe("noms de héros dans les succès (issue #156)", () => {
  it("chaque description reprend littéralement le nom du catalogue", () => {
    for (const hero of HEROES) {
      const def = ALL_ACHIEVEMENT_DEFS.find(
        (d) => d.code === `HERO_${hero.id.toUpperCase()}`,
      );
      expect(def, `succès manquant pour ${hero.id}`).toBeDefined();
      expect(
        def!.description,
        `"${def!.description}" ne contient pas "${hero.name}"`,
      ).toContain(hero.name);
    }
  });
});
```

Vérifier au préalable que `ALL_ACHIEVEMENT_DEFS` est bien exporté par `lib/achievements.ts` ; sinon, utiliser l'export équivalent existant.

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
npm test -- achievements
```

Attendu : ÉCHEC sur quatre héros — `"Hashashin du Vent débloqué." ne contient pas "Assassin du Vent"` et les trois autres.

- [ ] **Step 3: Dériver la description du catalogue**

Dans `lib/achievements.ts`, remplacer les lignes 33-41 :

```ts
const HERO_TITLES: Record<string, { title: string; description: string }> = {
  fire_knight: { title: "Flamme Intérieure", description: "Chevalier de Feu débloqué." },
  water_priestess: { title: "Marée Calme", description: "Prêtresse de l'Eau débloquée." },
  ground_monk: { title: "Racines", description: "Moine de la Terre débloqué." },
  wind_hashashin: { title: "Souffle", description: "Hashashin du Vent débloqué." },
  leaf_ranger: { title: "Mue", description: "Rôdeuse des Feuilles débloquée." },
  crystal_mauler: { title: "Facette", description: "Massacreur de Cristal débloqué." },
  metal_bladekeeper: { title: "Lame Froide", description: "Gardien de Lame débloqué." },
};
```

par :

```ts
// Issue #156 : la table ne garde que le TITRE du succès — « Souffle », « Lame
// Froide »… qui sont bien des titres, pas des noms de héros — plus le genre,
// pour l'accord du participe. La description se compose depuis `hero.name`.
// Les descriptions écrites en dur avaient dérivé du catalogue sur quatre
// héros sur sept (Hashashin/Assassin du Vent, Rôdeuse/Rôdeur des Feuilles,
// Massacreur/Broyeur de Cristal, Gardien de Lame/des Lames) — application
// directe de la leçon du reframe #51 : toute valeur d'un type partagé
// dupliquée en dur ailleurs que dans sa source casse au prochain renommage.
const HERO_TITLES: Record<string, { title: string; feminine?: boolean }> = {
  fire_knight: { title: "Flamme Intérieure" },
  water_priestess: { title: "Marée Calme", feminine: true },
  ground_monk: { title: "Racines" },
  wind_hashashin: { title: "Souffle" },
  leaf_ranger: { title: "Mue" },
  crystal_mauler: { title: "Facette" },
  metal_bladekeeper: { title: "Lame Froide" },
};
```

Puis dans `HERO_ACHIEVEMENTS` (lignes 43-54), remplacer `description: copy.description,` par :

```ts
    description: `${hero.name} débloqué${copy.feminine ? "e" : ""}.`,
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

```bash
npm test -- achievements
npx tsc --noEmit
```

Attendu : tout vert.

- [ ] **Step 5: Balayer les autres duplications de noms de héros**

```bash
grep -rn "Chevalier de Feu\|Prêtresse de l'Eau\|Moine de la Terre\|Assassin du Vent\|Hashashin du Vent\|Rôdeur des Feuilles\|Rôdeuse des Feuilles\|Broyeur de Cristal\|Massacreur de Cristal\|Gardien des Lames\|Gardien de Lame" --include=*.ts --include=*.tsx . | grep -v node_modules | grep -v "lib/heroes.ts"
```

Toute occurrence hors de `lib/heroes.ts`, d'un fichier de test ou de la documentation doit être remplacée par une lecture de `getHero(id)?.name`. Les occurrences dans `content/guide/**` et `docs/**` sont du contenu rédactionnel : les corriger si elles emploient un nom obsolète, mais sans les brancher sur le catalogue.

- [ ] **Step 6: Vérifier l'écran des succès**

Ouvrir `http://localhost:3000/tableau-de-chasse/succes` et vérifier que les descriptions des succès de héros déjà débloqués affichent bien les noms du catalogue.

- [ ] **Step 7: Commit**

```bash
git add lib/achievements.ts lib/achievements.test.ts
git commit -m "fix(succes): deriver les noms de heros du catalogue (issue #156)

Quatre descriptions sur sept avaient derive du catalogue : Hashashin du Vent
pour Assassin du Vent, Rodeuse pour Rodeur des Feuilles, Massacreur pour
Broyeur de Cristal, Gardien de Lame pour Gardien des Lames.

HERO_TITLES ne garde plus que le titre du succes et le genre ; la description
se compose depuis hero.name. Un test verrouille l'invariant.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 15 : documentation, vérification globale et PR

**Files:**
- Modify: `CLAUDE.md`, `ASSETS.md`, `CHANGELOG.md`

**Interfaces:** aucune.

- [ ] **Step 1: Mettre à jour CLAUDE.md**

Trois ajouts, dans les sections existantes :

Dans **§ Sprites de combat — spritesheets, boîte de recadrage commune et hauteurs figées (issue #48)**, ajouter en fin de paragraphe :

> **Ancrage horizontal (issue #156)** — la boîte de recadrage étant l'union alpha de toutes les anims, la silhouette idle y occupe une fraction et une position variables : de 274 px (`ground-monk`) à 497 px (`wind-hashashin`) de largeur rendue dans l'Arène, pour une demi-scène de ~172 px sur mobile. Aligner les **bords de la tuile** — ce que faisaient les deux zones flex de l'issue #145 — place donc chaque personnage à un endroit différent. `idleAnchorX` (centre de la silhouette idle en fraction de `tileW`) et `idleWidthRatio` sont produits par `build-sprite-sheets.mjs` depuis le même `idleBox` que `groundOffset`, dont ils sont le pendant horizontal exact. Le rendu pose `left: 25%` / `left: 75%` puis `translateX(-idleAnchorX × 100%)`. **L'ancre du Boss doit être miroitée (`1 - idleAnchorX`) quand `flip` est vrai** : le `scaleX(-1)` s'applique à la tuile entière, et la majorité du roster est flippée.

Dans **§ Mode Entraînement — génération au chargement, pas seulement au Réveil (US-17)**, ajouter :

> **Trois verrous anti-doublon (issue #156)** — deux chemins de duplication existaient. **P1**, une course : `generateRecurringInstances()` mute à chaque GET de `/`, en lecture-puis-écriture non atomique, et `/` est **préfetchée par le `<Link href="/">` de `BottomNav`** — un prefetch RSC exécute le composant serveur, donc la mutation. **P2**, déterministe : la génération créait l'instance du jour, puis « Reporter » au Réveil ramenait le reste de la veille de la même routine sur `day_date = today`. Correctifs : `planRecurringGeneration` reçoit `overdueTemplateIds` et saute les routines ayant un reste actif (P2) ; l'index unique partiel `tasks_recurring_unique_per_day` + `.upsert(ignoreDuplicates)` ferme P1 et tout chemin résiduel ; `profiles.last_recurring_gen_day` est un **cache de saut**, écrit **après** succès et jamais un verrou pris en amont — réserver la journée avant le travail ferait qu'un prefetch annulé consommerait la réservation sans rien créer, et la routine manquerait jusqu'au lendemain. `createRecurringTemplate` et la relance de fin de Réveil passent `force: true` pour ignorer ce cache.

Dans **§ Le Réveil (`WakeUpRitual`) : overlay client qui ne déclenche jamais de refetch (bug prod #70)**, ajouter :

> **Issue #156** — la génération des routines est relancée en fin de rituel (les routines à reste n'ont pas été générées au chargement) et ses lignes créées empruntent **le même canal que `deferredTasks`** : `onResolved({ deferredTasks, createdTasks })`, fusionnées dans le state d'`Arena`. Même contrainte, même raison.

Ajouter enfin une entrée sur l'angle mort des tests d'animation :

> **`data-anim-state` expose l'état interne du sprite, pas celui de l'Arène (issue #156)** — `e2e/combat-animations.spec.ts` vérifie le retour à l'idle via cet attribut, qui reflète `rendered`, local à `CharacterSprite` et correctement réinitialisé par `onEnd`. L'état `heroAnim` / `bossAnim` d'`Arena` — celui que consultent les gardes anti-chevauchement — restait pour sa part figé sur `hurt` ou `attack`. Un test e2e vert sur cet attribut ne prouve donc rien sur l'état côté Arène : c'est par là que #149 est passé. La transition est désormais une fonction pure (`nextAnimStateAfterEnd`, `lib/combat-animation.ts`) testée en isolation.

- [ ] **Step 2: Mettre à jour ASSETS.md**

Vérifier que la suppression des VFX faite en Task 8 Step 7 est complète : plus aucune mention de `public/vfx`, `HERO_VFX` ou des packs VFX par héros (tableau autour de la ligne 134).

- [ ] **Step 3: Mettre à jour CHANGELOG.md**

Ajouter sous `## [Unreleased]` :

```markdown
- Correction d'un lot de bugs remontés en usage réel (issue #156) : jauges Héros et Boss de largeur égale, badge combo sorti de la jauge du Boss, overlay de fin de journée en modal plein écran, position du héros et du Boss ancrée sur leur silhouette (identique d'un héros à l'autre, cadre de taille constante au Marché Noir), VFX d'impact remplacés par un flash blanc façon Street Fighter, tâches récurrentes ne pouvant plus se dupliquer, noms de héros cohérents entre le catalogue et les succès.
```

- [ ] **Step 4: Vérification complète**

```bash
npm run lint
npm test
npx tsc --noEmit
npm run build
npm run e2e
```

Les cinq doivent être verts. `npm run e2e` tourne en série sur un serveur de production (cf. `playwright.config.ts`) : compter le temps nécessaire, ne pas l'interrompre.

- [ ] **Step 5: Vérifier l'état des migrations**

```bash
npx supabase migration list --linked
```

Attendu : `20260802120000_fix_recurring_duplicates` présent dans les colonnes Local **et** Remote, sans écart sur les migrations antérieures.

- [ ] **Step 6: Commit de documentation**

```bash
git add CLAUDE.md ASSETS.md CHANGELOG.md
git commit -m "docs: pieges et conventions issus de l'issue #156

Ancrage horizontal des sprites et miroir de l'ancre au flip, trois verrous
anti-doublon des routines et role exact de last_recurring_gen_day,
propagation des lignes creees hors du Reveil, angle mort de data-anim-state
dans les tests d'animation.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 7: Pousser et ouvrir la PR**

```bash
git push -u origin fix/issue-156-bugs-part4
gh pr create --title "fix: le retour des bugs part4 (issue #156)" --body "$(cat <<'EOF'
Corrige les neuf bugs de l'issue #156, ramenés à six causes racines.

## HUD de l'Arène
- **Jauges de largeur égale** : le HUD passe d'un flex à trois colonnes à une grille `[1fr auto 1fr]` avec `min-w-0`. Sans lui, le `truncate` (donc `white-space: nowrap`) du pseudo + titre équipé faisait remonter le `min-width:auto` de la colonne héros à la largeur du texte entier, affamant la colonne Boss. Régression introduite par #139 / PR #152.
- **Badge combo** sorti de la jauge du Boss, descendu dans la colonne Boss.
- **Overlay K.O.** en `fixed inset-0` : en `absolute inset-0` sur une scène de 192 px pour un contenu de ~330 px, `justify-center` faisait sortir le titre par le haut.

## Ancrage des sprites
Nouvelle métadonnée `idleAnchorX` / `idleWidthRatio`, pendant horizontal exact de `groundOffset`. La tuile étant l'union alpha de toutes les anims, sa largeur va de 274 px à 497 px selon le personnage : aligner ses bords plaçait chaque héros à un endroit différent. Corrige d'un coup la position dans l'Arène et la taille du cadre au Marché Noir. L'ancre du Boss est miroitée quand il est flippé.

## Flash blanc
`HeroVfx`, `public/vfx`, la section `buildVfx` du script de build et les helpers associés sont supprimés au profit d'un `filter: brightness(0) invert(1)` animé sur le personnage touché.

## Tâches récurrentes
Deux chemins de duplication : une course (la route `/` est préfetchée par `BottomNav`, et le composant serveur mute) et une collision déterministe avec « Reporter » au Réveil. Fermés par un index unique partiel + upsert, un saut des routines à reste actif, et une régénération en fin de rituel dont les lignes remontent explicitement au state client (bug #70).

## Noms de héros
Quatre descriptions de succès sur sept avaient dérivé du catalogue. Elles sont désormais composées depuis `hero.name`.

## Tests
Chaque bug porte au moins un test de non-régression — voir la matrice §8 du spec. Point notable : `e2e/combat-animations.spec.ts` passait déjà en vérifiant le retour à l'idle, mais via `data-anim-state`, qui expose l'état interne du sprite et non celui de l'Arène. C'est l'angle mort par lequel #149 est passé ; la transition est extraite en fonction pure et testée en isolation.

Spec : `docs/superpowers/specs/2026-08-02-issue156-bugs-part4-design.md`
Plan : `docs/superpowers/plans/2026-08-02-issue156-bugs-part4-plan.md`

Closes #156

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

**Ne pas merger.** Attendre l'accord explicite de l'utilisateur.

---

## Ordre d'exécution et dépendances

```
Task 1 (jauges) ──► Task 2 (badge combo)
Task 3 (overlay K.O.)                     [indépendante]
Task 4 (métadonnées) ──┬─► Task 5 (ancrage Arène) ──► Task 8 (flash blanc)
                       ├─► Task 6 (cadre boutique)
                       └─► Task 7 (écrans de calage)
Task 9 (P2 pure) ──► Task 10 (Réveil) ──► Task 11 (index + upsert)
Task 12 (machine à états) ──► Task 13 (repro hurt double)
Task 14 (noms de héros)                   [indépendante]
Task 15 (docs + PR)                       [après toutes les autres]
```

La Task 8 doit passer après la Task 5 : elle branche `whiteFlash` sur les `CharacterSprite` que la Task 5 réécrit.

La Task 13 est la seule dont le résultat est incertain. Si elle n'aboutit pas, livrer sans elle et laisser le point ouvert dans l'issue — les quatorze autres tâches sont indépendantes de son issue.
