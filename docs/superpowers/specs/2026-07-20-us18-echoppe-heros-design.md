# Spec — US-18 : L'Échoppe & Économie d'Or (Character Select)

> Date : 2026-07-20 · Statut : validé (brainstorming) · Sprint 2
> Contient l'**économie d'or transverse** (source de `profiles.gold`) dont dépendent US-12 (bonus streak) et US-10 (or all-time).
> **Réécrit la BDD d'origine d'US-18** : la boutique vend des **héros**, pas des skins de Boss.

## 1. Contexte & problème

`profiles.gold` existe (default 0) mais **aucune source ne le crédite** et aucune boutique ne le dépense. Ce spec définit d'un bloc : (1) d'où vient l'or, (2) comment on le dépense, (3) l'écran Échoppe.

Divergence assumée avec la BDD écrite (« skin Mecha-Boss ») : l'Échoppe vend des **combattants (héros)** issus de `assets/MC` (série Elementals) + alternatives CC0. Colle mieux aux assets disponibles et à l'idée d'un roster façon jeu de combat. Les **skins/tenues** (recolors d'un même héros, 3-4 couleurs) sont **hors scope**, repoussés à une US dédiée ; le modèle de données les anticipe.

## 2. Décisions de cadrage (tranchées)

| # | Décision |
|---|----------|
| D1 | **Or gagné à la clôture du jour** (Crépuscule US-07 / backfill Réveil US-08), écrit dans `day_results.gold_earned`. Une seule source. |
| D2 | **Solde dérivé, jamais accumulé** : `gold = SUM(day_results.gold_earned) − SUM(unlocked_heroes.price_paid)`. Aligne la philosophie recompute (B3 du Cycle). `profiles.gold` devient un **cache** rafraîchi à l'écriture (ou lu par recalcul ; voir §7). |
| D3 | **L'Échoppe vend des héros.** Catalogue **statique** dans `lib/heroes.ts` (versionné), pas de table admin. |
| D4 | **Acheté = possédé à vie**, jamais de DELETE (esprit RG-04). Table `unlocked_heroes` avec `price_paid` figé à l'achat. |
| D5 | **Héros par défaut `fire_knight`** possédé d'office (gratuit, `price_paid = 0`, seedé à l'onboarding). |
| D6 | **Équipement libre** parmi les héros possédés. `profiles.equipped_hero_id` = héros actif de l'Arène. |
| D7 | **UI = Character Select façon VS Fighting** : stage (héros + idle) en haut, matrice compacte en bas (couleur = débloqué, N&B = verrouillé). |
| D8 | **Achat idempotent + confirmé** : modale de confirmation, server action verrouillée (re-achat d'un héros possédé = no-op). |

### Améliorations retenues

| # | Amélioration |
|---|--------------|
| A1 | **Composante anti-farm sur l'or** : le gain n'est pas seulement forfaitaire par issue, il inclut une part liée aux dégâts réels (un jour à 1 tâche ≠ un jour à 20). |
| A2 | **Breakdown d'or au Crépuscule** : la carte de score détaille base + part dégâts + bonus streak (transparence + dopamine). *(Livré dans US-16/US-07 côté récap, alimenté par le helper de ce spec.)* |
| A3 | **Preview du verrouillé** : tap sur une silhouette N&B → aperçu idle **grisé** du héros + prix. Donne envie avant l'achat. |
| A4 | **Nudge de palier** : « +120 or pour débloquer Leaf Ranger », tri de la matrice par accessibilité (possédés, puis achetables, puis hors budget). |
| A5 | **Idle animé** via CSS `steps()` depuis les frames MC — aucune lib externe. |
| A6 | **Composant réutilisable** pour l'onboarding (#29, US-14) : le Character Select sert aussi au choix de l'avatar initial. |

### Baselines techniques (non négociables)

- **B1 — Or dérivé & idempotent.** `computeGoldEarned` est pur ; réécrire un `day_result` recalcule l'or, ne l'accumule jamais.
- **B2 — Catalogue = source unique.** Prix, chemins sprites, élément, ordre : tout dans `lib/heroes.ts`. La base ne stocke que la **possession** (`hero_id` + `price_paid`) et l'**équipé**.
- **B3 — Pas de DELETE** sur `unlocked_heroes` (RG-04).
- **B4 — Achat serveur autoritaire.** Le solde et la possession sont revérifiés côté serveur (jamais de confiance au client). Solde insuffisant → refus propre.

## 3. Économie d'or (transverse)

### Barème (tunable — constantes dans `lib/game-engine.ts`)

```
GOLD_BASE = { victory: 50, retreat: 10, defeat: 0 }
GOLD_PER_DAMAGE_UNIT = 1        // +1 or par tranche de 20 dégâts (≈ 1 tâche)
GOLD_STREAK_BONUS_PER_DAY = 5   // × longueur de streak au jour J
GOLD_STREAK_BONUS_CAP = 50      // plafond du bonus streak (anti-explosion)
```

### Helper pur

```ts
computeGoldEarned(outcome, damageDealt, streakOnThatDay): number
// = GOLD_BASE[outcome]
//   + floor(damageDealt / 20) * GOLD_PER_DAMAGE_UNIT
//   + min(streakOnThatDay * GOLD_STREAK_BONUS_PER_DAY, GOLD_STREAK_BONUS_CAP)
```

- `streakOnThatDay` : longueur de streak **au jour J**, fournie par l'action (qui a accès aux `day_results`).
- Idempotent : mêmes entrées → même or.

### Écriture

- `closeDay()` (US-07) : calcule `streakOnThatDay` depuis les `day_results < J` + l'issue du jour, ajoute `gold_earned` à l'upsert.
- `backfillMissedDays()` (US-08) : traite les jours **chronologiquement** (plus ancien d'abord) pour que le bonus streak de chaque jour lise les jours antérieurs déjà écrits.

## 4. Écran Échoppe (Character Select)

Route `app/echoppe/page.tsx`, accessible **depuis le QG** (nav = QG hub, voir §9).

- **Stage (haut)** : héros sélectionné en grand, animation **idle** en boucle, nom + élément, bouton d'action contextuel :
  - possédé & actif → `✓ ÉQUIPÉ` (désactivé) ;
  - possédé & inactif → `Équiper` ;
  - verrouillé & solde suffisant → `🪙 <prix> · Débloquer` ;
  - verrouillé & solde insuffisant → grisé `🪙 <prix>` + nudge (A4).
- **Matrice (bas)** : grille compacte des combattants. Couleur = débloqué, **N&B (grayscale)** = verrouillé, bord jaune = sélectionné, bord vert = équipé. Tap = met à jour le stage (preview, A3).
- **Bande « Tenues (bientôt) »** : swatches inactifs sous le stage → signale la future US skins (perso → couleur). Non fonctionnelle.
- **Header** : solde d'or courant.
- **Achat** : tap `Débloquer` → **modale de confirmation** (« Débloquer <héros> pour <prix> or ? ») → server action → matrice + solde rafraîchis, héros passe en couleur, optionnellement auto-équipé.
- **Équipement** : `Équiper` → `profiles.equipped_hero_id` mis à jour → **swap live** du sprite dans l'Arène au retour (revalidate).

### 3 états UI (règle projet n°3)

- **Loading** : squelette matrice + stage.
- **Error** : échec chargement ou achat → message + retry, aucun débit fantôme.
- **Empty** : ne s'applique pas vraiment (catalogue toujours ≥ 1 héros) ; cas limite « tout possédé » → matrice full couleur, aucun prix, message « Roster complet, champion ».

## 5. Catalogue héros (`lib/heroes.ts`)

Un `Hero` : `{ id, name, element, spriteBasePath, idleFrames, frameSize, price, isDefault }`.

Roster initial (depuis `ASSETS.md` §1 + Autres CC0) :

| id | Nom | Élément | Prix | Note |
|----|-----|---------|------|------|
| `fire_knight` | Fire Knight | Feu | 0 | défaut, possédé d'office |
| `water_priestess` | Water Priestess | Eau | 200 | anim heal |
| `ground_monk` | Ground Monk | Terre | 200 | |
| `wind_hashashin` | Wind Hashashin | Vent | 300 | |
| `leaf_ranger` | Leaf Ranger | Feuille | 300 | le plus riche |
| `crystal_mauler` | Crystal Mauler | Cristal | 350 | |
| `metal_bladekeeper` | Metal Bladekeeper | Métal | 350 | |

*(Prix tunables. Brawler Girl CC0 en réserve.)* ⚠️ **Licences** : plusieurs packs MC « sans licence documentée localement » (ASSETS.md §Licences) — vérifier les pages source **avant prod monétisée**. Déblocage via or **virtuel** = OK côté produit.

## 6. Modèle de données

### Nouvelle table `unlocked_heroes`
Une ligne par `(user_id, hero_id)`.

| Colonne | Type | Rôle |
|---------|------|------|
| `id` | uuid PK | |
| `user_id` | uuid FK profiles | |
| `hero_id` | text | id du catalogue statique |
| `price_paid` | int | prix figé à l'achat (0 pour le défaut) |
| `unlocked_at` | timestamptz | |

- **Unique** `(user_id, hero_id)` → garantit l'idempotence de l'achat.
- **RLS** : select / insert own. **Pas de policy DELETE** (RG-04). Update non nécessaire.

### Modif `profiles`
- `equipped_hero_id text` (default `'fire_knight'`).
- `gold` conservé comme **cache** du solde dérivé (rafraîchi à l'achat et à la clôture ; source de vérité = formule D2).

### Modif `day_results`
- `gold_earned int not null default 0`.

Migrations Supabase dédiées (une par table/altération).

## 7. Découpage technique

### `lib/game-engine.ts` (pur, Vitest)
- `computeGoldEarned(outcome, damageDealt, streakOnThatDay)` (§3).
- Constantes `GOLD_*`.

### `lib/heroes.ts` (catalogue statique)
- `HEROES: Hero[]`, `DEFAULT_HERO_ID`, helpers `getHero(id)`, `isOwned(id, unlocked)`.

### `lib/economy.ts` (ou dans game-engine)
- `goldBalance(dayResults, unlockedHeroes): number` — `SUM(gold_earned) − SUM(price_paid)` (pur, testable).

### `app/actions/shop.ts`
- `purchaseHero(heroId)` — revérifie solde (B4) + possession (idempotent), insert `unlocked_heroes` (`price_paid` = prix catalogue), rafraîchit `profiles.gold` cache, revalidate. Refus si solde insuffisant / héros inconnu.
- `equipHero(heroId)` — vérifie possession, set `profiles.equipped_hero_id`, revalidate `/` et `/echoppe`.

### `app/actions/day.ts` (modif)
- `closeDay` / `backfillMissedDays` : intégrer `computeGoldEarned` + écrire `gold_earned` (§3).

### Composants
- `components/shop/CharacterSelect.tsx` — stage + matrice + modale (réutilisable onboarding, A6).
- `components/shop/HeroSprite.tsx` — idle CSS `steps()` (A5), variante `grayscale` pour verrouillé (A3).
- `app/echoppe/page.tsx` — data fetch (catalogue + possession + solde), 3 états UI.
- Câblage Arène : lire `equipped_hero_id` pour afficher le bon héros.

### Docs (même commit)
- `CLAUDE.md` : économie d'or dérivée, tables `unlocked_heroes`, colonnes `equipped_hero_id`/`gold_earned`, catalogue statique.
- `CHANGELOG.md` : ligne US-18 sous `[Unreleased]`.
- `SPECS_FONCTIONNELLES.md` : réécrire la BDD US-18 (héros).
- `ASSETS.md` : marquer les héros MC copiés dans `public/sprites/heroes/`.

## 8. Tests

### Vitest (pur)
- `computeGoldEarned` : chaque issue, part dégâts (0/20/400 dmg), bonus streak (0, sous cap, au cap), idempotence.
- `goldBalance` : gains − achats, achats multiples, défaut à 0 (nouvel utilisateur).

### Playwright e2e (série, serveur prod — compte fixe ADR-04)
- `echoppe.spec.ts` : matrice affiche défaut équipé ; héros verrouillé N&B ; achat avec solde suffisant → possédé + solde décrémenté (vérif base : ligne `unlocked_heroes`, **aucun DELETE**) ; achat solde insuffisant → refus, pas de débit ; équiper un possédé → `equipped_hero_id` màj + swap Arène.
- ⚠️ **Pollution d'état** : les tests partagent le compte e2e unique → un achat persiste. Prévoir un **reset** en fixture (ou un héros de test dédié) pour rester déterministe en série.

## 9. Navigation (transverse Sprint 2)

**QG comme hub** : Arène = accueil ; bouton QG ; **Panthéon (US-10)** et **Échoppe (US-18)** accessibles **depuis le QG**, pas en direct. Arène épurée pendant le combat. À refléter dans `app/qg/page.tsx` (liens) et `SPECS_FONCTIONNELLES.md`.

## 10. Hors scope (repoussé)

- **Skins / tenues** (recolors 3-4 couleurs par héros) → US dédiée. Modèle anticipé (`equipped` deviendra `hero_id + skin_id`).
- **Art de portrait dédié (têtes) pour la matrice de l'Échoppe** → **US skins/UI future**. En attendant, la matrice affiche le perso entier rogné (`portrait.png` via `scripts/generate-hero-portraits.mjs`, sharp `.trim()`) : les poses idle (armes qui dépassent) rendent un cadrage « tête seule » uniforme peu fiable sans art dédié. Le vrai portrait (face) sera livré avec l'US skins/UI.
- Héros comme récompense de streak/niveau (ASSETS le suggère) → possible via jalons US-12, pas ici.
- Décors d'Arène & VFX achetables → plus tard.

## 11. Vérification (fin d'implémentation)

1. `npm run test` (Vitest) vert, cas or + solde inclus.
2. `npm run build` sans erreur (TS strict, zéro `any`).
3. `npm run lint` propre.
4. `npx playwright test` (série, prod) : specs existantes + `echoppe.spec.ts` vertes en local.
5. Manuel : gagner un jour → or crédité au Crépuscule (breakdown visible) ; acheter un héros → solde décrémenté, héros en couleur ; équiper → sprite Arène change ; re-tap achat d'un possédé = no-op.
6. Base : `unlocked_heroes` sans policy DELETE ; `day_results.gold_earned` peuplé ; solde = formule dérivée.
