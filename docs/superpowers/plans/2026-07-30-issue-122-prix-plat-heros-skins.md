# Issue #122 — Tarif plat 500 or / héros & 300 or / tenue — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Spec complète (postée sur l'issue) : <https://github.com/ouro84/dodojo/issues/122#issuecomment-5135371821>

**Goal:** Passer le catalogue des héros à un tarif uniforme de 500 or (au lieu de 150/200/200/300/300/350/350) et celui des tenues alternatives à 300 or (au lieu du `30% du prix du héros arrondi à la dizaine` = 50/60/90/110). La tenue « Défaut » reste à 0 (jamais achetable). L'onboarding conserve son starter offert (`price_paid=0` mécanique inchangée). Objectif produit : ralentir l'acquisition pour préserver la valeur-récompense de l'or.

**Architecture:** Édition de données pure dans le catalogue statique, plus un changement de signature d'un helper que personne n'appelle dans le code applicatif (`skinPrice`, source unique "théorique" non câblée — uniquement référencée par ses tests). Aucune migration, aucun schéma, aucune logique de calcul modifiée. `goldBalance()`, `computeGoldEarned()` et `app/actions/shop.ts` restent inchangés : ils lisent `price` depuis le catalogue, pas depuis une constante. Le montant d'un achat suit automatiquement le catalogue.

**Tech Stack:** TypeScript, Vitest, Playwright (fixtures uniquement, pas de specs e2e à modifier car les assertions restent agnostiques au montant).

## Global Constraints

- **Aucune migration rétroactive des `price_paid` existants** (RG-04 esprit, décision tranchée dans la spec). Les anciens achats restent à leur `price_paid` historique ; seul le catalogue change pour les futurs achats.
- **Aucune condition `if (heroId === 'fire_knight')`** ou exception de prix dans le code applicatif : `fire_knight` devient un héros comme les autres dans le catalogue (`price=500`). S'il est le starter choisi à l'onboarding, c'est `app/onboarding/actions.ts` qui seed `price_paid=0` — mécanique déjà en place, à ne pas modifier.
- `GOLD_BASE` / `GOLD_PER_DAMAGE_UNIT` / `GOLD_STREAK_BONUS_*` dans `lib/game-engine.ts` : **intouchables**. Le grind plus long (~5-10 jours pour un héros contre ~1-2 aujourd'hui) est la décision produit avouée (cf. spec). Out of scope explicite : rééquilibrage des gains d'or.
- Convention Commits : `fix: description courte` (l'issue est labellée `fix`).
- Toute PR livrant un changement visible utilisateur ajoute une ligne sous `## [Unreleased]` de `CHANGELOG.md` dans le même commit (cf. `CLAUDE.md`).
- `skinPrice()` n'est appelée nulle part dans le code applicatif (vérifié) — seule sa signature et ses tests changent, aucun call site à mettre à jour.

---

### Task 1 : Catalogue héros à 500 or

**Files:**
- Modify: `lib/heroes.ts:18,28,38,48,58,68,78` (champ `price` de chaque entrée du tableau `HEROES`)
- Test: `lib/heroes.test.ts:11-18` (test `ids et slugs uniques ; tous les héros price > 0 et frames > 0`)

**Interfaces:**
- Consumes: `Hero` interface (`types/index.ts:78-87`) — `price: number; // 0 pour le héros par défaut` (commentairebecaduc après ce changement, mais on garde le type intact ; la sémantique `isDefault` reste lefallback de rendu).
- Produces: aucune nouvelle fonction ; `HEROES[i].price` change de valeur uniquement pour les 7 entrées.

- [ ] **Step 1: Écrire le test qui échoue (garde-fou anti-régression)**

Dans `lib/heroes.test.ts`, remplacer le bloc `it("ids et slugs uniques ; tous les héros price > 0 et frames > 0", ...)` (lignes 11-18) par :

```ts
  it("ids et slugs uniques ; tous les héros ont price === 500 et frames > 0 (issue #122)", () => {
    expect(new Set(HEROES.map((h) => h.id)).size).toBe(HEROES.length);
    expect(new Set(HEROES.map((h) => h.slug)).size).toBe(HEROES.length);
    for (const h of HEROES) {
      expect(h.price).toBe(500);
      expect(h.idleFrameCount).toBeGreaterThan(0);
    }
  });
```

On remplace strictement `toBeGreaterThan(0)` par `toBe(500)` — impossible à contourner par un nouveau héros oublié. La mention `(issue #122)` documente la cause dans le test.

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npm test -- lib/heroes.test.ts`
Expected: FAIL sur le 1er héros (price 150 ≠ 500) — tous les autres aussi.

- [ ] **Step 3: Passer les 7 prix à 500**

Dans `lib/heroes.ts`, remplacer `price: 150,` (ligne 18), `price: 200,` (lignes 28 et 38), `price: 300,` (lignes 48 et 58), `price: 350,` (lignes 68 et 78) par :

```ts
    price: 500,
```

(ordre du tableau `HEROES` inchangé : feu → eau → terre → vent → feuille → cristal → métal — seules les valeurs `price` changent, pas la structure.)

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test -- lib/heroes.test.ts`
Expected: PASS (tous les tests du fichier, y compris le nouveau).

Puis lancer la suite complète pour vérifier l'absence de régression ailleurs (les Composants UI `CharacterSelect`/`HeroIdle` lisent `hero.price` par interpolation — aucun montant codé en dur ailleurs, déjà vérifié par grep sur `(500|price|cost|coût)` à l'échelle du projet) :

Run: `npm test`
Expected: PASS, 0 échec.

Run: `npx tsc --noEmit`
Expected: 0 erreur (la signature `Hero.price: number` est inchangée).

- [ ] **Step 5: Commit**

```bash
git add lib/heroes.ts lib/heroes.test.ts
git commit -m "fix: passe le catalogue héros à 500 or (issue #122)"
```

---

### Task 2 : Catalogue tenues à 300 or + signature `skinPrice(isDefault)`

**Files:**
- Modify: `lib/hero-skins.ts:7-41` (prix des alternatives dans `SKINS`), `:55-57` (signature et corps de `skinPrice`)
- Test: `lib/hero-skins.test.ts:7` (import), `:53-57` (test `skinPrice = 30%...`)

**Interfaces:**
- Consumes: `Skin` interface (`types/index.ts:130-137`) — `price: number; // 0 pour la tenue "default"` (commentaire conservé, sémantique toujours vraie).
- Produces: changement de signature publique — `skinPrice(isDefault: boolean): number` (abroge la formule dérivée D7 du spec US-53 `skinPrice(heroPrice: number): number`).

- [ ] **Step 1: Écrire le test qui échoue (garde-fou anti-régression)**

Dans `lib/hero-skins.test.ts`, remplacer le bloc `it("skinPrice = 30% du prix du héros, arrondi à la dizaine", ...)` (lignes 53-57) par :

```ts
  it("skinPrice : 0 pour le défaut, 300 pour une alternative (issue #122)", () => {
    expect(skinPrice(true)).toBe(0);
    expect(skinPrice(false)).toBe(300);
  });

  it("toutes les tenues alternatives du catalogue sont à 300 or (issue #122)", () => {
    for (const skin of SKINS) {
      if (skin.isDefault) {
        expect(skin.price).toBe(0);
      } else {
        expect(skin.price).toBe(300);
      }
    }
  });
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npm test -- lib/hero-skins.test.ts`
Expected: FAIL — `skinPrice is not a function` (ou équivalent erreur de signature) sur les 1ers tests, et `expected 50 to be 0`/`expected 60 to be 300` sur les assertions de catalogue.

- [ ] **Step 3: Passer les prix du catalogue `SKINS` à 300**

Dans `lib/hero-skins.ts`, remplacer chaque `price: 50,` `price: 60,` `price: 90,` `price: 110,` des entrées alternatives par `price: 300,` (lignes 10, 14, 18, 22, 23, 24, 28, 29, 33, 34, 35, 39, 40). Les entrées `default` (`price: 0, isDefault: true`, lignes 9, 13, 17, 21, 27, 32, 38) restent inchangées.

Résultat attendu pour les 13 tenues alternatives (vérification visuelle, à déposer dans le commit) :
- Fire Knight : `shadow_purple` → 300
- Ground Monk : `shadow_purple` → 300
- Wind Hashashin : `azure` → 300
- Water Priestess : `ember`, `verdant`, `amethyst` → 300 (×3)
- Leaf Ranger : `ember`, `amethyst` → 300 (×2)
- Crystal Mauler : `ember`, `verdant`, `amethyst` → 300 (×3)
- Metal Bladekeeper : `bronze`, `dark_steel` → 300 (×2)

- [ ] **Step 4: Changer la signature et le corps de `skinPrice`**

Toujours dans `lib/hero-skins.ts`, remplacer le bloc (lignes 55-57) :

```ts
export function skinPrice(heroPrice: number): number {
  return Math.round((heroPrice * 0.3) / 10) * 10;
}
```

par :

```ts
// Issue #122 : tarif plat — 0 pour la tenue "default", 300 pour toute
// alternative. Abroge la formule "30% du prix du héros arrondi à la dizaine"
// (D7 du spec US-53). Le helper reste la "source unique théorique" du prix
// d'une tenue alternative ; personne ne l'appelle dans le code applicatif
// (les prix sont hardcoded dans SKINS ci-dessus), mais le test le verrouille
// — un appelant futur qui voudrait calculer un prix doit passer par ici.
export function skinPrice(isDefault: boolean): number {
  return isDefault ? 0 : 300;
}
```

La signature a changé (`heroPrice: number` → `isDefault: boolean`) mais aucun call site applicatif à mettre à jour (grep `skinPrice\(` confirmé : zéro appel hors du fichier de test). Si un futur appelant veut connaître le prix d'une `Skin` précise, il lira directement `skin.price` dans le catalogue — `skinPrice()` reste un garde-fou de cohérence (alternative = 300, default = 0).

- [ ] **Step 5: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test -- lib/hero-skins.test.ts`
Expected: PASS (tous les tests, y compris les deux nouveaux).

Run: `npm test`
Expected: PASS, 0 échec.

Run: `npx tsc --noEmit`
Expected: 0 erreur.

- [ ] **Step 6: Commit**

```bash
git add lib/hero-skins.ts lib/hero-skins.test.ts
git commit -m "fix: passe le catalogue tenues à 300 or et skinPrice(en défaut) (issue #122)"
```

---

### Task 3 : Monter le seed d'or e2e à 1500

**Files:**
- Modify: `e2e/fixtures.ts:131` (`gold_earned: 500 → 1500`)

**Interfaces:**
- Consumes: `resetShopState()` déjà appelée en `beforeEach` par `echoppe.spec.ts`, `echoppe-skins.spec.ts` et `journey-hero-economy.spec.ts`.
- Produces: aucun changement de signature ; le seed de `day_results` du compte de test e2e est dorénavant plus généreux (1 jour victory avec 1500 or), ce qui autorise achat héros (500) + 2 tenues (600) + reste (400) en un seul test, là où 500 or ne permettait plus qu'un seul achat héros après le recalibrage.

- [ ] **Step 1: Modifier le montant du seed**

Dans `e2e/fixtures.ts`, ligne 131, remplacer :

```ts
      gold_earned: 500,
```

par :

```ts
      // Issue #122 : 1500 or (1 hero à 500 + 2 tenues à 300 + reste 400).
      // Avant le tarif plat, 500 or suffisait pour 1 hero à 350 + 2 tenues
      // à 110 (=570) ; le seed à 500 was just fit. À 500/300, 500 ne couvre
      // même plus l'achat hero + tenue (800) — on monte à 1500 pour garder
      // les tests d'achat multiples déterministes.
      gold_earned: 1500,
```

- [ ] **Step 2: Lancer les tests e2e concernés**

Run: `npx playwright test e2e/echoppe.spec.ts e2e/echoppe-skins.spec.ts e2e/journey-hero-economy.spec.ts`
Expected: PASS — les tests restent agnostiques au montant d'or seedé (ils cliquent sur `Débloquer`/`Confirmer`/`Équiper` et vérifient les attributs `data-owned`/`aria-pressed`, jamais la valeur chiffrée du solde). Le reset repart maintenant d'un solde dérivé de 1500, ce qui couvre largement les 800 or nécessaires à un parcours héros + tenue.

Si l'environnement local ne peut pas pousser en base Supabase distante (cf. `E2E_TEST_EMAIL`/`NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PRIVATE_KEY_SUPABASE` manquants dans `.env.local`), omettre ce step et le signaler dans le corps de PR — ce n'est pas bloquant pour le merge (les tests tournent en CI).

- [ ] **Step 3: Commit**

```bash
git add e2e/fixtures.ts
git commit -m "fix: monte le seed d'or e2e à 1500 pour couvrir les nouveaux prix (issue #122)"
```

---

### Task 4 : Documentation produit & piège CLAUDE.md

**Files:**
- Modify: `CHANGELOG.md` (section `## [Unreleased]` → `### Produit`)
- Modify: `CLAUDE.md:147` (bloc « Économie d'or dérivée & Marché Noir de héros (US-18) ») — ajout d'une phrase sur le tarif plat
- Modify: `SPECS_FONCTIONNELLES.md` — ajout d'une section §3.5 « Hors sprint — Recalibrage économique (issue #122) » avant le séparateur du §4
- Modify: `content/guide/or.md` — précision du prix
- Modify: `content/guide/tenues.md` — précision du prix

- [ ] **Step 1: CHANGELOG.md**

Dans `CHANGELOG.md`, sous `## [Unreleased]` → `### Produit`, ajouter (en haut de la liste, dernière date d'abord) :

```markdown
- fix: tarif plat du Marché Noir — 500 or par héros, 300 or par tenue alternative (issue #122). Ralentit l'acquisition pour préserver la valeur-récompense de l'or ; les anciens achats gardent leur `price_paid` historique.
```

- [ ] **Step 2: CLAUDE.md (piège)**

Dans `CLAUDE.md`, repérer la ligne `**Économie d'or dérivée & Marché Noir de héros (US-18)** —` (ligne 147) et l'autre piège `**Tenues/skins des héros — recolor par tiers de qualité (US-53)** —` (ligne 179) qui contient `prix = 30% du prix du héros arrondi à la dizaine, \`skinPrice\``.

1. Dans le bloc US-18 (ligne 147), à la fin du paragraphe (avant `**Onboarding & économie du starter (US-29)**`), ajouter :

   ```markdown
   ⚠️ **Issue #122 — tarif plat depuis le 2026-07-30** : tous les héros du catalogue valent 500 or (plus de graduation 150-350). Le starter choisi à l'onboarding reste offert (`price_paid=0`), mécanique US-29 inchangée. La migration n'est **pas** rétroactive — les `price_paid` historiques restent figés (RG-04 esprit), seuls les futurs achats sont impacted.
   ```

2. Dans le bloc US-53 (ligne 179), remplacer le segment `prix = 30% du prix du héros arrondi à la dizaine, \`skinPrice\`` par :

   ```markdown
   prix plat : 0 pour la tenue "default", 300 pour toute alternative (`skinPrice(isDefault)`, signature modifiée par l'issue #122 — abroge l'ancienne formule `round(heroPrice × 0.3 / 10) × 10`)
   ```

- [ ] **Step 3: SPECS_FONCTIONNELLES.md**

Après `#### US-53 : Tenues des héros (Skins)` (lignes 273-281) et avant le séparateur `---` du §4 (ligne 283), insérer une nouvelle section avant le séparateur :

```markdown
---

### 🛠️ HORS SPRINT — RECALIBRAGE ÉCONOMIQUE (ISSUE #122)

> Hors lotissement sprint (fix économique isolé), voir `CHANGELOG.md [Unreleased]` pour la ligne produit. Spec commentée sur l'issue GitHub.

#### Issue #122 : Tarif plat du Marché Noir
*   **Standard :** En tant que Héros, je veux que tous les combattants coûtent 500 or et toutes les tenues alternatives 300 or (au lieu d'un barème gradué 150-350 pour les héros et 30% du prix pour les tenues) pour que chaque acquisition représente un effort significatif et préserve la valeur de l'or comme récompense.
*   **BDD :**
    ```gherkin
    Given Un profil avec 490 pièces d'or et aucun héros additionnel débloqué
    When L'utilisateur tente de débloquer un héros à 500 or dans Le Marché Noir
    Then L'achat est refusé et le solde reste à 490
    And Un texte explicite rappelle qu'il manque 10 or
    ```

    ```gherkin
    Given Un profil avec 1500 pièces d'or et le starter de l'onboarding équipé
    When L'utilisateur débloque successivement un héros (500) puis une tenue alternative (300) de ce nouveau héros
    Then Son solde descend à 700
    And Le héros passe en couleur dans la matrice, la tenue est possédée
    ```
```

- [ ] **Step 4: content/guide/or.md**

Remplacer le contenu actuel de `content/guide/or.md` :

```markdown
Tu gagnes de l'or à la clôture du jour : une victoire paie plus qu'une retraite, et les gros dégâts comme les séries ajoutent un bonus.

Au Marché Noir, ton or débloque de nouveaux combattants façon écran de sélection. **Chaque combattant additionnel coûte 500 or.** Ton combattant de départ est offert à l'onboarding ; les autres se méritent.
```

(Ajout du 2e paragraphe encadré par `❡` ou simplement la phrase en gras — pas de markup spécial nécessaire dans le pipeline Markdown existant.)

> ⚠️ **Important :** Edit direct dans `content/guide/or.md` (fichier committé). Ne PAS appeler `npm run pull:guide` ici — la source Notion reste inchangée, l'édit est purement local. Si la base Notion est éditée à terme pour refléter ce changement, le `prebuild` écrasera ce fichier — il faudra harmoniser Notion à part (capture dans CLAUDE.md / un futur ticket). Pour ce plan, on édite directement le `.md` (cohérent avec la pratique documentée dans le spec US-53 §8 quand Notion n'est pas branché : « éditer directement `content/guide.json` en respectant `lib/guide.ts` ». Ici le Markdown direct est plus naturel que JSON car c'est du `.md` rendu via `react-markdown`).

- [ ] **Step 5: content/guide/tenues.md**

Remplacer le contenu actuel de `content/guide/tenues.md` :

```markdown
Chaque combattant peut posséder jusqu'à 4 tenues que tu débloques et équipes depuis le Marché Noir, sous le stage de sélection. **Chaque tenue alternative coûte 300 or ; la tenue « Défaut » est offerte avec le héros.**

Purement cosmétique : une tenue ne change ni les HP, ni l'XP, ni l'or gagné — juste le style de ton combattant dans l'Arène.
```

- [ ] **Step 6: Vérification du build et du rendu guide**

Run: `npm run build`
Expected: succès — les `.md` du guide sont SSG via `generateStaticParams`, ils sont regénérés et intégrés au build. Aucune dépendance Notion requise (la source de vérité compile = le contenu committé, cf. US-68 : sync tolérant).

Inspecter visuellement (optionnel) : `npm run dev` → naviguer à `/guide/or` et `/guide/tenues`, vérifier que la phrase en gras apparaît bien.

- [ ] **Step 7: Commit unique pour toute la doc**

```bash
git add CHANGELOG.md CLAUDE.md SPECS_FONCTIONNELLES.md content/guide/or.md content/guide/tenues.md
git commit -m "docs: doc produit & pièges pour le tarif plat Marché Noir (issue #122)"
```

---

## Self-Review

**Spec coverage :**

- « Chaque personnage coûte 500 pièce d'or » → Task 1: les 7 entrées `HEROES[].price → 500` + test `toBe(500)`.
- « Chaque skin / tenue coûte 300 pièce d'or » → Task 2: 13 entrées `SKINS[].price → 300` (alternatives) + test `toBe(300)` ; la tenue "default" reste à 0 par convention US-53 (D4 : jamais achetable, gratuite dès que le héros est possédé), validé comme décision produit dans le brainstorming.
- « fire_knight devient payant comme les autres » → Task 1: prix catalogue `500` pour `fire_knight`. Le caractère "gratuit au démarrage" est porté par `app/onboarding/actions.ts:57-59` qui seed `price_paid=0` pour le `starterId` choisi (variable du formulaire), pas par une exception de catalogue. Si l'utilisateur choisit `water_priestess` à l'onboarding, c'est elle qui est à `price_paid=0`, et `fire_knight` reste à 500 dans le Marché Noir. Aucun code à modifier côté onboarding (vérifié, `starterId` variable déjà en place).
- « Migration des existants : anciens prix figés » → par construction : `price_paid` n'est jamais recalculé rétroactivement, aucun script de migration à écrire. `goldBalance()` lit les `price_paid` existants et les nouveaux au même niveau, inchangé.
- Decisions transverses de la spec (gains d'or inchangés, hors sprint, abrogation de la formule 30%, replay) → Global Constraints, Task 2 Step 4 (commentaire de la nouvelle signature), Task 4 Step 2 (CLAUDE.md) et Task 4 Step 3 (SPECS_FONCTIONNELLES), chacun documenté.

**Placeholder scan :** aucun — tout le code, configs et contenus de doc sont fournis intégralement à chaque étape. Les seules valeurs "à adapter" sont les numéros de ligne approximatifs (`lib/heroes.ts:18,28,38...`), qui peuvent décaler si des lignes sont ajoutées/supprimées plus tôt dans le fichier — utiliser `grep "price: "` pour localiser la liste exhaustive à ce moment.

**Type consistency :**

- `Hero.price: number` (commentaire `// 0 pour le héros par défaut` devient partiellement inexact après ce plan car `fire_knight` vaut 500 comme les autres ; le commentaire pourrait être mis à jour en `// 500 (tarif plat, issue #122) ; 0 seulement pour un starter offert à l'onboarding via price_paid, jamais dans le catalogue` — mais c'est secondaire, ne pas inclure dans ce plan pour ne pas disperser les diffs. Le type reste `number` strict, aucune dérive.)
- `Skin.price: number` — commentaire `// 0 pour la tenue "default"` reste vrai (inchangé).
- `skinPrice(heroPrice: number): number` → `skinPrice(isDefault: boolean): number`. Changement **breaking** de la signature publique, mais sans appelant applicatif (vérifié par grep). Si un futur appelant existait, TypeScript casserait à la compilation (param `number` attendu, `boolean` fourni) plutôt que silencieusement. C'est exactement le garde-fou souhaité.

**Out of scope (rappels de la spec, non couverts ici) :**

- Rééquilibrage des gains d'or (`GOLD_BASE`, `GOLD_PER_DAMAGE_UNIT`, `GOLD_STREAK_BONUS_*`) — US à part si le grind s'avère insoutenable en usage réel.
- Tri accessibilité / nudge "+X or pour Y" dans la matrice Échoppe — abandonné avec un prix uniforme, à restaurer si retour à un barème gradué.
- Migration rétroactive des `price_paid` — refusée (RG-04 esprit).
- Synchronisation de la source Notion du guide — ce plan édite les `.md` committés directement ; un ticket séparé doit porter l'harmonisation Notion (`pull:guide` écraserait l'édit local au prochain build si la base Notion restait en l'état. Vérifier après merge que le `prebuild` ne réécrit pas les fichiers en restant sur leur version Notion — si oui, éditer la page Notion « Or » et « Tenues » pour refléter le même wording).
