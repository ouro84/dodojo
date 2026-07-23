# US-53 : Tenues / Skins des héros — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner à chaque héros 2 à 4 tenues (recolors) achetables à l'or dans l'Échoppe, générées offline à partir des sprites existants, avec un écran de test interne pour valider chaque tenue avant merge.

**Architecture:** Génération offline (script `sharp`, jamais au runtime) → catalogue statique (`lib/hero-skins.ts`) → possession en base (`unlocked_skins`, RG-04) → bande de swatches dans l'Échoppe existant (`app/echoppe/page.tsx` / `CharacterSelect.tsx`) → wiring de `equipped_skin_id` jusqu'à l'Arène.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + RLS), TypeScript strict, Vitest, Playwright, `sharp` (déjà une dépendance du projet via `scripts/generate-hero-portraits.mjs`).

## Global Constraints

- TypeScript strict partout dans `lib/`, `app/`, `components/` — jamais de `any`.
- Aucune suppression destructive : `unlocked_skins` n'a **aucune policy UPDATE ni DELETE** (RG-04).
- Tout algorithme de calcul de jeu/économie reste dans `lib/game-engine.ts` ou `lib/hero-skins.ts` (pur, testable sans UI).
- Tout écran doit gérer Loading / Error / Empty (déjà couvert par `app/echoppe/page.tsx` et `loading.tsx` existants — pas de nouvel écran plein pour cette US, seule la bande tenues s'y ajoute).
- Commits `type: description courte` (Conventional Commits) — un commit par étape "Commit" ci-dessous.
- `CHANGELOG.md` (sous `[Unreleased]`), `CLAUDE.md`, `SPECS_FONCTIONNELLES.md`, `ASSETS.md`, et le Manuel du Dojo (`content/guide.json`) doivent être mis à jour **dans les mêmes commits** que les changements qu'ils documentent (règle projet), pas après coup.
- Zéro merge/PR si `npm run test`, `npm run build`, `npm run lint` ou `npx playwright test` (série, prod) ne passent pas en local.
- Scripts d'assets (`scripts/*.mjs`) restent des outils offline autonomes (aucun import de `lib/*.ts` — convention déjà en place dans `copy-boss-sprites.mjs`/`generate-hero-portraits.mjs`, Node ne peut pas importer du TS sans loader dédié absent de ce projet). Leur logique n'est donc **pas** couverte par Vitest ; la validation se fait visuellement via l'écran `/skins-preview-*` (Task 11), comme `roster-preview-8f3a2c9d` le fait déjà pour les boss.

---

### Task 1: Migration `unlocked_skins`

**Files:**
- Create: `supabase/migrations/20260723090000_create_unlocked_skins.sql`

**Interfaces:**
- Consumes: rien (nouvelle table).
- Produces: table `public.unlocked_skins(id, user_id, hero_id, skin_id, price_paid, unlocked_at)`, unique `(user_id, hero_id, skin_id)`, RLS select/insert own, aucune policy update/delete.

- [ ] **Step 1: Écrire la migration**

```sql
-- US-53 : possession de tenues (recolors de héros). Achat = insert ; jamais
-- de DELETE ni UPDATE (RG-04). Miroir de unlocked_heroes (US-18).
create table public.unlocked_skins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  hero_id text not null,
  skin_id text not null,
  price_paid integer not null default 0,
  unlocked_at timestamptz not null default now(),
  unique (user_id, hero_id, skin_id)
);

create index unlocked_skins_user_idx on public.unlocked_skins (user_id);

alter table public.unlocked_skins enable row level security;

create policy "unlocked_skins_select_own"
  on public.unlocked_skins for select
  using (user_id = auth.uid());

create policy "unlocked_skins_insert_own"
  on public.unlocked_skins for insert
  with check (user_id = auth.uid());

-- Volontairement aucune policy UPDATE ni DELETE (RG-04).
```

- [ ] **Step 2: Appliquer la migration en local**

Run: `npx supabase db reset` (ou `npx supabase migration up` si une base locale existe déjà)
Expected: migration `20260723090000_create_unlocked_skins` listée comme appliquée, aucune erreur SQL.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260723090000_create_unlocked_skins.sql
git commit -m "feat: ajoute la table unlocked_skins (possession des tenues, US-53)"
```

---

### Task 2: Migration `profiles.equipped_skin_id`

**Files:**
- Create: `supabase/migrations/20260723090100_add_profile_equipped_skin.sql`

**Interfaces:**
- Consumes: table `profiles` existante.
- Produces: colonne `profiles.equipped_skin_id text nullable` (défaut `null` = tenue par défaut du héros équipé).

- [ ] **Step 1: Écrire la migration**

```sql
-- US-53 : tenue actuellement équipée (recolor du héros affiché dans l'Arène).
-- null = tenue par défaut (aucune ligne unlocked_skins nécessaire, D4 du spec).
alter table public.profiles
  add column equipped_skin_id text;
```

- [ ] **Step 2: Appliquer la migration en local**

Run: `npx supabase db reset`
Expected: colonne `equipped_skin_id` présente sur `profiles`, valeur `null` pour les profils existants.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260723090100_add_profile_equipped_skin.sql
git commit -m "feat: ajoute profiles.equipped_skin_id (US-53)"
```

---

### Task 3: Types partagés

**Files:**
- Modify: `types/index.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `interface Skin { id, heroId, name, price, isDefault, swatchColor }`, `interface UnlockedSkin { id, user_id, hero_id, skin_id, price_paid, unlocked_at }`, `Profile.equipped_skin_id: string | null`.

- [ ] **Step 1: Ajouter `equipped_skin_id` à `Profile`**

Dans `types/index.ts`, modifier l'interface existante :

```ts
export interface Profile {
  id: string;
  username: string;
  level: number;
  xp: number;
  gold: number;
  current_title: string;
  streak_days: number;
  best_streak: number;
  timezone: string;
  equipped_hero_id: string;
  equipped_skin_id: string | null;
  has_seen_tutorial: boolean;
  created_at: string;
}
```

- [ ] **Step 2: Ajouter les interfaces `Skin` et `UnlockedSkin`**

Ajouter à la suite de `UnlockedHero` dans `types/index.ts` :

```ts
export interface Skin {
  id: string; // ex "water_priestess_ember"
  heroId: string; // ref Hero.id
  name: string;
  price: number; // 0 pour la tenue "default"
  isDefault: boolean;
  swatchColor: string; // hex, puce dans l'Échoppe
}

export interface UnlockedSkin {
  id: string;
  user_id: string;
  hero_id: string;
  skin_id: string;
  price_paid: number;
  unlocked_at: string;
}
```

- [ ] **Step 3: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur (les nouveaux champs ne sont pas encore consommés, mais rien ne doit casser).

- [ ] **Step 4: Commit**

```bash
git add types/index.ts
git commit -m "feat: types Skin/UnlockedSkin et Profile.equipped_skin_id (US-53)"
```

---

### Task 4: Catalogue statique `lib/hero-skins.ts`

**Files:**
- Create: `lib/hero-skins.ts`
- Test: `lib/hero-skins.test.ts`

**Interfaces:**
- Consumes: `Hero`, `HEROES`, `getHero` de `lib/heroes.ts` ; `Skin` de `types/index.ts`.
- Produces: `SKINS: Skin[]`, `getSkinsForHero(heroId: string): Skin[]`, `getSkin(id: string): Skin | undefined`, `defaultSkinIdFor(heroId: string): string`, `skinPrice(heroPrice: number): number`, `isSkinOwned(skinId: string, heroId: string, ownedSkinIds: string[]): boolean`, `getHeroSpritePrefix(heroId: string, skinId: string | null): string`.

- [ ] **Step 1: Écrire les tests (TDD)**

Créer `lib/hero-skins.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import {
  SKINS,
  getSkinsForHero,
  getSkin,
  defaultSkinIdFor,
  skinPrice,
  isSkinOwned,
  getHeroSpritePrefix,
} from "./hero-skins";
import { HEROES } from "./heroes";

describe("hero-skins catalogue", () => {
  it("chaque héros a exactement une tenue default (price 0, isDefault)", () => {
    for (const hero of HEROES) {
      const skins = getSkinsForHero(hero.id);
      const defaults = skins.filter((s) => s.isDefault);
      expect(defaults).toHaveLength(1);
      expect(defaults[0].price).toBe(0);
      expect(defaults[0].id).toBe(defaultSkinIdFor(hero.id));
    }
  });

  it("Tier A (Water Priestess, Leaf Ranger, Crystal Mauler) a 4 tenues chacun", () => {
    for (const heroId of ["water_priestess", "leaf_ranger", "crystal_mauler"]) {
      expect(getSkinsForHero(heroId)).toHaveLength(4);
    }
  });

  it("Tier B (Fire Knight, Ground Monk, Wind Hashashin) a 2 tenues chacun", () => {
    for (const heroId of ["fire_knight", "ground_monk", "wind_hashashin"]) {
      expect(getSkinsForHero(heroId)).toHaveLength(2);
    }
  });

  it("Metal Bladekeeper (Tier C) a 3 tenues", () => {
    expect(getSkinsForHero("metal_bladekeeper")).toHaveLength(3);
  });

  it("ids uniques dans tout le catalogue", () => {
    expect(new Set(SKINS.map((s) => s.id)).size).toBe(SKINS.length);
  });

  it("getSkin retrouve par id, undefined sinon", () => {
    expect(getSkin("fire_knight_default")?.id).toBe("fire_knight_default");
    expect(getSkin("inconnu")).toBeUndefined();
  });

  it("skinPrice = 30% du prix du héros, arrondi à la dizaine", () => {
    expect(skinPrice(150)).toBe(50);
    expect(skinPrice(200)).toBe(60);
    expect(skinPrice(350)).toBe(110);
  });

  it("isSkinOwned : default toujours possédé, alternative nécessite la liste", () => {
    expect(isSkinOwned("fire_knight_default", "fire_knight", [])).toBe(true);
    expect(isSkinOwned("fire_knight_shadow_purple", "fire_knight", [])).toBe(false);
    expect(
      isSkinOwned("fire_knight_shadow_purple", "fire_knight", ["fire_knight_shadow_purple"]),
    ).toBe(true);
  });

  it("getHeroSpritePrefix : null/default -> chemin idle existant, sinon chemin skins/", () => {
    expect(getHeroSpritePrefix("fire_knight", null)).toBe(
      "/sprites/mc/fire-knight/idle/frame",
    );
    expect(getHeroSpritePrefix("fire_knight", "fire_knight_default")).toBe(
      "/sprites/mc/fire-knight/idle/frame",
    );
    expect(getHeroSpritePrefix("fire_knight", "fire_knight_shadow_purple")).toBe(
      "/sprites/mc/fire-knight/skins/fire_knight_shadow_purple/idle/frame",
    );
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npm run test -- hero-skins`
Expected: FAIL — `Cannot find module './hero-skins'`.

- [ ] **Step 3: Écrire l'implémentation**

Créer `lib/hero-skins.ts` :

```ts
import type { Skin } from "../types";
import { getHero } from "./heroes";

// US-53 : catalogue statique des tenues (recolors de héros). Source unique —
// la base ne stocke que la possession (unlocked_skins) et l'équipé
// (profiles.equipped_skin_id). Génération des sprites : scripts/generate-hero-skins.mjs.
export const SKINS: Skin[] = [
  // Fire Knight (Tier B — mono-palette, recolor global accepté)
  { id: "fire_knight_default", heroId: "fire_knight", name: "Défaut", price: 0, isDefault: true, swatchColor: "#c0392b" },
  { id: "fire_knight_shadow_purple", heroId: "fire_knight", name: "Shadow Purple", price: 50, isDefault: false, swatchColor: "#5b2c8f" },

  // Ground Monk (Tier B)
  { id: "ground_monk_default", heroId: "ground_monk", name: "Défaut", price: 0, isDefault: true, swatchColor: "#8a6a3a" },
  { id: "ground_monk_verdant", heroId: "ground_monk", name: "Verdant", price: 60, isDefault: false, swatchColor: "#27ae60" },

  // Wind Hashashin (Tier B)
  { id: "wind_hashashin_default", heroId: "wind_hashashin", name: "Défaut", price: 0, isDefault: true, swatchColor: "#c9a15a" },
  { id: "wind_hashashin_azure", heroId: "wind_hashashin", name: "Azure", price: 90, isDefault: false, swatchColor: "#2980b9" },

  // Water Priestess (Tier A — séparation costume/peau nette)
  { id: "water_priestess_default", heroId: "water_priestess", name: "Défaut", price: 0, isDefault: true, swatchColor: "#2980b9" },
  { id: "water_priestess_ember", heroId: "water_priestess", name: "Ember", price: 60, isDefault: false, swatchColor: "#c0392b" },
  { id: "water_priestess_verdant", heroId: "water_priestess", name: "Verdant", price: 60, isDefault: false, swatchColor: "#27ae60" },
  { id: "water_priestess_amethyst", heroId: "water_priestess", name: "Amethyst", price: 60, isDefault: false, swatchColor: "#8e44ad" },

  // Leaf Ranger (Tier A)
  { id: "leaf_ranger_default", heroId: "leaf_ranger", name: "Défaut", price: 0, isDefault: true, swatchColor: "#16a085" },
  { id: "leaf_ranger_ember", heroId: "leaf_ranger", name: "Ember", price: 90, isDefault: false, swatchColor: "#c0392b" },
  { id: "leaf_ranger_verdant", heroId: "leaf_ranger", name: "Verdant", price: 90, isDefault: false, swatchColor: "#27ae60" },
  { id: "leaf_ranger_amethyst", heroId: "leaf_ranger", name: "Amethyst", price: 90, isDefault: false, swatchColor: "#8e44ad" },

  // Crystal Mauler (Tier A)
  { id: "crystal_mauler_default", heroId: "crystal_mauler", name: "Défaut", price: 0, isDefault: true, swatchColor: "#34495e" },
  { id: "crystal_mauler_ember", heroId: "crystal_mauler", name: "Ember", price: 110, isDefault: false, swatchColor: "#c0392b" },
  { id: "crystal_mauler_verdant", heroId: "crystal_mauler", name: "Verdant", price: 110, isDefault: false, swatchColor: "#27ae60" },
  { id: "crystal_mauler_amethyst", heroId: "crystal_mauler", name: "Amethyst", price: 110, isDefault: false, swatchColor: "#8e44ad" },

  // Metal Bladekeeper (Tier C — overlay tint, pas de hue-rotate)
  { id: "metal_bladekeeper_default", heroId: "metal_bladekeeper", name: "Défaut", price: 0, isDefault: true, swatchColor: "#7f8c8d" },
  { id: "metal_bladekeeper_bronze", heroId: "metal_bladekeeper", name: "Bronze", price: 110, isDefault: false, swatchColor: "#8a6a3a" },
  { id: "metal_bladekeeper_dark_steel", heroId: "metal_bladekeeper", name: "Acier sombre", price: 110, isDefault: false, swatchColor: "#3a3f47" },
];

export function getSkinsForHero(heroId: string): Skin[] {
  return SKINS.filter((s) => s.heroId === heroId);
}

export function getSkin(id: string): Skin | undefined {
  return SKINS.find((s) => s.id === id);
}

export function defaultSkinIdFor(heroId: string): string {
  return `${heroId}_default`;
}

export function skinPrice(heroPrice: number): number {
  return Math.round((heroPrice * 0.3) / 10) * 10;
}

// US-53 : la tenue "default" est toujours possédée dès que le héros l'est
// (aucune ligne unlocked_skins pour ce cas — D4 du spec). Une alternative
// nécessite une ligne dans la liste passée par l'appelant.
export function isSkinOwned(
  skinId: string,
  heroId: string,
  ownedSkinIds: string[],
): boolean {
  if (skinId === defaultSkinIdFor(heroId)) return true;
  return ownedSkinIds.includes(skinId);
}

export function getHeroSpritePrefix(
  heroId: string,
  skinId: string | null,
): string {
  const hero = getHero(heroId);
  if (!hero) throw new Error(`Héros inconnu : ${heroId}`);
  if (!skinId || skinId === defaultSkinIdFor(heroId)) return hero.idleFramePrefix;
  return `/sprites/mc/${hero.slug}/skins/${skinId}/idle/frame`;
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npm run test -- hero-skins`
Expected: PASS (9 tests verts).

- [ ] **Step 5: Commit**

```bash
git add lib/hero-skins.ts lib/hero-skins.test.ts
git commit -m "feat: catalogue statique des tenues lib/hero-skins.ts (US-53)"
```

---

### Task 5: `goldBalance` doit soustraire aussi les tenues

**Files:**
- Modify: `lib/game-engine.ts:259-266`
- Modify: `lib/game-engine.test.ts:79,83,86`
- Modify: `app/actions/shop.ts:38`
- Modify: `app/echoppe/page.tsx:24,40`
- Modify: `app/pantheon/page.tsx:36-39,63`

**Interfaces:**
- Consumes: `UnlockedSkin` de `types/index.ts` (Task 3).
- Produces: `goldBalance(dayResults, unlockedHeroes, unlockedSkins): number` (signature étendue, 3e paramètre requis).

- [ ] **Step 1: Mettre à jour les tests existants pour refléter la nouvelle signature**

Dans `lib/game-engine.test.ts`, remplacer les 3 appels existants (lignes ~79, 83, 86) :

```ts
  it("goldBalance = gains cumulés - achats cumulés (héros + tenues)", () => {
    expect(
      goldBalance(
        [{ gold_earned: 50 }, { gold_earned: 60 }],
        [{ price_paid: 40 }],
        [{ price_paid: 20 }],
      ),
    ).toBe(50);
  });

  it("goldBalance = 0 sans historique", () => {
    expect(goldBalance([], [], [])).toBe(0);
  });

  it("goldBalance ignore les achats à 0 (héros/tenue par défaut)", () => {
    expect(
      goldBalance([{ gold_earned: 50 }], [{ price_paid: 0 }], [{ price_paid: 0 }]),
    ).toBe(50);
  });
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npm run test -- game-engine`
Expected: FAIL — `goldBalance` n'accepte que 2 arguments, le 3e est ignoré, les totaux ne correspondent plus (50 attendu vs 70 calculé sans la déduction skins).

- [ ] **Step 3: Modifier `goldBalance`**

Dans `lib/game-engine.ts:259-266`, remplacer :

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

Et ajouter `UnlockedSkin` à l'import de types en tête de fichier (à côté de l'import existant de `UnlockedHero`).

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npm run test -- game-engine`
Expected: PASS.

- [ ] **Step 5: Mettre à jour les 3 call sites**

`app/actions/shop.ts:38` — après avoir ajouté le fetch `unlocked_skins` (fait en Task 7), mais pour l'instant passer un tableau vide en attendant :

```ts
  const balance = goldBalance(results ?? [], owned ?? [], []);
```

`app/echoppe/page.tsx:24,40` — ajouter le fetch et passer le résultat (le fetch complet des tenues possédées arrive en Task 9 ; pour cette étape, fetch minimal `price_paid` suffisant pour le solde) :

```ts
    supabase.from("unlocked_skins").select("price_paid").eq("user_id", user.id),
```

à ajouter au `Promise.all` existant (après la ligne `unlocked_heroes`), puis :

```ts
  const balance = goldBalance(results ?? [], owned ?? [], ownedSkinsForBalance ?? []);
```

(renommer la variable déstructurée du 4e élément du tableau, ex. `{ data: ownedSkinsForBalance }`).

`app/pantheon/page.tsx:36-39,63` — ajouter le fetch et l'argument :

```ts
  const { data: unlockedSkins } = await supabase
    .from("unlocked_skins")
    .select("price_paid")
    .eq("user_id", user.id);
```

```ts
  const balance = goldBalance(results, unlockedHeroes ?? [], unlockedSkins ?? []);
```

- [ ] **Step 6: Vérifier la compilation et le build**

Run: `npx tsc --noEmit && npm run build`
Expected: aucune erreur.

- [ ] **Step 7: Commit**

```bash
git add lib/game-engine.ts lib/game-engine.test.ts app/actions/shop.ts app/echoppe/page.tsx app/pantheon/page.tsx
git commit -m "fix: goldBalance déduit aussi les tenues achetées (US-53)"
```

---

### Task 6: Génération des sprites de tenues

**Files:**
- Create: `scripts/generate-hero-skins.mjs`

**Interfaces:**
- Consumes: `public/sprites/mc/<slug>/idle/frameNNNN.png` (déjà extraits par `copy-hero-sprites.sh`).
- Produces: `public/sprites/mc/<slug>/skins/<skin_id>/idle/frameNNNN.png` pour chaque tenue non-default listée dans `lib/hero-skins.ts`.

- [ ] **Step 1: Écrire le script**

Créer `scripts/generate-hero-skins.mjs` :

```js
// US-53 : génère les frames idle de chaque tenue (recolor) à partir des
// frames idle déjà extraites par copy-hero-sprites.sh. Jamais exécuté au
// runtime — offline uniquement. Usage : node scripts/generate-hero-skins.mjs
import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r: h = ((g - b) / d) % 6; break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s, l];
}

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

// Recolor masqué (Tier A/B) : ne retinte que les pixels dans la bande de
// teinte du costume, au-delà du seuil de saturation. Le reste (contours,
// hautes lumières, peau quand séparable) reste inchangé pixel pour pixel.
async function maskedRecolor(src, out, { hueMin, hueMax, minSat, hueShift }) {
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a < 10) continue;
    const [h, s, l] = rgbToHsl(r, g, b);
    if (s < minSat) continue;
    const inBand = hueMin <= hueMax ? h >= hueMin && h <= hueMax : h >= hueMin || h <= hueMax;
    if (!inBand) continue;
    const [nr, ng, nb] = hslToRgb((h + hueShift + 360) % 360, s, l);
    data[i] = nr; data[i + 1] = ng; data[i + 2] = nb;
  }
  await sharp(data, { raw: { width, height, channels } }).png().toFile(out);
}

// Overlay tint multiply (Tier C) : ne retinte que les pixels quasi neutres
// (gris métal), préserve les accents colorés existants.
async function tintRecolor(src, out, { maxSat, tint }) {
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const [tr, tg, tb] = tint;
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a < 10) continue;
    const [, s] = rgbToHsl(r, g, b);
    if (s >= maxSat) continue;
    data[i] = Math.round((r * tr) / 255);
    data[i + 1] = Math.round((g * tg) / 255);
    data[i + 2] = Math.round((b * tb) / 255);
  }
  await sharp(data, { raw: { width, height, channels } }).png().toFile(out);
}

// Calibration par héros — cf. docs/superpowers/specs/2026-07-23-us53-tenues-skins-design.md §4.
const PLAN = [
  {
    slug: "fire-knight", frameCount: 8,
    band: { hueMin: 0, hueMax: 60, minSat: 0.35 },
    skins: [{ id: "fire_knight_shadow_purple", hueShift: 250 }],
  },
  {
    slug: "ground-monk", frameCount: 6,
    band: { hueMin: 0, hueMax: 30, minSat: 0.35 },
    skins: [{ id: "ground_monk_verdant", hueShift: 125 }],
  },
  {
    slug: "wind-hashashin", frameCount: 8,
    band: { hueMin: 15, hueMax: 45, minSat: 0.35 },
    skins: [{ id: "wind_hashashin_azure", hueShift: 180 }],
  },
  {
    slug: "water-priestess", frameCount: 8,
    band: { hueMin: 180, hueMax: 255, minSat: 0.35 },
    skins: [
      { id: "water_priestess_ember", hueShift: 150 },
      { id: "water_priestess_verdant", hueShift: 275 },
      { id: "water_priestess_amethyst", hueShift: 55 },
    ],
  },
  {
    slug: "leaf-ranger", frameCount: 12,
    band: { hueMin: 150, hueMax: 195, minSat: 0.4 },
    skins: [
      { id: "leaf_ranger_ember", hueShift: 190 },
      { id: "leaf_ranger_verdant", hueShift: 315 },
      { id: "leaf_ranger_amethyst", hueShift: 95 },
    ],
  },
  {
    slug: "crystal-mauler", frameCount: 8,
    band: { hueMin: 165, hueMax: 240, minSat: 0.3 },
    skins: [
      { id: "crystal_mauler_ember", hueShift: 170 },
      { id: "crystal_mauler_verdant", hueShift: 295 },
      { id: "crystal_mauler_amethyst", hueShift: 75 },
    ],
  },
  {
    slug: "metal-bladekeeper", frameCount: 8,
    tint: { maxSat: 0.15 },
    skins: [
      { id: "metal_bladekeeper_bronze", color: [138, 106, 58] },
      { id: "metal_bladekeeper_dark_steel", color: [58, 63, 71] },
    ],
  },
];

for (const hero of PLAN) {
  for (const skin of hero.skins) {
    const outDir = `public/sprites/mc/${hero.slug}/skins/${skin.id}/idle`;
    await fs.mkdir(outDir, { recursive: true });
    for (let i = 0; i < hero.frameCount; i++) {
      const frame = String(i).padStart(4, "0");
      const src = `public/sprites/mc/${hero.slug}/idle/frame${frame}.png`;
      const out = path.join(outDir, `frame${frame}.png`);
      if (hero.tint) {
        await tintRecolor(src, out, { maxSat: hero.tint.maxSat, tint: skin.color });
      } else {
        await maskedRecolor(src, out, { ...hero.band, hueShift: skin.hueShift });
      }
    }
    console.log(`${hero.slug} -> ${skin.id} : ${hero.frameCount} frames`);
  }
}
```

- [ ] **Step 2: Exécuter le script**

Run: `node scripts/generate-hero-skins.mjs`
Expected: une ligne de log par tenue générée (14 lignes — cf. §3 du spec, 21 tenues cataloguées − 7 défauts = 14 tenues alternatives), aucune erreur.

- [ ] **Step 3: Vérifier visuellement le nombre de fichiers générés**

Run: `find public/sprites/mc -path "*/skins/*/idle/*.png" | wc -l`
Expected : `122` — somme de `frameCount × nb_tenues_alternatives` par héros : fire-knight 1×8=8, ground-monk 1×6=6, wind-hashashin 1×8=8, water-priestess 3×8=24, leaf-ranger 3×12=36, crystal-mauler 3×8=24, metal-bladekeeper 2×8=16 → 8+6+8+24+36+24+16=122.

- [ ] **Step 4: Commit**

```bash
git add scripts/generate-hero-skins.mjs public/sprites/mc/*/skins
git commit -m "feat: génère les sprites de tenues (recolor/tint) via sharp (US-53)"
```

---

### Task 7: Écran de test interne `/skins-preview-*`

**Files:**
- Create: `components/shop/SkinsPreview.tsx`
- Create: `app/skins-preview-4c7a1e9b/page.tsx`

**Interfaces:**
- Consumes: `HEROES` (`lib/heroes.ts`), `SKINS`/`getSkinsForHero`/`getHeroSpritePrefix` (`lib/hero-skins.ts`), `IdleSprite` (`components/combat/IdleSprite.tsx`).
- Produces: page `/skins-preview-4c7a1e9b` (login requis, `noindex`, jamais liée dans l'UI).

Sert à valider visuellement les sprites générés en Task 6 **avant** de câbler l'Échoppe (Task 8-9) — si une calibration déçoit, on ajuste `scripts/generate-hero-skins.mjs` et on relance Task 6 sans toucher au reste.

- [ ] **Step 1: Écrire le composant**

Créer `components/shop/SkinsPreview.tsx` :

```tsx
"use client";

import type { Hero } from "@/types";
import { getSkinsForHero, getHeroSpritePrefix } from "@/lib/hero-skins";
import IdleSprite from "@/components/combat/IdleSprite";

// Écran de test interne (chemin obscur, login requis, non listé). Affiche
// toutes les tenues de tous les héros côte à côte pour valider (ou recalibrer)
// scripts/generate-hero-skins.mjs avant de merger. Même patron que RosterPreview.
export default function SkinsPreview({ heroes }: { heroes: Hero[] }) {
  return (
    <div className="flex flex-col gap-8">
      {heroes.map((hero) => {
        const skins = getSkinsForHero(hero.id);
        return (
          <section key={hero.id} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-display text-sm text-ink">{hero.name}</span>
              <span className="text-[10px] text-faint">
                {hero.id} · {skins.length} tenues
              </span>
            </div>
            <div className="flex flex-wrap gap-3">
              {skins.map((skin) => (
                <div
                  key={skin.id}
                  className="flex flex-col items-center gap-1 rounded border border-border bg-black/40 p-2"
                >
                  <IdleSprite
                    framePrefix={getHeroSpritePrefix(hero.id, skin.id)}
                    frameCount={hero.idleFrameCount}
                    alt={`${hero.name} — ${skin.name}`}
                    className="h-24 w-auto [image-rendering:pixelated]"
                  />
                  <span className="text-[10px] text-muted">{skin.name}</span>
                  <span className="text-[9px] text-faint">
                    {skin.id} · 🪙 {skin.price}
                  </span>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Écrire la page**

Créer `app/skins-preview-4c7a1e9b/page.tsx` :

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { HEROES } from "@/lib/heroes";
import SkinsPreview from "@/components/shop/SkinsPreview";

// Écran de test INTERNE des tenues de héros (US-53).
// - Chemin volontairement obscur et non listé dans la navigation.
// - Login requis (redirige sinon) → inaccessible à un visiteur anonyme.
// - Ne doit jamais être lié depuis l'UI utilisateur final.
export const metadata = { robots: { index: false, follow: false } };

export default async function SkinsPreviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-6">
      <h1 className="text-center font-display text-lg uppercase tracking-wide text-ink">
        Tenues — test interne
      </h1>
      <SkinsPreview heroes={HEROES} />
    </main>
  );
}
```

- [ ] **Step 3: Vérifier manuellement dans le navigateur**

Run: `npm run dev`, ouvrir `http://localhost:3000/skins-preview-4c7a1e9b` (connecté).
Expected : les 7 héros affichés, chacun avec ses tenues (défaut inclus) animées en idle. Comparer visuellement chaque tenue Tier A/B à son héros de base (contours/hautes lumières intacts) et chaque tenue Tier C (Metal Bladekeeper) à sa version grise d'origine. Si une tenue déçoit, ajuster la calibration correspondante dans `scripts/generate-hero-skins.mjs` (Task 6) et relancer le script avant de continuer.

- [ ] **Step 4: Commit**

```bash
git add components/shop/SkinsPreview.tsx app/skins-preview-4c7a1e9b/page.tsx
git commit -m "feat: écran de test interne /skins-preview pour valider les tenues (US-53)"
```

---

### Task 8: Server actions `purchaseSkin` / `equipSkin`

**Files:**
- Modify: `app/actions/shop.ts`

**Interfaces:**
- Consumes: `getSkin`, `isSkinOwned`, `defaultSkinIdFor` (`lib/hero-skins.ts`), `getHero`, `isHeroOwned` (`lib/heroes.ts`), `goldBalance` (`lib/game-engine.ts`, Task 5).
- Produces: `purchaseSkin(heroId: string, skinId: string): Promise<ShopActionResult>`, `equipSkin(heroId: string, skinId: string): Promise<ShopActionResult>`.

- [ ] **Step 1: Ajouter les deux actions**

À la fin de `app/actions/shop.ts`, après `equipHero` :

```ts
import { getSkin, isSkinOwned } from "@/lib/hero-skins";

// US-53 : achat autoritaire côté serveur. Idempotent, refus si solde
// insuffisant ou héros parent non possédé (D6 du spec). Jamais de DELETE.
export async function purchaseSkin(
  heroId: string,
  skinId: string,
): Promise<ShopActionResult> {
  const skin = getSkin(skinId);
  if (!skin || skin.heroId !== heroId) return { error: "Cette tenue n'existe pas." };
  if (skin.isDefault) return { error: null };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const [{ data: ownedHeroes }, { data: ownedSkins }] = await Promise.all([
    supabase.from("unlocked_heroes").select("hero_id, price_paid").eq("user_id", user.id),
    supabase.from("unlocked_skins").select("hero_id, skin_id, price_paid").eq("user_id", user.id),
  ]);
  const ownedHeroIds = (ownedHeroes ?? []).map((r) => r.hero_id);
  if (!isHeroOwned(heroId, ownedHeroIds)) {
    return { error: "Débloque ce combattant avant d'acheter une tenue." };
  }

  const ownedSkinIds = (ownedSkins ?? []).map((r) => r.skin_id);
  if (isSkinOwned(skinId, heroId, ownedSkinIds)) return { error: null };

  const { data: results } = await supabase
    .from("day_results")
    .select("gold_earned")
    .eq("user_id", user.id);

  const balance = goldBalance(results ?? [], ownedHeroes ?? [], ownedSkins ?? []);
  if (balance < skin.price) {
    return { error: "Pas assez d'or, champion. Va terrasser des Boss." };
  }

  const { error } = await supabase.from("unlocked_skins").insert({
    user_id: user.id,
    hero_id: heroId,
    skin_id: skinId,
    price_paid: skin.price,
  });
  if (error && error.code !== "23505") {
    return { error: "L'achat a échoué. Réessaie." };
  }

  await supabase
    .from("profiles")
    .update({ gold: balance - skin.price })
    .eq("id", user.id);

  revalidatePath("/echoppe");
  revalidatePath("/");
  return { error: null };
}

// US-53 : équipe une tenue possédée (ou la default, toujours possédée).
export async function equipSkin(
  heroId: string,
  skinId: string,
): Promise<ShopActionResult> {
  const skin = getSkin(skinId);
  if (!skin || skin.heroId !== heroId) return { error: "Cette tenue n'existe pas." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  if (!skin.isDefault) {
    const { data: ownedSkins } = await supabase
      .from("unlocked_skins")
      .select("skin_id")
      .eq("user_id", user.id);
    const ownedSkinIds = (ownedSkins ?? []).map((r) => r.skin_id);
    if (!isSkinOwned(skinId, heroId, ownedSkinIds)) {
      return { error: "Débloque cette tenue avant de l'équiper." };
    }
  }

  const equippedSkinId = skin.isDefault ? null : skinId;
  const { error } = await supabase
    .from("profiles")
    .update({ equipped_skin_id: equippedSkinId })
    .eq("id", user.id);
  if (error) return { error: "Impossible d'équiper cette tenue. Réessaie." };

  revalidatePath("/echoppe");
  revalidatePath("/");
  return { error: null };
}
```

- [ ] **Step 2: Vérifier la compilation**

Run: `npx tsc --noEmit && npm run lint`
Expected: aucune erreur, aucun import inutilisé.

- [ ] **Step 3: Commit**

```bash
git add app/actions/shop.ts
git commit -m "feat: server actions purchaseSkin/equipSkin (US-53)"
```

---

### Task 9: Bande tenues dans l'Échoppe

**Files:**
- Modify: `components/combat/HeroIdle.tsx`
- Modify: `components/shop/CharacterSelect.tsx`
- Modify: `app/echoppe/page.tsx`

**Interfaces:**
- Consumes: `getSkinsForHero`, `isSkinOwned`, `defaultSkinIdFor`, `getHeroSpritePrefix` (`lib/hero-skins.ts`), `purchaseSkin`, `equipSkin` (`app/actions/shop.ts`, Task 8).
- Produces: bande de swatches fonctionnelle sous le stage de `CharacterSelect`, gating sur possession du héros (D6).

- [ ] **Step 1: Étendre `HeroIdle` pour accepter une tenue**

Modifier `components/combat/HeroIdle.tsx` :

```tsx
import IdleSprite from "./IdleSprite";
import type { Hero } from "@/types";
import { getHeroSpritePrefix } from "@/lib/hero-skins";

// US-18/US-53 : rend l'idle d'un héros (et éventuellement d'une tenue) en
// réutilisant IdleSprite. Verrouillé = filtre grayscale sur le wrapper.
export default function HeroIdle({
  hero,
  skinId = null,
  locked = false,
  className,
}: {
  hero: Hero;
  skinId?: string | null;
  locked?: boolean;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={locked ? { filter: "grayscale(1) brightness(0.4)" } : undefined}
      data-hero={hero.id}
      data-locked={locked}
    >
      <IdleSprite
        framePrefix={getHeroSpritePrefix(hero.id, skinId)}
        frameCount={hero.idleFrameCount}
        alt={locked ? `${hero.name} (verrouillé)` : hero.name}
        className="h-full w-auto [image-rendering:pixelated]"
      />
    </div>
  );
}
```

- [ ] **Step 2: Étendre `CharacterSelect` avec la bande tenues**

Dans `components/shop/CharacterSelect.tsx`, remplacer l'import et la signature de props :

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { HEROES, getHero, isHeroOwned, DEFAULT_HERO_ID } from "@/lib/heroes";
import { getSkinsForHero, isSkinOwned, defaultSkinIdFor } from "@/lib/hero-skins";
import {
  equipHero,
  purchaseHero,
  equipSkin,
  purchaseSkin,
} from "@/app/actions/shop";
import HeroIdle from "@/components/combat/HeroIdle";

export function CharacterSelect({
  ownedIds,
  equippedId,
  ownedSkinIds,
  equippedSkinId,
  balance,
}: {
  ownedIds: string[];
  equippedId: string;
  ownedSkinIds: string[];
  equippedSkinId: string | null;
  balance: number;
}) {
  const [selectedId, setSelectedId] = useState(equippedId);
  const [selectedSkinId, setSelectedSkinId] = useState(
    () => equippedSkinId ?? defaultSkinIdFor(equippedId),
  );
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmSkin, setConfirmSkin] = useState<{ heroId: string; skinId: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selected = getHero(selectedId) ?? getHero(DEFAULT_HERO_ID)!;
  const owned = isHeroOwned(selected.id, ownedIds);
  const equipped = selected.id === equippedId;
  const affordable = balance >= selected.price;

  // Quand la sélection de héros change, réinitialise la tenue prévisualisée :
  // l'équipée s'il s'agit du héros actif, sinon sa tenue par défaut.
  useEffect(() => {
    setSelectedSkinId(
      selected.id === equippedId
        ? (equippedSkinId ?? defaultSkinIdFor(selected.id))
        : defaultSkinIdFor(selected.id),
    );
  }, [selected.id, equippedId, equippedSkinId]);

  function onAction() {
    setError(null);
    if (equipped) return;
    if (owned) {
      startTransition(async () => {
        const res = await equipHero(selected.id);
        if (res.error) setError(res.error);
      });
    } else if (affordable) {
      setConfirmId(selected.id);
    }
  }

  function confirmPurchase() {
    const id = confirmId;
    setConfirmId(null);
    if (!id) return;
    startTransition(async () => {
      const res = await purchaseHero(id);
      if (res.error) setError(res.error);
    });
  }

  function onSkinAction(skinId: string) {
    setError(null);
    if (!owned) return;
    const skinOwned = isSkinOwned(skinId, selected.id, ownedSkinIds);
    const isEquippedSkin =
      selected.id === equippedId && (equippedSkinId ?? defaultSkinIdFor(selected.id)) === skinId;
    if (isEquippedSkin) return;
    if (skinOwned) {
      startTransition(async () => {
        const res = await equipSkin(selected.id, skinId);
        if (res.error) setError(res.error);
      });
      return;
    }
    const skin = getSkinsForHero(selected.id).find((s) => s.id === skinId);
    if (skin && balance >= skin.price) {
      setConfirmSkin({ heroId: selected.id, skinId });
    }
  }

  function confirmSkinPurchase() {
    const target = confirmSkin;
    setConfirmSkin(null);
    if (!target) return;
    startTransition(async () => {
      const res = await purchaseSkin(target.heroId, target.skinId);
      if (res.error) setError(res.error);
    });
  }

  return (
    <div data-testid="character-select" className="flex w-full flex-col gap-4">
      <div className="flex items-center justify-between font-display text-xs uppercase tracking-wide text-ink">
        <span>⚔️ Choisis ton combattant</span>
        <span data-testid="gold-balance" className="text-gold">
          🪙 {balance}
        </span>
      </div>

      {/* Stage */}
      <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-black/40 p-4">
        <HeroIdle hero={selected} skinId={selectedSkinId} locked={!owned} className="h-28" />
        <div className="font-display text-sm uppercase tracking-wide text-ink">
          {selected.name}
        </div>
        <div className="text-xs text-muted">Élément : {selected.element}</div>
        {error && (
          <p role="alert" className="text-xs text-hp">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={onAction}
          disabled={pending || equipped || (!owned && !affordable)}
          className="mt-1 rounded border border-border px-4 py-2 font-display text-xs uppercase tracking-wide text-ink disabled:opacity-50"
        >
          {equipped
            ? "✓ Équipé"
            : owned
              ? "Équiper"
              : affordable
                ? `🪙 ${selected.price} · Débloquer`
                : `🪙 ${selected.price}`}
        </button>
      </div>

      {/* Bande tenues (US-53) — active seulement si le héros est possédé (D6) */}
      <div
        className="flex flex-wrap justify-center gap-1.5"
        aria-disabled={!owned}
        title={owned ? undefined : "Débloque le héros d'abord"}
      >
        {getSkinsForHero(selected.id).map((skin) => {
          const skinOwned = isSkinOwned(skin.id, selected.id, ownedSkinIds);
          const isEquippedSkin =
            selected.id === equippedId &&
            (equippedSkinId ?? defaultSkinIdFor(selected.id)) === skin.id;
          const isSelectedSkin = skin.id === selectedSkinId;
          return (
            <button
              key={skin.id}
              type="button"
              data-skin-swatch={skin.id}
              data-owned={skinOwned}
              aria-pressed={isSelectedSkin}
              aria-label={skin.name}
              disabled={!owned}
              onClick={() => {
                setSelectedSkinId(skin.id);
                onSkinAction(skin.id);
              }}
              className={`h-6 w-6 rounded-full border-2 disabled:opacity-40 ${
                isEquippedSkin ? "border-xp" : isSelectedSkin ? "border-gold" : "border-border"
              }`}
              style={{
                backgroundColor: skin.swatchColor,
                filter: owned && !skinOwned ? "grayscale(1) brightness(0.5)" : undefined,
              }}
            />
          );
        })}
      </div>

      {/* Matrice */}
      <div className="mx-auto flex max-w-[240px] flex-wrap justify-center gap-1.5">
        {HEROES.map((h) => {
          const hOwned = isHeroOwned(h.id, ownedIds);
          const isSelected = h.id === selectedId;
          const isEquipped = h.id === equippedId;
          return (
            <button
              key={h.id}
              type="button"
              data-hero-cell={h.id}
              data-owned={hOwned}
              aria-pressed={isSelected}
              aria-label={h.name}
              onClick={() => {
                setSelectedId(h.id);
                setError(null);
              }}
              className={`h-11 w-11 overflow-hidden rounded border-2 bg-black/40 ${
                isEquipped
                  ? "border-xp"
                  : isSelected
                    ? "border-gold"
                    : "border-border"
              }`}
              style={hOwned ? undefined : { filter: "grayscale(1) brightness(0.4)" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- mini-portrait pixel, next/image inutile */}
              <img
                src={`/sprites/mc/${h.slug}/portrait.png`}
                alt=""
                className="h-full w-full object-contain p-0.5 [image-rendering:pixelated]"
              />
            </button>
          );
        })}
      </div>

      {/* Modale de confirmation héros */}
      {confirmId && (
        <div
          role="dialog"
          aria-label="Confirmer l'achat"
          className="flex flex-col items-center gap-2 rounded-lg border border-border bg-black/60 p-4 text-center"
        >
          <p className="text-sm text-ink">
            Débloquer {getHero(confirmId)?.name} pour {getHero(confirmId)?.price} or ?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={confirmPurchase}
              className="rounded border border-border px-3 py-1.5 font-display text-xs uppercase text-gold"
            >
              Confirmer
            </button>
            <button
              type="button"
              onClick={() => setConfirmId(null)}
              className="rounded border border-border px-3 py-1.5 font-display text-xs uppercase text-muted"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Modale de confirmation tenue */}
      {confirmSkin && (
        <div
          role="dialog"
          aria-label="Confirmer l'achat de la tenue"
          className="flex flex-col items-center gap-2 rounded-lg border border-border bg-black/60 p-4 text-center"
        >
          <p className="text-sm text-ink">
            Débloquer la tenue{" "}
            {getSkinsForHero(confirmSkin.heroId).find((s) => s.id === confirmSkin.skinId)?.name}{" "}
            pour{" "}
            {getSkinsForHero(confirmSkin.heroId).find((s) => s.id === confirmSkin.skinId)?.price}{" "}
            or ?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={confirmSkinPurchase}
              className="rounded border border-border px-3 py-1.5 font-display text-xs uppercase text-gold"
            >
              Confirmer
            </button>
            <button
              type="button"
              onClick={() => setConfirmSkin(null)}
              className="rounded border border-border px-3 py-1.5 font-display text-xs uppercase text-muted"
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Câbler `app/echoppe/page.tsx`**

Remplacer le fichier :

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { goldBalance } from "@/lib/game-engine";
import { CharacterSelect } from "@/components/shop/CharacterSelect";

// US-18/US-53 : l'Échoppe (Character Select + tenues). Solde d'or dérivé,
// possession lue depuis unlocked_heroes/unlocked_skins, équipé depuis profiles.
export default async function EchoppePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: profile, error: pErr },
    { data: results, error: rErr },
    { data: owned, error: oErr },
    { data: ownedSkins, error: sErr },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("equipped_hero_id, equipped_skin_id")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("day_results").select("gold_earned").eq("user_id", user.id),
    supabase.from("unlocked_heroes").select("hero_id, price_paid").eq("user_id", user.id),
    supabase.from("unlocked_skins").select("hero_id, skin_id, price_paid").eq("user_id", user.id),
  ]);

  if (pErr || rErr || oErr || sErr || !profile) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <p role="alert" className="max-w-[32ch] text-sm text-hp">
          L&apos;Échoppe est fermée un instant. Réessaie.
        </p>
        <Link href="/qg" className="text-sm text-xp underline underline-offset-4">
          Retour au QG
        </Link>
      </main>
    );
  }

  const balance = goldBalance(results ?? [], owned ?? [], ownedSkins ?? []);
  const ownedIds = (owned ?? []).map((r) => r.hero_id);
  const ownedSkinIds = (ownedSkins ?? []).map((r) => r.skin_id);

  return (
    <main className="flex flex-1 flex-col items-center gap-4 px-6 py-8">
      <Link
        href="/qg"
        className="self-start text-sm text-xp underline underline-offset-4"
      >
        ← Retour au QG
      </Link>
      <CharacterSelect
        ownedIds={ownedIds}
        equippedId={profile.equipped_hero_id}
        ownedSkinIds={ownedSkinIds}
        equippedSkinId={profile.equipped_skin_id}
        balance={balance}
      />
    </main>
  );
}
```

- [ ] **Step 4: Vérifier la compilation et le lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: aucune erreur.

- [ ] **Step 5: Vérifier manuellement**

Run: `npm run dev`, ouvrir `/echoppe`. Sélectionner Fire Knight (possédé par défaut) → la bande tenues doit afficher 2 puces (défaut + Shadow Purple). Sélectionner un héros verrouillé → bande grisée, tooltip "Débloque le héros d'abord". Acheter puis équiper une tenue → le stage doit refléter le changement immédiatement.
Expected: comportement conforme à la description ci-dessus, aucune erreur console.

- [ ] **Step 6: Commit**

```bash
git add components/combat/HeroIdle.tsx components/shop/CharacterSelect.tsx app/echoppe/page.tsx
git commit -m "feat: bande tenues fonctionnelle dans l'Échoppe (US-53)"
```

---

### Task 10: Wiring de la tenue équipée dans l'Arène

**Files:**
- Modify: `components/combat/Arena.tsx:175-177,633-647`

**Interfaces:**
- Consumes: `Profile.equipped_skin_id` (Task 3), `getHeroSpritePrefix` (`lib/hero-skins.ts`).
- Produces: `VersusScene` reçoit le `heroFramePrefix` de la tenue équipée (au lieu du sprite de base systématiquement).

- [ ] **Step 1: Importer `getHeroSpritePrefix`**

Dans `components/combat/Arena.tsx`, ajouter à côté de l'import existant de `lib/heroes` :

```ts
import { getHeroSpritePrefix } from "@/lib/hero-skins";
```

- [ ] **Step 2: Calculer le prefix skin-aware**

Dans `components/combat/Arena.tsx:175-177`, après la ligne `equippedHero`, ajouter :

```ts
  const equippedHero =
    getHero(profile.equipped_hero_id) ?? getHero(DEFAULT_HERO_ID)!;
  const equippedHeroFramePrefix = getHeroSpritePrefix(
    equippedHero.id,
    profile.equipped_skin_id,
  );
```

- [ ] **Step 3: Utiliser le prefix dans `VersusScene`**

Dans `components/combat/Arena.tsx:633-647`, remplacer :

```tsx
          <VersusScene
            heroName={equippedHero.name}
            heroFramePrefix={equippedHeroFramePrefix}
            heroFrameCount={equippedHero.idleFrameCount}
```

(seule la ligne `heroFramePrefix` change, le reste des props de `VersusScene` est inchangé.)

- [ ] **Step 4: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 5: Vérifier manuellement**

Équiper une tenue dans l'Échoppe (Task 9), revenir à l'Arène (`/`).
Expected: le héros affiché dans l'Arène porte la tenue équipée (swap live confirmé par le pattern `revalidatePath("/")` déjà en place dans `equipSkin`).

- [ ] **Step 6: Commit**

```bash
git add components/combat/Arena.tsx
git commit -m "feat: câble la tenue équipée dans l'Arène (US-53)"
```

---

### Task 11: Tests e2e

**Files:**
- Modify: `e2e/fixtures.ts`
- Create: `e2e/echoppe-skins.spec.ts`

**Interfaces:**
- Consumes: `resetShopState` existant (`e2e/fixtures.ts`), `login` (`e2e/fixtures.ts`).
- Produces: `resetShopState` nettoie aussi `unlocked_skins`/`equipped_skin_id` ; nouveau spec `echoppe-skins.spec.ts`.

- [ ] **Step 1: Étendre `resetShopState`**

Dans `e2e/fixtures.ts`, dans `resetShopState` (après la ligne `await admin.from("unlocked_heroes").upsert(...)`), ajouter :

```ts
  await admin.from("unlocked_skins").delete().eq("user_id", uid);
  await admin.from("profiles").update({ equipped_skin_id: null }).eq("id", uid);
```

(à insérer avant la ligne `await admin.from("profiles").update({ equipped_hero_id: "fire_knight" })...` existante, ou juste après — l'ordre entre ces deux updates n'a pas d'importance tant que les deux s'exécutent).

- [ ] **Step 2: Écrire le spec e2e**

Créer `e2e/echoppe-skins.spec.ts` :

```ts
import { expect, test } from "@playwright/test";
import { login, resetShopState } from "./fixtures";

// US-53 : parcours tenues. Compte e2e fixe partagé → reset avant chaque test.
test.describe("US-53 Tenues", () => {
  test.beforeEach(async ({ page }) => {
    await resetShopState();
    await login(page);
  });

  test("la bande tenues est grisée sur un héros verrouillé", async ({ page }) => {
    await page.goto("/echoppe");
    await page.locator('[data-hero-cell="water_priestess"]').click();
    const swatch = page.locator('[data-skin-swatch="water_priestess_ember"]');
    await expect(swatch).toBeDisabled();
  });

  test("achète puis équipe une tenue du héros par défaut", async ({ page }) => {
    await page.goto("/echoppe");
    // Fire Knight (possédé par défaut) déjà sélectionné/équipé.
    const swatch = page.locator('[data-skin-swatch="fire_knight_shadow_purple"]');
    await expect(swatch).toHaveAttribute("data-owned", "false");

    await swatch.click();
    await page.getByRole("dialog", { name: "Confirmer l'achat de la tenue" }).waitFor();
    await page.getByRole("button", { name: "Confirmer" }).click();

    await expect(swatch).toHaveAttribute("data-owned", "true");
    // Re-tap = équiper (déjà possédée).
    await swatch.click();
    await expect(swatch).toHaveAttribute("aria-pressed", "true");
  });

  test("la tenue par défaut n'est jamais achetable", async ({ page }) => {
    await page.goto("/echoppe");
    const defaultSwatch = page.locator('[data-skin-swatch="fire_knight_default"]');
    await expect(defaultSwatch).toHaveAttribute("data-owned", "true");
  });
});
```

- [ ] **Step 3: Build de production et lancement des tests**

Run: `npm run build && npx playwright test echoppe-skins`
Expected: build sans erreur, 3 tests verts (le serveur prod est démarré automatiquement par `playwright.config.ts`).

- [ ] **Step 4: Relancer toute la suite e2e en série (non-régression)**

Run: `npx playwright test`
Expected: tous les specs existants + `echoppe-skins.spec.ts` verts (aucune régression sur `echoppe.spec.ts` notamment, qui partage le même compte).

- [ ] **Step 5: Commit**

```bash
git add e2e/fixtures.ts e2e/echoppe-skins.spec.ts
git commit -m "test: e2e tenues (achat, équipement, gating héros verrouillé) (US-53)"
```

---

### Task 12: Documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `CHANGELOG.md`
- Modify: `SPECS_FONCTIONNELLES.md`
- Modify: `ASSETS.md`
- Modify: `content/guide.json`

**Interfaces:**
- Consumes: rien (documentation).
- Produces: piège CLAUDE.md à jour, ligne CHANGELOG, entrée registre US, cartographie assets, section guide utilisateur.

- [ ] **Step 1: `CLAUDE.md` — nouveau piège**

Ajouter, à la fin de la section « Pièges et décisions non-évidentes » (avant la section « URL de production ») :

```markdown
**Tenues/skins des héros — recolor par tiers de qualité (US-53)** — Aucun art alternatif n'existe dans `assets/MC` (fichiers `.aseprite` : 3 calques `bkg`/`base`/`effects`, pas de calque peau/armure séparé) ; les tenues sont donc **générées offline** par `scripts/generate-hero-skins.mjs` (jamais au runtime), à partir des frames idle déjà extraites (`public/sprites/mc/<slug>/idle/`). La **portée varie par héros** selon la séparabilité réelle de sa palette (analyse d'histogramme HSL, cf. `docs/superpowers/specs/2026-07-23-us53-tenues-skins-design.md`) : **Tier A** (Water Priestess, Leaf Ranger, Crystal Mauler, 4 tenues) = recolor masqué (seuls les pixels saturés dans la bande de teinte du costume sont retintés, contours/hautes lumières intacts) ; **Tier B** (Fire Knight, Ground Monk, Wind Hashashin, 2 tenues) = recolor global accepté malgré une palette mono-teinte (peau et costume indissociables par teinte) ; **Tier C** (Metal Bladekeeper, 3 tenues) = overlay *tint* multiply sur les pixels quasi neutres (le hue-rotate ne fait presque rien sur du gris désaturé). Catalogue statique `lib/hero-skins.ts` (`SKINS`, prix = 30% du prix du héros arrondi à la dizaine, `skinPrice`). Possession dans `unlocked_skins` (unique `(user_id, hero_id, skin_id)`, **aucune policy UPDATE/DELETE**, RG-04) ; la tenue `<hero>_default` n'est **jamais** une ligne en base — gratuite dès que le héros est possédé (`isSkinOwned`). `profiles.equipped_skin_id` (nullable, `null` = défaut) câblé jusqu'à l'Arène via `getHeroSpritePrefix`. **`goldBalance` (`lib/game-engine.ts`) a un 3e paramètre requis** (`unlockedSkins`) depuis cette US — un appelant qui l'omet échoue à la compilation plutôt que de calculer un solde faux. Écran de test interne **`/skins-preview-4c7a1e9b`** (même patron que `roster-preview-8f3a2c9d` : chemin obscur, login requis, `noindex`, jamais lié depuis l'UI) pour valider chaque tenue avant merge.
```

- [ ] **Step 2: `CHANGELOG.md`**

Sous `## [Unreleased]`, ajouter :

```markdown
- `feat`: tenues/skins des héros — jusqu'à 4 recolors achetables à l'or par héros, Échoppe (US-53).
```

- [ ] **Step 3: `SPECS_FONCTIONNELLES.md`**

Ajouter une entrée US-53 au registre des User Stories (section Sprint 3), avec un résumé pointant vers le spec de design (chemin exact `docs/superpowers/specs/2026-07-23-us53-tenues-skins-design.md`) et la mention des règles métier concernées (déblocage à l'or, RG-04).

- [ ] **Step 4: `ASSETS.md`**

Dans la section `1. assets/MC`, ajouter un paragraphe après celui sur l'intégration US-18 :

```markdown
**Intégration US-53 (Tenues)** : `scripts/generate-hero-skins.mjs` génère les frames idle de chaque tenue (recolor masqué ou overlay tint, cf. `CLAUDE.md`) vers `public/sprites/mc/<slug>/skins/<skin_id>/idle/frameNNNN.png`, à partir des frames idle déjà extraites (pas de re-lecture d'`assets/`). Catalogue et calibration : `lib/hero-skins.ts` + `docs/superpowers/specs/2026-07-23-us53-tenues-skins-design.md` §4.
```

- [ ] **Step 5: Manuel du Dojo (`content/guide.json`)**

Si `NOTION_TOKEN`/`NOTION_GUIDE_PAGE_ID` sont configurés en local : éditer la page Notion du guide (nouvelle section « Tenues »), puis `npm run sync:guide`. Sinon, éditer directement `content/guide.json` en ajoutant une section avec `id: "tenues"` (stable, ancre de deep-link `/guide#tenues`), respectant le schéma de `lib/guide.ts` (vérifier la forme exacte des sections existantes dans `content/guide.json` avant d'écrire — copier la structure d'une section comparable, ex. celle sur l'Échoppe/l'or, plutôt que d'en inventer une nouvelle). Contenu : comment débloquer une tenue (or, même écran que les héros), comment l'équiper, rappel que c'est purement cosmétique (aucun effet sur les HP/XP/or gagné).

- [ ] **Step 6: Vérifier le rendu du guide**

Run: `npm run dev`, ouvrir `/guide#tenues`.
Expected: la nouvelle section s'affiche et l'ancre `#tenues` scrolle correctement dessus.

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md CHANGELOG.md SPECS_FONCTIONNELLES.md ASSETS.md content/guide.json
git commit -m "docs: documente les tenues des héros (US-53)"
```

---

## Self-Review (fait par l'auteur du plan)

**Couverture du spec** : D1-D8 et B1-B4 couverts (tiers → Task 4/6, génération offline → Task 6, achat à l'or → Task 1/8, default jamais en base → Task 4/8, `equipped_skin_id` → Task 2/9/10, prix dérivé → Task 4, `IdleSprite` inchangé → Task 9 confirmé, aucune modif du composant). §5 modèle de données → Task 1-3. §6 rendu → Task 9-10. §7 UI Échoppe → Task 9. §8 découpage → Task 5 (correction `goldBalance`), 6, 8, 9, 12 (docs). §9 tests → Task 4 (Vitest catalogue), 11 (e2e). Écran de test interne → Task 7.

**Incohérence détectée et corrigée pendant la planification** : la spec initiale ne mentionnait pas que `goldBalance` devait aussi déduire les tenues (sans quoi elles seraient gratuites en pratique) — ajouté à la spec (§8) puis à ce plan (Task 5) avant d'aller plus loin. Les tableaux de calibration Tier A (Leaf Ranger, Crystal Mauler) et le comptage Tier C avaient aussi des trous, corrigés dans la spec avant l'écriture du plan.

**Cohérence des types** : `getHeroSpritePrefix(heroId, skinId)` (Task 4) utilisé identiquement en Task 7 (SkinsPreview), Task 9 (HeroIdle), Task 10 (Arena). `Skin { id, heroId, name, price, isDefault, swatchColor }` (Task 3) utilisé sans variation dans SKINS (Task 4) et CharacterSelect (Task 9). `purchaseSkin(heroId, skinId)`/`equipSkin(heroId, skinId)` (Task 8) appelés avec la même signature en Task 9.
