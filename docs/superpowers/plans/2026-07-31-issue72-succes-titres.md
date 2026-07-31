# Issue #72 — Système de Succès & Titres Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le mécanisme mono-titre auto-écrasé (`titleForStreak`/`profiles.current_title`) par un vrai système de succès : catalogue de 26 succès (4 raretés), déblocage server-authoritative à 4 checkpoints, titre équipable manuellement, notification en direct, écran catalogue avec succès mystère + barres de progression.

**Architecture:** Toute la logique de condition est pure dans `lib/achievements.ts` (nouveau fichier, testé Vitest), sur le même patron que `currentStreak`/`goldBalance` (`lib/game-engine.ts`). L'état débloqué est un **journal append-only** (`unlocked_achievements`, jamais UPDATE/DELETE — RG-04), écrit par 4 server actions déjà existantes (complétion de tâche, clôture de jour, résolution du boss du jour, achat/starter d'un héros). `resolveDailyBoss` assemble le contexte **complet** (pas seulement boss/décors) — comme il tourne déjà à chaque chargement de l'Arène, ça sert aussi de rattrapage naturel pour les profils existants, sans script de migration séparé.

**Tech Stack:** Next.js 16 (App Router, server actions), Supabase (PostgreSQL, RLS), TypeScript strict, Vitest, Playwright (e2e).

## Global Constraints

- **TypeScript strict — pas de `any`.**
- **Toute logique de condition en TypeScript pur** dans `lib/achievements.ts` — jamais de trigger/logique métier SQL.
- **`unlocked_achievements` : journal append-only.** Unique `(user_id, code)`, aucune policy UPDATE/DELETE (RG-04). Un succès débloqué n'est **jamais** révoqué.
- **Platine exclut les 5 paliers de niveau easter egg** (`LEVEL_212/666/777/1000/9001`, `countsTowardPlatinum: false`) — mathématiquement hors d'atteinte, leur inclusion rendrait Platine inobtenable.
- **26 succès au total** : 25 dans `ACHIEVEMENTS` (évalués en boucle) + `PLATINUM` (cas spécial, jamais dans la boucle d'évaluation).
- **`ALL_BOSSES`/`HALF_BOSSES` lisent `BOSSES.length` dynamiquement** (27 confirmé, issue #74 déjà mergée) — jamais un nombre en dur. `HALF_BOSSES` = `Math.ceil(BOSSES.length / 2)`.
- **Deux modes d'affichage avant déblocage** : `mystery` (titre/description masqués) pour 21 succès ; `progress` (barre `current/total` toujours visible) pour 5 succès à compteur (`ALL_HEROES`, `HALF_BOSSES`, `ALL_BOSSES`, `ALL_BACKGROUNDS`, `PLATINUM`).
- **Titre équipé sticky après 1er choix manuel** : `profiles.equipped_title_code` + `profiles.title_manually_set`. Auto-affiche le plus prestigieux tant que `title_manually_set = false`.
- **Textes fixes** — pas de déclinaison par niveau d'agressivité (doux/direct/brut).
- **3 états UI obligatoires** (règle projet n°3) sur l'écran catalogue.
- **Réflexe non négociable** : dernière tâche = mettre à jour `CLAUDE.md`/`CHANGELOG.md`/`SPECS_FONCTIONNELLES.md` + commenter l'issue #72 dans le même travail.

---

## File Structure

- `supabase/migrations/20260731100000_create_unlocked_achievements.sql` — nouvelle table.
- `supabase/migrations/20260731100100_add_profile_title_fields.sql` — `equipped_title_code`/`title_manually_set`.
- `supabase/migrations/20260731190000_drop_profile_current_title.sql` — nettoyage final.
- `types/index.ts` — `Profile` : ajout puis (Task 12) suppression de `current_title`.
- `lib/achievements.ts` (nouveau) — catalogue + `evaluateAchievements`/`bestTitleCode`/`achievementProgressFor`/`getAchievement`.
- `lib/achievements.test.ts` (nouveau) — tests Vitest.
- `lib/game-engine.ts` — suppression de `titleForStreak` (Task 12).
- `lib/game-engine.test.ts` — suppression du describe `titleForStreak` (Task 12).
- `app/actions/achievements.ts` (nouveau) — `assembleAchievementContext`, `applyNewAchievements`, `equipTitle`.
- `app/actions/tasks.ts` — checkpoint dans `setTaskCompleted`.
- `app/actions/day.ts` — checkpoint dans `closeDay`/`backfillMissedDays`, suppression de `titleForStreak`.
- `app/actions/boss.ts` — checkpoint (contexte complet) dans `resolveDailyBoss`.
- `app/actions/shop.ts` — checkpoint dans `purchaseHero`.
- `app/onboarding/actions.ts` — checkpoint dans `createProfile` (héros starter).
- `app/page.tsx` — passe `daily.newAchievements` à `Arena`.
- `components/combat/Arena.tsx` — état `achievementQueue`, rendu `AchievementToast`, titre résolu pour les cartes de partage.
- `components/combat/AchievementToast.tsx` (nouveau) + `AchievementToast.test.tsx` (nouveau).
- `components/shop/CharacterSelect.tsx` — état `achievementQueue` + `AchievementToast` (Marché Noir).
- `app/tableau-de-chasse/succes/page.tsx` (nouveau) + `loading.tsx` (nouveau).
- `components/pantheon/TitleSelector.tsx` (nouveau).
- `app/tableau-de-chasse/page.tsx` — remplace le Bloc Titres + `activeTitle`.
- `app/globals.css` — animation `achievement-toast`.
- `e2e/fixtures.ts` — `resetAchievementsState`.
- `e2e/achievements.spec.ts` (nouveau).
- `CLAUDE.md`, `CHANGELOG.md`, `SPECS_FONCTIONNELLES.md` — docs. Issue #72.

---

## Task 1: Migration — table `unlocked_achievements`

**Files:**
- Create: `supabase/migrations/20260731100000_create_unlocked_achievements.sql`

**Interfaces:**
- Produces: table `unlocked_achievements(id, user_id, code, unlocked_at)`, unique `(user_id, code)`.

- [ ] **Step 1: Écrire la migration**

```sql
-- Issue #72 : journal append-only des succès débloqués. Toute la logique de
-- condition est en TypeScript pur (lib/achievements.ts) — cette table ne
-- contient aucune logique métier, uniquement l'état. Jamais de DELETE/UPDATE
-- (RG-04, même patron que unlocked_heroes/unlocked_skins).
create table public.unlocked_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  code text not null,
  unlocked_at timestamptz not null default now(),
  unique (user_id, code)
);

create index unlocked_achievements_user_idx on public.unlocked_achievements (user_id);

alter table public.unlocked_achievements enable row level security;

create policy "unlocked_achievements_select_own"
  on public.unlocked_achievements for select
  using (user_id = auth.uid());

create policy "unlocked_achievements_insert_own"
  on public.unlocked_achievements for insert
  with check (user_id = auth.uid());

-- Volontairement aucune policy UPDATE ni DELETE (RG-04).
```

- [ ] **Step 2: (Différé si Docker éteint) Appliquer**

Run: `supabase db push` (projet distant lié) ou `supabase migration up` (local).
Expected: table présente. Peut être différé, à appliquer avant l'e2e/prod.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260731100000_create_unlocked_achievements.sql
git commit -m "feat: add unlocked_achievements table (issue #72)"
```

---

## Task 2: Migration + type — `profiles.equipped_title_code`/`title_manually_set`

**Files:**
- Create: `supabase/migrations/20260731100100_add_profile_title_fields.sql`
- Modify: `types/index.ts`

**Interfaces:**
- Produces: colonnes `profiles.equipped_title_code text null`, `profiles.title_manually_set boolean not null default false` ; `Profile.equipped_title_code: string | null`, `Profile.title_manually_set: boolean`.
- **`current_title` reste en base et dans le type pour l'instant** — supprimé uniquement en Task 12, une fois tous les call-sites migrés.

- [ ] **Step 1: Écrire la migration**

```sql
-- Issue #72 : titre équipé manuellement (remplace current_title — cf. Task 12
-- du plan pour la suppression de l'ancienne colonne une fois tous les
-- appelants migrés).
alter table public.profiles
  add column equipped_title_code text null,
  add column title_manually_set boolean not null default false;
```

- [ ] **Step 2: (Différé si Docker éteint) Appliquer**

Run: `supabase db push` ou `supabase migration up`.
Expected: colonnes présentes.

- [ ] **Step 3: Ajouter les champs à `Profile`**

Dans `types/index.ts`, juste après la ligne `current_title: string;` (ligne 9), ajouter :

```ts
  equipped_title_code: string | null;
  title_manually_set: boolean;
```

- [ ] **Step 4: Vérifier**

Run: `npx tsc --noEmit`
Expected: aucune nouvelle erreur.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260731100100_add_profile_title_fields.sql types/index.ts
git commit -m "feat: add equipped_title_code/title_manually_set to profiles (issue #72)"
```

---

## Task 3: `lib/achievements.ts` — catalogue + moteur pur

**Files:**
- Create: `lib/achievements.ts`
- Test: `lib/achievements.test.ts`

**Interfaces:**
- Consumes: `HEROES` (`lib/heroes.ts`), `BOSSES` (`lib/bosses.ts`), `BACKGROUNDS` (`lib/backgrounds.ts`).
- Produces:
  - `type AchievementRarity = "bronze" | "argent" | "or" | "platine"`
  - `type AchievementDisplayMode = "mystery" | "progress"`
  - `interface AchievementContext { level: number; bestStreak: number; hasVictory: boolean; unlockedHeroIds: string[]; seenBossIds: string[]; seenBackgroundIds: string[] }`
  - `interface AchievementDef { code: string; category: string; rarity: AchievementRarity; title: string; description: string; countsTowardPlatinum: boolean; displayMode: AchievementDisplayMode; isUnlocked: (ctx: AchievementContext) => boolean }`
  - `const ACHIEVEMENTS: AchievementDef[]` (25, sans Platine)
  - `const PLATINUM_CODE = "PLATINUM"`
  - `const ALL_ACHIEVEMENT_DEFS: AchievementDef[]` (26, avec Platine — pour affichage/lookup)
  - `const TOTAL_ACHIEVEMENTS_COUNT: number` (26)
  - `function getAchievement(code: string): AchievementDef | undefined`
  - `function evaluateAchievements(ctx: AchievementContext, alreadyUnlocked: Set<string>): string[]`
  - `function bestTitleCode(unlocked: { code: string; unlockedAt: string }[]): string | null`
  - `function achievementProgressFor(code: string, ctx: AchievementContext, unlockedCodes: Set<string>): { current: number; total: number } | null`

- [ ] **Step 1: Écrire les tests (échouants)**

Créer `lib/achievements.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENTS,
  PLATINUM_CODE,
  TOTAL_ACHIEVEMENTS_COUNT,
  achievementProgressFor,
  bestTitleCode,
  evaluateAchievements,
  getAchievement,
  type AchievementContext,
} from "./achievements";
import { HEROES } from "./heroes";
import { BOSSES } from "./bosses";
import { BACKGROUNDS } from "./backgrounds";

function baseCtx(overrides: Partial<AchievementContext> = {}): AchievementContext {
  return {
    level: 1,
    bestStreak: 0,
    hasVictory: false,
    unlockedHeroIds: [],
    seenBossIds: [],
    seenBackgroundIds: [],
    ...overrides,
  };
}

describe("evaluateAchievements", () => {
  it("ne débloque rien sur un contexte vierge", () => {
    expect(evaluateAchievements(baseCtx(), new Set())).toEqual([]);
  });

  it("débloque un succès héros quand le héros est possédé", () => {
    const codes = evaluateAchievements(baseCtx({ unlockedHeroIds: ["fire_knight"] }), new Set());
    expect(codes).toContain("HERO_FIRE_KNIGHT");
  });

  it("débloque ALL_HEROES quand tous les héros sont possédés", () => {
    const allIds = HEROES.map((h) => h.id);
    expect(evaluateAchievements(baseCtx({ unlockedHeroIds: allIds }), new Set())).toContain(
      "ALL_HEROES",
    );
  });

  it("débloque FIRST_VICTORY", () => {
    expect(evaluateAchievements(baseCtx({ hasVictory: true }), new Set())).toContain(
      "FIRST_VICTORY",
    );
  });

  it.each([
    [7, "STREAK_7"],
    [30, "STREAK_30"],
    [100, "STREAK_100"],
  ])("débloque la série %s -> %s", (streak, code) => {
    expect(evaluateAchievements(baseCtx({ bestStreak: streak as number }), new Set())).toContain(
      code,
    );
  });

  it("débloque HALF_BOSSES à la moitié du roster, pas avant", () => {
    const half = Math.ceil(BOSSES.length / 2);
    const tooFew = BOSSES.slice(0, half - 1).map((b) => b.id);
    expect(evaluateAchievements(baseCtx({ seenBossIds: tooFew }), new Set())).not.toContain(
      "HALF_BOSSES",
    );
    const enough = BOSSES.slice(0, half).map((b) => b.id);
    expect(evaluateAchievements(baseCtx({ seenBossIds: enough }), new Set())).toContain(
      "HALF_BOSSES",
    );
  });

  it("débloque ALL_BOSSES quand tout le roster est vu", () => {
    const allIds = BOSSES.map((b) => b.id);
    expect(evaluateAchievements(baseCtx({ seenBossIds: allIds }), new Set())).toContain(
      "ALL_BOSSES",
    );
  });

  it("débloque ALL_BACKGROUNDS quand tous les décors sont vus", () => {
    const allIds = BACKGROUNDS.map((b) => b.id);
    expect(evaluateAchievements(baseCtx({ seenBackgroundIds: allIds }), new Set())).toContain(
      "ALL_BACKGROUNDS",
    );
  });

  it.each([
    [10, "LEVEL_10"],
    [20, "LEVEL_20"],
    [50, "LEVEL_50"],
    [84, "LEVEL_84"],
    [100, "LEVEL_100"],
    [212, "LEVEL_212"],
    [666, "LEVEL_666"],
    [777, "LEVEL_777"],
    [1000, "LEVEL_1000"],
    [9001, "LEVEL_9001"],
  ])("débloque le niveau %s -> %s", (level, code) => {
    expect(evaluateAchievements(baseCtx({ level: level as number }), new Set())).toContain(code);
  });

  it("est idempotent : un code déjà débloqué n'est jamais re-retourné", () => {
    const already = new Set(["FIRST_VICTORY"]);
    expect(evaluateAchievements(baseCtx({ hasVictory: true }), already)).not.toContain(
      "FIRST_VICTORY",
    );
  });

  it("PLATINUM : débloqué à 20/20 succès éligibles, jamais avant, jamais via les easter eggs seuls", () => {
    const eligible = ACHIEVEMENTS.filter((a) => a.countsTowardPlatinum).map((a) => a.code);
    expect(eligible.length).toBe(20);

    const almostAll = new Set(eligible.slice(0, eligible.length - 1));
    expect(evaluateAchievements(baseCtx(), almostAll)).not.toContain(PLATINUM_CODE);

    const allEligible = new Set(eligible);
    expect(evaluateAchievements(baseCtx(), allEligible)).toContain(PLATINUM_CODE);

    const onlyEasterEggs = new Set(
      ACHIEVEMENTS.filter((a) => !a.countsTowardPlatinum).map((a) => a.code),
    );
    expect(evaluateAchievements(baseCtx({ level: 9001 }), onlyEasterEggs)).not.toContain(
      PLATINUM_CODE,
    );
  });
});

describe("bestTitleCode", () => {
  it("renvoie null sans succès débloqué", () => {
    expect(bestTitleCode([])).toBeNull();
  });

  it("choisit la rareté la plus haute", () => {
    const unlocked = [
      { code: "HERO_FIRE_KNIGHT", unlockedAt: "2026-01-01T00:00:00Z" },
      { code: "STREAK_100", unlockedAt: "2026-01-02T00:00:00Z" },
    ];
    expect(bestTitleCode(unlocked)).toBe("STREAK_100");
  });

  it("départage l'égalité de rareté par le plus récent", () => {
    const unlocked = [
      { code: "STREAK_7", unlockedAt: "2026-01-01T00:00:00Z" },
      { code: "STREAK_30", unlockedAt: "2026-01-02T00:00:00Z" },
    ];
    expect(bestTitleCode(unlocked)).toBe("STREAK_30");
  });
});

describe("achievementProgressFor", () => {
  it("renvoie null pour un succès mystère", () => {
    expect(achievementProgressFor("FIRST_VICTORY", baseCtx(), new Set())).toBeNull();
  });

  it("renvoie current/total pour ALL_HEROES", () => {
    expect(
      achievementProgressFor("ALL_HEROES", baseCtx({ unlockedHeroIds: ["fire_knight"] }), new Set()),
    ).toEqual({ current: 1, total: HEROES.length });
  });

  it("HALF_BOSSES et ALL_BOSSES partagent le même progrès", () => {
    const ctx = baseCtx({ seenBossIds: [BOSSES[0].id] });
    expect(achievementProgressFor("HALF_BOSSES", ctx, new Set())).toEqual(
      achievementProgressFor("ALL_BOSSES", ctx, new Set()),
    );
  });

  it("PLATINUM compte les succès éligibles débloqués", () => {
    const eligible = ACHIEVEMENTS.filter((a) => a.countsTowardPlatinum).map((a) => a.code);
    expect(
      achievementProgressFor(PLATINUM_CODE, baseCtx(), new Set([eligible[0]])),
    ).toEqual({ current: 1, total: eligible.length });
  });
});

describe("catalogue", () => {
  it("expose 26 succès au total (25 + Platine)", () => {
    expect(ACHIEVEMENTS.length).toBe(25);
    expect(TOTAL_ACHIEVEMENTS_COUNT).toBe(26);
  });

  it("résout le titre Platine", () => {
    expect(getAchievement(PLATINUM_CODE)?.title).toBe("Démon Vaincu");
  });
});
```

- [ ] **Step 2: Lancer → échec attendu**

Run: `npx vitest run lib/achievements.test.ts`
Expected: FAIL (module `./achievements` introuvable).

- [ ] **Step 3: Écrire `lib/achievements.ts`**

```ts
// Issue #72 : catalogue de succès + titres équipables. Remplace titleForStreak
// (lib/game-engine.ts). Toute la logique de condition est pure ici (D2 du
// spec) : aucun accès base, tout le contexte est assemblé par l'appelant
// (app/actions/achievements.ts) avant l'appel.
// Voir docs/superpowers/specs/2026-07-31-issue72-succes-titres-design.md.
import { HEROES } from "./heroes";
import { BOSSES } from "./bosses";
import { BACKGROUNDS } from "./backgrounds";

export type AchievementRarity = "bronze" | "argent" | "or" | "platine";
export type AchievementDisplayMode = "mystery" | "progress";

export interface AchievementContext {
  level: number;
  bestStreak: number;
  hasVictory: boolean;
  unlockedHeroIds: string[];
  seenBossIds: string[];
  seenBackgroundIds: string[];
}

export interface AchievementDef {
  code: string;
  category: string;
  rarity: AchievementRarity;
  title: string;
  description: string;
  countsTowardPlatinum: boolean;
  displayMode: AchievementDisplayMode;
  isUnlocked: (ctx: AchievementContext) => boolean;
}

const HERO_TITLES: Record<string, { title: string; description: string }> = {
  fire_knight: { title: "Flamme Intérieure", description: "Chevalier de Feu débloqué." },
  water_priestess: { title: "Marée Calme", description: "Prêtresse de l'Eau débloquée." },
  ground_monk: { title: "Racines", description: "Moine de la Terre débloqué." },
  wind_hashashin: { title: "Souffle", description: "Hashashin du Vent débloqué." },
  leaf_ranger: { title: "Mue", description: "Rôdeuse des Feuilles débloquée." },
  crystal_mauler: { title: "Facette", description: "Massacreur de Cristal débloqué." },
  metal_bladekeeper: { title: "Lame Froide", description: "Gardien de Lame débloqué." },
};

const HERO_ACHIEVEMENTS: AchievementDef[] = HEROES.map((hero) => {
  const copy = HERO_TITLES[hero.id];
  return {
    code: `HERO_${hero.id.toUpperCase()}`,
    category: "hero",
    rarity: "bronze",
    title: copy.title,
    description: copy.description,
    countsTowardPlatinum: true,
    displayMode: "mystery",
    isUnlocked: (ctx) => ctx.unlockedHeroIds.includes(hero.id),
  };
});

export const PLATINUM_CODE = "PLATINUM";

const OTHER_ACHIEVEMENTS: AchievementDef[] = [
  {
    code: "ALL_HEROES",
    category: "collection",
    rarity: "or",
    title: "Ensemble on est plus fort",
    description: "Tous les héros débloqués.",
    countsTowardPlatinum: true,
    displayMode: "progress",
    isUnlocked: (ctx) => ctx.unlockedHeroIds.length >= HEROES.length,
  },
  {
    code: "FIRST_VICTORY",
    category: "progression",
    rarity: "bronze",
    title: "Aube",
    description: "Première victoire remportée.",
    countsTowardPlatinum: true,
    displayMode: "mystery",
    isUnlocked: (ctx) => ctx.hasVictory,
  },
  {
    code: "STREAK_7",
    category: "streak",
    rarity: "argent",
    title: "Calme",
    description: "Série de 7 jours de victoire.",
    countsTowardPlatinum: true,
    displayMode: "mystery",
    isUnlocked: (ctx) => ctx.bestStreak >= 7,
  },
  {
    code: "STREAK_30",
    category: "streak",
    rarity: "argent",
    title: "Silence",
    description: "Série de 30 jours de victoire.",
    countsTowardPlatinum: true,
    displayMode: "mystery",
    isUnlocked: (ctx) => ctx.bestStreak >= 30,
  },
  {
    code: "STREAK_100",
    category: "streak",
    rarity: "or",
    title: "Esprit Vide",
    description: "Série de 100 jours de victoire.",
    countsTowardPlatinum: true,
    displayMode: "mystery",
    isUnlocked: (ctx) => ctx.bestStreak >= 100,
  },
  {
    code: "HALF_BOSSES",
    category: "exploration",
    rarity: "bronze",
    title: "La moitié du chemin",
    description: "La moitié du roster de boss rencontrée.",
    countsTowardPlatinum: true,
    displayMode: "progress",
    isUnlocked: (ctx) => ctx.seenBossIds.length >= Math.ceil(BOSSES.length / 2),
  },
  {
    code: "ALL_BOSSES",
    category: "exploration",
    rarity: "or",
    title: "A vaincu une armée",
    description: "Tous les boss rencontrés.",
    countsTowardPlatinum: true,
    displayMode: "progress",
    isUnlocked: (ctx) => ctx.seenBossIds.length >= BOSSES.length,
  },
  {
    code: "ALL_BACKGROUNDS",
    category: "exploration",
    rarity: "argent",
    title: "Chaque Paysage",
    description: "Tous les décors rencontrés.",
    countsTowardPlatinum: true,
    displayMode: "progress",
    isUnlocked: (ctx) => ctx.seenBackgroundIds.length >= BACKGROUNDS.length,
  },
  {
    code: "LEVEL_10",
    category: "level",
    rarity: "bronze",
    title: "Level UP",
    description: "Niveau 10 atteint.",
    countsTowardPlatinum: true,
    displayMode: "mystery",
    isUnlocked: (ctx) => ctx.level >= 10,
  },
  {
    code: "LEVEL_20",
    category: "level",
    rarity: "bronze",
    title: "Rigueur",
    description: "Niveau 20 atteint.",
    countsTowardPlatinum: true,
    displayMode: "mystery",
    isUnlocked: (ctx) => ctx.level >= 20,
  },
  {
    code: "LEVEL_50",
    category: "level",
    rarity: "argent",
    title: "Ténacité",
    description: "Niveau 50 atteint.",
    countsTowardPlatinum: true,
    displayMode: "mystery",
    isUnlocked: (ctx) => ctx.level >= 50,
  },
  {
    code: "LEVEL_84",
    category: "level",
    rarity: "argent",
    title: "Trad's",
    description: "Niveau 84 atteint.",
    countsTowardPlatinum: true,
    displayMode: "mystery",
    isUnlocked: (ctx) => ctx.level >= 84,
  },
  {
    code: "LEVEL_100",
    category: "level",
    rarity: "argent",
    title: "Enfin !",
    description: "Niveau 100 atteint.",
    countsTowardPlatinum: true,
    displayMode: "mystery",
    isUnlocked: (ctx) => ctx.level >= 100,
  },
  {
    code: "LEVEL_212",
    category: "level",
    rarity: "or",
    title: "Prom's",
    description: "Niveau 212 atteint.",
    countsTowardPlatinum: false,
    displayMode: "mystery",
    isUnlocked: (ctx) => ctx.level >= 212,
  },
  {
    code: "LEVEL_666",
    category: "level",
    rarity: "or",
    title: "Damné",
    description: "Niveau 666 atteint.",
    countsTowardPlatinum: false,
    displayMode: "mystery",
    isUnlocked: (ctx) => ctx.level >= 666,
  },
  {
    code: "LEVEL_777",
    category: "level",
    rarity: "or",
    title: "Veinard",
    description: "Niveau 777 atteint.",
    countsTowardPlatinum: false,
    displayMode: "mystery",
    isUnlocked: (ctx) => ctx.level >= 777,
  },
  {
    code: "LEVEL_1000",
    category: "level",
    rarity: "or",
    title: "Mythe",
    description: "Niveau 1000 atteint.",
    countsTowardPlatinum: false,
    displayMode: "mystery",
    isUnlocked: (ctx) => ctx.level >= 1000,
  },
  {
    code: "LEVEL_9001",
    category: "level",
    rarity: "or",
    title: "Super Saiyan",
    description: "Niveau 9001 atteint.",
    countsTowardPlatinum: false,
    displayMode: "mystery",
    isUnlocked: (ctx) => ctx.level >= 9001,
  },
];

// 25 succès évalués en boucle par evaluateAchievements. PLATINUM n'y figure
// PAS (cas spécial : sa condition référence les 24 autres, cf. plus bas).
export const ACHIEVEMENTS: AchievementDef[] = [...HERO_ACHIEVEMENTS, ...OTHER_ACHIEVEMENTS];

const PLATINUM_ELIGIBLE_CODES = ACHIEVEMENTS.filter((a) => a.countsTowardPlatinum).map(
  (a) => a.code,
);

const PLATINUM_DEF: AchievementDef = {
  code: PLATINUM_CODE,
  category: "meta",
  rarity: "platine",
  title: "Démon Vaincu",
  description: "Tous les succès obtenus (hors paliers de niveau extrêmes).",
  countsTowardPlatinum: false,
  displayMode: "progress",
  // Jamais appelée : PLATINUM est évaluée spécifiquement dans evaluateAchievements.
  isUnlocked: () => false,
};

// 26 entrées — pour l'affichage catalogue et les lookups (getAchievement).
export const ALL_ACHIEVEMENT_DEFS: AchievementDef[] = [...ACHIEVEMENTS, PLATINUM_DEF];

export const TOTAL_ACHIEVEMENTS_COUNT = ALL_ACHIEVEMENT_DEFS.length;

export function getAchievement(code: string): AchievementDef | undefined {
  return ALL_ACHIEVEMENT_DEFS.find((a) => a.code === code);
}

export function evaluateAchievements(
  ctx: AchievementContext,
  alreadyUnlocked: Set<string>,
): string[] {
  const newlyUnlocked: string[] = [];
  for (const def of ACHIEVEMENTS) {
    if (!alreadyUnlocked.has(def.code) && def.isUnlocked(ctx)) {
      newlyUnlocked.push(def.code);
    }
  }

  const unlockedNow = new Set([...alreadyUnlocked, ...newlyUnlocked]);
  const allEligibleUnlocked = PLATINUM_ELIGIBLE_CODES.every((code) => unlockedNow.has(code));
  if (allEligibleUnlocked && !alreadyUnlocked.has(PLATINUM_CODE)) {
    newlyUnlocked.push(PLATINUM_CODE);
  }
  return newlyUnlocked;
}

const RARITY_RANK: Record<AchievementRarity, number> = {
  bronze: 0,
  argent: 1,
  or: 2,
  platine: 3,
};

// « meilleur » titre débloqué : rareté la plus haute, égalité départagée par
// la date de déblocage la plus récente.
export function bestTitleCode(unlocked: { code: string; unlockedAt: string }[]): string | null {
  if (unlocked.length === 0) return null;
  let best = unlocked[0];
  let bestRarity = getAchievement(best.code)?.rarity ?? "bronze";
  for (const candidate of unlocked.slice(1)) {
    const rarity = getAchievement(candidate.code)?.rarity ?? "bronze";
    const better =
      RARITY_RANK[rarity] > RARITY_RANK[bestRarity] ||
      (RARITY_RANK[rarity] === RARITY_RANK[bestRarity] && candidate.unlockedAt > best.unlockedAt);
    if (better) {
      best = candidate;
      bestRarity = rarity;
    }
  }
  return best.code;
}

// null pour un succès "mystère" (pas de compteur pertinent à afficher).
export function achievementProgressFor(
  code: string,
  ctx: AchievementContext,
  unlockedCodes: Set<string>,
): { current: number; total: number } | null {
  switch (code) {
    case "ALL_HEROES":
      return { current: ctx.unlockedHeroIds.length, total: HEROES.length };
    case "HALF_BOSSES":
    case "ALL_BOSSES":
      return { current: ctx.seenBossIds.length, total: BOSSES.length };
    case "ALL_BACKGROUNDS":
      return { current: ctx.seenBackgroundIds.length, total: BACKGROUNDS.length };
    case PLATINUM_CODE: {
      const current = PLATINUM_ELIGIBLE_CODES.filter((c) => unlockedCodes.has(c)).length;
      return { current, total: PLATINUM_ELIGIBLE_CODES.length };
    }
    default:
      return null;
  }
}
```

- [ ] **Step 4: Lancer → succès**

Run: `npx vitest run lib/achievements.test.ts`
Expected: PASS (toute la suite).

- [ ] **Step 5: Commit**

```bash
git add lib/achievements.ts lib/achievements.test.ts
git commit -m "feat: achievements catalogue + pure evaluation engine (issue #72)"
```

---

## Task 4: `app/actions/achievements.ts` — assemblage de contexte + application + équipement

**Files:**
- Create: `app/actions/achievements.ts`

**Interfaces:**
- Consumes: `evaluateAchievements`, `bestTitleCode` (`lib/achievements.ts`), `createClient` (`lib/supabase/server`).
- Produces:
  - `assembleAchievementContext(supabase, userId): Promise<AchievementContext>`
  - `applyNewAchievements(supabase, userId, ctx): Promise<string[]>` (insère les nouveaux codes, ré-équipe le titre auto si `title_manually_set = false`, renvoie les codes nouvellement débloqués)
  - `equipTitle(code: string | null): Promise<{ error: string | null }>` (server action publique, appelée par le sélecteur de titre)

Pas de test Vitest dédié ici (server action, dépend de Supabase) — couvert par les checkpoints (Tasks 6-9, vérifiés en `build`+e2e) et par `lib/achievements.ts` (Task 3) pour la logique pure sous-jacente. Même patron que `app/actions/day.ts` (aucun test Vitest sur `closeDay` lui-même).

- [ ] **Step 1: Écrire le fichier**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  bestTitleCode,
  evaluateAchievements,
  type AchievementContext,
} from "@/lib/achievements";

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

// Assemble le contexte complet depuis les tables sources. Aucune logique de
// condition ici (D2) — seulement de la lecture. Réutilisé par les 4
// checkpoints (tâche, jour, boss, héros) pour ne jamais dupliquer ces
// requêtes.
export async function assembleAchievementContext(
  supabase: SupabaseServer,
  userId: string,
): Promise<AchievementContext> {
  const [
    { data: prof },
    { data: unlockedHeroes },
    { data: dailyBoss },
    { data: victoryRow },
  ] = await Promise.all([
    supabase.from("profiles").select("level, best_streak").eq("id", userId).maybeSingle(),
    supabase.from("unlocked_heroes").select("hero_id").eq("user_id", userId),
    supabase.from("daily_boss").select("boss_id, background_id").eq("user_id", userId),
    supabase
      .from("day_results")
      .select("id")
      .eq("user_id", userId)
      .eq("outcome", "victory")
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    level: prof?.level ?? 1,
    bestStreak: prof?.best_streak ?? 0,
    hasVictory: victoryRow !== null,
    unlockedHeroIds: (unlockedHeroes ?? []).map((r) => r.hero_id),
    seenBossIds: [...new Set((dailyBoss ?? []).map((r) => r.boss_id))],
    seenBackgroundIds: [...new Set((dailyBoss ?? []).map((r) => r.background_id))],
  };
}

// Évalue, persiste (upsert idempotent) et ré-équipe le titre auto si le
// joueur n'a jamais choisi manuellement (D8). Renvoie les codes nouvellement
// débloqués — l'appelant les fait remonter au client pour AchievementToast.
export async function applyNewAchievements(
  supabase: SupabaseServer,
  userId: string,
  ctx: AchievementContext,
): Promise<string[]> {
  const { data: existing } = await supabase
    .from("unlocked_achievements")
    .select("code, unlocked_at")
    .eq("user_id", userId);
  const existingRows = existing ?? [];
  const alreadyUnlocked = new Set(existingRows.map((r) => r.code));

  const newCodes = evaluateAchievements(ctx, alreadyUnlocked);
  if (newCodes.length === 0) return [];

  const now = new Date().toISOString();
  await supabase
    .from("unlocked_achievements")
    .upsert(
      newCodes.map((code) => ({ user_id: userId, code, unlocked_at: now })),
      { onConflict: "user_id,code" },
    );

  const { data: prof } = await supabase
    .from("profiles")
    .select("title_manually_set")
    .eq("id", userId)
    .maybeSingle();

  if (!prof?.title_manually_set) {
    const allUnlocked = [
      ...existingRows.map((r) => ({ code: r.code, unlockedAt: r.unlocked_at })),
      ...newCodes.map((code) => ({ code, unlockedAt: now })),
    ];
    const best = bestTitleCode(allUnlocked);
    if (best) {
      await supabase.from("profiles").update({ equipped_title_code: best }).eq("id", userId);
    }
  }

  return newCodes;
}

// Équipement manuel (D8) : dès le premier appel réussi, l'auto-écrasement
// s'arrête définitivement pour ce profil (title_manually_set = true).
export async function equipTitle(code: string | null): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  if (code !== null) {
    const { data: owned } = await supabase
      .from("unlocked_achievements")
      .select("code")
      .eq("user_id", user.id)
      .eq("code", code)
      .maybeSingle();
    if (!owned) return { error: "Ce titre n'est pas encore débloqué." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ equipped_title_code: code, title_manually_set: true })
    .eq("id", user.id);
  if (error) return { error: "Impossible d'équiper ce titre. Réessaie." };

  revalidatePath("/tableau-de-chasse/succes");
  revalidatePath("/tableau-de-chasse");
  revalidatePath("/");
  return { error: null };
}
```

- [ ] **Step 2: Vérifier**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add app/actions/achievements.ts
git commit -m "feat: achievement context assembly, apply and equip actions (issue #72)"
```

---

## Task 5: `AchievementToast` — composant de notification

**Files:**
- Create: `components/combat/AchievementToast.tsx`
- Test: `components/combat/AchievementToast.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `getAchievement` (`lib/achievements.ts`).
- Produces: `<AchievementToast codes={string[]} onDismissAll={() => void} />` — non-bloquant, empilable, `prefers-reduced-motion` géré en CSS.

- [ ] **Step 1: Écrire le test (échouant)**

Créer `components/combat/AchievementToast.test.tsx` :

```tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import AchievementToast from "./AchievementToast";

afterEach(cleanup);

describe("AchievementToast", () => {
  it("ne rend rien sans code", () => {
    const { container } = render(<AchievementToast codes={[]} onDismissAll={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("affiche le titre et la description du succès débloqué", () => {
    render(<AchievementToast codes={["FIRST_VICTORY"]} onDismissAll={vi.fn()} />);
    expect(screen.getByText(/Aube/)).toBeInTheDocument();
    expect(screen.getByText("Première victoire remportée.")).toBeInTheDocument();
  });

  it("empile plusieurs succès débloqués simultanément", () => {
    render(
      <AchievementToast codes={["FIRST_VICTORY", "STREAK_7"]} onDismissAll={vi.fn()} />,
    );
    expect(screen.getByText(/Aube/)).toBeInTheDocument();
    expect(screen.getByText(/Calme/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Lancer → échec attendu**

Run: `npx vitest run components/combat/AchievementToast.test.tsx`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Écrire le composant**

```tsx
"use client";

import { useEffect } from "react";
import { getAchievement, type AchievementRarity } from "@/lib/achievements";

interface AchievementToastProps {
  codes: string[];
  onDismissAll: () => void;
}

const RARITY_ICON: Record<AchievementRarity, string> = {
  bronze: "🥉",
  argent: "🥈",
  or: "🥇",
  platine: "💎",
};

// Issue #72 (D9) : non-bloquant, empilable, disparaît seul — contrairement
// à LevelUpOverlay/PerfectOverlay (bloquants, focus trap), pas d'interaction
// requise pour continuer à jouer.
export default function AchievementToast({ codes, onDismissAll }: AchievementToastProps) {
  useEffect(() => {
    if (codes.length === 0) return;
    const timer = setTimeout(onDismissAll, 4000 + codes.length * 1000);
    return () => clearTimeout(timer);
  }, [codes, onDismissAll]);

  if (codes.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-2 z-40 flex flex-col items-center gap-2 px-4"
    >
      {codes.map((code) => {
        const def = getAchievement(code);
        if (!def) return null;
        return (
          <div
            key={code}
            className="achievement-toast pointer-events-auto flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-left shadow-lg motion-reduce:animate-none"
          >
            <span className="text-lg" aria-hidden="true">
              {RARITY_ICON[def.rarity]}
            </span>
            <div>
              <p className="font-display text-xs uppercase tracking-wide text-gold">
                Succès débloqué : {def.title}
              </p>
              <p className="text-[11px] text-muted">{def.description}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Ajouter l'animation + garde reduced-motion**

Dans `app/globals.css`, ajouter :

```css
@keyframes achievement-pop {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}
.achievement-toast { animation: achievement-pop 0.25s ease-out; }
@media (prefers-reduced-motion: reduce) {
  .achievement-toast { animation: none; }
}
```

- [ ] **Step 5: Lancer → succès**

Run: `npx vitest run components/combat/AchievementToast.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/combat/AchievementToast.tsx components/combat/AchievementToast.test.tsx app/globals.css
git commit -m "feat: AchievementToast notification component (issue #72)"
```

---

## Task 6: Checkpoint tâche — `setTaskCompleted` + Arena.tsx

**Files:**
- Modify: `app/actions/tasks.ts:30-38,161-298`
- Modify: `components/combat/Arena.tsx`

**Interfaces:**
- Consumes: `assembleAchievementContext`, `applyNewAchievements` (`app/actions/achievements.ts`), `AchievementToast` (Task 5).
- Produces: `TaskActionResult.newAchievements?: string[]` ; `Arena.tsx` maintient `achievementQueue: string[]` et rend `AchievementToast`.

- [ ] **Step 1: Étendre `TaskActionResult`**

Dans `app/actions/tasks.ts`, `interface TaskActionResult` (ligne 30) :

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
}
```

- [ ] **Step 2: Importer les helpers**

Ajouter à l'import `@/lib/game-engine` existant (ligne 5) rien de nouveau ; ajouter une nouvelle ligne d'import juste après :

```ts
import { applyNewAchievements, assembleAchievementContext } from "@/app/actions/achievements";
```

- [ ] **Step 3: Évaluer les succès après un vrai coche (pas un décoché)**

Dans `setTaskCompleted` (ligne 161), déclarer `let newAchievements: string[] = [];` à côté de `let level`/`let xp`/`let leveledUp`/`let comboCount` (ligne 218-221). Puis, dans la branche `if (isCompleted) { ... }` (ligne 234-265), juste après le bloc `await supabase.from("tasks").update({ xp_awarded: xpDelta })...` (ligne 261-265), ajouter :

```ts
        const ctx = await assembleAchievementContext(supabase, user.id);
        newAchievements = await applyNewAchievements(supabase, user.id, ctx);
```

Ne rien ajouter dans la branche `else` (décocher) — les succès ne sont jamais révoqués (B2), inutile d'évaluer.

- [ ] **Step 4: Renvoyer `newAchievements`**

Ligne 296-297, remplacer :

```ts
  revalidatePath("/");
  return { error: null, level, xp, leveledUp, comboCount };
```

par :

```ts
  revalidatePath("/");
  return { error: null, level, xp, leveledUp, comboCount, newAchievements };
```

- [ ] **Step 5: Wire dans `Arena.tsx` — état + accumulation + rendu**

Ajouter l'import (à côté des autres imports de `components/combat/`) :

```ts
import AchievementToast from "./AchievementToast";
```

Ajouter un état, à côté de `const [levelUpValue, setLevelUpValue] = useState<number | null>(null);` (ligne 154) :

```ts
  const [achievementQueue, setAchievementQueue] = useState<string[]>([]);
```

Dans `handleToggle` (ligne 780-784), remplacer la boucle :

```ts
    let lastResult: Awaited<ReturnType<typeof setTaskCompletedAction>> | null = null;
    for (const change of cascade) {
      lastResult = await setTaskCompletedAction(change.taskId, change.isCompleted);
      if (lastResult.error) break;
    }
```

par :

```ts
    let lastResult: Awaited<ReturnType<typeof setTaskCompletedAction>> | null = null;
    const newAchievementCodes: string[] = [];
    for (const change of cascade) {
      lastResult = await setTaskCompletedAction(change.taskId, change.isCompleted);
      if (lastResult.newAchievements?.length) newAchievementCodes.push(...lastResult.newAchievements);
      if (lastResult.error) break;
    }
    if (newAchievementCodes.length > 0) {
      setAchievementQueue((prev) => [...prev, ...newAchievementCodes]);
    }
```

Enfin, juste après le bloc fermant des overlays `koState`/`levelUpValue` (après la ligne `)}` qui suit `<LevelUpOverlay .../>`, avant la fermeture `</div></div>` — reprendre le repère exact : après `{levelUpValue !== null && (<LevelUpOverlay ... />)}` et avant `</div>\n      </div>`), ajouter :

```tsx
          <AchievementToast
            codes={achievementQueue}
            onDismissAll={() => setAchievementQueue([])}
          />
```

- [ ] **Step 6: Vérifier**

Run: `npx vitest run && npm run build && npx tsc --noEmit`
Expected: tout vert (les tests existants de `tasks.test.ts` couvrent le fast-path UUID, non affecté).

- [ ] **Step 7: Commit**

```bash
git add app/actions/tasks.ts components/combat/Arena.tsx
git commit -m "feat: evaluate achievements on task completion, show AchievementToast (issue #72)"
```

---

## Task 7: Checkpoint jour — `closeDay`/`backfillMissedDays` + Arena.tsx

**Files:**
- Modify: `app/actions/day.ts`
- Modify: `components/combat/Arena.tsx`

**Interfaces:**
- Consumes: `assembleAchievementContext`, `applyNewAchievements`.
- Produces: `closeDay`/`backfillMissedDays` renvoient `newAchievements?: string[]` ; `handleCrepuscule` (Arena.tsx) alimente `achievementQueue`.

- [ ] **Step 1: Retirer `titleForStreak`, importer les helpers d'achievements**

Dans `app/actions/day.ts`, l'import (lignes 5-12) :

```ts
import {
  computeGoldEarned,
  currentStreak,
  dayKey,
  summarizeDay,
  type SummaryTask,
} from "@/lib/game-engine";
import { applyNewAchievements, assembleAchievementContext } from "@/app/actions/achievements";
import type { DayOutcome } from "@/types";
```

(`titleForStreak` retiré de la liste — la fonction elle-même n'est supprimée qu'en Task 12, une fois `tableau-de-chasse/page.tsx` migré lui aussi.)

- [ ] **Step 2: `CloseDayResult` — ajouter `newAchievements`**

```ts
interface CloseDayResult {
  error: string | null;
  outcome?: DayOutcome;
  newAchievements?: string[];
}
```

- [ ] **Step 3: `closeDay` — remplacer le bloc titre par le checkpoint achievements**

Remplacer (lignes 90-105) :

```ts
  // US-12 : rafraîchit les caches de série (source = day_results).
  const { data: prof } = await supabase
    .from("profiles")
    .select("best_streak, current_title")
    .eq("id", user.id)
    .maybeSingle();
  const bestStreak = Math.max(prof?.best_streak ?? 0, streakToday);
  const title = titleForStreak(bestStreak);
  await supabase
    .from("profiles")
    .update({
      streak_days: streakToday,
      best_streak: bestStreak,
      ...(title ? { current_title: title } : {}),
    })
    .eq("id", user.id);

  revalidatePath("/");
  return { error: null, outcome: summary.outcome };
```

par :

```ts
  // US-12 : rafraîchit les caches de série (source = day_results).
  const { data: prof } = await supabase
    .from("profiles")
    .select("best_streak")
    .eq("id", user.id)
    .maybeSingle();
  const bestStreak = Math.max(prof?.best_streak ?? 0, streakToday);
  await supabase
    .from("profiles")
    .update({ streak_days: streakToday, best_streak: bestStreak })
    .eq("id", user.id);

  // Issue #72 : après le rafraîchissement du cache streak (bestStreak à jour),
  // évalue les succès (streak, première victoire...).
  const ctx = await assembleAchievementContext(supabase, user.id);
  const newAchievements = await applyNewAchievements(supabase, user.id, ctx);

  revalidatePath("/");
  return { error: null, outcome: summary.outcome, newAchievements };
```

- [ ] **Step 4: `backfillMissedDays` — même remplacement**

Remplacer (lignes 196-213) :

```ts
  const { data: prof } = await supabase
    .from("profiles")
    .select("best_streak, current_title")
    .eq("id", user.id)
    .maybeSingle();
  const bestStreak = Math.max(prof?.best_streak ?? 0, streakNow);
  const title = titleForStreak(bestStreak);
  await supabase
    .from("profiles")
    .update({
      streak_days: streakNow,
      best_streak: bestStreak,
      ...(title ? { current_title: title } : {}),
    })
    .eq("id", user.id);

  revalidatePath("/");
  return { error: null };
```

par :

```ts
  const { data: prof } = await supabase
    .from("profiles")
    .select("best_streak")
    .eq("id", user.id)
    .maybeSingle();
  const bestStreak = Math.max(prof?.best_streak ?? 0, streakNow);
  await supabase
    .from("profiles")
    .update({ streak_days: streakNow, best_streak: bestStreak })
    .eq("id", user.id);

  const ctx = await assembleAchievementContext(supabase, user.id);
  await applyNewAchievements(supabase, user.id, ctx);

  revalidatePath("/");
  return { error: null };
```

(`backfillMissedDays` n'a pas besoin de renvoyer `newAchievements` : appelé par `WakeUpRitual`, qui n'affiche pas de toast de succès — cf. spec, hors scope. Les codes sont tout de même persistés.)

- [ ] **Step 5: Arena.tsx — `handleCrepuscule` alimente la queue**

Dans `components/combat/Arena.tsx`, `handleCrepuscule` (ligne 1008-1017) :

```ts
  async function handleCrepuscule() {
    setClosing(true);
    const result = await closeDayAction();
    setClosing(false);
    if (result.error) {
      setBanner(result.error);
      return;
    }
    if (result.newAchievements?.length) {
      setAchievementQueue((prev) => [...prev, ...result.newAchievements]);
    }
    setRecap(summarizeDay(tasks, "manual"));
  }
```

- [ ] **Step 6: Vérifier**

Run: `npx vitest run && npm run build && npx tsc --noEmit`
Expected: tout vert.

- [ ] **Step 7: Commit**

```bash
git add app/actions/day.ts components/combat/Arena.tsx
git commit -m "feat: evaluate achievements on day close/backfill (issue #72)"
```

---

## Task 8: Checkpoint boss — `resolveDailyBoss` (contexte complet) + `app/page.tsx` + Arena.tsx

**Files:**
- Modify: `app/actions/boss.ts`
- Modify: `app/page.tsx`
- Modify: `components/combat/Arena.tsx`

**Interfaces:**
- Produces: `DailyBossSelection.newAchievements: string[]` ; `Arena.tsx` initialise `achievementQueue` depuis une nouvelle prop `initialNewAchievements`.

> Note d'architecture : `resolveDailyBoss` tourne à **chaque** chargement de l'Arène (cf. `app/page.tsx`), y compris quand le boss du jour est déjà résolu. On en profite pour y assembler le contexte **complet** (pas seulement boss/décors) — c'est ce qui sert de rattrapage naturel pour un profil existant migré (héros déjà possédés, streak déjà atteinte, victoire déjà obtenue) sans script de migration séparé.

- [ ] **Step 1: Réécrire `resolveDailyBoss`**

Remplacer tout le corps de `app/actions/boss.ts` par :

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { dayKey } from "@/lib/game-engine";
import {
  DEFAULT_BOSS_ID,
  getBoss,
  pickBackgroundId,
  pickDailyBoss,
} from "@/lib/bosses";
import { DEFAULT_BACKGROUND_ID } from "@/lib/backgrounds";
import { applyNewAchievements, assembleAchievementContext } from "@/app/actions/achievements";

export interface DailyBossSelection {
  bossId: string;
  backgroundId: string;
  newAchievements: string[];
}

// Résout (et fige) le boss + décor du jour local courant. Lazy & idempotent :
// appelée au chargement de l'Arène. Si une ligne existe déjà pour aujourd'hui,
// on la renvoie ; sinon on tire un boss en excluant ceux des 2 derniers jours,
// un décor cohérent, et on persiste. En cas d'échec, fallback boss par défaut.
// Issue #72 : sert aussi de checkpoint d'évaluation des succès — assemble le
// contexte complet à chaque appel (pas seulement boss/décors).
export async function resolveDailyBoss(): Promise<DailyBossSelection> {
  const fallback: DailyBossSelection = {
    bossId: DEFAULT_BOSS_ID,
    backgroundId: DEFAULT_BACKGROUND_ID,
    newAchievements: [],
  };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fallback;

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .maybeSingle();
  const today = dayKey(new Date(), profile?.timezone ?? "UTC");

  let selection: { bossId: string; backgroundId: string };

  // Déjà tiré aujourd'hui ?
  const { data: existing } = await supabase
    .from("daily_boss")
    .select("boss_id, background_id")
    .eq("user_id", user.id)
    .eq("day_date", today)
    .maybeSingle();

  if (existing) {
    selection = { bossId: existing.boss_id, backgroundId: existing.background_id };
  } else {
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

    const { error } = await supabase.from("daily_boss").insert({
      user_id: user.id,
      day_date: today,
      boss_id: boss.id,
      background_id: backgroundId,
    });

    if (error) {
      // Course possible (double chargement) : si insert échoue, relire la ligne.
      const { data: raced } = await supabase
        .from("daily_boss")
        .select("boss_id, background_id")
        .eq("user_id", user.id)
        .eq("day_date", today)
        .maybeSingle();
      selection = raced
        ? { bossId: raced.boss_id, backgroundId: raced.background_id }
        : getBoss(boss.id)
          ? { bossId: boss.id, backgroundId }
          : { bossId: fallback.bossId, backgroundId: fallback.backgroundId };
    } else {
      selection = { bossId: boss.id, backgroundId };
    }
  }

  const ctx = await assembleAchievementContext(supabase, user.id);
  const newAchievements = await applyNewAchievements(supabase, user.id, ctx);

  return { ...selection, newAchievements };
}
```

- [ ] **Step 2: `app/page.tsx` — passer `newAchievements` à `Arena`**

Ligne 78-89, remplacer :

```tsx
  return (
    <Arena
      initialProfile={profile}
      initialTasks={tasks ?? []}
      overdueTasks={overdueTasks ?? []}
      dayResults={dayResults ?? []}
      today={today}
      bossId={daily.bossId}
      backgroundId={daily.backgroundId}
      hasSeenTutorial={profile.has_seen_tutorial}
    />
  );
```

par :

```tsx
  return (
    <Arena
      initialProfile={profile}
      initialTasks={tasks ?? []}
      overdueTasks={overdueTasks ?? []}
      dayResults={dayResults ?? []}
      today={today}
      bossId={daily.bossId}
      backgroundId={daily.backgroundId}
      hasSeenTutorial={profile.has_seen_tutorial}
      initialNewAchievements={daily.newAchievements}
    />
  );
```

- [ ] **Step 3: `Arena.tsx` — nouvelle prop, initialise `achievementQueue`**

`ArenaProps` (ligne 87-96), ajouter :

```ts
  hasSeenTutorial: boolean;
  initialNewAchievements: string[];
```

Destructure (ligne 125-134), ajouter `initialNewAchievements,`.

Remplacer l'état créé en Task 6 :

```ts
  const [achievementQueue, setAchievementQueue] = useState<string[]>([]);
```

par :

```ts
  const [achievementQueue, setAchievementQueue] = useState<string[]>(initialNewAchievements);
```

- [ ] **Step 4: Vérifier**

Run: `npx vitest run && npm run build && npx tsc --noEmit`
Expected: tout vert.

- [ ] **Step 5: Commit**

```bash
git add app/actions/boss.ts app/page.tsx components/combat/Arena.tsx
git commit -m "feat: full achievement evaluation on daily boss resolution (issue #72)"
```

---

## Task 9: Checkpoint héros — `purchaseHero` + `createProfile` + `CharacterSelect.tsx`

**Files:**
- Modify: `app/actions/shop.ts:1-64`
- Modify: `app/onboarding/actions.ts`
- Modify: `components/shop/CharacterSelect.tsx`

**Interfaces:**
- Produces: `ShopActionResult.newAchievements?: string[]` (uniquement renseigné par `purchaseHero`) ; `CharacterSelect.tsx` affiche `AchievementToast`.

- [ ] **Step 1: `ShopActionResult` — ajouter `newAchievements`**

Dans `app/actions/shop.ts` (ligne 9-11) :

```ts
interface ShopActionResult {
  error: string | null;
  newAchievements?: string[];
}
```

- [ ] **Step 2: Importer les helpers**

```ts
import { applyNewAchievements, assembleAchievementContext } from "@/app/actions/achievements";
```

- [ ] **Step 3: Checkpoint dans `purchaseHero`**

Remplacer (lignes 55-63) :

```ts
  // Rafraîchit le cache profiles.gold (source = solde dérivé).
  await supabase
    .from("profiles")
    .update({ gold: balance - hero.price })
    .eq("id", user.id);

  revalidatePath("/marche-noir");
  revalidatePath("/");
  return { error: null };
}
```

par :

```ts
  // Rafraîchit le cache profiles.gold (source = solde dérivé).
  await supabase
    .from("profiles")
    .update({ gold: balance - hero.price })
    .eq("id", user.id);

  const ctx = await assembleAchievementContext(supabase, user.id);
  const newAchievements = await applyNewAchievements(supabase, user.id, ctx);

  revalidatePath("/marche-noir");
  revalidatePath("/");
  return { error: null, newAchievements };
}
```

- [ ] **Step 4: Checkpoint dans `createProfile` (héros starter)**

Dans `app/onboarding/actions.ts`, après l'insert `unlocked_heroes` (ligne 55-59) et avant `redirect("/")` (ligne 61) :

```ts
  await supabase.from("unlocked_heroes").insert({
    user_id: user.id,
    hero_id: starterId,
    price_paid: 0,
  });

  // Issue #72 : enregistre le succès du héros starter. Pas de toast possible
  // ici (redirect() interrompt l'exécution, aucune valeur de retour lue par
  // le client) — l'achievement est simplement persisté, il apparaîtra dans
  // le catalogue et sera de toute façon re-catché par resolveDailyBoss au
  // premier chargement de l'Arène juste après.
  const ctx = await assembleAchievementContext(supabase, user.id);
  await applyNewAchievements(supabase, user.id, ctx);

  redirect("/");
```

Ajouter l'import en haut du fichier :

```ts
import { applyNewAchievements, assembleAchievementContext } from "@/app/actions/achievements";
```

- [ ] **Step 5: `CharacterSelect.tsx` — état + rendu du toast**

Ajouter les imports :

```ts
import AchievementToast from "@/components/combat/AchievementToast";
```

Ajouter un état à côté de `const [error, setError] = useState<string | null>(null);` (ligne 38) :

```ts
  const [achievementQueue, setAchievementQueue] = useState<string[]>([]);
```

Dans la fonction qui appelle `purchaseHero` (autour de la ligne 79-85), remplacer :

```ts
    startTransition(async () => {
      const res = await purchaseHero(id);
      if (res.error) setError(res.error);
    });
```

par :

```ts
    startTransition(async () => {
      const res = await purchaseHero(id);
      if (res.error) setError(res.error);
      if (res.newAchievements?.length) {
        setAchievementQueue((prev) => [...prev, ...res.newAchievements]);
      }
    });
```

Ajouter le rendu du toast dans le JSX retourné par le composant (juste avant sa balise fermante racine) :

```tsx
      <AchievementToast
        codes={achievementQueue}
        onDismissAll={() => setAchievementQueue([])}
      />
```

- [ ] **Step 6: Vérifier**

Run: `npx vitest run && npm run build && npx tsc --noEmit`
Expected: tout vert.

- [ ] **Step 7: Commit**

```bash
git add app/actions/shop.ts app/onboarding/actions.ts components/shop/CharacterSelect.tsx
git commit -m "feat: evaluate achievements on hero unlock (purchase + starter) (issue #72)"
```

---

## Task 10: Écran catalogue — `/tableau-de-chasse/succes` + sélecteur de titre

**Files:**
- Create: `app/tableau-de-chasse/succes/page.tsx`
- Create: `app/tableau-de-chasse/succes/loading.tsx`
- Create: `components/pantheon/TitleSelector.tsx`

**Interfaces:**
- Consumes: `ACHIEVEMENTS`, `ALL_ACHIEVEMENT_DEFS`, `achievementProgressFor`, `TOTAL_ACHIEVEMENTS_COUNT` (`lib/achievements.ts`), `equipTitle` (`app/actions/achievements.ts`).
- Produces: page lecture + écriture (via `TitleSelector`), 3 états UI (règle projet n°3).

- [ ] **Step 1: `TitleSelector.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { ALL_ACHIEVEMENT_DEFS } from "@/lib/achievements";
import { equipTitle } from "@/app/actions/achievements";

interface TitleSelectorProps {
  unlockedCodes: string[];
  equippedCode: string | null;
}

export default function TitleSelector({ unlockedCodes, equippedCode }: TitleSelectorProps) {
  const [selected, setSelected] = useState(equippedCode);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const unlockedTitles = ALL_ACHIEVEMENT_DEFS.filter((d) => unlockedCodes.includes(d.code));

  function handleSelect(code: string | null) {
    setError(null);
    setSelected(code);
    startTransition(async () => {
      const res = await equipTitle(code);
      if (res.error) {
        setError(res.error);
        setSelected(equippedCode);
      }
    });
  }

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
      <p className="font-display text-xs uppercase tracking-wide text-muted">Titre équipé</p>
      <select
        value={selected ?? ""}
        disabled={pending}
        onChange={(event) => handleSelect(event.target.value || null)}
        className="rounded-md border border-border bg-bg px-2 py-1.5 text-xs text-ink"
      >
        <option value="">Aucun</option>
        {unlockedTitles.map((def) => (
          <option key={def.code} value={def.code}>
            {def.title}
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

- [ ] **Step 2: `loading.tsx`**

```tsx
export default function AchievementsLoading() {
  return (
    <main className="flex flex-1 flex-col gap-3 px-4 py-6">
      <div className="skeleton h-6 w-32 self-center rounded" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="skeleton h-32 w-full rounded-lg" />
      ))}
    </main>
  );
}
```

- [ ] **Step 3: `page.tsx`**

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  ALL_ACHIEVEMENT_DEFS,
  TOTAL_ACHIEVEMENTS_COUNT,
  achievementProgressFor,
  type AchievementContext,
  type AchievementRarity,
} from "@/lib/achievements";
import BottomNav from "@/components/ui/BottomNav";
import BackLink from "@/components/ui/BackLink";
import TitleSelector from "@/components/pantheon/TitleSelector";

export const metadata: Metadata = { title: "Succès — Dodojo" };

const RARITY_ICON: Record<AchievementRarity, string> = {
  bronze: "🥉",
  argent: "🥈",
  or: "🥇",
  platine: "💎",
};

const CATEGORY_LABELS: Record<string, string> = {
  hero: "Héros",
  collection: "Collection",
  progression: "Progression",
  streak: "Séries",
  exploration: "Exploration",
  level: "Niveau",
  meta: "Méta",
};

// Issue #72 : catalogue lecture seule + sélecteur de titre. Succès "mystère"
// masqués (titre/description) tant que non débloqués ; succès à compteur
// affichent une barre de progression toujours visible (D12/D13 du spec).
export default async function AchievementsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: profile, error: profileError },
    { data: unlockedRows, error: unlockedError },
    { data: unlockedHeroes },
    { data: dailyBoss },
    { data: victoryRow },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("level, best_streak, equipped_title_code")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("unlocked_achievements").select("code, unlocked_at").eq("user_id", user.id),
    supabase.from("unlocked_heroes").select("hero_id").eq("user_id", user.id),
    supabase.from("daily_boss").select("boss_id, background_id").eq("user_id", user.id),
    supabase
      .from("day_results")
      .select("id")
      .eq("user_id", user.id)
      .eq("outcome", "victory")
      .limit(1)
      .maybeSingle(),
  ]);

  // État Error (règle projet n°3).
  if (profileError || unlockedError || !profile) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center">
        <p className="font-hud text-sm font-semibold uppercase tracking-wide text-alert">
          Le catalogue est scellé
        </p>
        <p className="max-w-[28ch] text-xs text-muted">
          Impossible de charger tes succès. Réessaie dans un instant.
        </p>
        <BottomNav active="qg" />
      </main>
    );
  }

  const unlockedCodes = new Set((unlockedRows ?? []).map((r) => r.code));
  const ctx: AchievementContext = {
    level: profile.level,
    bestStreak: profile.best_streak,
    hasVictory: victoryRow !== null,
    unlockedHeroIds: (unlockedHeroes ?? []).map((r) => r.hero_id),
    seenBossIds: [...new Set((dailyBoss ?? []).map((r) => r.boss_id))],
    seenBackgroundIds: [...new Set((dailyBoss ?? []).map((r) => r.background_id))],
  };

  // État Empty (règle projet n°3) : 0 succès débloqué — le catalogue reste
  // affiché, entièrement grisé (pas un état séparé, cf. spec §7).

  return (
    <main className="screen-main gap-3 px-4 py-6">
      <BackLink href="/tableau-de-chasse" label="Retour au Tableau de Chasse" />
      <h1 className="text-center font-hud text-lg font-semibold uppercase tracking-wide text-ink">
        Succès
      </h1>
      <p className="text-center text-xs text-muted">
        {unlockedCodes.size} / {TOTAL_ACHIEVEMENTS_COUNT} succès débloqués
      </p>

      <TitleSelector
        unlockedCodes={[...unlockedCodes]}
        equippedCode={profile.equipped_title_code}
      />

      {Object.entries(CATEGORY_LABELS).map(([category, label]) => {
        const defs = ALL_ACHIEVEMENT_DEFS.filter((d) => d.category === category);
        if (defs.length === 0) return null;
        return (
          <section
            key={category}
            className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4"
          >
            <p className="font-display text-xs uppercase tracking-wide text-muted">{label}</p>
            <ul className="flex flex-col gap-2 text-xs">
              {defs.map((def) => {
                const unlocked = unlockedCodes.has(def.code);
                const progress = achievementProgressFor(def.code, ctx, unlockedCodes);
                const row = (unlockedRows ?? []).find((r) => r.code === def.code);
                return (
                  <li
                    key={def.code}
                    className={`rounded-md border border-border p-2 ${unlocked ? "" : "opacity-60"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span>
                        <span aria-hidden="true">{RARITY_ICON[def.rarity]}</span>{" "}
                        {def.displayMode === "mystery" && !unlocked ? "???" : def.title}
                      </span>
                      {unlocked && row && (
                        <span className="text-faint">{row.unlocked_at.slice(0, 10)}</span>
                      )}
                    </div>
                    {(def.displayMode === "progress" || unlocked) && (
                      <p className="mt-1 text-[11px] text-muted">{def.description}</p>
                    )}
                    {progress && (
                      <>
                        <div
                          role="progressbar"
                          aria-valuenow={progress.current}
                          aria-valuemin={0}
                          aria-valuemax={progress.total}
                          aria-label={def.title}
                          className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-border"
                        >
                          <div
                            className="h-full rounded-full bg-xp transition-[width] duration-300 ease-out motion-reduce:transition-none"
                            style={{
                              width: `${Math.min(100, Math.round((progress.current / progress.total) * 100))}%`,
                            }}
                          />
                        </div>
                        <p className="mt-0.5 text-right text-[10px] text-faint">
                          {progress.current} / {progress.total}
                        </p>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <BottomNav active="qg" />
    </main>
  );
}
```

- [ ] **Step 4: Vérifier**

Run: `npm run build && npm run lint && npx tsc --noEmit`
Expected: tout propre.

- [ ] **Step 5: Commit**

```bash
git add app/tableau-de-chasse/succes/page.tsx app/tableau-de-chasse/succes/loading.tsx components/pantheon/TitleSelector.tsx
git commit -m "feat: achievements catalogue screen with title selector (issue #72)"
```

---

## Task 11: Migration des affichages existants — Tableau de Chasse + cartes de partage

**Files:**
- Modify: `app/tableau-de-chasse/page.tsx`
- Modify: `components/combat/Arena.tsx`

**Interfaces:**
- Consumes: `getAchievement` (`lib/achievements.ts`).

- [ ] **Step 1: `app/tableau-de-chasse/page.tsx` — imports**

Remplacer (lignes 5-10) :

```ts
import {
  goldBalance,
  tableauChasseStats,
  titleForStreak,
  xpThresholdForLevel,
} from "@/lib/game-engine";
```

par :

```ts
import { goldBalance, tableauChasseStats, xpThresholdForLevel } from "@/lib/game-engine";
import { getAchievement } from "@/lib/achievements";
```

- [ ] **Step 2: Profil — sélectionner `equipped_title_code`, compter les succès débloqués**

Ligne 28-53, remplacer le `Promise.all` par :

```tsx
  const [
    { data: profile, error: profileError },
    { data: dayResults, error: dayError },
    { data: goldHistory },
    { data: unlockedHeroes },
    { data: unlockedSkins },
    { data: unlockedAchievements },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("username, level, xp, equipped_title_code, best_streak")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("day_results")
      .select("day_date, outcome, damage_dealt, gold_earned")
      .eq("user_id", user.id)
      .order("day_date", { ascending: false })
      .limit(90),
    supabase.from("day_results").select("gold_earned").eq("user_id", user.id),
    supabase.from("unlocked_heroes").select("price_paid").eq("user_id", user.id),
    supabase.from("unlocked_skins").select("price_paid").eq("user_id", user.id),
    supabase.from("unlocked_achievements").select("code").eq("user_id", user.id),
  ]);
```

- [ ] **Step 3: Remplacer `TITLE_TIERS`/`nextLocked`/`activeTitle`**

Supprimer (lignes 79-85) :

```ts
  const TITLE_TIERS = [
    { streak: 7, name: "Calme" },
    { streak: 30, name: "Silence" },
    { streak: 100, name: "Esprit Vide" },
  ];
  const nextLocked = TITLE_TIERS.find((t) => profile.best_streak < t.streak);
  const activeTitle = titleForStreak(profile.best_streak) ?? profile.current_title;
```

Remplacer par :

```ts
  const activeTitle = profile.equipped_title_code
    ? (getAchievement(profile.equipped_title_code)?.title ?? "")
    : "";
  const unlockedAchievementCount = (unlockedAchievements ?? []).length;
```

- [ ] **Step 4: Remplacer le « Bloc Titres »**

Remplacer (lignes 169-193) :

```tsx
      {/* Bloc Titres */}
      <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
        <p className="font-display text-xs uppercase tracking-wide text-muted">Titres</p>
        <ul className="flex flex-col gap-1 text-xs">
          {TITLE_TIERS.map((tier) => {
            const unlocked = profile.best_streak >= tier.streak;
            return (
              <li
                key={tier.streak}
                className={`flex justify-between ${unlocked ? "text-gold" : "text-faint"}`}
              >
                <span>
                  {unlocked ? "🏅" : "🔒"} {tier.name}
                </span>
                <span>série {tier.streak}</span>
              </li>
            );
          })}
        </ul>
        {nextLocked && (
          <p className="text-[11px] text-muted">
            Prochain palier : {nextLocked.name} à {nextLocked.streak} jours de série.
          </p>
        )}
      </section>
```

par :

```tsx
      {/* Bloc Titres & Succès */}
      <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
        <p className="font-display text-xs uppercase tracking-wide text-muted">Titres & Succès</p>
        <p className="text-xs text-muted">{unlockedAchievementCount} / 26 succès débloqués.</p>
        <Link
          href="/tableau-de-chasse/succes"
          className="text-xs text-xp-text underline underline-offset-4"
        >
          Voir le catalogue complet
        </Link>
      </section>
```

- [ ] **Step 5: `Arena.tsx` — titre résolu pour les cartes de partage**

Ajouter l'import :

```ts
import { getAchievement } from "@/lib/achievements";
```

Ajouter, près du calcul d'autres valeurs dérivées du profil (avant le premier usage, ligne ~1062) :

```ts
  const activeTitleText = profile.equipped_title_code
    ? (getAchievement(profile.equipped_title_code)?.title ?? "")
    : "";
```

Remplacer les deux occurrences de `title: profile.current_title,` (lignes 1066 et 1171) par `title: activeTitleText,`.

- [ ] **Step 6: Vérifier**

Run: `npm run build && npm run lint && npx tsc --noEmit`
Expected: tout propre.

- [ ] **Step 7: Commit**

```bash
git add app/tableau-de-chasse/page.tsx components/combat/Arena.tsx
git commit -m "refactor: resolve active title from achievements catalogue (issue #72)"
```

---

## Task 12: Nettoyage — suppression `titleForStreak`/`current_title`

**Files:**
- Modify: `lib/game-engine.ts`
- Modify: `lib/game-engine.test.ts`
- Modify: `types/index.ts`
- Create: `supabase/migrations/20260731190000_drop_profile_current_title.sql`

**Interfaces:**
- Produces: `titleForStreak` supprimé ; `Profile.current_title` supprimé ; colonne `profiles.current_title` supprimée.

- [ ] **Step 1: Vérifier qu'il ne reste plus aucune référence**

Run: `grep -rn "titleForStreak\|current_title" app components lib types --include="*.ts" --include="*.tsx"`
Expected: aucune occurrence (Tasks 7 et 11 ont migré les deux seuls appelants).

- [ ] **Step 2: Supprimer `titleForStreak` de `lib/game-engine.ts`**

Supprimer la fonction (autour de la ligne 857) :

```ts
export function titleForStreak(bestStreak: number): string | null {
  if (bestStreak >= 100) return "Esprit Vide";
  if (bestStreak >= 30) return "Silence";
  if (bestStreak >= 7) return "Calme";
  return null;
}
```

- [ ] **Step 3: Supprimer les tests associés dans `lib/game-engine.test.ts`**

Retirer `titleForStreak,` de la liste d'import (ligne 32) et supprimer le bloc (lignes 1230-1240) :

```ts
describe("titleForStreak", () => {
  it("renvoie null sous le premier palier", () => {
    expect(titleForStreak(0)).toBeNull();
    expect(titleForStreak(6)).toBeNull();
  });
  it("paliers 7 / 30 / 100", () => {
    expect(titleForStreak(7)).toBe("Calme");
    expect(titleForStreak(30)).toBe("Silence");
    expect(titleForStreak(100)).toBe("Esprit Vide");
  });
});
```

- [ ] **Step 4: Retirer `current_title` de `Profile`**

Dans `types/index.ts`, supprimer la ligne `current_title: string;`.

- [ ] **Step 5: Migration — supprimer la colonne**

```sql
-- Issue #72 : current_title remplacé par equipped_title_code (résolu contre
-- le catalogue lib/achievements.ts) + title_manually_set. Tous les call-sites
-- (day.ts, tableau-de-chasse/page.tsx, Arena.tsx) migrés avant cette
-- migration (cf. Tasks 7 et 11 du plan issue #72).
alter table public.profiles drop column current_title;
```

- [ ] **Step 6: (Différé si Docker éteint) Appliquer**

Run: `supabase db push` ou `supabase migration up`.
Expected: colonne supprimée.

- [ ] **Step 7: Vérifier**

Run: `npx vitest run && npm run build && npm run lint && npx tsc --noEmit`
Expected: tout vert.

- [ ] **Step 8: Commit**

```bash
git add lib/game-engine.ts lib/game-engine.test.ts types/index.ts supabase/migrations/20260731190000_drop_profile_current_title.sql
git commit -m "chore: remove titleForStreak/current_title, superseded by achievements catalogue (issue #72)"
```

---

## Task 13: e2e — reset + parcours minimal

**Files:**
- Modify: `e2e/fixtures.ts`
- Create: `e2e/achievements.spec.ts`

**Interfaces:**
- Consumes: `login`, `seedStreak`, `listUsersRetrying` (`e2e/fixtures.ts`).
- Produces: `resetAchievementsState(): Promise<void>`.

> Exécution : nécessite les migrations Tasks 1/2/12 appliquées + serveur prod (`playwright.config.ts`).

- [ ] **Step 1: `resetAchievementsState` dans `e2e/fixtures.ts`**

Ajouter, à la suite de `resetShopState` :

```ts
// Issue #72 : vide le journal de succès + réinitialise le titre équipé pour
// le compte e2e fixe. Sans ça, les succès s'accumulent sur le compte
// partagé (ADR-04) et polluent les assertions des runs suivants.
export async function resetAchievementsState(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PRIVATE_KEY_SUPABASE;
  const email = process.env.E2E_TEST_EMAIL;
  if (!url || !key || !email) {
    throw new Error("Reset achievements e2e : env manquant.");
  }
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const users = await listUsersRetrying(admin);
  const testUser = users.find((u) => u.email === email);
  if (!testUser) throw new Error("Reset achievements e2e : utilisateur de test introuvable.");
  const uid = testUser.id;

  await admin.from("unlocked_achievements").delete().eq("user_id", uid);
  await admin
    .from("profiles")
    .update({ equipped_title_code: null, title_manually_set: false })
    .eq("id", uid);
}
```

- [ ] **Step 2: `e2e/achievements.spec.ts`**

```ts
import { expect, test } from "@playwright/test";
import { login, resetAchievementsState, seedStreak } from "./fixtures";

test.describe("Issue #72 Succès & Titres", () => {
  test("un succès mystère se révèle au déblocage et le titre s'équipe", async ({ page }) => {
    await resetAchievementsState();
    // Une seule victoire, n'importe quelle date : FIRST_VICTORY ne dépend pas
    // de l'horloge serveur (contrairement à un palier de série).
    await seedStreak([{ day_date: "2020-01-01", outcome: "victory" }]);

    await login(page);
    await page.goto("/tableau-de-chasse/succes");
    await expect(page.getByText("???").first()).toBeVisible();

    // Un chargement de l'Arène déclenche resolveDailyBoss, qui réévalue tous
    // les succès (y compris FIRST_VICTORY) — pas seulement boss/décors.
    await page.goto("/");
    await page.goto("/tableau-de-chasse/succes");
    await expect(page.getByText("Aube")).toBeVisible();

    await page.getByRole("combobox").selectOption("FIRST_VICTORY");
    await expect(page.getByRole("combobox")).toHaveValue("FIRST_VICTORY");
  });
});
```

- [ ] **Step 3: (Différé si besoin) Lancer**

Run: `npx playwright test e2e/achievements.spec.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add e2e/fixtures.ts e2e/achievements.spec.ts
git commit -m "test: add achievements e2e + reset helper (issue #72)"
```

---

## Task 14: Documentation + Issue GitHub (réflexe)

**Files:**
- Modify: `CLAUDE.md`, `CHANGELOG.md`, `SPECS_FONCTIONNELLES.md`
- GitHub: commentaire sur l'issue #72 (+ `Ferme #72` dans la PR)

- [ ] **Step 1: `CLAUDE.md` — mettre à jour l'entrée streak, ajouter l'entrée succès**

Dans le paragraphe **« Streaks à budget de jokers hebdo (US-12) »**, remplacer la phrase :

```
Dérivée de `day_results` (source unique) ; `profiles.streak_days`/`best_streak`/`current_title` sont des **caches** rafraîchis à la clôture (`closeDay`) et au backfill. Titres de jalon (`titleForStreak` : 7/30/100 → Calme/Silence/Esprit Vide) — écrasent `current_title` (provisoire, à fusionner avec d'éventuels titres de niveau).
```

par :

```
Dérivée de `day_results` (source unique) ; `profiles.streak_days`/`best_streak` sont des **caches** rafraîchis à la clôture (`closeDay`) et au backfill. Les paliers de streak (7/30/100 → Calme/Silence/Esprit Vide) sont désormais des succès du catalogue `lib/achievements.ts` — voir « Système de succès & titres (issue #72) » ci-dessous. `titleForStreak`/`profiles.current_title` n'existent plus.
```

Ajouter, à la fin de la section « Pièges et décisions non-évidentes » (après l'entrée « Combo server-authoritative... ») :

```markdown
**Système de succès & titres (issue #72) — catalogue statique + journal append-only, jamais de logique en SQL** — `lib/achievements.ts` remplace entièrement `titleForStreak`/`profiles.current_title` (ancien mécanisme mono-titre auto-écrasé). 26 succès (`ACHIEVEMENTS` = 25 + `PLATINUM` séparé, `ALL_ACHIEVEMENT_DEFS` pour l'affichage), 4 raretés (bronze/argent/or/platine). **Platine exclut les 5 paliers de niveau easter egg** (`countsTowardPlatinum: false` sur `LEVEL_212/666/777/1000/9001`, mathématiquement hors d'atteinte au rythme de jeu réel — niveau 100 ≈ 9 ans) : sans cette exclusion Platine serait structurellement inobtenable. Toute la logique de condition (`evaluateAchievements`, pure, testée Vitest) est en TypeScript — aucun trigger SQL, `unlocked_achievements` (unique `(user_id, code)`, **aucune policy UPDATE/DELETE**, RG-04) n'est qu'un journal append-only écrit par l'application. **4 checkpoints serveur** évaluent les conditions : `setTaskCompleted` (niveau), `closeDay`/`backfillMissedDays` (streak, première victoire), `resolveDailyBoss` (boss/décors vus), `purchaseHero`/`createProfile` (héros). **`resolveDailyBoss` fait exception** : il assemble le contexte **complet** (pas seulement boss/décors) à chaque appel — comme il tourne déjà à chaque chargement de l'Arène, ça double comme rattrapage naturel pour tout profil existant migré, aucun script de migration séparé n'a été nécessaire. **Deux modes d'affichage avant déblocage** : `displayMode: 'mystery'` (21 succès — héros, streak, niveau, première victoire) masque titre/description jusqu'au déblocage ; `displayMode: 'progress'` (5 succès à compteur — `ALL_HEROES`/`HALF_BOSSES`/`ALL_BOSSES`/`ALL_BACKGROUNDS`/`PLATINUM`) affiche toujours titre/description + une barre `current/total` live (`achievementProgressFor`, `HALF_BOSSES` et `ALL_BOSSES` partagent la même barre — deux seuils, un seul compteur). **Titre équipé** : `profiles.equipped_title_code` (nullable) + `profiles.title_manually_set` — tant que le joueur n'a jamais équipé de titre lui-même, le plus prestigieux débloqué s'affiche automatiquement (`bestTitleCode`, rareté puis date la plus récente) ; dès qu'il équipe manuellement une fois (`equipTitle`, `/tableau-de-chasse/succes`), l'auto-écrasement s'arrête définitivement pour ce profil. **Roster boss dynamique** : `ALL_BOSSES`/`HALF_BOSSES` lisent `BOSSES.length` (27 depuis l'issue #74, jamais un nombre en dur) — `HALF_BOSSES` = `Math.ceil(BOSSES.length / 2)`. Spec complète : `docs/superpowers/specs/2026-07-31-issue72-succes-titres-design.md`.
```

- [ ] **Step 2: `CHANGELOG.md` — ligne sous `[Unreleased]` / Produit**

```markdown
- Issue #72 : système de succès & titres (26 succès, 4 raretés, catalogue `/tableau-de-chasse/succes`, titre équipable manuellement, succès mystère + barres de progression, notification `AchievementToast`).
```

- [ ] **Step 3: `SPECS_FONCTIONNELLES.md` — nouvelle entrée**

Ajouter à la suite de la dernière US (après l'entrée US-53) :

```markdown
#### Issue #72 : Système de Succès & Titres
> Design détaillé : `docs/superpowers/specs/2026-07-31-issue72-succes-titres-design.md`. Catalogue statique de 26 succès (héros, collection, streak, exploration boss/décors, paliers de niveau, méta Platine), 4 raretés. Succès "mystère" masqués jusqu'au déblocage, succès à compteur affichés en barre de progression live. Titre équipé manuellement (`/tableau-de-chasse/succes`), auto-affiché tant que non personnalisé. Remplace l'ancien `titleForStreak` (US-12).
*   **Standard :** En tant que joueur, je veux débloquer des succès et choisir le titre affiché sous mon nom, pour incarner ma progression.
*   **BDD :**
    ```gherkin
    Given J'ai rempli la condition d'un succès verrouillé
    When L'action correspondante est validée côté serveur
    Then Le succès est débloqué, une notification apparaît, et je peux l'équiper comme titre depuis le catalogue
    ```
```

- [ ] **Step 4: Commit docs**

```bash
git add CLAUDE.md CHANGELOG.md SPECS_FONCTIONNELLES.md
git commit -m "docs: document achievements & titles system (issue #72)"
```

- [ ] **Step 5: Commenter l'issue #72**

```bash
gh issue comment 72 --body "✅ Implémenté (branche feat/issue-72-succes-titres) : catalogue de 26 succès (lib/achievements.ts, 4 raretés), journal append-only unlocked_achievements, 4 checkpoints serveur (tâche/jour/boss/héros), titre équipable manuellement (sticky après 1er choix), succès mystère + barres de progression, notification AchievementToast, écran /tableau-de-chasse/succes. Roster boss confirmé à 27 (issue #74 déjà mergée). Vérif : Vitest + build/lint + e2e. Fermeture via la PR."
```

*(La fermeture définitive se fait par `Ferme #72` dans la description de la PR.)*

---

## Self-Review (rempli)

- **Couverture spec** : D1 (système complet) → Tasks 1-12 ; D2 (logique pure, pas de SQL) → Task 3 ; D3 (4 checkpoints) → Tasks 6-9 ; D4 (raretés + Platine hors easter eggs) → Task 3 ; D5 (paliers extrêmes inchangés) → Task 3 (catalogue) ; D6 (textes fixes) → aucune déclinaison ajoutée nulle part ; D7 (sous-page Tableau de Chasse) → Task 10 ; D8 (équipement sticky) → Task 4 (`applyNewAchievements`/`equipTitle`) ; D9 (toast) → Task 5 ; D10 (boss/décors dérivés) → Task 4 (`assembleAchievementContext`) ; D11 (roster 27 dynamique) → Task 3 (`BOSSES.length`) ; D12 (barres de progression) → Task 3 (`achievementProgressFor`) + Task 10 (rendu) ; D13 (mystère) → Task 3 (`displayMode`) + Task 10 (rendu). Migration/backfill (§6 spec) → Task 8 (contexte complet dans `resolveDailyBoss`, remplace le script de backfill dédié envisagé au spec — plus simple, mêmes garanties). Nettoyage `titleForStreak`/`current_title` → Task 12. e2e → Task 13. Docs/issue → Task 14.
- **Placeholders** : aucun — chaque étape contient le code exact à écrire. Les 2 seules choses différées explicitement sont l'application de migration (Docker/Supabase distant, comme dans le plan US-12 précédent) et le run e2e (serveur prod requis) — mêmes réserves que les plans précédents de ce projet, pas des trous de spec.
- **Cohérence des types** : `AchievementContext`/`AchievementDef` définis une fois (Task 3), réutilisés identiques dans Tasks 4, 6-11. `newAchievements?: string[]` sur `TaskActionResult`/`CloseDayResult`/`ShopActionResult`/`DailyBossSelection` — même nom de champ partout, jamais renommé. `assembleAchievementContext`/`applyNewAchievements` (Task 4) appelés avec la même signature `(supabase, userId[, ctx])` dans tous les checkpoints.
- **Ordre de build** : vérifié qu'aucune tâche ne casse `build`/`lint`/`tsc` à mi-parcours — `AchievementToast` (Task 5) créé avant sa première utilisation (Task 6) ; `achievementQueue` toujours lu (rendu) dans la même tâche où il est créé, jamais un état orphelin ; `titleForStreak`/`current_title` seulement supprimés (Task 12) une fois leurs 2 derniers appelants migrés (Tasks 7 et 11).

## Vérification finale

1. `npx vitest run` vert (catalogue, `evaluateAchievements`, `bestTitleCode`, `achievementProgressFor`, `AchievementToast`).
2. `npm run build` + `npm run lint` + `npx tsc --noEmit` propres.
3. `npx supabase migration list --linked` sans écart après les 3 migrations (pièges bug prod #70 — timestamps strictement croissants, déjà respecté ici : 100000 < 100100 < 190000).
4. `npx playwright test e2e/achievements.spec.ts` vert.
5. Manuel : compléter une tâche jusqu'à un palier de niveau → toast + succès visible (plus "???") au catalogue ; terminer la journée un jour de streak 7/30/100 → toast streak ; acheter un héros → toast héros (+ `ALL_HEROES`/`PLATINUM` si c'est le dernier) ; équiper un titre manuellement → reste affiché même après un déblocage plus prestigieux ensuite ; profil existant avec un `current_title` déjà migré (avant Task 12) → même titre affiché après le premier chargement de l'Arène post-déploiement, sans action du joueur.
