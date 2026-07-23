# Spec — US-53 : Tenues / Skins des héros (recolors)

> Date : 2026-07-23 · Statut : validé (brainstorming) · Sprint 3+
> Solde la dette documentée dans le spec US-18 (§10, « Skins / tenues → US dédiée ») et active la bande **« Tenues (bientôt) »** déjà prévue dans `app/echoppe/page.tsx`.
> Issue GitHub #53 : « Modifier les couleurs des persos pour proposer jusqu'à 4 skins différents par perso ».

## 1. Contexte & problème

Les 7 héros (`lib/heroes.ts`, série "Elementals") n'ont qu'une seule palette chacun — aucun art alternatif fourni dans `assets/MC`, aucune séparation peau/costume dans les fichiers source (`.aseprite` : 3 calques `bkg`/`base`/`effects`, pas de calque recolorable). Toute tenue doit donc être **générée par traitement d'image** à partir des frames idle existantes, pas peinte à la main.

Un recolor global (rotation de teinte HSL sur toute l'image) a été testé visuellement sur Fire Knight : seule la variante violette était à peu près acceptable, le reste teintait la peau et l'armure de façon indissociable. Un recolor masqué (ne retinter que les pixels saturés, épargnant contours noirs et hautes lumières) a ensuite été comparé — toujours jugé insuffisant sur Fire Knight par le porteur produit.

**Cause racine identifiée par analyse d'histogramme HSL** (pas une limite de l'algorithme) : certains héros ont une palette où peau et costume partagent la même bande de teinte (mono-palette), d'autres ont une vraie séparation. Le scope de cette US suit donc cette réalité plutôt que de viser une qualité uniforme impossible à obtenir sans repeindre les sprites à la main.

## 2. Décisions de cadrage (tranchées)

| # | Décision |
|---|----------|
| D1 | **Portée par héros, en 3 tiers de qualité/quantité** (§3), déterminés par l'histogramme de couleurs réel de chaque héros, pas par un a priori uniforme. |
| D2 | **Génération pré-bakée au build**, jamais de filtre CSS/SVG au runtime — mêmes garanties de rendu que les sprites actuels, zéro coût client. |
| D3 | **Déblocage à l'or**, même mécanique que les héros (US-18) : table `unlocked_skins` séparée, achat idempotent, jamais de DELETE (RG-04). |
| D4 | **Tenue par défaut jamais en base** : gratuite dès que le héros est possédé, réutilise les frames idle existantes telles quelles (aucun nouvel asset, aucune ligne `unlocked_skins`). |
| D5 | **`profiles.equipped_skin_id`** (nullable, `null` = défaut) en plus de `equipped_hero_id` existant. |
| D6 | **Bande tenues active seulement si le héros est possédé** — pas de personnalisation d'un héros non débloqué. |
| D7 | **Prix dérivé du héros** : `round(hero.price × 0.3, -1)`, pas de table de prix indépendante à maintenir. |
| D8 | **Aucun changement dans `IdleSprite.tsx`** — un helper calcule le bon `framePrefix`, le composant reste agnostique des tenues. |

### Baselines techniques (non négociables)

- **B1 — Calibration par héros, jamais générique.** Chaque héros a ses propres `hueMin`/`hueMax`/`minSat` de masquage (ou tint pour Tier C), choisis en regardant le rendu réel — pas une formule aveugle appliquée à tous.
- **B2 — Génération offline uniquement.** `scripts/generate-hero-skins.mjs`, jamais exécuté en requête utilisateur.
- **B3 — Catalogue statique** (`lib/hero-skins.ts`), la base ne stocke que possession + équipé (même philosophie que B2 du spec US-18).
- **B4 — Pas de DELETE/UPDATE** sur `unlocked_skins` (RG-04).

## 3. Portée par héros (tiers)

Déterminée par analyse d'histogramme HSL des frames idle (bucket 15°/0.25/0.25 sur teinte/saturation/luminosité).

| Tier | Héros | Technique | # tenues (dont défaut) |
|------|-------|-----------|------------------------|
| A — séparation nette | Water Priestess, Leaf Ranger, Crystal Mauler | Recolor masqué (hue-shift ciblé par bande de teinte) | 4 |
| B — mono-palette | Fire Knight, Ground Monk, Wind Hashashin | Recolor global accepté (masquage peu efficace, documenté comme limite d'art source) | 2 |
| C — quasi-neutre (métal) | Metal Bladekeeper | Overlay tint multiply (le hue-rotate ne fait presque rien sur du gris désaturé) | 3 |

Total : 21 tenues cataloguées, 14 achetables (7 défauts gratuits).

## 4. Génération technique (pipeline)

Nouveau script `scripts/generate-hero-skins.mjs`, à côté de `copy-hero-sprites.sh` / `generate-hero-portraits.mjs`. Lit les frames idle sources (`assets/MC/.../idle/*.png`), écrit vers `public/sprites/mc/<slug>/skins/<skin_id>/idle/frameNNNN.png` (même convention base 0 / 4 chiffres).

### Tier A/B — recolor masqué par bande de teinte

Pour chaque pixel (RGBA → HSL) :
```
si hueMin ≤ hue ≤ hueMax (ou hue hors [hueMax, hueMin] si la bande traverse 0°)
   ET saturation ≥ minSat
alors hue' = (hue + hueShift) mod 360, pixel recoloré
sinon pixel inchangé (octet identique)
```
Contours noirs, blancs/hautes lumières et teintes hors bande (typiquement la peau quand elle est séparable) restent identiques pixel pour pixel.

Calibration par héros (issue de l'histogramme, à re-vérifier visuellement en implémentation) :

| Héros | hueMin–hueMax (bande costume) | minSat | Tenues (hueShift) |
|-------|-------------------------------|--------|--------------------|
| Water Priestess | 180–255 | 0.35 | Crimson (+180), Verdant (vers 140°), Amethyst (vers 280°) |
| Leaf Ranger | 150–195 | 0.4 | Crimson, Amethyst (idem cibles) |
| Crystal Mauler | 165–240 | 0.3 | Ember, Verdant |
| Fire Knight | 0–60 | 0.35 (peu sélectif, mono-palette assumé) | Shadow Purple (+250) uniquement — seule variante jugée acceptable en revue visuelle |
| Ground Monk | 0–30 | 0.35 | 1 variante à calibrer en implémentation (même limite que Fire Knight) |
| Wind Hashashin | 15–45 | 0.35 | 1 variante à calibrer en implémentation |

### Tier C — overlay tint (Metal Bladekeeper)

Pixels `saturation < 0.15` (le gris métal dominant) : appliquer un overlay *multiply* avec une couleur cible, préserver les touches colorées existantes (accents rougeâtres repérés dans l'histogramme, `saturation ≥ 0.15`) inchangées.

| Tenue | Couleur multiply |
|-------|-------------------|
| Bronze | `#8a6a3a` |
| Acier sombre | `#3a3f47` |

### Sortie

- `skin_id="default"` ne génère rien : le helper de rendu (§6) pointe directement vers `idle/` existant.
- Chaque tenue alternative génère un jeu complet de frames idle (même `frameCount` que le héros, cf. `lib/heroes.ts`).

## 5. Modèle de données

### Nouvelle table `unlocked_skins`

Une ligne par `(user_id, hero_id, skin_id)`.

| Colonne | Type | Rôle |
|---------|------|------|
| `id` | uuid PK | |
| `user_id` | uuid FK profiles | |
| `hero_id` | text | référence catalogue |
| `skin_id` | text | référence catalogue |
| `price_paid` | int | prix figé à l'achat |
| `unlocked_at` | timestamptz | |

- **Unique** `(user_id, hero_id, skin_id)` → idempotence de l'achat.
- **RLS** : select / insert own. **Aucune policy UPDATE ni DELETE** (RG-04), même patron que `unlocked_heroes`.

### Modif `profiles`

- `equipped_skin_id text nullable` (default `null`). `null` = tenue par défaut du héros équipé.

### Catalogue statique (`lib/hero-skins.ts`)

```ts
interface Skin {
  id: string;        // ex "water_priestess_crimson"
  heroId: string;    // ref Hero.id
  name: string;
  price: number;     // 0 pour la tenue "default"
  isDefault: boolean;
  swatchColor: string; // hex, pour la puce dans l'Échoppe
}

export const SKINS: Skin[] = [
  // une entrée "default" par héros (price 0, isDefault true) +
  // une entrée par tenue alternative listée en §4
];

export function getSkinsForHero(heroId: string): Skin[];
export function getSkin(id: string): Skin | undefined;

// "default" toujours considéré possédé si le héros est possédé — pas de ligne
// unlocked_skins pour ce cas (D4).
export function isSkinOwned(skinId: string, heroId: string, ownedSkinIds: string[]): boolean;

export function skinPrice(heroPrice: number): number {
  return Math.round(heroPrice * 0.3 / 10) * 10;
}
```

## 6. Rendu

- `getHeroSpritePrefix(heroId, skinId)` dans `lib/hero-skins.ts` :
  ```ts
  function getHeroSpritePrefix(heroId: string, skinId: string | null): string {
    const hero = getHero(heroId);
    if (!skinId || skinId === defaultSkinIdFor(heroId)) return hero.idleFramePrefix;
    return `/sprites/mc/${hero.slug}/skins/${skinId}/idle/frame`;
  }
  ```
- `IdleSprite.tsx` **inchangé** — reçoit toujours `framePrefix`/`frameCount` calculés en amont.
- `Arena` / `VersusScene` reçoivent `equipped_skin_id` en plus de `equipped_hero_id`, passent le prefix calculé — même mécanique de swap live que US-18.
- Portraits Échoppe (`generate-hero-portraits.mjs`) : **inchangés**, la matrice de héros garde le portrait de base ; seule la bande tenues change avec la sélection.

## 7. UI Échoppe

Active la bande **« Tenues (bientôt) »** prévue dans `app/echoppe/page.tsx` (US-18 §4), sous le stage :

- **Swatch** = puce de couleur (`Skin.swatchColor`), pas de mini-sprite rendu (léger, net).
- États : couleur = possédée, grisé + `🪙 prix` = verrouillée, bord jaune = sélectionnée (preview stage), bord vert = équipée.
- Bande réagit au héros **actuellement sélectionné dans la matrice** (pas forcément l'équipé), cohérent avec le comportement preview existant.
- Héros verrouillé → bande entière grisée, tooltip « Débloque le héros d'abord » (D6).
- Achat : tap swatch verrouillée → modale de confirmation (« Débloquer la tenue <nom> pour <prix> or ? ») → server action → bande + solde rafraîchis.
- Équipement : tap swatch possédée non équipée → `profiles.equipped_skin_id` mis à jour → swap live stage + Arène au retour (revalidate).

### 3 états UI (règle projet n°3)

- **Loading** : squelette bande tenues (déjà couvert par le squelette Échoppe existant).
- **Error** : échec achat → message + retry, aucun débit fantôme (même patron que l'achat héros).
- **Empty** : héros sans tenue alternative encore calibrée (Ground Monk/Wind Hashashin en attente de calibration finale, §4) → bande affiche uniquement le défaut, pas de swatch verrouillée fantôme.

## 8. Découpage technique

### `lib/game-engine.ts` (modif — correction transverse)

`goldBalance` ne soustrayait jusqu'ici que `unlocked_heroes.price_paid` (US-18). Sans correction, une tenue achetée ne débiterait jamais le solde. Nouvelle signature :

```ts
export function goldBalance(
  dayResults: Pick<DayResult, "gold_earned">[],
  unlockedHeroes: Pick<UnlockedHero, "price_paid">[],
  unlockedSkins: Pick<UnlockedSkin, "price_paid">[],
): number {
  const earned = dayResults.reduce((sum, r) => sum + r.gold_earned, 0);
  const spentHeroes = unlockedHeroes.reduce((sum, h) => sum + h.price_paid, 0);
  const spentSkins = unlockedSkins.reduce((sum, s) => sum + s.price_paid, 0);
  return earned - spentHeroes - spentSkins;
}
```

Paramètre **requis** (pas de valeur par défaut) pour qu'un appelant qui l'omet échoue à la compilation plutôt que de calculer un solde faux. Trois call sites existants à mettre à jour : `app/actions/shop.ts` (`purchaseHero`), `app/echoppe/page.tsx`, `app/pantheon/page.tsx`.

### `scripts/generate-hero-skins.mjs`
- Génération offline (§4), lit `assets/MC/`, écrit `public/sprites/mc/<slug>/skins/<skin_id>/idle/`.

### `lib/hero-skins.ts`
- `SKINS`, `getSkinsForHero`, `getSkin`, `isSkinOwned`, `skinPrice`, `getHeroSpritePrefix` (§5, §6).

### `app/actions/shop.ts` (extension)
- `purchaseSkin(heroId, skinId)` — revérifie solde + possession du héros parent + idempotence, insert `unlocked_skins`, rafraîchit `profiles.gold` cache, revalidate.
- `equipSkin(heroId, skinId)` — vérifie possession (ou `isDefault`), set `profiles.equipped_skin_id`, revalidate `/` et `/echoppe`.

### Composants
- `app/echoppe/page.tsx` — bande tenues fonctionnelle (§7), fetch `unlocked_skins` en plus de `unlocked_heroes`.
- Câblage Arène : lire `equipped_skin_id` en plus de `equipped_hero_id` (§6).

### Écran de test interne (validation visuelle des tenues)

Même patron que `app/roster-preview-8f3a2c9d/page.tsx` (US roster de boss) : chemin obscur (`app/skins-preview-<hash>/page.tsx`), **login requis** (redirige sinon), `metadata.robots = { index: false, follow: false }`, jamais lié depuis l'UI utilisateur final. Sert à valider (ou invalider et recalibrer) chaque tenue générée avant merge.

- `components/shop/SkinsPreview.tsx` — pour chaque héros, affiche l'idle animé de **toutes ses tenues** (défaut + alternatives) côte à côte, avec l'id de tenue et le tier (A/B/C) affichés.
- Permet le même usage que `RosterPreview` : repérer visuellement une calibration `hueMin`/`hueMax`/`minSat`/`hueShift` (ou tint) à corriger avant de merger, sans repasser par l'Échoppe/l'achat.
- Généré à partir de `HEROES` + `SKINS` (catalogues statiques), pas de fetch Supabase nécessaire (pas de notion de possession ici, juste un aperçu brut des assets générés).

### Migrations Supabase
- `create_unlocked_skins.sql` (table + RLS, §5).
- `add_profile_equipped_skin.sql` (colonne `profiles.equipped_skin_id`).

### Docs (même commit)
- `CLAUDE.md` : nouveau piège « Tenues/skins des héros » (tiers par héros, technique recolor masqué vs global vs tint, table `unlocked_skins`, `equipped_skin_id`).
- `CHANGELOG.md` : ligne US-53 sous `[Unreleased]`.
- `SPECS_FONCTIONNELLES.md` : ajouter US-53 au registre.
- `ASSETS.md` : documenter le script `generate-hero-skins.mjs` et les chemins `public/sprites/mc/<slug>/skins/`.
- **Manuel du Dojo** (guide utilisateur, US-28) : nouvelle section tenues (feature visible utilisateur). Source = Notion → éditer la page Notion puis `npm run sync:guide` (régénère `content/guide.json`, committé). Si Notion non branché localement (`NOTION_TOKEN`/`NOTION_GUIDE_PAGE_ID` absents), éditer directement `content/guide.json` en respectant `lib/guide.ts` et en donnant un `section.id` stable (ex. `#tenues`) pour le deep-link.

## 9. Tests

### Vitest (pur)
- `isSkinOwned` : default toujours possédé si héros possédé, alternative nécessite ligne `unlocked_skins`.
- `skinPrice` : arrondi correct sur plusieurs prix de héros.
- `getHeroSpritePrefix` : default → chemin idle existant, alternative → chemin skins/.

### Playwright e2e (série, serveur prod — compte fixe ADR-04)
- `echoppe-skins.spec.ts` : bande grisée sur héros verrouillé ; achat tenue avec solde suffisant → possédée + solde décrémenté (vérif base : ligne `unlocked_skins`, aucun DELETE) ; achat solde insuffisant → refus ; équiper une tenue possédée → `equipped_skin_id` màj + swap Arène ; défaut jamais achetable (pas de swatch verrouillée pour "default").
- ⚠️ Même piège de pollution d'état que US-18 (compte e2e unique) — prévoir reset/fixture dédiée.

## 10. Hors scope (repoussé)

- **Masques peints à la main** (qualité maximale, tous héros) — nécessiterait un travail d'art par frame hors portée de ce spec ; réévaluer si un artiste rejoint le projet.
- **Tenues comme récompense de streak/niveau** (alternative au déblocage à l'or, évoquée dans `ASSETS.md`) — collision de mécanique de déblocage à trancher séparément si soulevée.
- **Portrait dédié par tenue** dans la matrice Échoppe — la matrice garde le portrait de base (cf. US-18 §10), seule la bande tenues distingue visuellement.
- Calibration fine définitive de Ground Monk / Wind Hashashin (Tier B) — valeurs de départ posées en §4, à confirmer visuellement en implémentation comme fait pour Fire Knight/Water Priestess durant ce brainstorming.

## 11. Vérification (fin d'implémentation)

1. `npm run test` (Vitest) vert, cas `isSkinOwned`/`skinPrice`/`getHeroSpritePrefix` inclus.
2. `npm run build` sans erreur (TS strict, zéro `any`).
3. `npm run lint` propre.
4. `npx playwright test` (série, prod) : specs existantes + `echoppe-skins.spec.ts` vertes en local.
5. Manuel : via `/skins-preview-<hash>` (§8), comparer visuellement chaque tenue générée à son héros de base, sur les 7 héros (contours/hautes lumières intacts sur Tier A, dégradation assumée documentée sur Tier B/C) avant de merger.
6. Base : `unlocked_skins` sans policy DELETE ; achat idempotent (re-tap = no-op) ; défaut jamais présent en base.
