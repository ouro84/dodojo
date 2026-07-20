# US-18 Échoppe & Économie d'Or — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer la monnaie d'or (gagnée à la clôture du jour, solde dérivé) et l'Échoppe façon Character Select où l'on débloque/équipe des héros.

**Architecture:** Logique pure dans `lib/game-engine.ts` (barème d'or) et `lib/heroes.ts` (catalogue statique). L'or est écrit dans `day_results.gold_earned` par `closeDay`/`backfillMissedDays` (idempotent, recalculé). La possession vit dans une table `unlocked_heroes` (jamais de DELETE) ; le solde est dérivé `SUM(gold_earned) − SUM(price_paid)`. L'écran `app/echoppe/page.tsx` consomme catalogue + possession + solde, muté par les server actions `purchaseHero`/`equipHero`.

**Tech Stack:** Next.js 16 (App Router, server actions), Supabase (PostgreSQL + RLS), TypeScript strict, Vitest (logique pure), Playwright (e2e série, serveur prod).

## Global Constraints

- **TypeScript strict — interdiction de `any`.** Tout type explicite.
- **Logique de jeu dans `lib/game-engine.ts`** (testable sans UI). Catalogue héros dans `lib/heroes.ts`.
- **RG-04 — jamais de DELETE.** `unlocked_heroes` sans policy DELETE ; achat idempotent.
- **3 états UI** (Loading / Error / Empty) obligatoires sur tout écran.
- **Solde d'or dérivé, jamais accumulé** : `SUM(day_results.gold_earned) − SUM(unlocked_heroes.price_paid)`. `profiles.gold` = cache.
- **Chiffres recalculés, jamais accumulés** dans `day_results` (idempotence sur reclose).
- **Commits Conventional Commits** ; toute PR feature ajoute sa ligne sous `## [Unreleased]` de `CHANGELOG.md` dans le même commit.
- **e2e Playwright** : `fullyParallel: false`, serveur prod, compte fixe unique → isoler l'état muté (achats) via fixture de reset.
- **Barème d'or (tunable, constantes)** : `GOLD_BASE = { victory: 50, retreat: 10, defeat: 0 }`, `GOLD_PER_DAMAGE_UNIT = 1` (par 20 dégâts), `GOLD_STREAK_BONUS_PER_DAY = 5`, `GOLD_STREAK_BONUS_CAP = 50`.
- **Héros par défaut** : `fire_knight`, possédé d'office (`price_paid = 0`), toujours considéré comme possédé sans ligne obligatoire.

---

## File Structure

- `supabase/migrations/*_add_day_results_gold_earned.sql` — colonne `gold_earned`.
- `supabase/migrations/*_create_unlocked_heroes.sql` — table possession + RLS (pas de DELETE).
- `supabase/migrations/*_add_profile_equipped_hero.sql` — colonne `equipped_hero_id`.
- `types/index.ts` — étend `DayResult`, `Profile` ; ajoute `Hero`, `UnlockedHero`.
- `lib/game-engine.ts` — constantes `GOLD_*`, `computeGoldEarned`, `goldBalance`.
- `lib/heroes.ts` — catalogue statique `HEROES`, `DEFAULT_HERO_ID`, `getHero`, `isHeroOwned`.
- `lib/game-engine.test.ts` — tests `computeGoldEarned`, `goldBalance`.
- `lib/heroes.test.ts` — tests catalogue/possession.
- `app/actions/day.ts` — écrit `gold_earned` dans `closeDay` + `backfillMissedDays`.
- `app/actions/shop.ts` — `purchaseHero`, `equipHero`.
- `components/shop/HeroSprite.tsx` — sprite idle (CSS steps) + variante grayscale.
- `components/shop/CharacterSelect.tsx` — stage + matrice + modale d'achat.
- `app/echoppe/page.tsx` — écran Échoppe (3 états UI).
- `app/qg/page.tsx` — lien vers l'Échoppe (nav QG hub).
- `e2e/echoppe.spec.ts` — parcours achat/équipement.
- `CLAUDE.md`, `CHANGELOG.md`, `ASSETS.md` — docs.

---

## Task 1: Migration `day_results.gold_earned`

**Files:**
- Create: `supabase/migrations/20260720130000_add_day_results_gold_earned.sql`

**Interfaces:**
- Produces: colonne `day_results.gold_earned integer not null default 0`.

- [ ] **Step 1: Écrire la migration**

```sql
-- US-18 : l'or gagné du jour, écrit à la clôture (Crépuscule) / au backfill.
-- Recalculé depuis les tâches + le streak, jamais accumulé (idempotence).
alter table public.day_results
  add column gold_earned integer not null default 0;
```

- [ ] **Step 2: Appliquer en local**

Run: `supabase migration up`
Expected: migration appliquée sans erreur ; `\d day_results` montre `gold_earned`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260720130000_add_day_results_gold_earned.sql
git commit -m "feat: add gold_earned column to day_results (US-18)"
```

---

## Task 2: Migration `unlocked_heroes`

**Files:**
- Create: `supabase/migrations/20260720130100_create_unlocked_heroes.sql`

**Interfaces:**
- Produces: table `unlocked_heroes (id, user_id, hero_id, price_paid, unlocked_at)`, unique `(user_id, hero_id)`, RLS select/insert own, **pas de DELETE**.

- [ ] **Step 1: Écrire la migration** (calquée sur `create_day_results.sql`)

```sql
-- US-18 : possession de héros. Achat = insert ; jamais de DELETE (RG-04).
create table public.unlocked_heroes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  hero_id text not null,
  price_paid integer not null default 0,
  unlocked_at timestamptz not null default now(),
  unique (user_id, hero_id)
);

create index unlocked_heroes_user_idx on public.unlocked_heroes (user_id);

alter table public.unlocked_heroes enable row level security;

create policy "unlocked_heroes_select_own"
  on public.unlocked_heroes for select
  using (user_id = auth.uid());

create policy "unlocked_heroes_insert_own"
  on public.unlocked_heroes for insert
  with check (user_id = auth.uid());

-- Volontairement aucune policy UPDATE ni DELETE (RG-04).
```

- [ ] **Step 2: Appliquer en local**

Run: `supabase migration up`
Expected: table `unlocked_heroes` créée, RLS active.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260720130100_create_unlocked_heroes.sql
git commit -m "feat: create unlocked_heroes table (US-18)"
```

---

## Task 3: Migration `profiles.equipped_hero_id`

**Files:**
- Create: `supabase/migrations/20260720130200_add_profile_equipped_hero.sql`

**Interfaces:**
- Produces: colonne `profiles.equipped_hero_id text not null default 'fire_knight'`.

- [ ] **Step 1: Écrire la migration**

```sql
-- US-18 : héros actuellement équipé (affiché dans l'Arène). Défaut = fire_knight.
alter table public.profiles
  add column equipped_hero_id text not null default 'fire_knight';
```

- [ ] **Step 2: Appliquer en local**

Run: `supabase migration up`
Expected: colonne présente, défaut `fire_knight`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260720130200_add_profile_equipped_hero.sql
git commit -m "feat: add equipped_hero_id to profiles (US-18)"
```

---

## Task 4: Types partagés

**Files:**
- Modify: `types/index.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `DayResult.gold_earned: number` ; `Profile.equipped_hero_id: string` ; `interface Hero` ; `interface UnlockedHero`.

- [ ] **Step 1: Étendre `DayResult` et `Profile`, ajouter `Hero` et `UnlockedHero`**

Dans `types/index.ts`, ajouter `gold_earned: number;` à `DayResult` (après `xp_earned`), `equipped_hero_id: string;` à `Profile` (après `timezone`), et à la fin du fichier :

```ts
export interface Hero {
  id: string;
  name: string;
  element: string;
  spriteBasePath: string; // ex. "/sprites/heroes/fire_knight"
  idleFrames: number; // nombre de frames de l'anim idle
  frameWidth: number;
  frameHeight: number;
  price: number; // 0 pour le héros par défaut
  isDefault: boolean;
}

export interface UnlockedHero {
  id: string;
  user_id: string;
  hero_id: string;
  price_paid: number;
  unlocked_at: string;
}
```

- [ ] **Step 2: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur (les usages de `DayResult`/`Profile` restent valides).

- [ ] **Step 3: Commit**

```bash
git add types/index.ts
git commit -m "feat: add Hero/UnlockedHero types + gold_earned/equipped_hero_id (US-18)"
```

---

## Task 5: Barème d'or pur — `computeGoldEarned`

**Files:**
- Modify: `lib/game-engine.ts`
- Test: `lib/game-engine.test.ts`

**Interfaces:**
- Consumes: `DayOutcome` (déjà importé dans game-engine).
- Produces: `computeGoldEarned(outcome: DayOutcome, damageDealt: number, streakOnThatDay: number): number` + constantes `GOLD_BASE`, `GOLD_PER_DAMAGE_UNIT`, `GOLD_STREAK_BONUS_PER_DAY`, `GOLD_STREAK_BONUS_CAP`.

- [ ] **Step 1: Écrire les tests (échouants)**

Ajouter dans `lib/game-engine.test.ts` (et importer `computeGoldEarned` depuis `./game-engine`) :

```ts
describe("computeGoldEarned", () => {
  it("victoire sans dégât ni streak = base 50", () => {
    expect(computeGoldEarned("victory", 0, 0)).toBe(50);
  });

  it("retreat = base 10, defeat = 0", () => {
    expect(computeGoldEarned("retreat", 0, 0)).toBe(10);
    expect(computeGoldEarned("defeat", 0, 0)).toBe(0);
  });

  it("ajoute +1 or par tranche de 20 dégâts", () => {
    // 120 dégâts -> floor(120/20)=6 or
    expect(computeGoldEarned("victory", 120, 0)).toBe(50 + 6);
  });

  it("ajoute le bonus streak (+5 par jour de série)", () => {
    expect(computeGoldEarned("victory", 0, 3)).toBe(50 + 15);
  });

  it("plafonne le bonus streak à GOLD_STREAK_BONUS_CAP", () => {
    // streak 100 -> 500 brut, plafonné à 50
    expect(computeGoldEarned("victory", 0, 100)).toBe(50 + 50);
  });
});
```

- [ ] **Step 2: Lancer les tests → échec attendu**

Run: `npx vitest run lib/game-engine.test.ts -t computeGoldEarned`
Expected: FAIL (`computeGoldEarned is not a function`).

- [ ] **Step 3: Implémenter dans `lib/game-engine.ts`**

Ajouter (près des constantes XP) :

```ts
export const GOLD_BASE: Record<DayOutcome, number> = {
  victory: 50,
  retreat: 10,
  defeat: 0,
};
export const GOLD_PER_DAMAGE_UNIT = 1; // par tranche de 20 dégâts (≈ 1 tâche)
export const GOLD_STREAK_BONUS_PER_DAY = 5;
export const GOLD_STREAK_BONUS_CAP = 50;

// US-18 : or gagné pour un jour. Pur & idempotent. `streakOnThatDay` = longueur
// de streak au jour concerné, fournie par l'action appelante (qui lit day_results).
export function computeGoldEarned(
  outcome: DayOutcome,
  damageDealt: number,
  streakOnThatDay: number,
): number {
  const damageBonus = Math.floor(damageDealt / 20) * GOLD_PER_DAMAGE_UNIT;
  const streakBonus = Math.min(
    streakOnThatDay * GOLD_STREAK_BONUS_PER_DAY,
    GOLD_STREAK_BONUS_CAP,
  );
  return GOLD_BASE[outcome] + damageBonus + streakBonus;
}
```

- [ ] **Step 4: Lancer les tests → succès**

Run: `npx vitest run lib/game-engine.test.ts -t computeGoldEarned`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/game-engine.ts lib/game-engine.test.ts
git commit -m "feat: add computeGoldEarned gold formula (US-18)"
```

---

## Task 6: Solde dérivé — `goldBalance`

**Files:**
- Modify: `lib/game-engine.ts`
- Test: `lib/game-engine.test.ts`

**Interfaces:**
- Consumes: `DayResult` (import type), `UnlockedHero`.
- Produces: `goldBalance(dayResults: Pick<DayResult, "gold_earned">[], unlockedHeroes: Pick<UnlockedHero, "price_paid">[]): number`.

- [ ] **Step 1: Écrire les tests (échouants)**

```ts
describe("goldBalance", () => {
  it("solde = somme des gains moins somme des achats", () => {
    const gains = [{ gold_earned: 50 }, { gold_earned: 60 }];
    const achats = [{ price_paid: 40 }];
    expect(goldBalance(gains, achats)).toBe(70);
  });

  it("nouvel utilisateur (aucun jour, aucun achat) = 0", () => {
    expect(goldBalance([], [])).toBe(0);
  });

  it("héros par défaut price_paid 0 n'affecte pas le solde", () => {
    expect(goldBalance([{ gold_earned: 50 }], [{ price_paid: 0 }])).toBe(50);
  });
});
```

- [ ] **Step 2: Lancer les tests → échec attendu**

Run: `npx vitest run lib/game-engine.test.ts -t goldBalance`
Expected: FAIL.

- [ ] **Step 3: Implémenter dans `lib/game-engine.ts`**

```ts
import type { DayOutcome, DayResult, Task, UnlockedHero } from "../types";
// (ajouter UnlockedHero à l'import type existant en tête de fichier)

// US-18 : solde d'or dérivé (source de vérité). Jamais accumulé.
export function goldBalance(
  dayResults: Pick<DayResult, "gold_earned">[],
  unlockedHeroes: Pick<UnlockedHero, "price_paid">[],
): number {
  const earned = dayResults.reduce((sum, r) => sum + r.gold_earned, 0);
  const spent = unlockedHeroes.reduce((sum, h) => sum + h.price_paid, 0);
  return earned - spent;
}
```

- [ ] **Step 4: Lancer les tests → succès**

Run: `npx vitest run lib/game-engine.test.ts -t goldBalance`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/game-engine.ts lib/game-engine.test.ts
git commit -m "feat: add goldBalance derived-balance helper (US-18)"
```

---

## Task 7: Catalogue héros — `lib/heroes.ts`

**Files:**
- Create: `lib/heroes.ts`
- Test: `lib/heroes.test.ts`

**Interfaces:**
- Consumes: `Hero` (type).
- Produces: `HEROES: Hero[]`, `DEFAULT_HERO_ID = "fire_knight"`, `getHero(id: string): Hero | undefined`, `isHeroOwned(heroId: string, ownedIds: string[]): boolean`.

- [ ] **Step 1: Écrire les tests (échouants)**

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_HERO_ID, getHero, HEROES, isHeroOwned } from "./heroes";

describe("heroes catalogue", () => {
  it("contient un héros par défaut unique, gratuit", () => {
    const defaults = HEROES.filter((h) => h.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].id).toBe(DEFAULT_HERO_ID);
    expect(defaults[0].price).toBe(0);
  });

  it("tous les autres héros ont un prix > 0 et un id unique", () => {
    const ids = HEROES.map((h) => h.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const h of HEROES.filter((x) => !x.isDefault)) {
      expect(h.price).toBeGreaterThan(0);
    }
  });

  it("getHero retrouve par id, undefined sinon", () => {
    expect(getHero(DEFAULT_HERO_ID)?.id).toBe(DEFAULT_HERO_ID);
    expect(getHero("inconnu")).toBeUndefined();
  });

  it("isHeroOwned : défaut toujours possédé, autres selon la liste", () => {
    expect(isHeroOwned(DEFAULT_HERO_ID, [])).toBe(true);
    expect(isHeroOwned("water_priestess", [])).toBe(false);
    expect(isHeroOwned("water_priestess", ["water_priestess"])).toBe(true);
  });
});
```

- [ ] **Step 2: Lancer les tests → échec attendu**

Run: `npx vitest run lib/heroes.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Implémenter `lib/heroes.ts`**

> Chemins/`idleFrames` provisoires : à ajuster quand les frames MC seront copiées dans `public/sprites/heroes/<id>/` (voir Task 12 / ASSETS.md §1). Les valeurs de frames ci-dessous sont des placeholders **structurels** à confirmer à l'intégration des sprites.

```ts
import type { Hero } from "../types";

export const DEFAULT_HERO_ID = "fire_knight";

export const HEROES: Hero[] = [
  { id: "fire_knight", name: "Fire Knight", element: "Feu", spriteBasePath: "/sprites/heroes/fire_knight", idleFrames: 8, frameWidth: 288, frameHeight: 128, price: 0, isDefault: true },
  { id: "water_priestess", name: "Water Priestess", element: "Eau", spriteBasePath: "/sprites/heroes/water_priestess", idleFrames: 8, frameWidth: 288, frameHeight: 128, price: 200, isDefault: false },
  { id: "ground_monk", name: "Ground Monk", element: "Terre", spriteBasePath: "/sprites/heroes/ground_monk", idleFrames: 8, frameWidth: 288, frameHeight: 128, price: 200, isDefault: false },
  { id: "wind_hashashin", name: "Wind Hashashin", element: "Vent", spriteBasePath: "/sprites/heroes/wind_hashashin", idleFrames: 8, frameWidth: 288, frameHeight: 128, price: 300, isDefault: false },
  { id: "leaf_ranger", name: "Leaf Ranger", element: "Feuille", spriteBasePath: "/sprites/heroes/leaf_ranger", idleFrames: 8, frameWidth: 288, frameHeight: 128, price: 300, isDefault: false },
  { id: "crystal_mauler", name: "Crystal Mauler", element: "Cristal", spriteBasePath: "/sprites/heroes/crystal_mauler", idleFrames: 8, frameWidth: 288, frameHeight: 128, price: 350, isDefault: false },
  { id: "metal_bladekeeper", name: "Metal Bladekeeper", element: "Métal", spriteBasePath: "/sprites/heroes/metal_bladekeeper", idleFrames: 8, frameWidth: 288, frameHeight: 128, price: 350, isDefault: false },
];

export function getHero(id: string): Hero | undefined {
  return HEROES.find((h) => h.id === id);
}

// Le héros par défaut est toujours possédé (aucune ligne requise en base).
export function isHeroOwned(heroId: string, ownedIds: string[]): boolean {
  const hero = getHero(heroId);
  if (hero?.isDefault) return true;
  return ownedIds.includes(heroId);
}
```

- [ ] **Step 4: Lancer les tests → succès**

Run: `npx vitest run lib/heroes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/heroes.ts lib/heroes.test.ts
git commit -m "feat: add static hero catalogue (US-18)"
```

---

## Task 8: Écrire l'or à la clôture — `closeDay` + `backfillMissedDays`

**Files:**
- Modify: `app/actions/day.ts`

**Interfaces:**
- Consumes: `computeGoldEarned`, `currentStreak` (existant, retourne `number`), `summarizeDay`, `dayKey`.
- Produces: `day_results.gold_earned` peuplé (idempotent). Aucune nouvelle signature exportée.

> Note : `currentStreak(dayResults, today)` renvoie aujourd'hui un `number`. US-12 le fera évoluer vers un objet `{ length, ... }` ; à ce moment-là, remplacer `currentStreak(...)` par `currentStreak(...).length` sur les 2 sites ci-dessous (le reste du code d'or est découplé via `computeGoldEarned`).

- [ ] **Step 1: `closeDay` — calculer streak + gold_earned**

Dans `app/actions/day.ts`, importer `computeGoldEarned` et `currentStreak` depuis `@/lib/game-engine`. Après le calcul de `summary` et avant l'upsert, insérer :

```ts
// Streak au jour courant = série incluant l'issue du jour, calculée depuis
// les day_results passés (source de vérité). Sert au bonus d'or (US-18).
const { data: priorResults } = await supabase
  .from("day_results")
  .select("day_date, outcome")
  .eq("user_id", user.id)
  .lt("day_date", today);

const streakToday = currentStreak(
  [...(priorResults ?? []), { day_date: today, outcome: summary.outcome }],
  today,
);
const goldEarned = computeGoldEarned(summary.outcome, summary.damageDealt, streakToday);
```

Puis ajouter `gold_earned: goldEarned,` dans l'objet passé à `.upsert(...)`.

- [ ] **Step 2: `backfillMissedDays` — gold_earned chronologique**

Remplacer le bloc `const rows = Array.from(byDay, ...)` par un calcul **chronologique** qui accumule les issues pour que le streak de chaque jour lise les jours antérieurs :

```ts
// Base connue = day_results déjà présents (issues) ; on y ajoute les jours
// backfillés dans l'ordre chronologique pour un streak correct par jour.
const { data: knownResults } = await supabase
  .from("day_results")
  .select("day_date, outcome")
  .eq("user_id", user.id);

const timeline: { day_date: string; outcome: DayOutcome }[] = [
  ...(knownResults ?? []),
];

const rows = Array.from(byDay.entries())
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([day_date, tasks]) => {
    const s = summarizeDay(tasks, "backfill");
    timeline.push({ day_date, outcome: s.outcome });
    const streakThatDay = currentStreak(timeline, day_date);
    return {
      user_id: user.id,
      day_date,
      outcome: s.outcome,
      damage_dealt: s.damageDealt,
      boss_max_hp: s.bossMaxHp,
      tasks_completed: s.tasksCompleted,
      tasks_abandoned: s.tasksAbandoned,
      xp_earned: s.xpEarned,
      gold_earned: computeGoldEarned(s.outcome, s.damageDealt, streakThatDay),
      closed_manually: false,
    };
  });
```

- [ ] **Step 3: Vérifier la compilation + tests existants**

Run: `npx tsc --noEmit && npx vitest run`
Expected: aucune erreur TS ; suite Vitest verte.

- [ ] **Step 4: Vérifier le build**

Run: `npm run build`
Expected: build OK.

- [ ] **Step 5: Commit**

```bash
git add app/actions/day.ts
git commit -m "feat: write gold_earned at day close/backfill (US-18)"
```

---

## Task 9: Server actions Échoppe — `purchaseHero` / `equipHero`

**Files:**
- Create: `app/actions/shop.ts`

**Interfaces:**
- Consumes: `createClient` (`@/lib/supabase/server`), `getHero`, `isHeroOwned`, `DEFAULT_HERO_ID` (`@/lib/heroes`), `goldBalance` (`@/lib/game-engine`).
- Produces: `purchaseHero(heroId: string): Promise<{ error: string | null }>`, `equipHero(heroId: string): Promise<{ error: string | null }>`.

- [ ] **Step 1: Écrire `app/actions/shop.ts`** (patron des actions existantes)

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { goldBalance } from "@/lib/game-engine";
import { DEFAULT_HERO_ID, getHero, isHeroOwned } from "@/lib/heroes";

interface ShopActionResult {
  error: string | null;
}

// US-18 : achat autoritaire côté serveur (B4). Idempotent : re-acheter un héros
// possédé = no-op. Refus si solde insuffisant. Jamais de DELETE (RG-04).
export async function purchaseHero(heroId: string): Promise<ShopActionResult> {
  const hero = getHero(heroId);
  if (!hero) return { error: "Ce combattant n'existe pas." };
  if (hero.isDefault) return { error: null }; // déjà possédé d'office

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const { data: owned } = await supabase
    .from("unlocked_heroes")
    .select("hero_id, price_paid")
    .eq("user_id", user.id);
  const ownedIds = (owned ?? []).map((r) => r.hero_id);

  if (isHeroOwned(heroId, ownedIds)) return { error: null }; // idempotent

  const { data: results } = await supabase
    .from("day_results")
    .select("gold_earned")
    .eq("user_id", user.id);

  const balance = goldBalance(results ?? [], owned ?? []);
  if (balance < hero.price) {
    return { error: "Pas assez d'or, champion. Va terrasser des Boss." };
  }

  const { error } = await supabase.from("unlocked_heroes").insert({
    user_id: user.id,
    hero_id: hero.id,
    price_paid: hero.price,
  });
  // Course concurrente : la contrainte unique (user_id, hero_id) protège du
  // double achat ; un conflit d'unicité est traité comme un no-op idempotent.
  if (error && error.code !== "23505") {
    return { error: "L'achat a échoué. Réessaie." };
  }

  // Rafraîchit le cache profiles.gold (source = solde dérivé).
  await supabase
    .from("profiles")
    .update({ gold: balance - hero.price })
    .eq("id", user.id);

  revalidatePath("/echoppe");
  revalidatePath("/");
  return { error: null };
}

// US-18 : équipe un héros possédé (sinon refus). Swap live du sprite Arène.
export async function equipHero(heroId: string): Promise<ShopActionResult> {
  const hero = getHero(heroId);
  if (!hero) return { error: "Ce combattant n'existe pas." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const { data: owned } = await supabase
    .from("unlocked_heroes")
    .select("hero_id")
    .eq("user_id", user.id);
  const ownedIds = (owned ?? []).map((r) => r.hero_id);

  if (!isHeroOwned(heroId, ownedIds)) {
    return { error: "Débloque ce combattant avant de l'équiper." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ equipped_hero_id: heroId })
    .eq("id", user.id);
  if (error) return { error: "Impossible d'équiper ce combattant. Réessaie." };

  revalidatePath("/echoppe");
  revalidatePath("/");
  return { error: null };
}
```

- [ ] **Step 2: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add app/actions/shop.ts
git commit -m "feat: add purchaseHero/equipHero server actions (US-18)"
```

---

## Task 10: Sprite héros — `HeroSprite.tsx`

**Files:**
- Create: `components/shop/HeroSprite.tsx`

**Interfaces:**
- Consumes: `Hero` (type).
- Produces: `<HeroSprite hero locked?={boolean} size?={number} />` — rend l'idle en boucle (CSS `steps()`), variante grayscale si `locked`.

> Prérequis d'asset : une spritesheet idle `<spriteBasePath>/idle.png` (frames horizontales) dans `public/` (copiée en Task 12). Respecte `prefers-reduced-motion` (fige la 1ʳᵉ frame).

- [ ] **Step 1: Écrire le composant**

```tsx
import type { Hero } from "@/types";

export function HeroSprite({
  hero,
  locked = false,
  size = 1,
}: {
  hero: Hero;
  locked?: boolean;
  size?: number;
}) {
  const w = hero.frameWidth * size;
  const h = hero.frameHeight * size;
  const style: React.CSSProperties = {
    width: w,
    height: h,
    backgroundImage: `url(${hero.spriteBasePath}/idle.png)`,
    backgroundRepeat: "no-repeat",
    backgroundSize: `${w * hero.idleFrames}px ${h}px`,
    imageRendering: "pixelated",
    animation: `hero-idle-${hero.idleFrames} 0.9s steps(${hero.idleFrames}) infinite`,
    filter: locked ? "grayscale(1) brightness(0.4)" : undefined,
  };
  return (
    <div
      role="img"
      aria-label={locked ? `${hero.name} (verrouillé)` : hero.name}
      style={style}
      data-hero={hero.id}
    />
  );
}
```

- [ ] **Step 2: Ajouter les keyframes + reduced-motion (global CSS)**

Dans `app/globals.css`, ajouter (le pas d'animation translate la spritesheet ; générer une règle par nombre de frames utilisé, ici 8) :

```css
@keyframes hero-idle-8 {
  from { background-position: 0 0; }
  to { background-position: -100% 0; }
}
@media (prefers-reduced-motion: reduce) {
  [data-hero] { animation: none !important; background-position: 0 0 !important; }
}
```

- [ ] **Step 3: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 4: Commit**

```bash
git add components/shop/HeroSprite.tsx app/globals.css
git commit -m "feat: add HeroSprite idle component (US-18)"
```

---

## Task 11: Character Select — `CharacterSelect.tsx`

**Files:**
- Create: `components/shop/CharacterSelect.tsx`

**Interfaces:**
- Consumes: `HEROES`, `getHero`, `isHeroOwned`, `DEFAULT_HERO_ID` (`@/lib/heroes`), `HeroSprite`, `purchaseHero`, `equipHero` (`@/app/actions/shop`).
- Produces: `<CharacterSelect ownedIds equippedId balance />` (client component) — stage + matrice + modale de confirmation.

- [ ] **Step 1: Écrire le composant client**

```tsx
"use client";

import { useState, useTransition } from "react";
import { HEROES, getHero, isHeroOwned, DEFAULT_HERO_ID } from "@/lib/heroes";
import { equipHero, purchaseHero } from "@/app/actions/shop";
import { HeroSprite } from "./HeroSprite";

export function CharacterSelect({
  ownedIds,
  equippedId,
  balance,
}: {
  ownedIds: string[];
  equippedId: string;
  balance: number;
}) {
  const [selectedId, setSelectedId] = useState(equippedId);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selected = getHero(selectedId) ?? getHero(DEFAULT_HERO_ID)!;
  const owned = isHeroOwned(selected.id, ownedIds);
  const equipped = selected.id === equippedId;
  const affordable = balance >= selected.price;

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

  return (
    <div data-testid="character-select">
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span>⚔️ CHOISIS TON COMBATTANT</span>
        <span data-testid="gold-balance">🪙 {balance}</span>
      </div>

      {/* Stage */}
      <div style={{ textAlign: "center" }}>
        <HeroSprite hero={selected} locked={!owned} size={1} />
        <div>{selected.name}</div>
        <div>Élément : {selected.element}</div>
        {error && <p role="alert">{error}</p>}
        <button onClick={onAction} disabled={pending || (equipped) || (!owned && !affordable)}>
          {equipped
            ? "✓ ÉQUIPÉ"
            : owned
              ? "Équiper"
              : affordable
                ? `🪙 ${selected.price} · Débloquer`
                : `🪙 ${selected.price}`}
        </button>
      </div>

      {/* Matrice */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "center" }}>
        {HEROES.map((h) => {
          const hOwned = isHeroOwned(h.id, ownedIds);
          return (
            <button
              key={h.id}
              data-hero-cell={h.id}
              data-owned={hOwned}
              aria-pressed={h.id === selectedId}
              onClick={() => { setSelectedId(h.id); setError(null); }}
              style={{ filter: hOwned ? undefined : "grayscale(1) brightness(0.4)" }}
            >
              {h.element.slice(0, 1)}
            </button>
          );
        })}
      </div>

      {/* Modale de confirmation */}
      {confirmId && (
        <div role="dialog" aria-label="Confirmer l'achat">
          <p>Débloquer {getHero(confirmId)?.name} pour {getHero(confirmId)?.price} or ?</p>
          <button onClick={confirmPurchase}>Confirmer</button>
          <button onClick={() => setConfirmId(null)}>Annuler</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add components/shop/CharacterSelect.tsx
git commit -m "feat: add CharacterSelect component (US-18)"
```

---

## Task 12: Écran Échoppe + assets + nav QG

**Files:**
- Create: `app/echoppe/page.tsx`
- Modify: `app/qg/page.tsx`
- Assets: copier les spritesheets idle vers `public/sprites/heroes/<id>/idle.png`

**Interfaces:**
- Consumes: `createClient`, `goldBalance`, `CharacterSelect`.
- Produces: route `/echoppe` (3 états UI) ; lien QG → Échoppe.

- [ ] **Step 1: Copier les sprites idle**

Depuis `assets/MC/<pack>/` (voir ASSETS.md §1), exporter/copier la spritesheet **idle** de chaque héros du catalogue vers `public/sprites/heroes/<id>/idle.png` (frames horizontales). Ajuster `idleFrames`/`frameWidth`/`frameHeight` dans `lib/heroes.ts` selon les fichiers réels, et la règle `@keyframes hero-idle-<n>` si le nombre de frames diffère de 8.

Run: `ls public/sprites/heroes/fire_knight/idle.png`
Expected: le fichier existe.

- [ ] **Step 2: Écrire `app/echoppe/page.tsx`** (Server Component, 3 états UI)

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { goldBalance } from "@/lib/game-engine";
import { CharacterSelect } from "@/components/shop/CharacterSelect";

export default async function EchoppePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile, error: pErr }, { data: results, error: rErr }, { data: owned, error: oErr }] =
    await Promise.all([
      supabase.from("profiles").select("equipped_hero_id").eq("id", user.id).maybeSingle(),
      supabase.from("day_results").select("gold_earned").eq("user_id", user.id),
      supabase.from("unlocked_heroes").select("hero_id, price_paid").eq("user_id", user.id),
    ]);

  if (pErr || rErr || oErr || !profile) {
    return (
      <main>
        <p role="alert">L'Échoppe est fermée un instant. Réessaie.</p>
        <a href="/qg">← Retour au QG</a>
      </main>
    );
  }

  const balance = goldBalance(results ?? [], owned ?? []);
  const ownedIds = (owned ?? []).map((r) => r.hero_id);

  return (
    <main>
      <a href="/qg">← Retour au QG</a>
      <CharacterSelect
        ownedIds={ownedIds}
        equippedId={profile.equipped_hero_id}
        balance={balance}
      />
    </main>
  );
}
```

> État Loading : géré par un `app/echoppe/loading.tsx` (squelette) — Next.js App Router l'affiche pendant le fetch du Server Component. État « roster complet » (variante d'Empty) : quand `ownedIds` couvre tout le catalogue, le solde reste affiché et aucune carte n'a de prix (comportement naturel de `CharacterSelect`).

- [ ] **Step 3: Ajouter `app/echoppe/loading.tsx`**

```tsx
export default function Loading() {
  return <main aria-busy="true">Ouverture de l'Échoppe…</main>;
}
```

- [ ] **Step 4: Lien QG → Échoppe**

Dans `app/qg/page.tsx`, ajouter un lien de navigation (nav QG hub) :

```tsx
<a href="/echoppe">🛒 L'Échoppe</a>
```

- [ ] **Step 5: Vérifier build + lint**

Run: `npm run build && npm run lint`
Expected: build OK, lint propre.

- [ ] **Step 6: Commit**

```bash
git add app/echoppe/page.tsx app/echoppe/loading.tsx app/qg/page.tsx lib/heroes.ts app/globals.css public/sprites/heroes
git commit -m "feat: add Echoppe screen + hero sprites + QG nav (US-18)"
```

---

## Task 13: e2e — `echoppe.spec.ts`

**Files:**
- Create: `e2e/echoppe.spec.ts`

**Interfaces:**
- Consumes: le compte e2e fixe (ADR-04), les routes `/echoppe` et `/qg`.

> ⚠️ Compte unique en série : ce spec **mute** l'état (achat persistant). Nettoyer en amont l'`unlocked_heroes` du compte de test et remettre `equipped_hero_id='fire_knight'` via un helper de fixture (server-side Supabase admin, comme les fixtures existantes), sinon un 2ᵉ run n'est pas déterministe. S'aligner sur le helper de reset déjà utilisé par `wake-up-ritual.spec.ts`.

- [ ] **Step 1: Écrire le test e2e**

```ts
import { expect, test } from "@playwright/test";
// Réutiliser le helper d'auth + reset des specs existants (cf. combat-loop.spec.ts).

test.describe("US-18 Échoppe", () => {
  test.beforeEach(async ({ page }) => {
    // login compte fixe + reset unlocked_heroes + equipped_hero_id='fire_knight'
    // + garantir un solde d'or suffisant (semer un day_result victory).
  });

  test("débloque puis équipe un héros", async ({ page }) => {
    await page.goto("/echoppe");
    // Fire Knight équipé par défaut
    await expect(page.getByRole("button", { name: /ÉQUIPÉ/ })).toBeVisible();

    // Sélectionner un héros verrouillé et l'acheter
    await page.locator('[data-hero-cell="water_priestess"]').click();
    await page.getByRole("button", { name: /Débloquer/ }).click();
    await page.getByRole("button", { name: "Confirmer" }).click();

    // Devient possédé → bouton Équiper, solde décrémenté
    await expect(page.getByRole("button", { name: "Équiper" })).toBeVisible();

    // Équiper
    await page.getByRole("button", { name: "Équiper" }).click();
    await expect(page.getByRole("button", { name: /ÉQUIPÉ/ })).toBeVisible();
  });

  test("refuse l'achat sans or suffisant", async ({ page }) => {
    // reset solde à 0 dans le beforeEach de ce test
    await page.goto("/echoppe");
    await page.locator('[data-hero-cell="metal_bladekeeper"]').click();
    // Bouton grisé (pas de "Débloquer" cliquable)
    await expect(page.getByRole("button", { name: /🪙 350$/ })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Lancer le e2e en local (série, prod)**

Run: `npx playwright test e2e/echoppe.spec.ts`
Expected: PASS (build prod démarré par la config).

- [ ] **Step 3: Commit**

```bash
git add e2e/echoppe.spec.ts
git commit -m "test: add echoppe e2e (US-18)"
```

---

## Task 14: Documentation

**Files:**
- Modify: `CLAUDE.md`, `CHANGELOG.md`, `ASSETS.md`

- [ ] **Step 1: `CLAUDE.md` — piège/décision**

Ajouter une entrée sous « Pièges et décisions non-évidentes » :

```markdown
**Économie d'or dérivée (US-18)** — L'or n'est jamais accumulé : `gold` = `SUM(day_results.gold_earned) − SUM(unlocked_heroes.price_paid)` (`goldBalance`, `lib/game-engine.ts`). `gold_earned` est écrit à la clôture (`closeDay`) et au backfill (chronologique, pour un bonus streak correct) via `computeGoldEarned` (base par issue + part dégâts + bonus streak cappé). `profiles.gold` n'est qu'un cache. L'Échoppe vend des **héros** (catalogue statique `lib/heroes.ts`, pas de table admin) ; possession dans `unlocked_heroes` (unique `(user_id, hero_id)`, **aucune policy DELETE**, RG-04). `fire_knight` possédé d'office sans ligne. `profiles.equipped_hero_id` = héros affiché dans l'Arène.
```

- [ ] **Step 2: `CHANGELOG.md` — ligne sous `[Unreleased]`**

```markdown
- US-18 : Échoppe (Character Select de héros), économie d'or (gain à la clôture, solde dérivé), possession `unlocked_heroes`.
```

- [ ] **Step 3: `ASSETS.md` — sprites copiés**

Noter les spritesheets idle copiées dans `public/sprites/heroes/<id>/idle.png` et rappeler le point licences (packs MC « sans licence documentée localement » à vérifier avant prod monétisée).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md CHANGELOG.md ASSETS.md
git commit -m "docs: document gold economy + Echoppe (US-18)"
```

---

## Self-Review (rempli)

- **Couverture spec** : économie d'or (T5/T6/T8), catalogue (T7), possession/achat/équip (T2/T3/T9), écran Character Select 3 états (T10/T11/T12), nav QG hub (T12), tests purs (T5/T6/T7) + e2e (T13), docs + licences (T14). Skins/décors = hors scope (spec §10) — non planifiés, correct.
- **Placeholders** : les `idleFrames`/chemins sprites sont marqués comme à confirmer à l'intégration (T7/T12) — dépendance d'asset réelle, pas un flou de logique. Le helper de reset e2e réutilise l'existant (T13).
- **Cohérence des types** : `computeGoldEarned(outcome, damageDealt, streakOnThatDay)`, `goldBalance(dayResults, unlockedHeroes)`, `isHeroOwned(heroId, ownedIds)`, `purchaseHero/equipHero(heroId)` — noms/signatures constants entre tâches et avec la spec.
- **Couplage US-12** : `currentStreak` renvoie un `number` aujourd'hui ; note explicite en T8 pour basculer sur `.length` quand US-12 le fera évoluer (formule d'or découplée).

## Vérification finale (après toutes les tâches)

1. `npx vitest run` vert (or + catalogue).
2. `npx tsc --noEmit` + `npm run build` + `npm run lint` propres.
3. `npx playwright test e2e/echoppe.spec.ts` vert en local (série, prod).
4. Manuel : gagner un jour → or crédité ; acheter un héros → solde décrémenté, carte en couleur ; équiper → sprite Arène change ; re-achat = no-op.
5. Base : `unlocked_heroes` sans DELETE ; `day_results.gold_earned` peuplé ; solde = formule dérivée.
