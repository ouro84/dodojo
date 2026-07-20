# US-18 Échoppe & Économie d'Or — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **RÉVISION 2026-07-20 (après revue du code réel)** : l'idle héros se rend via le composant existant `components/combat/IdleSprite.tsx` (frames PNG individuelles, `framePrefix` + index 4 chiffres, convention `/sprites/mc/<slug>/idle/frameNNNN.png`). On le réutilise (pas de nouveau composant spritesheet). `VersusScene.tsx` hardcode `fire-knight` → à câbler sur `equipped_hero_id`.
>
> **Environnement (2026-07-20)** : Docker/Supabase local **éteint** → les migrations sont **écrites** ici mais `supabase migration up` et l'e2e Playwright (serveur prod) sont **différés** jusqu'à `supabase start`. Le reset e2e utilise la clé secrète existante `NEXT_PRIVATE_KEY_SUPABASE` (pas de `SUPABASE_SERVICE_ROLE_KEY` dans `.env.local`).

**Goal:** Livrer la monnaie d'or (gagnée à la clôture du jour, solde dérivé) et l'Échoppe façon Character Select où l'on débloque/équipe des héros.

**Architecture:** Logique pure dans `lib/game-engine.ts` (barème d'or) et `lib/heroes.ts` (catalogue statique). L'or est écrit dans `day_results.gold_earned` par `closeDay`/`backfillMissedDays` (idempotent, recalculé). La possession vit dans une table `unlocked_heroes` (jamais de DELETE) ; le solde est dérivé `SUM(gold_earned) − SUM(price_paid)`. L'écran `app/echoppe/page.tsx` consomme catalogue + possession + solde, muté par les server actions `purchaseHero`/`equipHero`. Le rendu idle réutilise `IdleSprite`.

**Tech Stack:** Next.js 16 (App Router, server actions), Supabase (PostgreSQL + RLS), TypeScript strict, Vitest (logique pure), Playwright (e2e série, serveur prod).

## Global Constraints

- **TypeScript strict — interdiction de `any`.** Tout type explicite.
- **Logique de jeu dans `lib/game-engine.ts`** (testable sans UI). Catalogue héros dans `lib/heroes.ts`.
- **Rendu idle = réutiliser `components/combat/IdleSprite.tsx`** (frames PNG, `framePrefix`+`frameCount`). Convention publique `/sprites/mc/<slug>/idle/frameNNNN.png` (index sur 4 chiffres, base 0).
- **RG-04 — jamais de DELETE.** `unlocked_heroes` sans policy DELETE ; achat idempotent.
- **3 états UI** (Loading / Error / Empty) obligatoires sur tout écran.
- **Solde d'or dérivé, jamais accumulé** : `SUM(day_results.gold_earned) − SUM(unlocked_heroes.price_paid)`. `profiles.gold` = cache.
- **Chiffres recalculés, jamais accumulés** dans `day_results` (idempotence sur reclose).
- **Commits Conventional Commits** ; toute PR feature ajoute sa ligne sous `## [Unreleased]` de `CHANGELOG.md` dans le même commit.
- **e2e Playwright** : `fullyParallel: false`, serveur prod, compte fixe unique → isoler l'état muté (achats) via helper de reset service-role (`NEXT_PRIVATE_KEY_SUPABASE`).
- **Barème d'or (tunable, constantes)** : `GOLD_BASE = { victory: 50, retreat: 10, defeat: 0 }`, `GOLD_PER_DAMAGE_UNIT = 1` (par 20 dégâts), `GOLD_STREAK_BONUS_PER_DAY = 5`, `GOLD_STREAK_BONUS_CAP = 50`.
- **Héros par défaut** : `fire_knight` (slug `fire-knight`), possédé d'office (`price_paid = 0`), toujours considéré comme possédé sans ligne obligatoire.
- **DB différée** : écrire les migrations ; `supabase migration up` et l'e2e seront lancés quand Docker/Supabase tournera.

---

## File Structure

- `supabase/migrations/*_add_day_results_gold_earned.sql` — colonne `gold_earned`.
- `supabase/migrations/*_create_unlocked_heroes.sql` — table possession + RLS (pas de DELETE).
- `supabase/migrations/*_add_profile_equipped_hero.sql` — colonne `equipped_hero_id`.
- `types/index.ts` — étend `DayResult`, `Profile` ; ajoute `Hero`, `UnlockedHero`.
- `lib/game-engine.ts` — constantes `GOLD_*`, `computeGoldEarned`, `goldBalance`.
- `lib/heroes.ts` — catalogue statique `HEROES`, `DEFAULT_HERO_ID`, `getHero`, `isHeroOwned`.
- `lib/game-engine.test.ts`, `lib/heroes.test.ts` — tests purs.
- `app/actions/day.ts` — écrit `gold_earned` dans `closeDay` + `backfillMissedDays`.
- `app/actions/shop.ts` — `purchaseHero`, `equipHero`.
- `components/combat/HeroIdle.tsx` — wrapper mince sur `IdleSprite` (verrouillé = grayscale).
- `components/shop/CharacterSelect.tsx` — stage + matrice + modale d'achat.
- `components/combat/VersusScene.tsx` — accepte le héros équipé (frames dynamiques).
- `app/echoppe/page.tsx` + `app/echoppe/loading.tsx` — écran Échoppe (3 états UI).
- `app/qg/page.tsx` — lien vers l'Échoppe (nav QG hub).
- `scripts/copy-hero-sprites.sh` — copie/renomme les frames idle depuis `assets/MC`.
- `e2e/fixtures.ts` + `e2e/echoppe.spec.ts` — reset service-role + parcours achat/équip.
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

- [ ] **Step 2: (Différé Docker) Appliquer en local**

Run: `supabase migration up`
Expected: migration appliquée ; `\d day_results` montre `gold_earned`. **Différé tant que Docker est éteint.**

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

- [ ] **Step 2: (Différé Docker) Appliquer en local**

Run: `supabase migration up`
Expected: table `unlocked_heroes` créée, RLS active. **Différé.**

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

- [ ] **Step 2: (Différé Docker) Appliquer en local**

Run: `supabase migration up`
Expected: colonne présente, défaut `fire_knight`. **Différé.**

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
- Produces: `DayResult.gold_earned: number` ; `Profile.equipped_hero_id: string` ; `interface Hero` ; `interface UnlockedHero`.

- [ ] **Step 1: Étendre `DayResult` et `Profile`, ajouter `Hero` et `UnlockedHero`**

Ajouter `gold_earned: number;` à `DayResult` (après `xp_earned`), `equipped_hero_id: string;` à `Profile` (après `timezone`), et à la fin du fichier :

```ts
export interface Hero {
  id: string; // id logique/base, ex. "fire_knight"
  name: string;
  element: string;
  slug: string; // segment de chemin public, ex. "fire-knight"
  idleFramePrefix: string; // ex. "/sprites/mc/fire-knight/idle/frame"
  idleFrameCount: number;
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
Expected: aucune erreur.

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
- Consumes: `DayOutcome`.
- Produces: `computeGoldEarned(outcome: DayOutcome, damageDealt: number, streakOnThatDay: number): number` + constantes `GOLD_*`.

- [ ] **Step 1: Écrire les tests (échouants)**

Ajouter dans `lib/game-engine.test.ts` (importer `computeGoldEarned` depuis `./game-engine`) :

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
    expect(computeGoldEarned("victory", 120, 0)).toBe(50 + 6);
  });
  it("ajoute le bonus streak (+5 par jour de série)", () => {
    expect(computeGoldEarned("victory", 0, 3)).toBe(50 + 15);
  });
  it("plafonne le bonus streak à GOLD_STREAK_BONUS_CAP", () => {
    expect(computeGoldEarned("victory", 0, 100)).toBe(50 + 50);
  });
});
```

- [ ] **Step 2: Lancer les tests → échec attendu**

Run: `npx vitest run lib/game-engine.test.ts -t computeGoldEarned`
Expected: FAIL (`computeGoldEarned is not a function`).

- [ ] **Step 3: Implémenter dans `lib/game-engine.ts`** (près des constantes XP)

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
- Consumes: `DayResult`, `UnlockedHero` (import type).
- Produces: `goldBalance(dayResults: Pick<DayResult, "gold_earned">[], unlockedHeroes: Pick<UnlockedHero, "price_paid">[]): number`.

- [ ] **Step 1: Écrire les tests (échouants)**

```ts
describe("goldBalance", () => {
  it("solde = somme des gains moins somme des achats", () => {
    expect(goldBalance([{ gold_earned: 50 }, { gold_earned: 60 }], [{ price_paid: 40 }])).toBe(70);
  });
  it("nouvel utilisateur = 0", () => {
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

Ajouter `UnlockedHero` à l'import type en tête (`import type { DayOutcome, DayResult, Task, UnlockedHero } from "../types";`), puis :

```ts
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
- Consumes: `Hero`.
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
  it("ids et slugs uniques ; autres héros price > 0", () => {
    expect(new Set(HEROES.map((h) => h.id)).size).toBe(HEROES.length);
    expect(new Set(HEROES.map((h) => h.slug)).size).toBe(HEROES.length);
    for (const h of HEROES.filter((x) => !x.isDefault)) {
      expect(h.price).toBeGreaterThan(0);
      expect(h.idleFrameCount).toBeGreaterThan(0);
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

> `idleFrameCount` par héros = nombre réel de frames `01_idle` copiées (Task 12). `fire-knight` = 8 (confirmé dans `VersusScene`/assets). Confirmer les autres au moment de la copie et ajuster ici.

```ts
import type { Hero } from "../types";

export const DEFAULT_HERO_ID = "fire_knight";

const idlePrefix = (slug: string) => `/sprites/mc/${slug}/idle/frame`;

export const HEROES: Hero[] = [
  { id: "fire_knight", name: "Fire Knight", element: "Feu", slug: "fire-knight", idleFramePrefix: idlePrefix("fire-knight"), idleFrameCount: 8, price: 0, isDefault: true },
  { id: "water_priestess", name: "Water Priestess", element: "Eau", slug: "water-priestess", idleFramePrefix: idlePrefix("water-priestess"), idleFrameCount: 8, price: 200, isDefault: false },
  { id: "ground_monk", name: "Ground Monk", element: "Terre", slug: "ground-monk", idleFramePrefix: idlePrefix("ground-monk"), idleFrameCount: 8, price: 200, isDefault: false },
  { id: "wind_hashashin", name: "Wind Hashashin", element: "Vent", slug: "wind-hashashin", idleFramePrefix: idlePrefix("wind-hashashin"), idleFrameCount: 8, price: 300, isDefault: false },
  { id: "leaf_ranger", name: "Leaf Ranger", element: "Feuille", slug: "leaf-ranger", idleFramePrefix: idlePrefix("leaf-ranger"), idleFrameCount: 8, price: 300, isDefault: false },
  { id: "crystal_mauler", name: "Crystal Mauler", element: "Cristal", slug: "crystal-mauler", idleFramePrefix: idlePrefix("crystal-mauler"), idleFrameCount: 8, price: 350, isDefault: false },
  { id: "metal_bladekeeper", name: "Metal Bladekeeper", element: "Métal", slug: "metal-bladekeeper", idleFramePrefix: idlePrefix("metal-bladekeeper"), idleFrameCount: 8, price: 350, isDefault: false },
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
- Produces: `day_results.gold_earned` peuplé (idempotent).

> Note : `currentStreak(dayResults, today)` renvoie aujourd'hui un `number`. US-12 le fera évoluer vers `{ length, ... }` ; à ce moment-là, remplacer `currentStreak(...)` par `currentStreak(...).length` sur les 2 sites ci-dessous.

- [ ] **Step 1: `closeDay` — calculer streak + gold_earned**

Importer `computeGoldEarned` et `currentStreak` depuis `@/lib/game-engine`. Après le calcul de `summary` et avant l'upsert :

```ts
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

Ajouter `gold_earned: goldEarned,` dans l'objet `.upsert(...)`.

- [ ] **Step 2: `backfillMissedDays` — gold_earned chronologique**

Remplacer le bloc `const rows = Array.from(byDay, ...)` par :

```ts
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

- [ ] **Step 3: Vérifier compilation + tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: aucune erreur TS ; Vitest vert.

- [ ] **Step 4: Vérifier build**

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
- Consumes: `createClient` (`@/lib/supabase/server`), `getHero`, `isHeroOwned` (`@/lib/heroes`), `goldBalance` (`@/lib/game-engine`).
- Produces: `purchaseHero(heroId: string): Promise<{ error: string | null }>`, `equipHero(heroId: string): Promise<{ error: string | null }>`.

- [ ] **Step 1: Écrire `app/actions/shop.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { goldBalance } from "@/lib/game-engine";
import { getHero, isHeroOwned } from "@/lib/heroes";

interface ShopActionResult {
  error: string | null;
}

// US-18 : achat autoritaire côté serveur. Idempotent (re-achat = no-op),
// refus si solde insuffisant. Jamais de DELETE (RG-04).
export async function purchaseHero(heroId: string): Promise<ShopActionResult> {
  const hero = getHero(heroId);
  if (!hero) return { error: "Ce combattant n'existe pas." };
  if (hero.isDefault) return { error: null };

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

  if (isHeroOwned(heroId, ownedIds)) return { error: null };

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
  // Contrainte unique (user_id, hero_id) protège du double achat concurrent :
  // un conflit d'unicité (23505) est traité comme no-op idempotent.
  if (error && error.code !== "23505") {
    return { error: "L'achat a échoué. Réessaie." };
  }

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

## Task 10: Wrapper idle verrouillable — `HeroIdle.tsx`

**Files:**
- Create: `components/combat/HeroIdle.tsx`

**Interfaces:**
- Consumes: `IdleSprite` (default export `@/components/combat/IdleSprite`), `Hero`.
- Produces: `<HeroIdle hero locked?={boolean} className?={string} />`.

> Réutilise `IdleSprite` (gère déjà `prefers-reduced-motion`). Le verrou = filtre grayscale sur un wrapper.

- [ ] **Step 1: Écrire le composant**

```tsx
import IdleSprite from "./IdleSprite";
import type { Hero } from "@/types";

export default function HeroIdle({
  hero,
  locked = false,
  className,
}: {
  hero: Hero;
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
        framePrefix={hero.idleFramePrefix}
        frameCount={hero.idleFrameCount}
        alt={locked ? `${hero.name} (verrouillé)` : hero.name}
        className="h-full w-auto [image-rendering:pixelated]"
      />
    </div>
  );
}
```

- [ ] **Step 2: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add components/combat/HeroIdle.tsx
git commit -m "feat: add HeroIdle lockable idle wrapper (US-18)"
```

---

## Task 11: Character Select — `CharacterSelect.tsx`

**Files:**
- Create: `components/shop/CharacterSelect.tsx`

**Interfaces:**
- Consumes: `HEROES`, `getHero`, `isHeroOwned`, `DEFAULT_HERO_ID` (`@/lib/heroes`), `HeroIdle` (`@/components/combat/HeroIdle`), `purchaseHero`, `equipHero` (`@/app/actions/shop`).
- Produces: `<CharacterSelect ownedIds equippedId balance />` (client component).

- [ ] **Step 1: Écrire le composant client**

```tsx
"use client";

import { useState, useTransition } from "react";
import { HEROES, getHero, isHeroOwned, DEFAULT_HERO_ID } from "@/lib/heroes";
import { equipHero, purchaseHero } from "@/app/actions/shop";
import HeroIdle from "@/components/combat/HeroIdle";

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
      <div className="flex justify-between">
        <span>⚔️ CHOISIS TON COMBATTANT</span>
        <span data-testid="gold-balance">🪙 {balance}</span>
      </div>

      <div className="text-center">
        <HeroIdle hero={selected} locked={!owned} className="mx-auto h-28" />
        <div>{selected.name}</div>
        <div>Élément : {selected.element}</div>
        {error && <p role="alert">{error}</p>}
        <button
          onClick={onAction}
          disabled={pending || equipped || (!owned && !affordable)}
        >
          {equipped
            ? "✓ ÉQUIPÉ"
            : owned
              ? "Équiper"
              : affordable
                ? `🪙 ${selected.price} · Débloquer`
                : `🪙 ${selected.price}`}
        </button>
      </div>

      <div className="flex flex-wrap justify-center gap-1">
        {HEROES.map((h) => {
          const hOwned = isHeroOwned(h.id, ownedIds);
          return (
            <button
              key={h.id}
              data-hero-cell={h.id}
              data-owned={hOwned}
              aria-pressed={h.id === selectedId}
              onClick={() => {
                setSelectedId(h.id);
                setError(null);
              }}
              style={hOwned ? undefined : { filter: "grayscale(1) brightness(0.4)" }}
            >
              {h.element.slice(0, 1)}
            </button>
          );
        })}
      </div>

      {confirmId && (
        <div role="dialog" aria-label="Confirmer l'achat">
          <p>
            Débloquer {getHero(confirmId)?.name} pour {getHero(confirmId)?.price} or ?
          </p>
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

## Task 12: Copie des sprites idle

**Files:**
- Create: `scripts/copy-hero-sprites.sh`
- Assets produits: `public/sprites/mc/<slug>/idle/frameNNNN.png`

**Interfaces:**
- Produces: frames idle des héros achetables dans `public/`, nommées `frame0000.png…` (base 0, 4 chiffres) — compatibles `IdleSprite`.

> `fire-knight` est déjà dans `public/sprites/mc/fire-knight/idle/`. Ce script copie les 6 autres depuis `assets/MC/.../png/<hero>/01_idle/idle_N.png` (base 1) vers `frame(N-1 sur 4 chiffres).png`.

- [ ] **Step 1: Écrire le script**

```bash
#!/usr/bin/env bash
# US-18 : copie/renomme les frames idle des héros achetables vers public/.
# Source : assets/MC/<pack>/png/<hero>/01_idle/idle_N.png (base 1)
# Cible  : public/sprites/mc/<slug>/idle/frameNNNN.png (base 0, 4 chiffres)
set -euo pipefail

# slug|dossier source du pack|nom du sous-dossier hero
map=(
  "water-priestess|Elementals_water_priestess_FREE_v1.1|water_priestess"
  "ground-monk|Elementals_ground_monk_FREE_v1.3.1|ground_monk"
  "wind-hashashin|elementals_wind_hashashin_FREE_v1.1|wind_hashashin"
  "crystal-mauler|Elementals_Crystal_Mauler_Free_v1.0|crystal_mauler"
  "leaf-ranger|Elementals_Leaf_ranger_Free_v1.0|leaf_ranger"
  "metal-bladekeeper|Elementals_metal_bladekeeper_FREE_v1.1|metal_bladekeeper"
)

for entry in "${map[@]}"; do
  IFS='|' read -r slug pack hero <<< "$entry"
  # Recherche tolérante du dossier idle (casse/chemins variables entre packs).
  src=$(find "assets/MC/$pack" -type d -iname "*idle*" | head -n1 || true)
  if [[ -z "$src" ]]; then echo "SKIP $slug (idle introuvable dans $pack)"; continue; fi
  dest="public/sprites/mc/$slug/idle"
  mkdir -p "$dest"
  i=0
  for f in $(ls "$src"/*.png | sort -V); do
    printf -v n "%04d" "$i"
    cp "$f" "$dest/frame$n.png"
    i=$((i+1))
  done
  echo "$slug : $i frames -> $dest"
done
```

- [ ] **Step 2: Lancer le script + confirmer les compteurs de frames**

Run: `bash scripts/copy-hero-sprites.sh && ls public/sprites/mc/water-priestess/idle`
Expected: chaque héros affiche son nombre de frames ; `frame0000.png…` présents. **Ajuster `idleFrameCount` dans `lib/heroes.ts` si un héros n'a pas 8 frames**, puis `npx vitest run lib/heroes.test.ts` (toujours vert).

- [ ] **Step 3: Commit**

```bash
git add scripts/copy-hero-sprites.sh public/sprites/mc lib/heroes.ts
git commit -m "feat: copy hero idle sprites to public (US-18)"
```

---

## Task 13: Écran Échoppe + nav QG

**Files:**
- Create: `app/echoppe/page.tsx`, `app/echoppe/loading.tsx`
- Modify: `app/qg/page.tsx`

**Interfaces:**
- Consumes: `createClient`, `goldBalance`, `CharacterSelect`.
- Produces: route `/echoppe` (3 états UI) ; lien QG → Échoppe.

- [ ] **Step 1: Écrire `app/echoppe/page.tsx`** (Server Component, états Error/Empty)

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
        <p role="alert">L&apos;Échoppe est fermée un instant. Réessaie.</p>
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

> État Empty : le catalogue a toujours ≥1 héros ; le cas « roster complet » est géré naturellement par `CharacterSelect` (aucune carte à prix). État Loading = `loading.tsx` ci-dessous.

- [ ] **Step 2: `app/echoppe/loading.tsx`**

```tsx
export default function Loading() {
  return <main aria-busy="true">Ouverture de l&apos;Échoppe…</main>;
}
```

- [ ] **Step 3: Lien QG → Échoppe**

Dans `app/qg/page.tsx`, ajouter un lien de navigation :

```tsx
<a href="/echoppe">🛒 L&apos;Échoppe</a>
```

- [ ] **Step 4: Vérifier build + lint**

Run: `npm run build && npm run lint`
Expected: build OK, lint propre.

- [ ] **Step 5: Commit**

```bash
git add app/echoppe/page.tsx app/echoppe/loading.tsx app/qg/page.tsx
git commit -m "feat: add Echoppe screen + QG nav (US-18)"
```

---

## Task 14: Swap live du héros dans l'Arène

**Files:**
- Modify: `components/combat/VersusScene.tsx`, `app/page.tsx` (ou le parent qui monte `VersusScene`)

**Interfaces:**
- Consumes: `getHero`, `DEFAULT_HERO_ID` (`@/lib/heroes`), `profiles.equipped_hero_id`.
- Produces: `VersusScene` affiche le héros équipé (frames dynamiques) au lieu du `fire-knight` hardcodé.

- [ ] **Step 1: Paramétrer `VersusScene`**

Ajouter deux props et remplacer l'`IdleSprite` du héros hardcodé :

```tsx
// props ajoutées à VersusSceneProps :
heroFramePrefix: string;
heroFrameCount: number;
// remplacer le <IdleSprite framePrefix="/sprites/mc/fire-knight/idle/frame" frameCount={8} ... />
// du héros par :
<IdleSprite
  framePrefix={heroFramePrefix}
  frameCount={heroFrameCount}
  alt={`Ton héros : ${heroName}`}
  className="absolute bottom-2 left-4 h-28 w-auto [image-rendering:pixelated] drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)]"
/>
```

- [ ] **Step 2: Passer le héros équipé depuis le parent**

Là où `VersusScene` est monté (l'Arène — `app/page.tsx`), lire `profiles.equipped_hero_id`, résoudre via le catalogue, et passer les frames :

```tsx
import { getHero, DEFAULT_HERO_ID } from "@/lib/heroes";
// ...
const equipped = getHero(profile.equipped_hero_id) ?? getHero(DEFAULT_HERO_ID)!;
// <VersusScene ... heroFramePrefix={equipped.idleFramePrefix} heroFrameCount={equipped.idleFrameCount} />
```

> Vérifier le select du profil dans l'Arène : ajouter `equipped_hero_id` aux colonnes lues.

- [ ] **Step 3: Vérifier build + lint**

Run: `npm run build && npm run lint`
Expected: build OK, lint propre.

- [ ] **Step 4: Commit**

```bash
git add components/combat/VersusScene.tsx app/page.tsx
git commit -m "feat: render equipped hero in Arena versus scene (US-18)"
```

---

## Task 15: e2e — reset service-role + `echoppe.spec.ts` (différé Docker)

**Files:**
- Modify: `e2e/fixtures.ts`
- Create: `e2e/echoppe.spec.ts`

**Interfaces:**
- Consumes: `login` (existant), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PRIVATE_KEY_SUPABASE`, `E2E_TEST_EMAIL`.
- Produces: `resetShopState(): Promise<void>` (purge `unlocked_heroes`, `equipped_hero_id='fire_knight'`, sème un `day_result` victory pour l'or).

> ⚠️ **Exécution différée** : nécessite Docker/Supabase + serveur prod. Écrire maintenant, lancer quand la stack tourne. Le reset **DELETE** ici vise **la table `unlocked_heroes` via service-role hors RLS pour le compte de test uniquement** — c'est un utilitaire de test, pas le flux applicatif (l'app ne DELETE jamais, RG-04).

- [ ] **Step 1: Ajouter le helper de reset dans `e2e/fixtures.ts`**

```ts
import { createClient } from "@supabase/supabase-js";

export async function resetShopState(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PRIVATE_KEY_SUPABASE;
  const email = process.env.E2E_TEST_EMAIL;
  if (!url || !key || !email) {
    throw new Error("Reset e2e : NEXT_PUBLIC_SUPABASE_URL / NEXT_PRIVATE_KEY_SUPABASE / E2E_TEST_EMAIL manquants.");
  }
  const admin = createClient(url, key, { auth: { persistSession: false } });

  const { data: users } = await admin.auth.admin.listUsers();
  const testUser = users?.users.find((u) => u.email === email);
  if (!testUser) throw new Error("Reset e2e : utilisateur de test introuvable.");
  const uid = testUser.id;

  await admin.from("unlocked_heroes").delete().eq("user_id", uid);
  await admin.from("profiles").update({ equipped_hero_id: "fire_knight" }).eq("id", uid);
  // Sème un day_result victory (or suffisant pour acheter) — idempotent (upsert).
  await admin.from("day_results").upsert(
    {
      user_id: uid,
      day_date: "2000-01-01",
      outcome: "victory",
      damage_dealt: 200,
      boss_max_hp: 200,
      tasks_completed: 10,
      tasks_abandoned: 0,
      xp_earned: 300,
      gold_earned: 500,
      closed_manually: true,
    },
    { onConflict: "user_id,day_date" },
  );
}
```

- [ ] **Step 2: Écrire `e2e/echoppe.spec.ts`**

```ts
import { expect, test } from "@playwright/test";
import { login, resetShopState } from "./fixtures";

test.describe("US-18 Échoppe", () => {
  test.beforeEach(async ({ page }) => {
    await resetShopState();
    await login(page);
  });

  test("débloque puis équipe un héros", async ({ page }) => {
    await page.goto("/echoppe");
    await expect(page.getByRole("button", { name: /ÉQUIPÉ/ })).toBeVisible();

    await page.locator('[data-hero-cell="water_priestess"]').click();
    await page.getByRole("button", { name: /Débloquer/ }).click();
    await page.getByRole("button", { name: "Confirmer" }).click();

    await expect(page.getByRole("button", { name: "Équiper" })).toBeVisible();
    await page.getByRole("button", { name: "Équiper" }).click();
    await expect(page.getByRole("button", { name: /ÉQUIPÉ/ })).toBeVisible();
  });
});
```

- [ ] **Step 3: (Différé Docker) Lancer le e2e**

Run: `npx playwright test e2e/echoppe.spec.ts`
Expected: PASS (build prod démarré par la config). **Différé tant que Docker est éteint.**

- [ ] **Step 4: Commit**

```bash
git add e2e/fixtures.ts e2e/echoppe.spec.ts
git commit -m "test: add echoppe e2e + shop reset helper (US-18)"
```

---

## Task 16: Documentation

**Files:**
- Modify: `CLAUDE.md`, `CHANGELOG.md`, `ASSETS.md`

- [ ] **Step 1: `CLAUDE.md` — piège/décision**

Ajouter sous « Pièges et décisions non-évidentes » :

```markdown
**Économie d'or dérivée (US-18)** — L'or n'est jamais accumulé : `gold` = `SUM(day_results.gold_earned) − SUM(unlocked_heroes.price_paid)` (`goldBalance`, `lib/game-engine.ts`). `gold_earned` est écrit à la clôture (`closeDay`) et au backfill (chronologique, pour un bonus streak correct) via `computeGoldEarned` (base par issue + part dégâts + bonus streak cappé). `profiles.gold` n'est qu'un cache. L'Échoppe vend des **héros** (catalogue statique `lib/heroes.ts`, pas de table admin ; rendu idle via `IdleSprite`, frames `/sprites/mc/<slug>/idle/frameNNNN.png`) ; possession dans `unlocked_heroes` (unique `(user_id, hero_id)`, **aucune policy DELETE**, RG-04). `fire_knight` possédé d'office sans ligne. `profiles.equipped_hero_id` = héros affiché dans l'Arène (`VersusScene`).
```

- [ ] **Step 2: `CHANGELOG.md` — ligne sous `[Unreleased]`**

```markdown
- US-18 : Échoppe (Character Select de héros), économie d'or (gain à la clôture, solde dérivé), possession `unlocked_heroes`.
```

- [ ] **Step 3: `ASSETS.md` — sprites copiés**

Noter les frames idle copiées dans `public/sprites/mc/<slug>/idle/` (via `scripts/copy-hero-sprites.sh`) et rappeler le point licences (packs MC « sans licence documentée localement » à vérifier avant prod monétisée).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md CHANGELOG.md ASSETS.md
git commit -m "docs: document gold economy + Echoppe (US-18)"
```

---

## Self-Review (rempli)

- **Couverture spec** : économie d'or (T5/T6/T8), catalogue (T7), possession/achat/équip (T2/T3/T9), rendu idle réutilisant IdleSprite (T10), Character Select 3 états (T11/T13), copie assets (T12), swap Arène (T14), nav QG (T13), tests purs (T5/T6/T7) + e2e différé (T15), docs + licences (T16). Skins/décors = hors scope (spec §10).
- **Placeholders** : `idleFrameCount` par héros confirmé à la copie (T12) — dépendance d'asset réelle. e2e/migrations marqués **différés Docker** explicitement.
- **Cohérence des types** : `Hero {id,name,element,slug,idleFramePrefix,idleFrameCount,price,isDefault}` cohérent entre T4/T7/T10/T11/T14 ; `computeGoldEarned(outcome,damageDealt,streakOnThatDay)`, `goldBalance(dayResults,unlockedHeroes)`, `isHeroOwned(heroId,ownedIds)`, `purchaseHero/equipHero(heroId)` constants.
- **Couplage US-12** : `currentStreak` renvoie `number` aujourd'hui ; note T8 pour basculer sur `.length` après US-12.

## Vérification finale (après toutes les tâches)

1. `npx vitest run` vert (or + catalogue).
2. `npx tsc --noEmit` + `npm run build` + `npm run lint` propres.
3. **(Docker requis)** `supabase migration up` OK ; `npx playwright test e2e/echoppe.spec.ts` vert en local (série, prod).
4. Manuel : gagner un jour → or crédité ; acheter un héros → solde décrémenté, carte en couleur ; équiper → sprite Arène change ; re-achat = no-op.
5. Base : `unlocked_heroes` sans DELETE ; `day_results.gold_earned` peuplé ; solde = formule dérivée.
