# US-20 — Partage de victoires — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à un Héros de générer une carte PNG portrait (façon écran de score d'arcade) de son issue du jour (victoire/retraite/défaite) et de la partager, depuis `PerfectOverlay` (K.O. en direct) et la carte du Rituel du Crépuscule.

**Architecture:** Route serveur Next.js (`app/api/share-card/route.tsx`) qui rend une image PNG via `ImageResponse` de `next/og` (natif à Next.js 16, aucune dépendance `@vercel/og` séparée) à partir de **paramètres explicites** passés en query string (pas de lookup `day_result`, cf. design). Un module pur (`lib/share-card.ts`) porte tout le mapping/troncature/sérialisation testable indépendamment de l'UI. Un composant client réutilisable (`ShareButton`) gère le fetch + `navigator.share` + repli presse-papier + repli téléchargement, avec un journal d'événements minimal (`share_events`) pour mesurer l'usage réel.

**Tech Stack:** Next.js 16 (App Router, Route Handler), `next/og` (`ImageResponse`, Satori/Resvg intégrés — **pas** de package `@vercel/og` à ajouter), React 19, Supabase (Postgres + RLS), Vitest (+ `@testing-library/react`/`jsdom` pour les tests composant), TypeScript strict.

## Global Constraints

- Toute communication et tout commentaire/texte produit sont en français (CLAUDE.md).
- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`) — un commit par étape logique.
- Branche de feature : `feat/us-20-partage-victoire`.
- RG-04 (pas de suppression destructive) : toute nouvelle table (`share_events`) n'a **aucune policy DELETE/UPDATE** en RLS — journal d'événements immuable, cohérent avec le reste du schéma.
- TypeScript strict, **interdiction d'`any`** partout (types explicites, non-null assertions `!` tolérées uniquement dans le style déjà utilisé par `Arena.tsx`/`getBoss`/`getHero`).
- Logique de jeu pure isolée : le mapping/troncature/stratégie de partage n'est **pas** un calcul de jeu HP/XP (donc ne va **pas** dans `lib/game-engine.ts`) — il vit dans son propre fichier `lib/share-card.ts`, cohérent avec le pattern existant (`lib/bosses.ts`, `lib/heroes.ts`, `lib/guide.ts`).
- Next.js 16 natif : `import { ImageResponse } from "next/og"` — **vérifié dans `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/image-response.md`** : `ImageResponse` est fourni par Next.js lui-même depuis `next/og` (historiquement `@vercel/og`, mais **aucune dépendance séparée à ajouter** dans `package.json` en v16). Seuls formats de police supportés : `ttf`, `otf`, `woff` (pas `woff2`) — utiliser `public/fonts/boldpixels.woff`.
- Format de carte : **portrait 9:16, 1080×1920 PNG**, watermark "Dodojo" + `dodojo.vercel.app` en pied de carte, `Cache-Control: public, immutable, max-age=31536000`.
- Troncature défensive à **24 caractères** (`SHARE_CARD_LABEL_MAX_LENGTH`), cohérent avec `maxLength={24}` d'`OnboardingFlow.tsx`.
- Pas de test e2e Playwright sur `navigator.share` (API peu fiable en headless, justifié dans le design doc) — remplacé par un test composant (Vitest + `@testing-library/react` + `jsdom`) qui vérifie le déclenchement de l'appel réseau et le repli téléchargement.
- Règle Manuel du Dojo (CLAUDE.md) : toute feature visible utilisateur doit avoir sa section dans `content/guide.json` avec un `section.id` **stable** (deep-link), dans la **même PR**.
- Règle Changelog (CLAUDE.md) : ligne sous `## [Unreleased]` dans la même PR que l'implémentation (au sein de la branche — les PR de ce projet sont squash-mergées, donc un commit `docs:` dédié en fin de branche respecte la règle).
- `SPECS_FONCTIONNELLES.md` porte déjà le lien "Design détaillé" vers `docs/superpowers/specs/2026-07-22-us20-partage-victoire-design.md` sous US-20 — **aucune tâche dédiée** pour ce fichier dans ce plan. Note pour l'implémenteur : ce lien mentionne `@vercel/og`, ce qui est techniquement imprécis (c'est `next/og` natif, sans dépendance séparée) — écart mineur toléré, pas de tâche de correction dédiée.
- Contrepartie de sécurité assumée (design) : la route de génération ne vérifie **pas** que les valeurs reçues correspondent à un combat réel (paramètres explicites forgeables) ; l'authentification Supabase est un garde-fou anti-abus basique, pas un contrôle d'intégrité. Combinée au cache `public, immutable`, une requête identique déjà mise en cache CDN peut être resservie sans re-vérification d'auth — acceptable car aucune donnée privée n'est exposée dans l'image.

---

### Task 1: Fonctions pures de base — troncature, palier de série, stratégie de partage

**Files:**
- Create: `lib/share-card.ts`
- Test: `lib/share-card.test.ts`

**Interfaces:**
- Consumes: rien (fonctions pures autonomes).
- Produces (consommé par les tâches suivantes) :
  - `SHARE_CARD_LABEL_MAX_LENGTH: number` (= 24)
  - `truncateForCard(text: string, maxLength?: number): string`
  - `SHARE_CARD_MILESTONES: readonly [7, 30, 100]`
  - `milestoneStreak(streakLength: number): number | null`
  - `type ShareEventType = "share_clicked" | "share_succeeded" | "share_downloaded"`
  - `type ShareSource = "perfect_overlay" | "crepuscule"`
  - `interface ShareCapabilities { canShareFiles: boolean; canWriteClipboard: boolean }`
  - `type ShareStrategy = "native" | "clipboard" | "download"`
  - `pickShareStrategy(capabilities: ShareCapabilities): ShareStrategy`

- [ ] **Step 1: Écrire les tests (échec attendu)**

Créer `lib/share-card.test.ts` :

```ts
import { describe, expect, test } from "vitest";
import {
  SHARE_CARD_LABEL_MAX_LENGTH,
  truncateForCard,
  milestoneStreak,
  pickShareStrategy,
} from "./share-card";

describe("truncateForCard", () => {
  test("laisse un texte court intact", () => {
    expect(truncateForCard("Ada")).toBe("Ada");
  });

  test("tronque et ajoute une ellipse au-delà de la limite par défaut", () => {
    const longName = "Un pseudo vraiment beaucoup trop long"; // > 24 caractères
    const result = truncateForCard(longName);
    expect(result.length).toBe(SHARE_CARD_LABEL_MAX_LENGTH);
    expect(result.endsWith("…")).toBe(true);
  });

  test("respecte une limite personnalisée", () => {
    expect(truncateForCard("Chevalier de Feu", 8)).toBe("Chevali…");
  });

  test("un texte pile à la limite n'est pas tronqué", () => {
    const exact = "a".repeat(SHARE_CARD_LABEL_MAX_LENGTH);
    expect(truncateForCard(exact)).toBe(exact);
  });
});

describe("milestoneStreak", () => {
  test("renvoie le palier atteint (7/30/100)", () => {
    expect(milestoneStreak(7)).toBe(7);
    expect(milestoneStreak(30)).toBe(30);
    expect(milestoneStreak(100)).toBe(100);
  });

  test("renvoie null hors palier", () => {
    expect(milestoneStreak(0)).toBeNull();
    expect(milestoneStreak(6)).toBeNull();
    expect(milestoneStreak(8)).toBeNull();
    expect(milestoneStreak(101)).toBeNull();
  });
});

describe("pickShareStrategy", () => {
  test("préfère le partage natif si les fichiers sont partageables", () => {
    expect(pickShareStrategy({ canShareFiles: true, canWriteClipboard: true })).toBe("native");
  });

  test("retombe sur le presse-papier si le natif est indisponible", () => {
    expect(pickShareStrategy({ canShareFiles: false, canWriteClipboard: true })).toBe("clipboard");
  });

  test("retombe sur le téléchargement en dernier recours", () => {
    expect(pickShareStrategy({ canShareFiles: false, canWriteClipboard: false })).toBe("download");
  });
});
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `npm test -- lib/share-card.test.ts`
Expected: FAIL — `Cannot find module './share-card'` (le fichier n'existe pas encore).

- [ ] **Step 3: Implémenter `lib/share-card.ts`**

```ts
// US-20 : logique pure du partage de victoires — mapping, troncature,
// sérialisation querystring et choix de stratégie de partage client. Isolé du
// calcul de jeu (lib/game-engine.ts) car ce n'est pas une formule HP/XP,
// cohérent avec le pattern lib/bosses.ts / lib/heroes.ts / lib/guide.ts.

export const SHARE_CARD_LABEL_MAX_LENGTH = 24;

// Troncature défensive avec ellipse — pseudo déjà capé à 24 caractères à la
// création (OnboardingFlow.tsx, maxLength={24}), même traitement appliqué ici
// par cohérence de template (et pour tout autre libellé, ex. titre de palier).
export function truncateForCard(
  text: string,
  maxLength: number = SHARE_CARD_LABEL_MAX_LENGTH,
): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

export const SHARE_CARD_MILESTONES = [7, 30, 100] as const;

// US-12/US-20 : la carte bascule en variante "flourish" si le jour partagé
// franchit un palier de série (mêmes paliers que titleForStreak).
export function milestoneStreak(streakLength: number): number | null {
  return (SHARE_CARD_MILESTONES as readonly number[]).includes(streakLength)
    ? streakLength
    : null;
}

export type ShareEventType = "share_clicked" | "share_succeeded" | "share_downloaded";
export type ShareSource = "perfect_overlay" | "crepuscule";

export interface ShareCapabilities {
  canShareFiles: boolean;
  canWriteClipboard: boolean;
}

export type ShareStrategy = "native" | "clipboard" | "download";

// US-20 : ordre de préférence client — partage natif OS (fichiers) > copie
// presse-papier > téléchargement direct (dernier recours universel).
export function pickShareStrategy(capabilities: ShareCapabilities): ShareStrategy {
  if (capabilities.canShareFiles) return "native";
  if (capabilities.canWriteClipboard) return "clipboard";
  return "download";
}
```

- [ ] **Step 4: Lancer les tests, vérifier le succès**

Run: `npm test -- lib/share-card.test.ts`
Expected: PASS (11 tests verts).

- [ ] **Step 5: Commit**

```bash
git add lib/share-card.ts lib/share-card.test.ts
git commit -m "feat: add share card truncation, milestone and strategy helpers"
```

---

### Task 2: Mapping résumé combat/jour clôturé → paramètres de carte + codec querystring

**Files:**
- Modify: `lib/share-card.ts`
- Modify: `lib/share-card.test.ts`

**Interfaces:**
- Consumes : `DaySummary` (exporté par `lib/game-engine.ts`, champs `outcome`, `damageDealt`, `xpEarned`, `tasksCompleted` — déjà retourné par `summarizeDay`, utilisé tel quel par `Arena.tsx` pour `recap`) ; `truncateForCard`, `milestoneStreak` (Task 1).
- Produces (consommé par la route de génération et `Arena.tsx`) :
  - `type ShareCardSummary = Pick<DaySummary, "outcome" | "damageDealt" | "xpEarned" | "tasksCompleted">`
  - `interface ShareCardContext { username: string; heroId: string; bossId: string; level: number; title: string; streak: number; dayDate: string }`
  - `interface ShareCardParams { username: string; heroId: string; bossId: string; outcome: DaySummary["outcome"]; damageDealt: number; xpEarned: number; tasksCompleted: number; streak: number; level: number; title: string; dayDate: string; milestone: number | null }`
  - `buildShareCardParams(summary: ShareCardSummary, context: ShareCardContext): ShareCardParams`
  - `shareCardSearchParams(params: ShareCardParams): URLSearchParams`
  - `parseShareCardParams(searchParams: URLSearchParams): ShareCardParams | null`

- [ ] **Step 1: Écrire les tests (échec attendu)**

Ajouter à la fin de `lib/share-card.test.ts` :

```ts
import {
  buildShareCardParams,
  shareCardSearchParams,
  parseShareCardParams,
  type ShareCardParams,
} from "./share-card";

describe("buildShareCardParams", () => {
  const context = {
    username: "Ada",
    heroId: "fire_knight",
    bossId: "frost-guardian",
    level: 4,
    title: "Ceinture Jaune",
    streak: 7,
    dayDate: "2026-07-22",
  };

  test("mapping depuis un résumé de combat en direct (victoire, palier atteint)", () => {
    const summary = {
      outcome: "victory" as const,
      damageDealt: 80,
      tasksCompleted: 4,
      xpEarned: 120,
    };
    const params = buildShareCardParams(summary, context);
    expect(params).toEqual({
      username: "Ada",
      heroId: "fire_knight",
      bossId: "frost-guardian",
      outcome: "victory",
      damageDealt: 80,
      xpEarned: 120,
      tasksCompleted: 4,
      streak: 7,
      level: 4,
      title: "Ceinture Jaune",
      dayDate: "2026-07-22",
      milestone: 7,
    });
  });

  test("mapping depuis un jour clôturé en retraite (pas de flourish)", () => {
    const summary = {
      outcome: "retreat" as const,
      damageDealt: 40,
      tasksCompleted: 2,
      xpEarned: 60,
    };
    const params = buildShareCardParams(summary, { ...context, streak: 0 });
    expect(params.outcome).toBe("retreat");
    expect(params.milestone).toBeNull();
  });

  test("mapping d'une défaite", () => {
    const summary = {
      outcome: "defeat" as const,
      damageDealt: 20,
      tasksCompleted: 1,
      xpEarned: 30,
    };
    const params = buildShareCardParams(summary, { ...context, streak: 2 });
    expect(params.outcome).toBe("defeat");
  });

  test("tronque pseudo et titre au-delà de 24 caractères", () => {
    const summary = {
      outcome: "victory" as const,
      damageDealt: 20,
      tasksCompleted: 1,
      xpEarned: 30,
    };
    const params = buildShareCardParams(summary, {
      ...context,
      username: "Un pseudo vraiment beaucoup trop long",
      title: "Un titre de palier extrêmement long à tronquer",
    });
    expect(params.username.length).toBeLessThanOrEqual(24);
    expect(params.title.length).toBeLessThanOrEqual(24);
  });
});

describe("shareCardSearchParams / parseShareCardParams (aller-retour)", () => {
  const params: ShareCardParams = {
    username: "Ada",
    heroId: "fire_knight",
    bossId: "frost-guardian",
    outcome: "victory",
    damageDealt: 80,
    xpEarned: 120,
    tasksCompleted: 4,
    streak: 7,
    level: 4,
    title: "Ceinture Jaune",
    dayDate: "2026-07-22",
    milestone: 7,
  };

  test("round-trip complet", () => {
    const qs = shareCardSearchParams(params);
    expect(parseShareCardParams(qs)).toEqual(params);
  });

  test("round-trip sans palier (milestone null)", () => {
    const qs = shareCardSearchParams({ ...params, milestone: null });
    expect(parseShareCardParams(qs)?.milestone).toBeNull();
  });

  test("renvoie null si un champ requis est manquant", () => {
    const qs = shareCardSearchParams(params);
    qs.delete("username");
    expect(parseShareCardParams(qs)).toBeNull();
  });

  test("renvoie null si outcome est invalide", () => {
    const qs = shareCardSearchParams(params);
    qs.set("outcome", "cheating");
    expect(parseShareCardParams(qs)).toBeNull();
  });

  test("renvoie null si un nombre est invalide", () => {
    const qs = shareCardSearchParams(params);
    qs.set("damageDealt", "not-a-number");
    expect(parseShareCardParams(qs)).toBeNull();
  });

  test("retronque les champs texte à la lecture (défense en profondeur)", () => {
    const qs = shareCardSearchParams(params);
    qs.set("username", "Un pseudo vraiment beaucoup trop long, forgé à la main");
    expect(parseShareCardParams(qs)?.username.length).toBeLessThanOrEqual(24);
  });
});
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `npm test -- lib/share-card.test.ts`
Expected: FAIL — `buildShareCardParams`/`shareCardSearchParams`/`parseShareCardParams` non exportés.

- [ ] **Step 3: Implémenter le mapping et le codec querystring**

Ajouter à la fin de `lib/share-card.ts` :

```ts
import type { DaySummary } from "./game-engine";

export type ShareCardSummary = Pick<
  DaySummary,
  "outcome" | "damageDealt" | "xpEarned" | "tasksCompleted"
>;

export interface ShareCardContext {
  username: string;
  heroId: string;
  bossId: string;
  level: number;
  title: string;
  streak: number;
  dayDate: string;
}

export interface ShareCardParams {
  username: string;
  heroId: string;
  bossId: string;
  outcome: DaySummary["outcome"];
  damageDealt: number;
  xpEarned: number;
  tasksCompleted: number;
  streak: number;
  level: number;
  title: string;
  dayDate: string;
  milestone: number | null;
}

// US-20 : fonctionne identiquement pour les deux points d'entrée (PerfectOverlay
// avant clôture, récap Crépuscule après clôture) car les deux calculent leur
// résumé via summarizeDay (lib/game-engine.ts) — aucun lookup day_result requis.
export function buildShareCardParams(
  summary: ShareCardSummary,
  context: ShareCardContext,
): ShareCardParams {
  return {
    username: truncateForCard(context.username),
    heroId: context.heroId,
    bossId: context.bossId,
    outcome: summary.outcome,
    damageDealt: summary.damageDealt,
    xpEarned: summary.xpEarned,
    tasksCompleted: summary.tasksCompleted,
    streak: context.streak,
    level: context.level,
    title: truncateForCard(context.title),
    dayDate: context.dayDate,
    milestone: milestoneStreak(context.streak),
  };
}

export function shareCardSearchParams(params: ShareCardParams): URLSearchParams {
  const qs = new URLSearchParams();
  qs.set("username", params.username);
  qs.set("heroId", params.heroId);
  qs.set("bossId", params.bossId);
  qs.set("outcome", params.outcome);
  qs.set("damageDealt", String(params.damageDealt));
  qs.set("xpEarned", String(params.xpEarned));
  qs.set("tasksCompleted", String(params.tasksCompleted));
  qs.set("streak", String(params.streak));
  qs.set("level", String(params.level));
  qs.set("title", params.title);
  qs.set("dayDate", params.dayDate);
  qs.set("milestone", params.milestone === null ? "" : String(params.milestone));
  return qs;
}

const DAY_OUTCOMES = ["victory", "retreat", "defeat"] as const;

function isDayOutcome(value: string | null): value is DaySummary["outcome"] {
  return value !== null && (DAY_OUTCOMES as readonly string[]).includes(value);
}

function parseNonNegativeInt(value: string | null): number | null {
  if (value === null || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

// US-20 : reconstruit et re-valide les paramètres reçus par la route de
// génération. Retourne null si un champ requis est absent ou mal formé (→ 400
// côté route). Re-tronque les champs texte par défense en profondeur, même si
// shareCardSearchParams les a déjà tronqués côté client (paramètres forgeables).
export function parseShareCardParams(searchParams: URLSearchParams): ShareCardParams | null {
  const username = searchParams.get("username");
  const heroId = searchParams.get("heroId");
  const bossId = searchParams.get("bossId");
  const outcome = searchParams.get("outcome");
  const title = searchParams.get("title") ?? "";
  const dayDate = searchParams.get("dayDate");
  const damageDealt = parseNonNegativeInt(searchParams.get("damageDealt"));
  const xpEarned = parseNonNegativeInt(searchParams.get("xpEarned"));
  const tasksCompleted = parseNonNegativeInt(searchParams.get("tasksCompleted"));
  const streak = parseNonNegativeInt(searchParams.get("streak"));
  const level = parseNonNegativeInt(searchParams.get("level"));
  const milestoneRaw = searchParams.get("milestone");

  if (
    !username ||
    !heroId ||
    !bossId ||
    !dayDate ||
    !isDayOutcome(outcome) ||
    damageDealt === null ||
    xpEarned === null ||
    tasksCompleted === null ||
    streak === null ||
    level === null
  ) {
    return null;
  }

  const milestone =
    milestoneRaw === null || milestoneRaw === "" ? null : parseNonNegativeInt(milestoneRaw);

  return {
    username: truncateForCard(username),
    heroId,
    bossId,
    outcome,
    damageDealt,
    xpEarned,
    tasksCompleted,
    streak,
    level,
    title: truncateForCard(title),
    dayDate,
    milestone,
  };
}
```

- [ ] **Step 4: Lancer les tests, vérifier le succès**

Run: `npm test -- lib/share-card.test.ts`
Expected: PASS (17 tests verts).

- [ ] **Step 5: Commit**

```bash
git add lib/share-card.ts lib/share-card.test.ts
git commit -m "feat: add share card param mapping and querystring codec"
```

---

### Task 3: Migration Supabase — table `share_events` (analytics minimal)

**Files:**
- Create: `supabase/migrations/20260722100000_create_share_events.sql`

**Interfaces:**
- Consumes : convention RLS existante (`day_results`, `unlocked_heroes` — insert/select own, aucune policy delete/update).
- Produces (consommé par `app/actions/share.ts`, Task 4) : table `public.share_events(id, user_id, source, event, outcome, created_at)`.

- [ ] **Step 1: Créer le fichier de migration**

```sql
-- US-20 : analytics minimal de partage — mesure si la feature est réellement
-- utilisée (raison même de sa priorisation dans l'audit Sprint 3). Journal
-- d'événements en écriture seule, jamais de policy UPDATE/DELETE (RG-04).
create table public.share_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  source text not null check (source in ('perfect_overlay', 'crepuscule')),
  event text not null check (event in ('share_clicked', 'share_succeeded', 'share_downloaded')),
  outcome text not null check (outcome in ('victory', 'retreat', 'defeat')),
  created_at timestamptz not null default now()
);

create index share_events_user_created_idx on public.share_events (user_id, created_at);

alter table public.share_events enable row level security;

create policy "share_events_select_own"
  on public.share_events for select
  using (user_id = auth.uid());

create policy "share_events_insert_own"
  on public.share_events for insert
  with check (user_id = auth.uid());

-- Volontairement aucune policy UPDATE/DELETE : journal d'événements immuable.
```

- [ ] **Step 2: Appliquer la migration sur l'environnement Supabase de dev**

Run: `supabase db push` (si le projet local est lié via `supabase link`) — sinon coller le contenu du fichier dans l'éditeur SQL du dashboard Supabase du projet de dev.
Expected: la table `share_events` apparaît dans le schéma `public`, RLS activée, 2 policies (`select`, `insert`).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260722100000_create_share_events.sql
git commit -m "feat: add share_events analytics table migration"
```

---

### Task 4: Server action `logShareEvent`

**Files:**
- Create: `app/actions/share.ts`

**Interfaces:**
- Consumes : `createClient` (`@/lib/supabase/server`), `ShareEventType`/`ShareSource` (`@/lib/share-card`, Task 1), table `share_events` (Task 3).
- Produces (consommé par `ShareButton`, Task 7) : `logShareEvent(event: ShareEventType, source: ShareSource, outcome: DaySummary["outcome"]): Promise<{ error: string | null }>`.

- [ ] **Step 1: Implémenter l'action**

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import type { ShareCardParams, ShareEventType, ShareSource } from "@/lib/share-card";

// US-20 : analytics minimal de partage — n'affecte jamais l'UX si ça échoue
// (feature additive, jamais bloquante, cf. design). Erreurs avalées, comme
// markTutorialSeen (app/actions/profile.ts).
export async function logShareEvent(
  event: ShareEventType,
  source: ShareSource,
  outcome: ShareCardParams["outcome"],
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: null };

  await supabase.from("share_events").insert({
    user_id: user.id,
    source,
    event,
    outcome,
  });

  return { error: null };
}
```

- [ ] **Step 2: Vérifier la compilation TypeScript**

Run: `npx tsc --noEmit`
Expected: aucune erreur de type sur `app/actions/share.ts`.

- [ ] **Step 3: Commit**

```bash
git add app/actions/share.ts
git commit -m "feat: add logShareEvent server action"
```

---

### Task 5: Route de génération de la carte PNG (`next/og`)

**Files:**
- Create: `app/api/share-card/route.tsx`

**Interfaces:**
- Consumes : `parseShareCardParams` (`@/lib/share-card`, Task 2), `getHero`/`DEFAULT_HERO_ID` (`@/lib/heroes`), `getBoss`/`DEFAULT_BOSS_ID` (`@/lib/bosses`), `createClient` (`@/lib/supabase/server`), `ImageResponse` (`next/og`), `public/fonts/boldpixels.woff`, sprites `public/sprites/mc/<slug>/idle/frame0000.png` et `public/sprites/bosses/<slug>/idle/frame0000.png`.
- Produces (consommé par `ShareButton`, Task 7) : `GET /api/share-card?<querystring>` → réponse `image/png` (1080×1920) si authentifié et paramètres valides, `401`/`400`/`500` sinon.

- [ ] **Step 1: Implémenter la route**

```tsx
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@/lib/supabase/server";
import { parseShareCardParams, type ShareCardParams } from "@/lib/share-card";
import { getHero, DEFAULT_HERO_ID } from "@/lib/heroes";
import { getBoss, DEFAULT_BOSS_ID } from "@/lib/bosses";

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1920;

const OUTCOME_LABEL: Record<ShareCardParams["outcome"], string> = {
  victory: "Victoire",
  retreat: "Retraite",
  defeat: "Défaite",
};

const OUTCOME_COLOR: Record<ShareCardParams["outcome"], string> = {
  victory: "#f2c94c",
  retreat: "#e8e6e1",
  defeat: "#e0603f",
};

async function toDataUri(publicRelativePath: string): Promise<string> {
  const bytes = await readFile(join(process.cwd(), "public", publicRelativePath));
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

// US-20 : aucun lookup `day_result` ici — PerfectOverlay se déclenche *avant*
// la clôture du jour (aucune ligne day_results n'existe encore à cet instant),
// donc toutes les valeurs de la carte arrivent en paramètres explicites (cf.
// docs/superpowers/specs/2026-07-22-us20-partage-victoire-design.md).
// Contrepartie assumée : la route ne vérifie pas que les valeurs reçues
// correspondent à un combat réel (paramètres forgeables) — l'authentification
// ci-dessous est un garde-fou anti-abus basique, pas un contrôle d'intégrité.
// Runtime Node.js (par défaut, pas "edge") : requis pour lire les sprites/la
// police locaux via node:fs — le cache HTTP (Cache-Control ci-dessous) est
// indépendant du runtime et est bien honoré par le CDN Vercel.
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response("Non authentifié.", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const params = parseShareCardParams(searchParams);
  if (!params) {
    return new Response("Paramètres de carte invalides.", { status: 400 });
  }

  const hero = getHero(params.heroId) ?? getHero(DEFAULT_HERO_ID)!;
  const boss = getBoss(params.bossId) ?? getBoss(DEFAULT_BOSS_ID)!;

  try {
    const [heroFrameSrc, bossFrameSrc, boldPixels] = await Promise.all([
      toDataUri(`${hero.idleFramePrefix.replace(/^\//, "")}0000.png`),
      toDataUri(`${boss.idleFramePrefix.replace(/^\//, "")}0000.png`),
      readFile(join(process.cwd(), "public/fonts/boldpixels.woff")),
    ]);

    const outcomeLabel = OUTCOME_LABEL[params.outcome];
    const outcomeColor = OUTCOME_COLOR[params.outcome];
    const isFlourish = params.milestone !== null;

    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            padding: "64px 56px",
            background: isFlourish
              ? "linear-gradient(180deg, #3a1d0a 0%, #1b0f22 55%, #0d0912 100%)"
              : "linear-gradient(180deg, #241226 0%, #150c1e 55%, #0d0912 100%)",
            color: "#f4f1ec",
            fontFamily: "sans-serif",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span
              style={{
                fontFamily: "BoldPixels",
                fontSize: 40,
                color: "#f2c94c",
                letterSpacing: 2,
              }}
            >
              DODOJO
            </span>
            <span style={{ fontSize: 24, color: "#a79f95" }}>{params.dayDate}</span>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              flexGrow: 1,
              gap: 28,
            }}
          >
            <span
              style={{
                fontSize: 84,
                fontWeight: 700,
                color: outcomeColor,
                textTransform: "uppercase",
                letterSpacing: 4,
              }}
            >
              {outcomeLabel}
            </span>

            <div
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 40,
              }}
            >
              <div
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- Satori exige un <img> natif */}
                <img
                  src={heroFrameSrc}
                  width={160}
                  height={160}
                  style={{ imageRendering: "pixelated" }}
                />
                <span style={{ fontSize: 22, color: "#e8e6e1" }}>{hero.name}</span>
              </div>
              <span style={{ fontFamily: "BoldPixels", fontSize: 32, color: "#f2c94c" }}>VS</span>
              <div
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- Satori exige un <img> natif */}
                <img
                  src={bossFrameSrc}
                  width={160}
                  height={160}
                  style={{
                    imageRendering: "pixelated",
                    transform: boss.flip ? "scaleX(-1)" : undefined,
                  }}
                />
                <span style={{ fontSize: 22, color: "#e8e6e1" }}>{boss.name}</span>
              </div>
            </div>

            <span style={{ fontSize: 30, color: "#f4f1ec" }}>
              {params.username} · Niveau {params.level}
              {params.title ? ` · ${params.title}` : ""}
            </span>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                width: "100%",
                maxWidth: 720,
                gap: 16,
                borderRadius: 12,
                border: "2px solid #4a3f52",
                padding: "28px 32px",
                background: "rgba(20, 12, 24, 0.6)",
              }}
            >
              <div
                style={{ display: "flex", flexDirection: "row", justifyContent: "space-between" }}
              >
                <span style={{ fontSize: 24, color: "#a79f95" }}>Dégâts infligés</span>
                <span style={{ fontFamily: "BoldPixels", fontSize: 24, color: "#e0603f" }}>
                  {params.damageDealt} HP
                </span>
              </div>
              <div
                style={{ display: "flex", flexDirection: "row", justifyContent: "space-between" }}
              >
                <span style={{ fontSize: 24, color: "#a79f95" }}>Monstres vaincus</span>
                <span style={{ fontSize: 24, color: "#e8e6e1" }}>{params.tasksCompleted}</span>
              </div>
              <div
                style={{ display: "flex", flexDirection: "row", justifyContent: "space-between" }}
              >
                <span style={{ fontSize: 24, color: "#a79f95" }}>XP gagnée</span>
                <span style={{ fontFamily: "BoldPixels", fontSize: 24, color: "#8f7fd6" }}>
                  +{params.xpEarned}
                </span>
              </div>
              {params.streak > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <span style={{ fontSize: 24, color: "#a79f95" }}>Série en cours</span>
                  <span style={{ fontSize: 24, color: "#f2c94c" }}>{params.streak} jours</span>
                </div>
              )}
            </div>

            {isFlourish && (
              <span
                style={{
                  fontFamily: "BoldPixels",
                  fontSize: 28,
                  color: "#f2c94c",
                  textAlign: "center",
                }}
              >
                🔥 Palier de série : {params.milestone} jours 🔥
              </span>
            )}
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              borderTop: "2px solid #4a3f52",
              paddingTop: 24,
            }}
          >
            <span style={{ fontFamily: "BoldPixels", fontSize: 22, color: "#f2c94c" }}>
              DODOJO
            </span>
            <span style={{ fontSize: 20, color: "#a79f95" }}>dodojo.vercel.app</span>
          </div>
        </div>
      ),
      {
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        fonts: [{ name: "BoldPixels", data: boldPixels, weight: 400, style: "normal" }],
        headers: {
          "Cache-Control": "public, immutable, max-age=31536000",
        },
      },
    );
  } catch {
    return new Response("Génération de la carte impossible.", { status: 500 });
  }
}
```

**Note d'implémentation (police) :** `BoldPixels` n'est appliquée qu'aux libellés **courts et en majuscules** ("DODOJO", "VS", nombres de HP/XP, mention de palier) — cohérent avec `ASSETS.md` § 6 : *"Police bold optimisée pour du texte court en majuscules — prévoir une seconde police pour du texte long"*. Tout texte français long ou à casse mixte (pseudo, nom de héros/boss, titre, libellé d'issue, date) reste sur la police par défaut de Satori pour garantir le rendu des caractères accentués (é, è, ô…), non couvert de façon certaine par le glyph-set de BoldPixels.

- [ ] **Step 2: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur de type.

Run: `npm run build`
Expected: build Next.js réussi, la route `/api/share-card` apparaît dans la sortie du build.

- [ ] **Step 3: Vérification manuelle**

Démarrer le serveur (`npm run dev`), se connecter avec le compte e2e, puis dans un nouvel onglet appeler :

```
http://localhost:3000/api/share-card?username=Ada&heroId=fire_knight&bossId=frost-guardian&outcome=victory&damageDealt=80&xpEarned=120&tasksCompleted=4&streak=7&level=4&title=Ceinture+Jaune&dayDate=2026-07-22&milestone=7
```

Expected: une image PNG 1080×1920 s'affiche, sans caractère manquant/tofu sur "Ceinture Jaune" ni sur la date.

- [ ] **Step 4: Commit**

```bash
git add app/api/share-card/route.tsx
git commit -m "feat: add share card generation route (next/og)"
```

---

### Task 6: Outillage de test composant (jsdom + Testing Library)

**Files:**
- Modify: `package.json`
- Modify: `vitest.config.ts`

**Interfaces:**
- Consumes : rien.
- Produces (consommé par Task 7) : environnement Vitest capable d'exécuter des tests `components/**/*.test.tsx` en `jsdom` (via docblock `// @vitest-environment jsdom` par fichier), avec `@testing-library/react` et `@testing-library/jest-dom` disponibles.

- [ ] **Step 1: Installer les dépendances de test composant**

Run: `npm install -D jsdom @testing-library/react @testing-library/jest-dom`
Expected: `package.json`/`package-lock.json` mis à jour avec les 3 nouvelles devDependencies.

- [ ] **Step 2: Étendre l'inclusion Vitest aux tests composant**

Modifier `vitest.config.ts` :

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "components/**/*.test.tsx"],
  },
});
```

- [ ] **Step 3: Vérifier que la suite tourne toujours (aucun test composant encore présent)**

Run: `npm test`
Expected: PASS — mêmes tests `lib/**` qu'avant, aucune régression, aucun test composant collecté pour l'instant.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add component testing tooling (jsdom + Testing Library)"
```

---

### Task 7: Composant `ShareButton`

**Files:**
- Create: `components/combat/ShareButton.tsx`
- Test: `components/combat/ShareButton.test.tsx`

**Interfaces:**
- Consumes : `ShareCardParams`, `ShareSource`, `shareCardSearchParams`, `pickShareStrategy` (`@/lib/share-card`, Tasks 1-2) ; `logShareEvent` (`@/app/actions/share`, Task 4) ; outillage jsdom/Testing Library (Task 6).
- Produces (consommé par `PerfectOverlay` et `CrepusculeRecap`, Tasks 8-9) : `<ShareButton params={ShareCardParams} source={ShareSource} />`.

- [ ] **Step 1: Écrire le test composant (échec attendu)**

Créer `components/combat/ShareButton.test.tsx` :

```tsx
// @vitest-environment jsdom
import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ShareButton from "./ShareButton";
import type { ShareCardParams } from "@/lib/share-card";

vi.mock("@/app/actions/share", () => ({
  logShareEvent: vi.fn(async () => ({ error: null })),
}));

const params: ShareCardParams = {
  username: "Ada",
  heroId: "fire_knight",
  bossId: "frost-guardian",
  outcome: "victory",
  damageDealt: 80,
  xpEarned: 120,
  tasksCompleted: 4,
  streak: 5,
  level: 4,
  title: "",
  dayDate: "2026-07-22",
  milestone: null,
};

describe("ShareButton", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn(
      async () => new Response(new Blob(["fake-png"], { type: "image/png" }), { status: 200 }),
    ) as unknown as typeof fetch;
    global.URL.createObjectURL = vi.fn(() => "blob:mock");
    global.URL.revokeObjectURL = vi.fn();
  });

  test("déclenche l'appel réseau vers la route de génération au clic", async () => {
    render(<ShareButton params={params} source="perfect_overlay" />);
    fireEvent.click(screen.getByRole("button", { name: /partager/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const calledUrl = String((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(calledUrl).toContain("/api/share-card?");
    expect(calledUrl).toContain("username=Ada");
  });

  test("fallback téléchargement quand navigator.share est absent (jsdom ne l'implémente pas)", async () => {
    const clickSpy = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === "a") el.click = clickSpy;
      return el;
    });

    render(<ShareButton params={params} source="perfect_overlay" />);
    fireEvent.click(screen.getByRole("button", { name: /partager/i }));

    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1));
  });

  test("affiche une erreur si la génération échoue", async () => {
    global.fetch = vi.fn(async () => new Response(null, { status: 500 })) as unknown as typeof fetch;

    render(<ShareButton params={params} source="crepuscule" />);
    fireEvent.click(screen.getByRole("button", { name: /partager/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/impossible/i));
  });
});
```

- [ ] **Step 2: Lancer le test, vérifier l'échec**

Run: `npm test -- components/combat/ShareButton.test.tsx`
Expected: FAIL — `Cannot find module './ShareButton'`.

- [ ] **Step 3: Implémenter `ShareButton`**

```tsx
"use client";

import { useState } from "react";
import type { ShareCardParams, ShareSource } from "@/lib/share-card";
import { shareCardSearchParams, pickShareStrategy } from "@/lib/share-card";
import { logShareEvent } from "@/app/actions/share";

interface ShareButtonProps {
  params: ShareCardParams;
  source: ShareSource;
}

type ShareStatus = "idle" | "loading" | "error";

// US-20 : bouton réutilisable (PerfectOverlay + carte du Rituel du Crépuscule).
// Fetch la route de génération, puis partage natif OS > presse-papier >
// téléchargement (cf. pickShareStrategy). navigator.share annulé par
// l'utilisateur (AbortError) n'est pas une erreur — retour silencieux à idle.
export default function ShareButton({ params, source }: ShareButtonProps) {
  const [status, setStatus] = useState<ShareStatus>("idle");

  async function handleShare() {
    setStatus("loading");
    void logShareEvent("share_clicked", source, params.outcome);

    try {
      const qs = shareCardSearchParams(params);
      const response = await fetch(`/api/share-card?${qs.toString()}`);
      if (!response.ok) throw new Error("generation_failed");

      const blob = await response.blob();
      const file = new File([blob], "dodojo-victoire.png", { type: "image/png" });

      const canShareFiles =
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] });
      const canWriteClipboard =
        typeof navigator.clipboard?.write === "function" &&
        typeof window.ClipboardItem !== "undefined";

      const strategy = pickShareStrategy({ canShareFiles, canWriteClipboard });

      if (strategy === "native") {
        await navigator.share({
          files: [file],
          text: "Boss vaincu sur Dodojo — dodojo.vercel.app",
        });
        void logShareEvent("share_succeeded", source, params.outcome);
      } else if (strategy === "clipboard") {
        await navigator.clipboard.write([new window.ClipboardItem({ "image/png": blob })]);
        void logShareEvent("share_succeeded", source, params.outcome);
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "dodojo-victoire.png";
        link.click();
        URL.revokeObjectURL(url);
        void logShareEvent("share_downloaded", source, params.outcome);
      }
      setStatus("idle");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setStatus("idle");
        return;
      }
      setStatus("error");
    }
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={() => void handleShare()}
        disabled={status === "loading"}
        className="rounded-md border border-gold bg-surface px-4 py-2 font-display text-xs uppercase tracking-wide text-gold disabled:opacity-50"
      >
        {status === "loading" ? "…" : "📤 Partager"}
      </button>
      {status === "error" && (
        <p role="alert" className="text-xs text-alert">
          Partage impossible. Réessaie.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Lancer les tests, vérifier le succès**

Run: `npm test -- components/combat/ShareButton.test.tsx`
Expected: PASS (3 tests verts).

- [ ] **Step 5: Lancer toute la suite pour vérifier l'absence de régression**

Run: `npm test`
Expected: PASS (tous les tests `lib/**` + `components/**`).

- [ ] **Step 6: Commit**

```bash
git add components/combat/ShareButton.tsx components/combat/ShareButton.test.tsx
git commit -m "feat: add ShareButton component"
```

---

### Task 8: Intégration dans `PerfectOverlay`

**Files:**
- Modify: `components/combat/PerfectOverlay.tsx`

**Interfaces:**
- Consumes : `ShareCardParams` (`@/lib/share-card`), `ShareButton` (Task 7).
- Produces (consommé par `Arena.tsx`, Task 10) : nouvelle prop requise `shareCardParams: ShareCardParams` sur `PerfectOverlayProps`.

- [ ] **Step 1: Ajouter la prop et le bouton de partage**

Modifier `components/combat/PerfectOverlay.tsx` :

```tsx
"use client";

import type { KoTier } from "@/lib/game-engine";
import type { ShareCardParams } from "@/lib/share-card";
import ShareButton from "./ShareButton";

interface PerfectOverlayProps {
  tier: Exclude<KoTier, null>;
  bossName: string;
  username: string;
  damageDealt: number;
  monstersDefeated: number;
  // Palier de série franchi par ce KO (7/30/100), sinon null → super-variante.
  milestone?: number | null;
  // US-29 (A3) : ce KO est la toute première victoire (coach actif) → punchline dédiée.
  firstVictory?: boolean;
  // US-20 : paramètres pré-calculés de la carte partageable (snapshot live,
  // avant clôture du jour — cf. lib/share-card.ts).
  shareCardParams: ShareCardParams;
  onCrepuscule: () => void;
  onContinue: () => void;
}
```

Puis, dans le bloc de boutons (juste après le bouton "🌙 Rituel du Crépuscule" et avant "Continuer le combat") :

```tsx
      <div className="mt-1 flex flex-col items-stretch gap-2">
        <button
          type="button"
          onClick={onCrepuscule}
          className="rounded-md border border-gold bg-surface px-5 py-2 font-display text-xs uppercase tracking-wide text-gold"
        >
          🌙 Rituel du Crépuscule
        </button>
        <ShareButton params={shareCardParams} source="perfect_overlay" />
        <button
          type="button"
          onClick={onContinue}
          className="rounded-md px-4 py-1.5 text-xs text-muted underline underline-offset-4 hover:text-ink"
        >
          Continuer le combat
        </button>
      </div>
```

Et mettre à jour la signature de la fonction (déstructuration des props) pour inclure `shareCardParams` :

```tsx
export default function PerfectOverlay({
  tier,
  bossName,
  username,
  damageDealt,
  monstersDefeated,
  milestone = null,
  firstVictory = false,
  shareCardParams,
  onCrepuscule,
  onContinue,
}: PerfectOverlayProps) {
```

- [ ] **Step 2: Vérifier la compilation (échec attendu — `Arena.tsx` ne passe pas encore la prop)**

Run: `npx tsc --noEmit`
Expected: FAIL — `Property 'shareCardParams' is missing in type ... but required in type 'PerfectOverlayProps'` sur l'appel dans `Arena.tsx`. C'est attendu : corrigé à la Task 10.

- [ ] **Step 3: Commit**

```bash
git add components/combat/PerfectOverlay.tsx
git commit -m "feat: wire share button into PerfectOverlay"
```

---

### Task 9: Intégration dans `CrepusculeRecap`

**Files:**
- Modify: `components/combat/CrepusculeRecap.tsx`

**Interfaces:**
- Consumes : `ShareCardParams` (`@/lib/share-card`), `ShareButton` (Task 7).
- Produces (consommé par `Arena.tsx`, Task 10) : nouvelle prop requise `shareCardParams: ShareCardParams` sur `CrepusculeRecapProps`.

- [ ] **Step 1: Ajouter la prop et le bouton de partage**

Modifier `components/combat/CrepusculeRecap.tsx` :

```tsx
"use client";

import type { DayOutcome } from "@/types";
import type { ShareCardParams } from "@/lib/share-card";
import ShareButton from "./ShareButton";

interface CrepusculeRecapProps {
  outcome: DayOutcome;
  bossName: string;
  username: string;
  damageDealt: number;
  tasksCompleted: number;
  tasksAbandoned: number;
  xpEarned: number;
  remainingMonsters: number;
  streak: number;
  // US-20 : paramètres pré-calculés de la carte partageable pour ce récap.
  shareCardParams: ShareCardParams;
  onDismiss: () => void;
}
```

Mettre à jour la déstructuration :

```tsx
export default function CrepusculeRecap({
  outcome,
  bossName,
  username,
  damageDealt,
  tasksCompleted,
  tasksAbandoned,
  xpEarned,
  remainingMonsters,
  streak,
  shareCardParams,
  onDismiss,
}: CrepusculeRecapProps) {
```

Et ajouter le bouton juste avant "Continuer" :

```tsx
      <ShareButton params={shareCardParams} source="crepuscule" />

      <button
        type="button"
        onClick={onDismiss}
        className="rounded-md border border-border px-4 py-2 font-display text-xs uppercase tracking-wide text-ink"
      >
        Continuer
      </button>
```

- [ ] **Step 2: Vérifier la compilation (échec attendu — `Arena.tsx` ne passe pas encore la prop)**

Run: `npx tsc --noEmit`
Expected: FAIL — même nature d'erreur que Task 8, corrigée à la Task 10.

- [ ] **Step 3: Commit**

```bash
git add components/combat/CrepusculeRecap.tsx
git commit -m "feat: wire share button into CrepusculeRecap"
```

---

### Task 10: Câblage des `shareCardParams` dans `Arena.tsx`

**Files:**
- Modify: `components/combat/Arena.tsx`

**Interfaces:**
- Consumes : `buildShareCardParams` (`@/lib/share-card`, Task 2), props mises à jour de `PerfectOverlay` (Task 8) et `CrepusculeRecap` (Task 9).
- Produces : rien de nouveau exposé — point de câblage final.

- [ ] **Step 1: Importer `buildShareCardParams`**

Dans `components/combat/Arena.tsx`, ajouter l'import (à côté des autres imports `lib/`) :

```tsx
import { buildShareCardParams } from "@/lib/share-card";
```

- [ ] **Step 2: Passer `shareCardParams` à `PerfectOverlay`**

Repérer le bloc `{koState && (<PerfectOverlay ... />)}` (dans le JSX de retour d'`Arena`) et ajouter la prop `shareCardParams`, calculée à partir de l'état courant des tâches (mêmes tâches que celles qui ont produit ce KO) :

```tsx
          {koState && (
            <PerfectOverlay
              tier={koState.tier}
              bossName={bossName}
              username={profile.username}
              damageDealt={koState.damageDealt}
              monstersDefeated={koState.monstersDefeated}
              milestone={koState.milestone}
              firstVictory={koState.firstVictory}
              shareCardParams={buildShareCardParams(summarizeDay(tasks, "manual"), {
                username: profile.username,
                heroId: profile.equipped_hero_id,
                bossId: boss.id,
                level: profile.level,
                title: profile.current_title,
                streak: currentStreak(
                  [
                    ...dayResults.filter((r) => r.day_date !== today),
                    { day_date: today, outcome: "victory" },
                  ],
                  today,
                ).length,
                dayDate: today,
              })}
              onCrepuscule={() => {
                setKoState(null);
                void handleCrepuscule();
              }}
              onContinue={() => setKoState(null)}
            />
          )}
```

- [ ] **Step 3: Passer `shareCardParams` à `CrepusculeRecap`**

Repérer le bloc `{recap && (<CrepusculeRecap ... />)}` et ajouter la prop `shareCardParams` :

```tsx
      {recap && (
        <CrepusculeRecap
          outcome={recap.outcome}
          bossName={bossName}
          username={profile.username}
          damageDealt={recap.damageDealt}
          tasksCompleted={recap.tasksCompleted}
          tasksAbandoned={recap.tasksAbandoned}
          xpEarned={recap.xpEarned}
          remainingMonsters={activeTasks.filter((task) => !task.is_completed).length}
          streak={currentStreak(dayResults, today).length}
          shareCardParams={buildShareCardParams(recap, {
            username: profile.username,
            heroId: profile.equipped_hero_id,
            bossId: boss.id,
            level: profile.level,
            title: profile.current_title,
            streak: currentStreak(dayResults, today).length,
            dayDate: today,
          })}
          onDismiss={() => setRecap(null)}
        />
      )}
```

- [ ] **Step 4: Vérifier la compilation (doit maintenant réussir)**

Run: `npx tsc --noEmit`
Expected: PASS — plus d'erreur sur les props manquantes de `PerfectOverlay`/`CrepusculeRecap`.

- [ ] **Step 5: Lancer toute la suite de tests**

Run: `npm test`
Expected: PASS (tous les tests `lib/**` + `components/**`, aucune régression sur `game-engine`/`bosses`/`heroes`/`guide`).

- [ ] **Step 6: Build complet**

Run: `npm run build`
Expected: build Next.js réussi (Arène, route `/api/share-card`, tout le reste).

- [ ] **Step 7: Commit**

```bash
git add components/combat/Arena.tsx
git commit -m "feat: wire share card params in Arena"
```

---

### Task 11: Manuel du Dojo — section "Partager sa victoire"

**Files:**
- Modify: `content/guide.json`

**Interfaces:**
- Consumes : schéma `GuideSection`/`GuideBlock` (`lib/guide.ts`, inchangé).
- Produces : nouvelle section avec `id: "partage"` (deep-link stable `/guide#partage`).

- [ ] **Step 1: Ajouter la section au JSON**

Dans `content/guide.json`, mettre à jour `updatedAt` et ajouter une section en fin de tableau `sections` (après `"roster"`) :

```json
{
  "updatedAt": "2026-07-22",
  "sections": [
    { "...": "sections existantes inchangées, jusqu'à \"roster\" inclus" },
    {
      "id": "partage",
      "title": "Partager sa victoire",
      "blocks": [
        { "type": "p", "text": "Après un K.O. en direct ou au Rituel du Crépuscule, un bouton « Partager » génère une carte façon écran de score d'arcade : ton pseudo, ton combattant, le Boss du jour, les dégâts infligés, l'XP gagnée et ta série en cours." },
        { "type": "ul", "items": ["Victoire, retraite ou défaite : les trois issues sont partageables, dans l'esprit dojo qui assume la défaite plutôt que de la cacher", "Un jour qui franchit un palier de série (7/30/100) affiche une carte spéciale avec les flammes du palier", "Le partage utilise la feuille de partage native de ton appareil ; à défaut, la carte est copiée dans le presse-papier ou téléchargée"] }
      ]
    }
  ]
}
```

(Ne pas coller littéralement le placeholder `"..."` : conserver les 11 sections existantes telles quelles, telles que lues dans le fichier actuel, et n'ajouter que la nouvelle section `partage` à la fin.)

- [ ] **Step 2: Vérifier que le guide se rend toujours sans erreur**

Run: `npm test -- lib/guide.test.ts`
Expected: PASS (le test ne dépend pas du contenu de `guide.json`, seulement du mapper pur — aucune régression attendue).

Run: `npm run build`
Expected: `app/guide/page.tsx` build sans erreur (le JSON reste conforme au type `Guide`).

- [ ] **Step 3: Commit**

```bash
git add content/guide.json
git commit -m "docs: add partage section to Manuel du Dojo"
```

---

### Task 12: `CHANGELOG.md` — entrée US-20

**Files:**
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes : rien (fichier de documentation).
- Produces : traçabilité de la feature livrée sous `## [Unreleased]`.

- [ ] **Step 1: Ajouter la ligne Produit**

Sous `### Produit`, après la ligne US-29 (dernière ligne du bloc), ajouter :

```markdown
- US-20 : Partage de victoires (carte PNG portrait façon écran de score d'arcade, générée depuis `PerfectOverlay` et le Rituel du Crépuscule, sur les 3 issues victory/retreat/defeat ; variante flammes au franchissement d'un palier de série ; partage natif OS avec repli presse-papier puis téléchargement)
```

- [ ] **Step 2: Ajouter la ligne Technique**

Sous `### Technique`, après la dernière ligne (`day_results`...), ajouter :

```markdown
- US-20 : route `app/api/share-card/route.tsx` (génération PNG via `next/og`/`ImageResponse`, natif à Next.js 16 — pas de dépendance `@vercel/og` séparée), paramètres explicites (pas de lookup `day_result`), cache `public, immutable`, format 1080×1920 ; mapping pur testé (`lib/share-card.ts`) ; table `share_events` (analytics minimal `share_clicked`/`share_succeeded`/`share_downloaded`, aucune policy UPDATE/DELETE) ; outillage de test composant (`@testing-library/react` + `jsdom`, environnement par fichier)
```

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: add US-20 changelog entry"
```

---

### Task 13: `CLAUDE.md` — documenter la décision non-évidente

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes : rien.
- Produces : entrée dans « Pièges et décisions non-évidentes », suivant le style des entrées existantes (bold + paragraphe).

- [ ] **Step 1: Ajouter l'entrée**

Dans la section « Pièges et décisions non-évidentes » de `CLAUDE.md`, ajouter en dernière entrée (après celle sur « Perfect / K.O. en direct (US-16) ») :

```markdown
**Partage de victoire — paramètres explicites, pas de lookup DB (US-20)** — La route `app/api/share-card/route.tsx` (`next/og` natif à Next.js 16, **aucune dépendance `@vercel/og` séparée** — vérifié dans `node_modules/next/dist/docs`) reçoit toutes les valeurs de la carte en **paramètres de requête explicites** (`lib/share-card.ts`, `buildShareCardParams`/`parseShareCardParams`), jamais par lookup `day_result` : `PerfectOverlay` se déclenche *avant* la clôture du jour, aucune ligne `day_results` n'existe encore à cet instant (le Boss peut même renaître si une tâche est rajoutée après le K.O., cf. note sur `koOutcome`). Contrepartie assumée : la route ne vérifie pas que les valeurs reçues correspondent à un combat réel (n'importe qui pourrait forger une carte en bidouillant les paramètres) — l'authentification Supabase reste un garde-fou anti-abus basique, pas un contrôle d'intégrité. **Cache `Cache-Control: public, immutable, max-age=31536000`** : conséquence assumée, un cache CDN partagé peut resservir l'image à un utilisateur différent une fois qu'une requête identique a été mise en cache, sans re-vérification d'auth — acceptable ici car aucune donnée privée n'est exposée dans l'image. Police `BoldPixels` réservée aux libellés courts/majuscules (nombres, « DODOJO », « VS » — cf. `ASSETS.md` § Fonts) ; tout texte français long ou accentué (pseudo, titre, nom de héros/boss, date) reste sur la police par défaut de Satori pour garantir le rendu des accents. Table `share_events` (analytics minimal `share_clicked`/`share_succeeded`/`share_downloaded`) suit la même convention RG-04 : aucune policy UPDATE/DELETE.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document US-20 share card decisions in CLAUDE.md"
```

---

### Task 14: Vérification finale, bilan issue #21 et Pull Request

**Files:** aucun fichier de code — vérification + actions GitHub.

**Interfaces:** aucune (tâche de clôture).

- [ ] **Step 1: Vérification locale complète (CONTRIBUTING.md, ordre obligatoire)**

```bash
npm run lint
npm test
npm run build
npm run e2e
```

Expected: les 4 commandes passent au vert. Si l'une échoue, corriger avant de continuer (ne jamais pousser en rouge).

- [ ] **Step 2: Vérification manuelle du parcours complet**

1. Démarrer `npm run dev`, se connecter, ajouter 2-3 tâches et les compléter jusqu'au K.O.
2. Sur `PerfectOverlay`, cliquer "📤 Partager" : vérifier dans l'onglet Réseau du navigateur l'appel `GET /api/share-card?...` (200, `image/png`).
3. Sur desktop (navigateur sans `navigator.share`), vérifier que le PNG se télécharge automatiquement (repli téléchargement).
4. Cliquer "🌙 Rituel du Crépuscule" puis "📤 Partager" sur la carte du récap : même vérification.
5. Ouvrir le PNG téléchargé : vérifier visuellement l'absence de glyphe manquant sur le pseudo/titre/date (accents français), et la lisibilité du format portrait.
6. Vérifier dans Supabase (table `share_events`) que les lignes `share_clicked`/`share_downloaded` (ou `share_succeeded` sur mobile avec Web Share) sont bien enregistrées.

Expected: parcours fonctionnel de bout en bout, aucune erreur console, carte lisible.

- [ ] **Step 3: Push de la branche**

```bash
git push -u origin feat/us-20-partage-victoire
```

- [ ] **Step 4: Bilan sur l'issue GitHub #21**

```bash
gh issue comment 21 --body "$(cat <<'EOF'
Bilan d'implémentation US-20 (Partage de victoires) :

- Carte PNG portrait 1080×1920 générée serveur via `next/og` (`ImageResponse` natif Next.js 16, aucune dépendance `@vercel/og` séparée ajoutée), route `app/api/share-card`.
- Paramètres explicites (pas de lookup `day_result`) — fonctionne à l'identique depuis `PerfectOverlay` (avant clôture) et la carte du Rituel du Crépuscule (après clôture).
- Les 3 issues (victoire/retraite/défaite) sont partageables ; variante "flourish" (flammes) si le jour franchit un palier de série (7/30/100).
- Partage client : Web Share API (fichiers) → repli presse-papier → repli téléchargement direct.
- Watermark "Dodojo" + `dodojo.vercel.app` intégré dans la carte, cache `public, immutable`.
- Analytics minimal (`share_events` : `share_clicked`/`share_succeeded`/`share_downloaded`) pour mesurer l'usage réel.
- Mapping/troncature/détection de palier/stratégie de partage 100% couverts par Vitest ; bouton de partage couvert par un test composant (Testing Library + jsdom) — pas de test e2e Playwright sur `navigator.share` (API peu fiable en headless, cf. design doc).
- Manuel du Dojo mis à jour (`#partage`), `CHANGELOG.md` et `CLAUDE.md` mis à jour dans la même branche.

Design détaillé : `docs/superpowers/specs/2026-07-22-us20-partage-victoire-design.md`.
EOF
)"
```

- [ ] **Step 5: Créer la Pull Request**

```bash
gh pr create --title "feat: US-20 partage de victoires (carte PNG + Web Share)" --body "$(cat <<'EOF'
## Résumé
- Carte PNG portrait 9:16 (1080×1920) générée via `next/og` natif (`ImageResponse`), sans dépendance `@vercel/og` séparée, depuis des paramètres explicites (pas de lookup `day_result`).
- Bouton "Partager" sur `PerfectOverlay` (K.O. en direct) et la carte du Rituel du Crépuscule, pour les 3 issues (victory/retreat/defeat).
- Partage natif OS (Web Share API + fichiers) avec repli presse-papier puis téléchargement direct.
- Variante "flourish" (flammes) si le jour franchit un palier de série (7/30/100).
- Analytics minimal (`share_events`) pour mesurer l'usage réel de la feature.

## Test plan
- [x] `npm run lint`
- [x] `npm test` (Vitest — `lib/share-card.test.ts`, `components/combat/ShareButton.test.tsx`, aucune régression)
- [x] `npm run build`
- [x] `npm run e2e`
- [x] Vérification manuelle : partage depuis `PerfectOverlay` et depuis le récap Crépuscule, repli téléchargement sur desktop, absence de glyphe manquant sur texte accentué, ligne `share_events` enregistrée.

Closes #21
EOF
)"
```

Expected: PR créée, listant les commits de la branche, avec `Closes #21` dans le corps.

---

## Self-Review

**1. Couverture du design doc :**
- Carte PNG portrait 9:16, 1080×1920, watermark+lien retour → Task 5.
- `next/og` natif, pas de `@vercel/og` séparé → vérifié dans les docs locales, documenté en Global Constraints, Task 5 et Task 13.
- Génération sans lookup DB, paramètres explicites, contrepartie de sécurité assumée → Task 2 (parse/validate), Task 5 (route), Task 13 (CLAUDE.md).
- Variante flourish palier de streak → `milestoneStreak` (Task 1), branchement dans `buildShareCardParams` (Task 2) et le template (Task 5).
- Cache edge immutable → header dans Task 5.
- Partage client (Web Share + repli presse-papier + repli téléchargement) → `pickShareStrategy` (Task 1), `ShareButton` (Task 7).
- Analytics minimal (`share_clicked`/`share_succeeded`/`share_downloaded`) → Task 3 (table), Task 4 (action), câblé dans Task 7.
- Boutons sur `PerfectOverlay` ET la carte Crépuscule → Tasks 8-9-10.
- Troncature défensive 24 caractères → `truncateForCard` (Task 1), appliquée dans `buildShareCardParams` et `parseShareCardParams` (Task 2).
- Tests Vitest du mapping pur (live vs jour clôturé) → Task 2 (les deux scénarios testés via `buildShareCardParams` sur un `ShareCardSummary` provenant soit d'un combat en cours soit d'un jour clôturé — les deux passent par `summarizeDay` dans le code réel d'`Arena.tsx`, donc un seul mapping pur couvre les deux sources, testé sous les deux angles).
- Pas de test e2e Playwright sur `navigator.share`, test composant à la place → Task 7 (justifié en Global Constraints).
- Manuel du Dojo, section stable `#partage` → Task 11.
- `CHANGELOG.md` → Task 12.
- Bilan issue #21 + PR `Closes #21` → Task 14.
- `SPECS_FONCTIONNELLES.md` : confirmé qu'aucune tâche dédiée n'est nécessaire (lien déjà posé) — noté en Global Constraints.

**2. Scan placeholders :** aucune occurrence de "TBD"/"similaire à la tâche N"/code tronqué — seul le Step 1 de la Task 11 contient un commentaire explicite indiquant de ne pas coller littéralement un texte de remplacement et de conserver le contenu existant intact (instruction opérationnelle, pas un placeholder de code manquant).

**3. Cohérence des types/signatures :**
- `ShareCardParams`, `ShareCardSummary`, `ShareCardContext` définis une seule fois (Task 2) et réutilisés à l'identique dans Tasks 4, 5, 7, 8, 9, 10.
- `ShareEventType`/`ShareSource` définis dans `lib/share-card.ts` (Task 1) et importés (pas redéfinis) dans `app/actions/share.ts` (Task 4) et `ShareButton.tsx` (Task 7).
- `buildShareCardParams(summary, context)` — même signature dans sa définition (Task 2) et ses deux usages (Task 10).
- `pickShareStrategy({ canShareFiles, canWriteClipboard })` — même forme d'objet dans sa définition (Task 1) et son usage (Task 7).
- Props `shareCardParams: ShareCardParams` nommées identiquement sur `PerfectOverlay` (Task 8), `CrepusculeRecap` (Task 9) et leurs appels dans `Arena.tsx` (Task 10).
