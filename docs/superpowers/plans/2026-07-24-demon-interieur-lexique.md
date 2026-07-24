# Lexique "Démon Intérieur" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Renommer tout le vocabulaire "vernis dojo/japonais" (Sensei, Ceinture, Rituel, Sparring, Street, Dojo Gauge, Panthéon, QG, Échoppe, Manuel du Dojo) vers le lexique validé en brainstorming (`docs/superpowers/specs/2026-07-24-demon-interieur-identite-design.md` §3bis), et intégrer le nouveau logo — sans toucher à la mécanique de jeu ni à la palette.

**Architecture:** Renommage en couches, de bas en haut : (1) type/données (`AggressivityLevel`, migrations Supabase), (2) logique pure (`lib/game-engine.ts`, `lib/copy/*.ts`), (3) UI (composants, pages), (4) contenu (guide), (5) tests (unitaires + e2e), (6) documentation (specs, PRODUCT.md, DESIGN.md, CLAUDE.md, CHANGELOG.md). Chaque couche dépend de la précédente — respecter l'ordre des tâches.

**Tech Stack:** Next.js 16 (App Router), TypeScript strict, Supabase (Postgres), Vitest, Playwright.

## Global Constraints

- Mécanique de jeu (`lib/game-engine.ts` hors `titleForStreak`) et palette (`DESIGN.md`) : **aucun changement**.
- `Dodojo` (nom de l'app), `Boss`, `Héros`, `K.O.`, `Perfect`, `Combo`, `Rage Quit`, `Arène` : **restent identiques**, ne jamais renommer.
- Les libellés d'action UI `Ajouter`/`Terminer`/`Reporter`/`Annihiler` : **jamais renommés** — seule la narration autour change de sens.
- Routes techniques (`/qg`, `/echoppe`, `/pantheon`, `/guide`) : **inchangées** — seuls les libellés visibles (titres, aria-labels, nav) changent.
- Lexique exact à utiliser partout (copié depuis le spec, §3bis) :
  - QG → **Le Vestiaire** ; Échoppe → **Le Marché Noir** ; Panthéon → **Tableau de Chasse** ; Manuel du Dojo → **Le Guide**
  - Rituel du Réveil → **Le Réveil** ; Rituel du Crépuscule → **Dernier Round**
  - Ceinture Jaune (7j) → **Calme** ; Ceinture Noire (30j) → **Silence** ; Sensei (100j) → **Esprit Vide**
  - Dojo Gauge → **Volume Intérieur** ; paliers `sensei`/`sparring`/`street` → **`doux`/`direct`/`brut`** (libellés affichés : Doux/Direct/Brut)
  - Voix intérieure "Sensei" → **La Voix**
- Toute occurrence du mot commun "dojo" (hors nom propre `Dodojo`) et "la rue" (registre externe) dans la copy narrative doit disparaître — remplacée par une formulation "tête"/"La Voix"/`Dodojo` (service technique) selon le contexte, jamais par un nouveau mot dojo/japonais.
- Chaque pool de variantes de `lib/copy/*.ts` garde exactement 5 (ou 6 pour `notifications.ts`) entrées par niveau — aucune variante supprimée ou ajoutée, seul le contenu/la clé change.

---

### Task 1: Committer le logo et régénérer les icônes PWA

**Files:**
- Modify: `logo.svg` (racine) → déplacé vers `public/icons/logo-source.svg`
- Modify: `ASSETS.md` (nouvelle entrée)
- Test: vérification manuelle (génération d'assets, pas de test automatisé)

**Interfaces:**
- Consomme : `scripts/generate-pwa-icons.mjs` (déjà existant, lit `public/icons/logo-source.svg`)
- Produit : `app/favicon.ico`, `app/apple-icon.png`, `public/icons/*` régénérés

- [ ] **Step 1: Déplacer le logo au bon endroit**

```bash
mkdir -p public/icons
mv logo.svg public/icons/logo-source.svg
```

- [ ] **Step 2: Régénérer les icônes**

Run: `npm run generate:icons`
Expected: le script se termine sans erreur et régénère `app/favicon.ico`, `app/apple-icon.png`, `public/icons/*` à partir du nouveau SVG.

- [ ] **Step 3: Vérifier visuellement**

Run: `npm run dev` puis ouvrir `http://localhost:3000` et vérifier l'onglet navigateur (favicon = case à cocher rouge/coche or).

- [ ] **Step 4: Ajouter l'entrée ASSETS.md**

Ajouter en tête du fichier `ASSETS.md`, juste après le titre, une nouvelle section :

```markdown
## 0. `public/icons/logo-source.svg` — Logo Dodojo (issue #51)

Logo source du "Démon Intérieur" : case à cocher pixel-art rouge, coche or qui sort du cadre façon lame/coup porté — le coup n'est pas porté à un ennemi extérieur, il transperce ta propre résistance. Généré par `scripts/generate-pwa-icons.mjs` vers `app/favicon.ico`, `app/apple-icon.png`, `public/icons/*`. Relancer `npm run generate:icons` après toute modification de ce fichier.

---
```

- [ ] **Step 5: Commit**

```bash
git add public/icons/logo-source.svg app/favicon.ico app/apple-icon.png public/icons ASSETS.md
git commit -m "feat: intègre le nouveau logo Dodojo (issue #51)"
```

---

### Task 2: Renommer le type `AggressivityLevel` (sensei/sparring/street → doux/direct/brut)

**Files:**
- Modify: `types/index.ts:1`
- Modify: `lib/aggressivity.ts`
- Test: `lib/aggressivity.test.ts`

**Interfaces:**
- Produit : `export type AggressivityLevel = "doux" | "direct" | "brut";` — consommé par TOUTES les tâches suivantes (composants, `lib/copy/*`, tests).

- [ ] **Step 1: Mettre à jour le test (échoue avant le renommage)**

```typescript
import { describe, expect, test } from "vitest";
import { resolveAggressivityLevel } from "./aggressivity";

describe("resolveAggressivityLevel", () => {
  test("renvoie la valeur telle quelle si elle est définie", () => {
    expect(resolveAggressivityLevel("doux")).toBe("doux");
    expect(resolveAggressivityLevel("direct")).toBe("direct");
    expect(resolveAggressivityLevel("brut")).toBe("brut");
  });

  test("replie sur direct si null (profil pré-migration US-49/US-54)", () => {
    expect(resolveAggressivityLevel(null)).toBe("direct");
  });

  test("replie sur direct si undefined", () => {
    expect(resolveAggressivityLevel(undefined)).toBe("direct");
  });
});
```

- [ ] **Step 2: Run pour vérifier l'échec**

Run: `npx vitest run lib/aggressivity.test.ts`
Expected: FAIL — `resolveAggressivityLevel("doux")` ne matche pas le type `AggressivityLevel` actuel (`"sensei" | "sparring" | "street"`), erreur de compilation TypeScript ou assertion `toBe` en échec selon le runner.

- [ ] **Step 3: Renommer le type**

`types/index.ts:1` :
```typescript
export type AggressivityLevel = "doux" | "direct" | "brut";
```

- [ ] **Step 4: Renommer le défaut**

`lib/aggressivity.ts` :
```typescript
import type { AggressivityLevel } from "@/types";

const DEFAULT_LEVEL: AggressivityLevel = "direct";

// Le type Profile déclare `aggressivity_level: AggressivityLevel` (non-nullable),
// mais un profil créé avant la migration US-49/US-54 peut avoir NULL en base
// (pas de backfill au moment de la migration) — le type ment sur la forme
// runtime réelle. Point d'entrée UNIQUE pour résoudre une valeur sûre : tout
// lecteur de `profiles.aggressivity_level` doit passer par ici plutôt que
// dupliquer `?? "direct"` (la divergence entre app/qg/page.tsx et
// components/combat/Arena.tsx est exactement ce qui a causé le crash
// pickVariant(pools[undefined]) dans lib/copy/rituals.ts).
export function resolveAggressivityLevel(
  value: AggressivityLevel | null | undefined,
): AggressivityLevel {
  return value ?? DEFAULT_LEVEL;
}
```

- [ ] **Step 5: Run pour vérifier le succès**

Run: `npx vitest run lib/aggressivity.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add types/index.ts lib/aggressivity.ts lib/aggressivity.test.ts
git commit -m "refactor: renomme AggressivityLevel sensei/sparring/street en doux/direct/brut (issue #51)"
```

---

### Task 3: Migration Supabase — valeurs `profiles.aggressivity_level`

**Files:**
- Create: `supabase/migrations/20260724160000_rename_aggressivity_levels.sql`

**Interfaces:**
- Consomme : colonne `profiles.aggressivity_level` (contrainte check existante `in ('sensei','sparring','street')`, défaut `'sparring'`)
- Produit : mêmes lignes, nouvelles valeurs `'doux'|'direct'|'brut'`, nouveau défaut `'direct'`

- [ ] **Step 1: Écrire la migration**

```sql
-- Renomme les valeurs de profiles.aggressivity_level suite au reframe
-- "Démon Intérieur" (issue #51) : sensei/sparring/street → doux/direct/brut.
alter table public.profiles
  drop constraint if exists profiles_aggressivity_level_check;

update public.profiles set aggressivity_level = 'doux' where aggressivity_level = 'sensei';
update public.profiles set aggressivity_level = 'direct' where aggressivity_level = 'sparring';
update public.profiles set aggressivity_level = 'brut' where aggressivity_level = 'street';

alter table public.profiles
  alter column aggressivity_level set default 'direct';

alter table public.profiles
  add constraint profiles_aggressivity_level_check
  check (aggressivity_level in ('doux', 'direct', 'brut'));
```

- [ ] **Step 2: Appliquer localement et vérifier**

Run: `npx supabase migration up` (ou `npx supabase db push` selon le workflow local du projet)
Expected: migration appliquée sans erreur ; `select distinct aggressivity_level from profiles;` ne renvoie que `doux`/`direct`/`brut`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260724160000_rename_aggressivity_levels.sql
git commit -m "chore: migre les valeurs profiles.aggressivity_level vers doux/direct/brut (issue #51)"
```

---

### Task 4: Renommer `titleForStreak` (Ceinture Jaune/Noire/Sensei → Calme/Silence/Esprit Vide)

**Files:**
- Modify: `lib/game-engine.ts` (fonction `titleForStreak`, ~ligne 675)
- Test: `lib/game-engine.test.ts` (describe `"titleForStreak"`, ~ligne 991)

**Interfaces:**
- Produit : `titleForStreak(bestStreak: number): string | null` renvoie désormais `"Calme"` / `"Silence"` / `"Esprit Vide"` / `null` — consommé par `app/pantheon/page.tsx` (Task 15) et `app/actions/day.ts`.

- [ ] **Step 1: Mettre à jour le test (échoue avant le renommage)**

Remplacer dans `lib/game-engine.test.ts` :
```typescript
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

Et corriger le commentaire du test qui référence l'ancien titre, quelques lignes au-dessus (~ligne 976) :
```typescript
  it("détecte une série de 100 jours quand l'historique fourni couvre au moins 100 jours (audit #67, PR4)", () => {
    // Verrouille le bug : un appelant qui borne sa requête à 60 jours (comme
    // app/page.tsx avant fix) ne peut structurellement jamais faire détecter
    // le palier 100 (titre "Esprit Vide") par cette fonction, même avec 100+ jours
    // de victoires réelles en base — la fonction s'arrête à `earliest`, la
    // date la plus ancienne du tableau REÇU, pas de l'historique réel.
```

- [ ] **Step 2: Run pour vérifier l'échec**

Run: `npx vitest run lib/game-engine.test.ts -t titleForStreak`
Expected: FAIL — `titleForStreak(7)` renvoie encore `"Ceinture Jaune"`.

- [ ] **Step 3: Renommer l'implémentation**

`lib/game-engine.ts`, remplacer :
```typescript
// US-12 : titre débloqué selon le record de série — progression de clarté
// mentale croissante (issue #51, "Démon Intérieur").
export function titleForStreak(bestStreak: number): string | null {
  if (bestStreak >= 100) return "Esprit Vide";
  if (bestStreak >= 30) return "Silence";
  if (bestStreak >= 7) return "Calme";
  return null;
}
```

- [ ] **Step 4: Run pour vérifier le succès**

Run: `npx vitest run lib/game-engine.test.ts -t titleForStreak`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/game-engine.ts lib/game-engine.test.ts
git commit -m "refactor: renomme les titres de streak en Calme/Silence/Esprit Vide (issue #51)"
```

---

### Task 5: Migration Supabase — valeurs `profiles.current_title`

**Files:**
- Create: `supabase/migrations/20260724160100_rename_streak_titles.sql`

**Interfaces:**
- Consomme : colonne `profiles.current_title` (texte libre, défaut `'Novice'`, alimentée par `titleForStreak` via `app/actions/day.ts`)
- Produit : lignes existantes `Ceinture Jaune`/`Ceinture Noire`/`Sensei` renommées, `Novice` inchangé.

- [ ] **Step 1: Écrire la migration**

```sql
-- Renomme les titres de streak déjà persistés suite au reframe
-- "Démon Intérieur" (issue #51). "Novice" (défaut, non lié aux paliers de
-- streak) reste inchangé.
update public.profiles set current_title = 'Calme' where current_title = 'Ceinture Jaune';
update public.profiles set current_title = 'Silence' where current_title = 'Ceinture Noire';
update public.profiles set current_title = 'Esprit Vide' where current_title = 'Sensei';
```

- [ ] **Step 2: Appliquer localement et vérifier**

Run: `npx supabase migration up`
Expected: migration appliquée sans erreur ; `select distinct current_title from profiles;` ne renvoie plus `Ceinture Jaune`/`Ceinture Noire`/`Sensei`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260724160100_rename_streak_titles.sql
git commit -m "chore: migre les titres de streak persistés vers Calme/Silence/Esprit Vide (issue #51)"
```

---

### Task 6: Réécrire `lib/copy/rituals.ts` (Le Réveil / Dernier Round, voix La Voix)

**Files:**
- Modify: `lib/copy/rituals.ts`
- Test: `lib/copy/rituals.test.ts`

**Interfaces:**
- Consomme : `AggressivityLevel` (Task 2), `pickVariant`/`randomSeed` (`lib/copy/variant.ts`, inchangé)
- Produit : `wakeUpSubtitle(level, seed)`, `crepusculeHeader(level, victory)`, `crepusculeLine(level, args, seed)` — signatures inchangées, clés de niveau et contenu renommés.

- [ ] **Step 1: Mettre à jour le test (échoue avant la réécriture)**

```typescript
import { describe, expect, test } from "vitest";
import { wakeUpSubtitle, crepusculeHeader, crepusculeLine } from "./rituals";

const FORBIDDEN_DOUX = /putain|bordel|merde|\bcon\b|connard|foutre/;

describe("Le Réveil", () => {
  test("pool d'au moins 5 variantes, seed stable", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 5; seed++) seen.add(wakeUpSubtitle("direct", seed));
    expect(seen.size).toBeGreaterThanOrEqual(5);
    expect(wakeUpSubtitle("direct", 2)).toBe(wakeUpSubtitle("direct", 2));
  });
  test("doux reste sans juron sur tout le pool", () => {
    for (let seed = 0; seed < 5; seed++) {
      expect(wakeUpSubtitle("doux", seed)).not.toMatch(FORBIDDEN_DOUX);
    }
  });
});

describe("Dernier Round", () => {
  test("header reste fixe", () => {
    expect(crepusculeHeader("direct", true)).toBe("Perfect !");
    expect(crepusculeHeader("direct", false)).toBe("Dernier Round");
  });

  test("victoire : pool d'au moins 5 variantes, seed stable", () => {
    const args = { victory: true, username: "Thomas", bossName: "le Zombie" };
    const seen = new Set<string>();
    for (let seed = 0; seed < 5; seed++) seen.add(crepusculeLine("direct", args, seed));
    expect(seen.size).toBeGreaterThanOrEqual(5);
    expect(crepusculeLine("direct", args, 3)).toBe(crepusculeLine("direct", args, 3));
  });

  test("retraite : pool d'au moins 5 variantes", () => {
    const args = { victory: false, username: "Thomas", bossName: "le Zombie" };
    const seen = new Set<string>();
    for (let seed = 0; seed < 5; seed++) seen.add(crepusculeLine("direct", args, seed));
    expect(seen.size).toBeGreaterThanOrEqual(5);
  });

  test("brut élargit le vocabulaire sans viser le joueur, sur tout le pool", () => {
    const args = { victory: true, username: "Thomas", bossName: "le Zombie" };
    const jurons = Array.from({ length: 5 }, (_, seed) => crepusculeLine("brut", args, seed)).some((line) =>
      /putain|bordel|merde/i.test(line),
    );
    expect(jurons).toBe(true);
    for (let seed = 0; seed < 5; seed++) {
      expect(crepusculeLine("brut", args, seed)).not.toMatch(/connard|\bcon\b/);
    }
  });
});
```

- [ ] **Step 2: Run pour vérifier l'échec**

Run: `npx vitest run lib/copy/rituals.test.ts`
Expected: FAIL — `wakeUpSubtitle("direct", ...)` ne matche aucune clé du `Record<AggressivityLevel, ...>` actuel (`sensei`/`sparring`/`street`).

- [ ] **Step 3: Réécrire l'implémentation**

```typescript
import type { AggressivityLevel } from "../../types";
import { pickVariant, randomSeed } from "./variant";

export function wakeUpSubtitle(level: AggressivityLevel, seed: number = randomSeed()): string {
  const pools: Record<AggressivityLevel, string[]> = {
    doux: [
      "Les tâches d'hier attendent encore une réponse. Prends un instant, règle-les avant d'avancer.",
      "Ce qui n'a pas été traité hier reste là, tranquillement. Occupe-t'en avant de continuer.",
      "Quelques restes de la veille patientent. Rien d'urgent, mais rien qui se règle seul non plus.",
      "Avant d'avancer, un instant pour ce qui traîne depuis hier.",
      "Ta tête attend que tu règles ces quelques restes avant d'ouvrir un nouveau combat.",
    ],
    direct: [
      "Les monstres que tu as fuis hier sont revenus. Règle tes comptes avant d'entrer dans l'Arène.",
      "Il reste des comptes à régler d'hier. Passe par là avant l'Arène.",
      "Les restes de la veille t'attendent au tournant. On règle ça d'abord.",
      "Hier n'est pas totalement fini pour toi. Termine, puis on entre.",
      "Quelques monstres d'hier traînent encore. Avant l'Arène, tu les règles.",
    ],
    brut: [
      "Tes monstres d'hier sont pas partis, ils t'ont attendu. Nettoie ce bordel avant d'entrer.",
      "Ça, c'est les restes d'hier, et ouais, ils sont encore là. Dégage-moi ça avant d'avancer.",
      "T'as cru que fuir hier suffisait ? Non. Nettoie, putain, avant d'entrer dans l'Arène.",
      "Les monstres d'hier ont fait le pied de grue toute la nuit. Réglé-moi ça direct.",
      "Bordel de restes de la veille encore plantés là. On nettoie avant de taper la suite.",
    ],
  };
  return pickVariant(pools[level], seed);
}

export function crepusculeHeader(level: AggressivityLevel, victory: boolean): string {
  const headers: Record<AggressivityLevel, [string, string]> = {
    doux: ["Journée accomplie.", "Dernier Round."],
    direct: ["Perfect !", "Dernier Round"],
    brut: ["NETTOYÉ !", "Dernier Round."],
  };
  const [victoryHeader, retreatHeader] = headers[level];
  return victory ? victoryHeader : retreatHeader;
}

interface CrepusculeLineArgs {
  victory: boolean;
  username: string;
  bossName: string;
}

export function crepusculeLine(
  level: AggressivityLevel,
  args: CrepusculeLineArgs,
  seed: number = randomSeed(),
): string {
  const { victory, username, bossName } = args;

  if (victory) {
    const pools: Record<AggressivityLevel, Array<(u: string, b: string) => string>> = {
      doux: [
        (u, b) => `${u}, ${b} s'est incliné. Repose-toi, ta tête attendra ta prochaine sortie.`,
        (u, b) => `Journée close, ${u}. ${b} n'a plus rien à te disputer ce soir.`,
        (u, b) => `${b} recule pour aujourd'hui, ${u}. Le repos aussi fait partie du chemin.`,
        (u, b) => `${u}, la journée se referme sur ${b} vaincu. Rien à ajouter, tout est fait.`,
        (u, b) => `${b} s'efface, ${u}. Un jour de plus, calmement mené à son terme.`,
      ],
      direct: [
        (u, b) => `${u}, tu as terrassé ${b}. Ta tête est calme pour ce soir.`,
        (u, b) => `${b} plié, journée bouclée, ${u}. Va souffler un peu.`,
        (u, b) => `${u}, encore une journée pliée. ${b} n'a pas fait le poids.`,
        (u, b) => `${b} est tombé pour de bon ce soir, ${u}. Bien joué.`,
        (u, b) => `Journée terminée, ${u}. ${b} range ses affaires, tu peux ranger les tiennes aussi.`,
      ],
      brut: [
        (u, b) => `${u}, ${b} est au tapis, putain. Ta tête te doit le respect ce soir.`,
        (u, b) => `NETTOYÉ, ${u} ! ${b} valait rien face à toi ce soir.`,
        (u, b) => `${b} dégagé, journée pliée, ${u}. Même le Dernier Round applaudit, bordel.`,
        (u, b) => `${u}, tu viens de fermer boutique sur ${b}. Prochaine victime demain.`,
        (u, b) => `${b} en miettes, ${u}. Ta tête s'en souviendra un moment, merde.`,
      ],
    };
    return pickVariant(pools[level], seed)(username, bossName);
  }

  const pools: Record<AggressivityLevel, Array<(u: string) => string>> = {
    doux: [
      (u) => `${u}, tu poses les armes pour ce soir. Aucune honte à ça — demain reste un autre combat.`,
      (u) => `${u}, la journée s'arrête ici. Ce n'est pas un échec, juste une pause.`,
      (u) => `Tu t'arrêtes là ce soir, ${u}. Demain reprend où tu l'as laissé.`,
      (u) => `${u}, rien ne presse à forcer la fin. Reviens demain, l'esprit reposé.`,
      (u) => `La journée se clôt sans victoire, ${u}. Elle compte quand même.`,
    ],
    direct: [
      (u) => `${u}, tu poses les armes. Pas de honte — demain est un autre combat.`,
      (u) => `${u}, journée pas terminée, mais on arrête là pour ce soir.`,
      (u) => `Tu rentres sans le K.O. ce soir, ${u}. Ça arrive, demain on recommence.`,
      (u) => `${u}, pas de victoire cette fois. Repos, et on retente demain.`,
      (u) => `Journée close sans avoir plié le Boss, ${u}. Pas grave, il attendra.`,
    ],
    brut: [
      (u) => `${u}, tu esquives ce soir ? D'accord. Mais ce combat t'attend au tournant, demain.`,
      (u) => `Tu rentres bredouille, ${u}. Le Boss aura de la marge, mais demain il paiera.`,
      (u) => `${u}, pas de K.O. ce soir. Tant pis, on remet ça direct demain.`,
      (u) => `Bon, ${u}, ce soir c'est match nul. Le Boss t'attend de pied ferme demain.`,
      (u) => `${u}, tu lâches l'affaire pour aujourd'hui. Le combat, lui, n'oublie rien.`,
    ],
  };
  return pickVariant(pools[level], seed)(username);
}
```

- [ ] **Step 4: Run pour vérifier le succès**

Run: `npx vitest run lib/copy/rituals.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/copy/rituals.ts lib/copy/rituals.test.ts
git commit -m "feat: réécrit lib/copy/rituals.ts (Le Réveil/Dernier Round, doux/direct/brut) (issue #51)"
```

---

### Task 7: Réécrire `lib/copy/combat.ts`

**Files:**
- Modify: `lib/copy/combat.ts`
- Test: `lib/copy/combat.test.ts`

**Interfaces:**
- Produit : `emptyStateTitle`, `emptyStateBody`, `levelUpTitle`, `levelUpBody`, `koHeader`, `koLine`, `milestoneLine` — signatures inchangées, clés de niveau renommées, contenu "dojo" remplacé par "La Voix"/"ta tête".

- [ ] **Step 1: Mettre à jour le test (échoue avant la réécriture)**

```typescript
import { describe, expect, test } from "vitest";
import {
  emptyStateTitle,
  emptyStateBody,
  levelUpTitle,
  levelUpBody,
  koHeader,
  koLine,
  milestoneLine,
} from "./combat";

const FORBIDDEN_DOUX = /putain|bordel|merde|\bcon\b|connard|foutre/;

describe("empty state", () => {
  test("titre reste fixe (tag court, pas de pool)", () => {
    expect(emptyStateTitle("direct")).toBe("Terrain vague.");
  });
  test("le corps a un pool d'au moins 5 variantes par niveau, seed stable", () => {
    const seenDirect = new Set<string>();
    for (let seed = 0; seed < 5; seed++) seenDirect.add(emptyStateBody("direct", seed));
    expect(seenDirect.size).toBeGreaterThanOrEqual(5);
    expect(emptyStateBody("direct", 2)).toBe(emptyStateBody("direct", 2));
  });
  test("brut est plus cru que doux sur tout le pool", () => {
    for (let seed = 0; seed < 5; seed++) {
      expect(emptyStateBody("doux", seed)).not.toMatch(FORBIDDEN_DOUX);
    }
  });
});

describe("level up", () => {
  test("titre reste fixe", () => {
    expect(levelUpTitle("direct")).toBe("Level Up !");
  });
  test("le corps a un pool d'au moins 5 variantes, seed stable", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 5; seed++) seen.add(levelUpBody("direct", 4, seed));
    expect(seen.size).toBeGreaterThanOrEqual(5);
    expect(levelUpBody("direct", 4, 1)).toBe(levelUpBody("direct", 4, 1));
  });
  test("brut jure sur au moins une variante, doux jamais", () => {
    const brutJurons = Array.from({ length: 5 }, (_, seed) => levelUpBody("brut", 4, seed)).some(
      (line) => /putain|bordel/i.test(line),
    );
    expect(brutJurons).toBe(true);
    for (let seed = 0; seed < 5; seed++) {
      expect(levelUpBody("doux", 4, seed)).not.toMatch(FORBIDDEN_DOUX);
    }
  });
});

describe("Perfect / K.O.", () => {
  test("header reste fixe", () => {
    expect(koHeader("direct", true)).toBe("Perfect !");
    expect(koHeader("direct", false)).toBe("K.O. !");
  });

  test("koLine a un pool d'au moins 5 variantes par cas, seed stable", () => {
    const args = { isPerfect: true, firstVictory: false, username: "Thomas", bossName: "le Gardien de Glace" };
    const seen = new Set<string>();
    for (let seed = 0; seed < 5; seed++) seen.add(koLine("direct", args, seed));
    expect(seen.size).toBeGreaterThanOrEqual(5);
    expect(koLine("direct", args, 3)).toBe(koLine("direct", args, 3));
  });

  test("jamais d'attaque personnelle contre le joueur, même en brut, sur tout le pool", () => {
    const args = { isPerfect: true, firstVictory: false, username: "Thomas", bossName: "le Gardien de Glace" };
    for (let seed = 0; seed < 5; seed++) {
      expect(koLine("brut", args, seed)).not.toMatch(/connard|\bcon\b/);
    }
  });

  test("firstVictory a son propre pool, distinct de perfect/ko", () => {
    const perfectArgs = { isPerfect: true, firstVictory: false, username: "T", bossName: "B" };
    const firstVictoryArgs = { isPerfect: true, firstVictory: true, username: "T", bossName: "B" };
    expect(koLine("direct", firstVictoryArgs, 0)).not.toBe(koLine("direct", perfectArgs, 0));
  });

  test("milestone a un pool d'au moins 5 variantes, seed stable", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 5; seed++) seen.add(milestoneLine("direct", 7, seed));
    expect(seen.size).toBeGreaterThanOrEqual(5);
    expect(milestoneLine("direct", 7, 2)).toBe(milestoneLine("direct", 7, 2));
  });
});
```

- [ ] **Step 2: Run pour vérifier l'échec**

Run: `npx vitest run lib/copy/combat.test.ts`
Expected: FAIL.

- [ ] **Step 3: Réécrire l'implémentation**

```typescript
import type { AggressivityLevel } from "../../types";
import { pickVariant, randomSeed } from "./variant";

export function emptyStateTitle(level: AggressivityLevel): string {
  const titles: Record<AggressivityLevel, string> = {
    doux: "Ta tête est calme.",
    direct: "Terrain vague.",
    brut: "Tu glandes ou quoi ?",
  };
  return titles[level];
}

export function emptyStateBody(level: AggressivityLevel, seed: number = randomSeed()): string {
  const pools: Record<AggressivityLevel, string[]> = {
    doux: [
      "Aucune bataille à livrer pour l'instant. Le silence est aussi un entraînement.",
      "Rien ne presse. Profite de cet instant sans combat.",
      "Ta tête respire. Reviens quand une cible se présentera.",
      "Pas d'adversaire aujourd'hui — ce n'est pas rien de s'arrêter.",
      "L'esprit vide précède l'action juste. Prends ton temps.",
    ],
    direct: [
      "Aucun monstre à l'horizon. Ta tête est calme… trop calme.",
      "Pas d'adversaire en vue ? Ajoute un boss à tomber.",
      "Le compteur est à zéro. À toi de le faire grimper.",
      "Rien à se mettre sous la dent. Balance une tâche.",
      "Le Boss n'a pas encore pointé le bout de son nez.",
    ],
    brut: [
      "Balance tes tâches qu'on les défonce. Y'a rien à taper là.",
      "Sérieux, l'appli tourne dans le vide. Remplis quelque chose.",
      "Zéro monstre, zéro excuse. Ajoute un truc avant que je m'endorme.",
      "Même cet écran vide s'ennuie plus vite que toi.",
      "Le néant total. Même le dev qui a codé cet écran attendait mieux de toi.",
    ],
  };
  return pickVariant(pools[level], seed);
}

export function levelUpTitle(level: AggressivityLevel): string {
  const titles: Record<AggressivityLevel, string> = {
    doux: "Palier franchi.",
    direct: "Level Up !",
    brut: "LEVEL UP, YEAH !",
  };
  return titles[level];
}

export function levelUpBody(
  level: AggressivityLevel,
  newLevel: number,
  seed: number = randomSeed(),
): string {
  const pools: Record<AggressivityLevel, Array<(n: number) => string>> = {
    doux: [
      (n) => `Niveau ${n}. Une leçon de plus, assimilée en silence.`,
      (n) => `Niveau ${n}. Le chemin s'allonge, l'esprit s'affine.`,
      (n) => `Niveau ${n} atteint. Rien à célébrer bruyamment, tout à retenir.`,
      (n) => `Niveau ${n}. Chaque palier est une répétition de plus.`,
      (n) => `Niveau ${n}. La Voix ne dit rien, elle observe.`,
    ],
    direct: [
      (n) => `Niveau ${n}. Tu en as appris un peu plus sur toi-même.`,
      (n) => `Niveau ${n} ! Tu progresses, continue comme ça.`,
      (n) => `Niveau ${n}. Un cran au-dessus, mérité.`,
      (n) => `Niveau ${n} débloqué. La suite s'annonce plus corsée.`,
      (n) => `Niveau ${n}. La Voix prend des notes sur toi.`,
    ],
    brut: [
      (n) => `Niveau ${n}, putain ! Tu montes en grade, machine.`,
      (n) => `Niveau ${n} ! Même le générateur de niveaux est impressionné.`,
      (n) => `Ding ! Niveau ${n}. Ouais, comme dans un vrai jeu vidéo.`,
      (n) => `Niveau ${n}, bordel ! T'écris un patch note à toi tout seul.`,
      (n) => `Niveau ${n} ! Le compteur XP a fumé un peu, mais il tient.`,
    ],
  };
  return pickVariant(pools[level], seed)(newLevel);
}

export function koHeader(level: AggressivityLevel, isPerfect: boolean): string {
  const headers: Record<AggressivityLevel, [string, string]> = {
    doux: ["Perfect.", "K.O."],
    direct: ["Perfect !", "K.O. !"],
    brut: ["PERFECT !", "K.O. !!"],
  };
  const [perfect, ko] = headers[level];
  return isPerfect ? perfect : ko;
}

interface KoLineArgs {
  isPerfect: boolean;
  firstVictory: boolean;
  username: string;
  bossName: string;
}

export function koLine(
  level: AggressivityLevel,
  args: KoLineArgs,
  seed: number = randomSeed(),
): string {
  const { isPerfect, firstVictory, username, bossName } = args;

  if (firstVictory) {
    const pools: Record<AggressivityLevel, Array<(u: string, b: string) => string>> = {
      doux: [
        (u, b) => `Premier combat mené à son terme, ${u}. ${b} s'incline. Bienvenue dans l'Arène.`,
        (u, b) => `Premier pas dans l'Arène, ${u}. ${b} s'efface devant ta constance.`,
        (u, b) => `${b} recule. Un début discret, ${u}, mais un début.`,
        (u, b) => `Ton premier combat s'achève, ${u}. ${b} s'incline, sans éclat inutile.`,
        (u, b) => `${u}, ${b} cède. La suite s'écrit maintenant, pas à pas.`,
      ],
      direct: [
        (u, b) => `Premier sang, ${u} ! ${b} est au tapis. Bienvenue dans l'Arène.`,
        (u, b) => `${u}, ton premier K.O. ! ${b} ne s'y attendait pas.`,
        (u, b) => `Et de un ! ${b} tombe, ${u} entre dans l'Arène en fanfare.`,
        (u, b) => `Premier combat, premier K.O., ${u}. ${b} s'en souviendra.`,
        (u, b) => `${b} au tapis dès le premier round, ${u}. Beau début.`,
      ],
      brut: [
        (u, b) => `Premier sang, ${u} ! ${b} est en miettes, putain !`,
        (u, b) => `Premier combat, ${u}, et déjà ${b} qui mord la poussière. Respect.`,
        (u, b) => `${b} explose direct, ${u}. Même le tutoriel a l'air surpris.`,
        (u, b) => `Ça c'est une entrée fracassante, ${u} ! ${b} n'a rien vu venir.`,
        (u, b) => `Premier K.O. de ta carrière, ${u}, et ${b} en paie le prix. Bienvenue dans l'Arène.`,
      ],
    };
    return pickVariant(pools[level], seed)(username, bossName);
  }

  if (isPerfect) {
    const pools: Record<AggressivityLevel, Array<(u: string, b: string) => string>> = {
      doux: [
        (u, b) => `Pas une égratignure, ${u}. L'esprit clair suffit à faire tomber ${b}.`,
        (u, b) => `${b} tombe sans qu'un coup ne t'atteigne, ${u}. La maîtrise, sans bruit.`,
        (u, b) => `${u}, aucune marque sur toi. ${b} n'a trouvé aucune ouverture.`,
        (u, b) => `Combat clos sans une entaille, ${u}. ${b} salue la discipline.`,
        (u, b) => `${b} s'incline, ${u} intact. La constance a payé.`,
      ],
      direct: [
        (u, b) => `Pas une égratignure, ${u}. ${b} est au tapis.`,
        (u, b) => `${u}, tu ressors intact. ${b} n'a jamais pu te toucher.`,
        (u, b) => `Perfect, ${u} ! ${b} tombe sans avoir marqué un point.`,
        (u, b) => `${b} au tapis, et toi sans une égratignure, ${u}. Propre.`,
        (u, b) => `${u}, zéro dégât encaissé. ${b} n'a rien vu venir.`,
      ],
      brut: [
        (u, b) => `Pas une seule égratignure, ${u}. ${b} s'est fait démonter.`,
        (u, b) => `${u}, t'as même pas transpiré. ${b} est en pièces détachées.`,
        (u, b) => `Perfect, putain ! ${b} explose et toi t'es toujours nickel, ${u}.`,
        (u, b) => `${b} n'a pas pu poser un doigt sur toi, ${u}. C'est presque triste pour lui.`,
        (u, b) => `Zéro dégât, ${u}. ${b} raconte déjà des excuses à qui veut l'entendre.`,
      ],
    };
    return pickVariant(pools[level], seed)(username, bossName);
  }

  const pools: Record<AggressivityLevel, Array<(u: string, b: string) => string>> = {
    doux: [
      (u, b) => `${b} est tombé. Le chemin compte plus que la marque laissée, ${u}.`,
      (u, b) => `${b} cède, ${u}. Les marques s'effaceront, la victoire reste.`,
      (u, b) => `${u}, ${b} est vaincu. Les coups reçus font partie du chemin.`,
      (u, b) => `${b} plie. Tu portes quelques marques, ${u}, elles ne pèsent rien face à la victoire.`,
      (u, b) => `${u}, tu l'as emporté sur ${b}. Le prix payé n'efface pas le résultat.`,
    ],
    direct: [
      (u, b) => `${b} a mordu la poussière. Tu l'as eu, ${u}.`,
      (u, b) => `${b} tombe, ${u}. T'as encaissé, mais tu l'as eu.`,
      (u, b) => `Ça a chauffé, mais ${b} est à terre, ${u}.`,
      (u, b) => `${u}, ${b} est K.O. T'y es allé, ça s'est vu.`,
      (u, b) => `${b} plie sous les coups, ${u}. Victoire méritée, marquée.`,
    ],
    brut: [
      (u, b) => `${b} a mangé le trottoir. Tu l'as buté, ${u}.`,
      (u, b) => `${b} est au sol, ${u}. T'as pris cher mais t'as gagné, merde.`,
      (u, b) => `K.O., ${u} ! ${b} valait pas le coup de se ménager visiblement.`,
      (u, b) => `${b} mordu, ${u} cabossé. Résultat : victoire quand même, putain.`,
      (u, b) => `${u}, tu ressors amoché mais ${b} ressort en miettes. Bon deal.`,
    ],
  };
  return pickVariant(pools[level], seed)(username, bossName);
}

export function milestoneLine(
  level: AggressivityLevel,
  milestone: number,
  seed: number = randomSeed(),
): string {
  const pools: Record<AggressivityLevel, Array<(n: number) => string>> = {
    doux: [
      (n) => `Série de ${n}. La Voix retient ce genre de constance.`,
      (n) => `${n} jours de suite. La régularité parle plus fort que l'exploit.`,
      (n) => `Série de ${n}. Rien d'éclatant, juste de la constance qui s'accumule.`,
      (n) => `${n} d'affilée. La Voix observe, silencieuse, mais elle observe.`,
      (n) => `Série de ${n}. Ce n'est plus de la chance, c'est une discipline.`,
    ],
    direct: [
      (n) => `Série de ${n} ! Ça va laisser une trace.`,
      (n) => `${n} d'affilée, beau palier !`,
      (n) => `Série de ${n} ! Ça commence à ressembler à une habitude solide.`,
      (n) => `${n} victoires de suite. Le Boss doit s'en inquiéter.`,
      (n) => `Série de ${n} ! Tu tiens la cadence.`,
    ],
    brut: [
      (n) => `Série de ${n}, putain ! On va en parler pendant des semaines.`,
      (n) => `${n} d'affilée ! Même le compteur de série a l'air fatigué de compter.`,
      (n) => `Série de ${n}, bordel ! T'es en train de casser les stats du jeu.`,
      (n) => `${n} de suite. Le Boss commence à te connaître par ton prénom.`,
      (n) => `Série de ${n}, merde ! Ça mérite un vrai badge, pas juste des flammes.`,
    ],
  };
  return pickVariant(pools[level], seed)(milestone);
}
```

- [ ] **Step 4: Run pour vérifier le succès**

Run: `npx vitest run lib/copy/combat.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/copy/combat.ts lib/copy/combat.test.ts
git commit -m "feat: réécrit lib/copy/combat.ts (doux/direct/brut, La Voix) (issue #51)"
```

---

### Task 8: Réécrire `lib/copy/rage-quit.ts`

**Files:**
- Modify: `lib/copy/rage-quit.ts`
- Test: `lib/copy/rage-quit.test.ts`

**Interfaces:**
- Produit : `rageQuitConfirmBody(level, args, seed)`, `rageQuitPunchline(level, seed)` — signatures inchangées, seules les clés de niveau changent (aucun contenu "dojo"/"rue" dans ce fichier).

- [ ] **Step 1: Mettre à jour le test (échoue avant la réécriture)**

```typescript
import { describe, expect, test } from "vitest";
import { rageQuitConfirmBody, rageQuitPunchline } from "./rage-quit";

const FORBIDDEN_DOUX = /putain|bordel|merde|\bcon\b|connard|foutre/;
const NEVER_AT_PLAYER = /connard|\bcon\b|couilles|pathétique/i;

describe("Rage Quit — confirmation", () => {
  test("pool d'au moins 5 variantes, seed stable", () => {
    const args = { taskTitle: "Facture client", penalty: 5 };
    const seen = new Set<string>();
    for (let seed = 0; seed < 5; seed++) seen.add(rageQuitConfirmBody("direct", args, seed));
    expect(seen.size).toBeGreaterThanOrEqual(5);
    expect(rageQuitConfirmBody("direct", args, 2)).toBe(rageQuitConfirmBody("direct", args, 2));
  });

  test("doux reste sans juron sur tout le pool", () => {
    const args = { taskTitle: "X", penalty: 5 };
    for (let seed = 0; seed < 5; seed++) {
      expect(rageQuitConfirmBody("doux", args, seed)).not.toMatch(FORBIDDEN_DOUX);
    }
  });

  test("jamais d'attaque personnelle contre le joueur, même en brut", () => {
    const args = { taskTitle: "X", penalty: 5 };
    for (let seed = 0; seed < 5; seed++) {
      expect(rageQuitConfirmBody("brut", args, seed)).not.toMatch(NEVER_AT_PLAYER);
    }
  });
});

describe("Rage Quit — ricanement du Boss", () => {
  test("pool d'au moins 5 variantes, seed stable", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 5; seed++) seen.add(rageQuitPunchline("direct", seed));
    expect(seen.size).toBeGreaterThanOrEqual(5);
    expect(rageQuitPunchline("direct", 1)).toBe(rageQuitPunchline("direct", 1));
  });

  test("doux reste sans juron sur tout le pool", () => {
    for (let seed = 0; seed < 5; seed++) {
      expect(rageQuitPunchline("doux", seed)).not.toMatch(FORBIDDEN_DOUX);
    }
  });

  test("brut élargit le vocabulaire sans jamais viser le joueur", () => {
    const jurons = Array.from({ length: 5 }, (_, seed) => rageQuitPunchline("brut", seed)).some((line) =>
      /putain|bordel|merde/i.test(line),
    );
    expect(jurons).toBe(true);
    for (let seed = 0; seed < 5; seed++) {
      expect(rageQuitPunchline("brut", seed)).not.toMatch(NEVER_AT_PLAYER);
    }
  });
});
```

- [ ] **Step 2: Run pour vérifier l'échec**

Run: `npx vitest run lib/copy/rage-quit.test.ts`
Expected: FAIL.

- [ ] **Step 3: Réécrire l'implémentation (renommage des clés uniquement, contenu inchangé)**

```typescript
import type { AggressivityLevel } from "../../types";
import { pickVariant, randomSeed } from "./variant";

interface RageQuitConfirmArgs {
  taskTitle: string;
  penalty: number;
}

export function rageQuitConfirmBody(
  level: AggressivityLevel,
  args: RageQuitConfirmArgs,
  seed: number = randomSeed(),
): string {
  const { taskTitle, penalty } = args;
  const pools: Record<AggressivityLevel, Array<(t: string, p: number) => string>> = {
    doux: [
      (t, p) => `Abandonner « ${t} » coûte −${p} XP. Une pause consciente, pas un échec — le Boss retrouve un peu de terrain.`,
      (t, p) => `Laisser « ${t} » de côté, c'est −${p} XP. Rien de grave, juste un choix assumé.`,
      (t, p) => `« ${t} » s'arrête là, −${p} XP. Le Boss regagne un peu de terrain, sans drame.`,
      (t, p) => `Renoncer à « ${t} » coûte −${p} XP. Un pas de côté, pas une chute.`,
      (t, p) => `« ${t} » abandonnée, −${p} XP. Le terrain repris n'efface pas ce qui a déjà été fait.`,
    ],
    direct: [
      (t, p) => `Abandonner « ${t} » coûte −${p} XP. Le Boss rétrécit, mais il ricanera.`,
      (t, p) => `Lâcher « ${t} », c'est −${p} XP direct. Le Boss va prendre un peu de volume.`,
      (t, p) => `« ${t} » à l'abandon, −${p} XP. Le Boss va s'en vanter un peu.`,
      (t, p) => `Tu jettes l'éponge sur « ${t} » ? −${p} XP, et le Boss qui regagne du terrain.`,
      (t, p) => `« ${t} » abandonnée : −${p} XP. Le Boss repart plus costaud.`,
    ],
    brut: [
      (t, p) => `Lâcher « ${t} », ça pique −${p} XP direct. Le Boss va se foutre de ta gueule.`,
      (t, p) => `« ${t} » à la poubelle, −${p} XP direct. Le Boss va bien se marrer, merde.`,
      (t, p) => `Tu jettes l'éponge sur « ${t} », −${p} XP. Le Boss va en faire des caisses.`,
      (t, p) => `Abandon de « ${t} », −${p} XP dans les dents. Le Boss reprend du poil de la bête, putain.`,
      (t, p) => `« ${t} » dégagée, −${p} XP. Prépare-toi, le Boss va te chambrer sec.`,
    ],
  };
  return pickVariant(pools[level], seed)(taskTitle, penalty);
}

export function rageQuitPunchline(level: AggressivityLevel, seed: number = randomSeed()): string {
  const pools: Record<AggressivityLevel, string[]> = {
    doux: [
      "Le Boss hausse les épaules : « Une pause. Reviens quand tu es prêt. »",
      "Le Boss reste silencieux : « Ce n'est qu'un round. Le combat continue. »",
      "Le Boss incline la tête : « Se retirer aussi, c'est un choix. »",
      "Le Boss attend, sans un mot. Il sait que tu reviendras.",
      "Le Boss note simplement : « Un pas de côté n'efface pas le chemin. »",
    ],
    direct: [
      "Le Boss ricane : « Déjà à terre ? Relève-toi. »",
      "Le Boss sourit : « Je prends ce que tu me laisses. »",
      "Le Boss hausse un sourcil : « Tu reviendras, ils reviennent toujours. »",
      "Le Boss se marre doucement : « Une victoire facile, mais une victoire. »",
      "Le Boss reprend des forces : « Merci pour le cadeau. »",
    ],
    brut: [
      "Le Boss se marre : « Déjà cuit ? Merde, relève-toi et reviens te battre. »",
      "Le Boss explose de rire : « Sérieux ? Bordel, quelle chute. »",
      "Le Boss ricane fort : « Merci pour le cadeau, putain, j'en demandais pas tant. »",
      "Le Boss savoure : « Encore un qui se casse. Ça sent le vécu, bordel. »",
      "Le Boss se frotte les mains : « Une victoire gratuite, merde, autant en profiter. »",
    ],
  };
  return pickVariant(pools[level], seed);
}
```

- [ ] **Step 4: Run pour vérifier le succès**

Run: `npx vitest run lib/copy/rage-quit.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/copy/rage-quit.ts lib/copy/rage-quit.test.ts
git commit -m "refactor: renomme les clés de niveau dans lib/copy/rage-quit.ts (issue #51)"
```

---

### Task 9: Réécrire `lib/copy/notifications.ts`

**Files:**
- Modify: `lib/copy/notifications.ts`
- Test: `lib/copy/notifications.test.ts`

**Interfaces:**
- Produit : `buildReminderPayload(remainingTasks, level, pickIndex?)` — signature inchangée, 6 gabarits, clés de niveau renommées, "dojo"/"Rituel du Crépuscule" remplacés.

- [ ] **Step 1: Mettre à jour le test (échoue avant la réécriture)**

```typescript
import { describe, expect, test } from "vitest";
import { buildReminderPayload } from "./notifications";

describe("buildReminderPayload — direct (comportement actuel inchangé)", () => {
  test("titre et deep-link fixes, quel que soit le gabarit tiré", () => {
    const payload = buildReminderPayload(3, "direct", () => 0);
    expect(payload.title).toBe("Dodojo — Le Boss t'attend");
    expect(payload.url).toBe("/");
  });

  test("accorde au singulier quand il reste 1 tâche", () => {
    const payload = buildReminderPayload(1, "direct", () => 0);
    expect(payload.body).toContain("1 monstre à");
    expect(payload.body).not.toContain("monstres");
  });

  test("accorde au pluriel quand il reste plusieurs tâches", () => {
    const payload = buildReminderPayload(4, "direct", () => 0);
    expect(payload.body).toContain("4 monstres à");
  });

  test("pickIndex sélectionne le gabarit correspondant (index 2)", () => {
    const payload = buildReminderPayload(2, "direct", () => 2);
    expect(payload.body).toContain("Dernier Round approche");
  });

  test("pickIndex hors bornes retombe sur le premier gabarit", () => {
    const payload = buildReminderPayload(5, "direct", () => 99);
    expect(payload.body).toContain("Le Boss ricane");
  });
});

describe("buildReminderPayload — niveaux", () => {
  test("doux reste sans juron sur tous les gabarits", () => {
    for (let i = 0; i < 6; i++) {
      const payload = buildReminderPayload(3, "doux", () => i);
      expect(payload.body).not.toMatch(/putain|bordel|merde|\bcon\b|connard|foutre/);
    }
  });

  test("brut élargit le vocabulaire", () => {
    const payload = buildReminderPayload(3, "brut", () => 0);
    expect(payload.body).toMatch(/marre/);
  });

  test("6 gabarits disponibles par niveau, tous distincts", () => {
    const bodies = new Set<string>();
    for (let i = 0; i < 6; i++) bodies.add(buildReminderPayload(3, "direct", () => i).body);
    expect(bodies.size).toBe(6);
  });
});
```

- [ ] **Step 2: Run pour vérifier l'échec**

Run: `npx vitest run lib/copy/notifications.test.ts`
Expected: FAIL.

- [ ] **Step 3: Réécrire l'implémentation**

```typescript
import type { AggressivityLevel } from "../../types";

export interface PushReminderPayload {
  title: string;
  body: string;
  url: string;
}

function pluralize(n: number, singular: string, plural: string): string {
  return n <= 1 ? singular : plural;
}

type ReminderTemplate = Record<AggressivityLevel, (n: number) => string>;

const REMINDER_TEMPLATES: ReminderTemplate[] = [
  {
    doux: (n) => `Il te reste ${n} ${pluralize(n, "tâche", "tâches")} avant le Dernier Round. À ton rythme.`,
    direct: (n) =>
      `Le Boss ricane, il te reste ${n} ${pluralize(n, "monstre", "monstres")} à abattre avant le Dernier Round !`,
    brut: (n) =>
      `Le Boss se marre, il te reste ${n} ${pluralize(n, "monstre", "monstres")} à défoncer avant le Dernier Round, bouge-toi !`,
  },
  {
    doux: (n) =>
      `Ta tête t'attend, sans te presser : ${n} ${pluralize(n, "adversaire", "adversaires")} ${pluralize(n, "patiente", "patientent")} encore.`,
    direct: (n) =>
      `Ta tête t'attend : ${n} ${pluralize(n, "adversaire", "adversaires")} ${pluralize(n, "tient", "tiennent")} encore debout.`,
    brut: (n) =>
      `Ta tête t'attend, putain : ${n} ${pluralize(n, "adversaire", "adversaires")} ${pluralize(n, "tient", "tiennent")} encore debout.`,
  },
  {
    doux: (n) =>
      `Le Dernier Round approche. ${n} ${pluralize(n, "tâche restante", "tâches restantes")}, quand tu es prêt.`,
    direct: (n) =>
      `Le Dernier Round approche et ton Boss respire encore (${n} ${pluralize(n, "tâche restante", "tâches restantes")}).`,
    brut: (n) =>
      `Le Dernier Round approche et ton Boss respire encore, merde (${n} ${pluralize(n, "tâche restante", "tâches restantes")}).`,
  },
  {
    doux: (n) =>
      `${n} ${pluralize(n, "point de vie", "points de vie")} encore à récupérer aujourd'hui, si le cœur t'en dit.`,
    direct: (n) =>
      `Termine-le : ${n} ${pluralize(n, "point de vie", "points de vie")} planqué${n <= 1 ? "" : "s"} dans tes tâches du jour.`,
    brut: (n) =>
      `Termine-le, bordel : ${n} ${pluralize(n, "point de vie", "points de vie")} planqué${n <= 1 ? "" : "s"} dans tes tâches du jour.`,
  },
  {
    doux: (n) =>
      `Une petite pensée pour ${n} ${pluralize(n, "tâche", "tâches")} qui patiente${n <= 1 ? "" : "nt"} encore aujourd'hui.`,
    direct: (n) =>
      `Petit rappel : ${n} ${pluralize(n, "tâche", "tâches")} encore debout${n <= 1 ? "e" : "s"} avant ce soir.`,
    brut: (n) =>
      `Yo, rappel : ${n} ${pluralize(n, "tâche", "tâches")} encore debout${n <= 1 ? "e" : "s"}, bouge ton cul.`,
  },
  {
    doux: (n) =>
      `Le Dernier Round approche doucement. ${n} ${pluralize(n, "tâche", "tâches")} attend${n <= 1 ? "" : "ent"} ta décision.`,
    direct: (n) =>
      `Le Dernier Round approche à grands pas : ${n} ${pluralize(n, "tâche", "tâches")} encore en jeu.`,
    brut: (n) =>
      `Le Dernier Round rapplique, merde : ${n} ${pluralize(n, "tâche", "tâches")} encore en jeu. Grouille.`,
  },
];

export function buildReminderPayload(
  remainingTasks: number,
  level: AggressivityLevel,
  pickIndex: (templateCount: number) => number = (count) => Math.floor(Math.random() * count),
): PushReminderPayload {
  const index = pickIndex(REMINDER_TEMPLATES.length);
  const template = REMINDER_TEMPLATES[index] ?? REMINDER_TEMPLATES[0];
  return {
    title: "Dodojo — Le Boss t'attend",
    body: template[level](remainingTasks),
    url: "/",
  };
}
```

- [ ] **Step 4: Run pour vérifier le succès**

Run: `npx vitest run lib/copy/notifications.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/copy/notifications.ts lib/copy/notifications.test.ts
git commit -m "feat: réécrit lib/copy/notifications.ts (Dernier Round, doux/direct/brut) (issue #51)"
```

---

### Task 10: Réécrire `lib/copy/errors.ts`

**Files:**
- Modify: `lib/copy/errors.ts`
- Test: `lib/copy/errors.test.ts`

**Interfaces:**
- Produit : `technicalErrorLine(level, seed)` — signature inchangée, "le dojo" (métaphore d'entraînement) remplacé par "Dodojo" (le service/l'app, cohérent avec un message d'erreur technique de connexion).

- [ ] **Step 1: Mettre à jour le test (échoue avant la réécriture)**

```typescript
import { describe, expect, test } from "vitest";
import { technicalErrorLine } from "./errors";

const FORBIDDEN_DOUX = /putain|bordel|merde|\bcon\b|connard|foutre/;

describe("Erreur technique", () => {
  test("pool d'au moins 5 variantes, seed stable", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 5; seed++) seen.add(technicalErrorLine("direct", seed));
    expect(seen.size).toBeGreaterThanOrEqual(5);
    expect(technicalErrorLine("direct", 2)).toBe(technicalErrorLine("direct", 2));
  });

  test("brut jure sur tout le pool, doux jamais", () => {
    for (let seed = 0; seed < 5; seed++) {
      expect(technicalErrorLine("brut", seed)).toMatch(/putain|bordel|merde/i);
      expect(technicalErrorLine("doux", seed)).not.toMatch(FORBIDDEN_DOUX);
    }
  });
});
```

- [ ] **Step 2: Run pour vérifier l'échec**

Run: `npx vitest run lib/copy/errors.test.ts`
Expected: FAIL.

- [ ] **Step 3: Réécrire l'implémentation**

```typescript
import type { AggressivityLevel } from "../../types";
import { pickVariant, randomSeed } from "./variant";

export function technicalErrorLine(level: AggressivityLevel, seed: number = randomSeed()): string {
  const pools: Record<AggressivityLevel, string[]> = {
    doux: [
      "Dodojo est injoignable pour l'instant. Respire, réessaie dans un instant.",
      "La connexion s'est interrompue. Rien de grave, un instant suffira.",
      "Dodojo ne répond pas là, maintenant. Cela passera.",
      "Un silence technique, temporaire. Réessaie dans un moment.",
      "Le lien est coupé pour l'instant. Patiente, puis retente.",
    ],
    direct: [
      "Connexion coupée avec Dodojo. Impossible de récupérer ton combat.",
      "Dodojo ne répond plus. Réessaie dans un instant.",
      "Coupure de connexion. Ton combat n'a pas pu être chargé.",
      "Le serveur de Dodojo a toussé. Retente dans un moment.",
      "Liaison perdue avec Dodojo. Un nouvel essai devrait suffire.",
    ],
    brut: [
      "Putain, connexion coupée avec Dodojo. Impossible de choper ton combat. C'est vraiment codé avec les pieds !",
      "Bordel, Dodojo répond plus. Réessaie, merde.",
      "Connexion foutue, le combat a pas chargé. Ça arrive même aux meilleurs, putain.",
      "Le serveur a lâché comme une merde. Retente dans un instant.",
      "Coupure de ouf avec Dodojo. Même le wifi se met en rage quit, bordel.",
    ],
  };
  return pickVariant(pools[level], seed);
}
```

- [ ] **Step 4: Run pour vérifier le succès**

Run: `npx vitest run lib/copy/errors.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/copy/errors.ts lib/copy/errors.test.ts
git commit -m "feat: réécrit lib/copy/errors.ts (Dodojo remplace le dojo, doux/direct/brut) (issue #51)"
```

---

### Task 11: Réécrire `lib/copy/deadline.ts`

**Files:**
- Modify: `lib/copy/deadline.ts`
- Test: `lib/copy/deadline.test.ts`

**Interfaces:**
- Produit : `deadlineAlertLine(level, args, seed)` — signature inchangée, renommage des clés uniquement (aucun contenu "dojo"/"rue" dans ce fichier).

- [ ] **Step 1: Mettre à jour le test (échoue avant la réécriture)**

```typescript
import { describe, expect, test } from "vitest";
import { deadlineAlertLine } from "./deadline";

const FORBIDDEN_DOUX = /putain|bordel|merde|\bcon\b|connard|foutre/;

describe("Attaque Surprise (deadline ratée)", () => {
  test("pool d'au moins 5 variantes, seed stable", () => {
    const args = { taskTitle: "Appeler le client", damage: 10 };
    const seen = new Set<string>();
    for (let seed = 0; seed < 5; seed++) seen.add(deadlineAlertLine("direct", args, seed));
    expect(seen.size).toBeGreaterThanOrEqual(5);
    expect(deadlineAlertLine("direct", args, 2)).toBe(deadlineAlertLine("direct", args, 2));
  });

  test("doux reste sans juron, brut élargit sur tout le pool", () => {
    const args = { taskTitle: "X", damage: 10 };
    for (let seed = 0; seed < 5; seed++) {
      expect(deadlineAlertLine("doux", args, seed)).not.toMatch(FORBIDDEN_DOUX);
    }
    const jurons = Array.from({ length: 5 }, (_, seed) => deadlineAlertLine("brut", args, seed)).some((line) =>
      /merde|bordel|putain/i.test(line),
    );
    expect(jurons).toBe(true);
  });
});
```

- [ ] **Step 2: Run pour vérifier l'échec**

Run: `npx vitest run lib/copy/deadline.test.ts`
Expected: FAIL.

- [ ] **Step 3: Réécrire l'implémentation (renommage des clés uniquement, contenu inchangé)**

```typescript
import type { AggressivityLevel } from "../../types";
import { pickVariant, randomSeed } from "./variant";

interface DeadlineAlertArgs {
  taskTitle: string;
  damage: number;
}

export function deadlineAlertLine(
  level: AggressivityLevel,
  args: DeadlineAlertArgs,
  seed: number = randomSeed(),
): string {
  const { taskTitle, damage } = args;
  const pools: Record<AggressivityLevel, Array<(t: string, d: number) => string>> = {
    doux: [
      (t, d) => `⏰ Le temps a filé : « ${t} » a dépassé son heure (−${d} HP).`,
      (t, d) => `⏰ L'heure de « ${t} » est passée, sans bruit (−${d} HP).`,
      (t, d) => `⏰ « ${t} » n'a pas attendu, le temps non plus (−${d} HP).`,
      (t, d) => `⏰ Le moment de « ${t} » s'est écoulé (−${d} HP).`,
      (t, d) => `⏰ « ${t} » est restée en retrait de l'heure fixée (−${d} HP).`,
    ],
    direct: [
      (t, d) => `⏰ Attaque Surprise : « ${t} » a raté sa deadline (−${d} HP).`,
      (t, d) => `⏰ « ${t} » a filé sans prévenir (−${d} HP).`,
      (t, d) => `⏰ Deadline ratée sur « ${t} » (−${d} HP). Ça arrive.`,
      (t, d) => `⏰ « ${t} » n'a pas tenu l'horaire (−${d} HP).`,
      (t, d) => `⏰ Surprise : « ${t} » a dépassé l'heure fixée (−${d} HP).`,
    ],
    brut: [
      (t, d) => `⏰ Attaque Surprise, merde : « ${t} » a foiré sa deadline (−${d} HP).`,
      (t, d) => `⏰ « ${t} », c'est raté, bordel (−${d} HP).`,
      (t, d) => `⏰ Deadline explosée sur « ${t} », putain (−${d} HP).`,
      (t, d) => `⏰ « ${t} » a pris l'heure dans les dents (−${d} HP).`,
      (t, d) => `⏰ Le chrono a gagné cette manche sur « ${t} », merde (−${d} HP).`,
    ],
  };
  return pickVariant(pools[level], seed)(taskTitle, damage);
}
```

- [ ] **Step 4: Run pour vérifier le succès**

Run: `npx vitest run lib/copy/deadline.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/copy/deadline.ts lib/copy/deadline.test.ts
git commit -m "refactor: renomme les clés de niveau dans lib/copy/deadline.ts (issue #51)"
```

---

### Task 12: Renommer la jauge d'agressivité en UI (Volume Intérieur, Doux/Direct/Brut)

**Files:**
- Modify: `components/qg/AggressivityLevelSection.tsx`
- Modify: `app/onboarding/OnboardingFlow.tsx`
- Test: e2e couverts par la Task 20 (pas de test unitaire dédié à ces composants aujourd'hui)

**Interfaces:**
- Consomme : `AggressivityLevel` (Task 2)

- [ ] **Step 1: Mettre à jour `AggressivityLevelSection.tsx`**

Remplacer les lignes 11-15 et 39 :
```typescript
const LEVELS: Array<{ value: AggressivityLevel; name: string; description: string }> = [
  { value: "doux", name: "Doux", description: "Philosophe, zen." },
  { value: "direct", name: "Direct", description: "Franc-parler, équilibré." },
  { value: "brut", name: "Brut", description: "Arcade, sans filtre." },
];
```
```typescript
      <p className="font-display text-xs uppercase tracking-wide text-muted">Volume Intérieur</p>
```

- [ ] **Step 2: Mettre à jour `OnboardingFlow.tsx`**

Remplacer les lignes 11-15 :
```typescript
const AGGRESSIVITY_OPTIONS: Array<{ value: AggressivityLevel; name: string; description: string }> = [
  { value: "doux", name: "Doux", description: "Philosophe, zen." },
  { value: "direct", name: "Direct", description: "Franc-parler, équilibré." },
  { value: "brut", name: "Brut", description: "Arcade, sans filtre." },
];
```

Ligne 22 (état initial) :
```typescript
  const [aggressivityLevel, setAggressivityLevel] = useState<AggressivityLevel>("direct");
```

Ligne 97 (titre de l'étape) :
```typescript
      <p className="text-center text-xs uppercase tracking-wide text-faint">
        Ton Volume Intérieur, {trimmed}
      </p>
```

- [ ] **Step 3: Vérifier le typecheck**

Run: `npx tsc --noEmit`
Expected: pas de nouvelle erreur liée à ces deux fichiers.

- [ ] **Step 4: Vérifier visuellement**

Run: `npm run dev`, parcourir l'onboarding (étape 4) et le QG — les 3 cartes affichent "Doux"/"Direct"/"Brut" sous le titre "Volume Intérieur"/"Ton Volume Intérieur".

- [ ] **Step 5: Commit**

```bash
git add components/qg/AggressivityLevelSection.tsx app/onboarding/OnboardingFlow.tsx
git commit -m "feat: renomme Dojo Gauge en Volume Intérieur (Doux/Direct/Brut) (issue #51)"
```

---

### Task 13: Renommer "Rituel du Réveil" → "Le Réveil"

**Files:**
- Modify: `components/combat/WakeUpRitual.tsx:113,118-119`

**Interfaces:**
- Aucune interface publique affectée (props/exports inchangés).

- [ ] **Step 1: Remplacer l'aria-label et le titre visible**

```typescript
      aria-label="Le Réveil"
```
```typescript
      <header className="flex flex-col gap-1">
        <p className="font-display text-xl uppercase tracking-wide text-hp">
          Le Réveil
        </p>
```

- [ ] **Step 2: Corriger le commentaire au-dessus du composant (ligne 47)**

```typescript
// US-08 : overlay bloquant du Réveil. Confronte l'utilisateur aux
// restes de la veille avant toute action dans l'Arène. Ton non-punitif (B1) :
// on règle ses comptes, on ne se fait pas culpabiliser.
```

- [ ] **Step 3: Vérifier visuellement**

Run: `npm run dev`, se connecter avec un compte ayant des restes de la veille (ou vérifier via `e2e/wake-up-ritual.spec.ts` en Task 22) : l'overlay affiche "Le Réveil".

- [ ] **Step 4: Commit**

```bash
git add components/combat/WakeUpRitual.tsx
git commit -m "feat: renomme Rituel du Réveil en Le Réveil (issue #51)"
```

---

### Task 14: Renommer "Rituel du Crépuscule" → "Dernier Round"

**Files:**
- Modify: `components/combat/CrepusculeRecap.tsx:27-28,55`
- Modify: `components/combat/Arena.tsx` (bouton CTA, ~ligne 1030)
- Modify: `components/combat/PerfectOverlay.tsx` (bouton CTA, ~ligne 99)

**Interfaces:**
- Aucune interface publique affectée.

- [ ] **Step 1: `CrepusculeRecap.tsx` — aria-label et commentaire**

```typescript
// US-07 : récap figé du Dernier Round, dessiné comme une carte de score
// arcade self-contained (prête pour l'export PNG d'US-20, sans refonte).
// Victoire = ton exalté ; retraite = ton apaisé, jamais culpabilisant.
```
```typescript
      aria-label="Dernier Round"
```

- [ ] **Step 2: `Arena.tsx` — libellé du bouton CTA**

```typescript
          {closing ? "…" : "Dernier Round"}
```

- [ ] **Step 3: `PerfectOverlay.tsx` — libellé du bouton CTA**

```typescript
          🌙 Dernier Round
```

- [ ] **Step 4: Vérifier visuellement**

Run: `npm run dev`, terminer une journée (bouton en bas de l'Arène) : le bouton affiche "Dernier Round", l'overlay a l'aria-label correspondant.

- [ ] **Step 5: Commit**

```bash
git add components/combat/CrepusculeRecap.tsx components/combat/Arena.tsx components/combat/PerfectOverlay.tsx
git commit -m "feat: renomme Rituel du Crépuscule en Dernier Round (issue #51)"
```

---

### Task 15: Renommer le Panthéon → Tableau de Chasse

**Files:**
- Modify: `app/pantheon/page.tsx`

**Interfaces:**
- Consomme : `titleForStreak` (Task 4, renvoie déjà "Calme"/"Silence"/"Esprit Vide")

- [ ] **Step 1: Renommer le titre de page et les libellés visibles**

Ligne 16 :
```typescript
export const metadata: Metadata = { title: "Tableau de Chasse — Dodojo" };
```

Ligne 59 (état erreur) :
```typescript
          Le Tableau de Chasse est scellé
```

Ligne 91 (état vide) :
```typescript
        <h1 className="font-hud text-lg font-semibold uppercase tracking-wide text-ink">
          Tableau de Chasse
        </h1>
```

Ligne 108 (état normal) :
```typescript
      <h1 className="text-center font-hud text-lg font-semibold uppercase tracking-wide text-ink">
        Tableau de Chasse
      </h1>
```

- [ ] **Step 2: Mettre à jour `TITLE_TIERS` (lignes 78-82)**

```typescript
  const TITLE_TIERS = [
    { streak: 7, name: "Calme" },
    { streak: 30, name: "Silence" },
    { streak: 100, name: "Esprit Vide" },
  ];
```

- [ ] **Step 3: Corriger le commentaire (ligne 18)**

```typescript
// US-10 : le Tableau de Chasse — écran lecture seule, dérivé de day_results + profiles.
// Aucune écriture (B1). Accessible via le QG (D3).
```

- [ ] **Step 4: Vérifier visuellement**

Run: `npm run dev`, se connecter et visiter `/pantheon` : titre "Tableau de Chasse", bloc Titres affiche Calme/Silence/Esprit Vide avec les bons paliers (7/30/100).

- [ ] **Step 5: Commit**

```bash
git add app/pantheon/page.tsx
git commit -m "feat: renomme le Panthéon en Tableau de Chasse (issue #51)"
```

---

### Task 16: Renommer le QG → Le Vestiaire

**Files:**
- Modify: `app/qg/page.tsx`

**Interfaces:**
- Aucune interface publique affectée — route `/qg` inchangée (Global Constraints).

- [ ] **Step 1: Renommer le titre de page, le h1 et les libellés de section**

Ligne 17 :
```typescript
export const metadata: Metadata = { title: "Le Vestiaire — Dodojo" };
```

Lignes 22-27 (SECTIONS) :
```typescript
const SECTIONS: Array<{ href: string; icon: string; label: string }> = [
  { href: "/pantheon", icon: "🏆", label: "Tableau de Chasse" },
  { href: "/qg/entrainement", icon: "🔁", label: "Mode Entraînement" },
  { href: "/echoppe", icon: "🛒", label: "Le Marché Noir" },
  { href: "/guide", icon: "📖", label: "Le Guide" },
];
```

Ligne 72 (h1) :
```typescript
      <h1 className="text-center font-display text-lg uppercase tracking-wide text-ink">
        Le Vestiaire
      </h1>
```

Ligne 88 (aria-label de la nav) :
```typescript
      <nav aria-label="Sections du Vestiaire" className="flex flex-col gap-2">
```

- [ ] **Step 2: Vérifier visuellement**

Run: `npm run dev`, visiter `/qg` : titre "Le Vestiaire", menu affiche "Tableau de Chasse"/"Le Marché Noir"/"Le Guide".

- [ ] **Step 3: Commit**

```bash
git add app/qg/page.tsx
git commit -m "feat: renomme le QG en Le Vestiaire (issue #51)"
```

---

### Task 17: Renommer l'Échoppe → Le Marché Noir

**Files:**
- Modify: `app/echoppe/page.tsx`

**Interfaces:**
- Aucune interface publique affectée — route `/echoppe` inchangée.

- [ ] **Step 1: Renommer le titre de page et le message d'erreur**

Ligne 9 :
```typescript
export const metadata: Metadata = { title: "Le Marché Noir — Dodojo" };
```

Ligne 40 :
```typescript
        <p role="alert" className="max-w-[32ch] text-sm text-hp-text">
          Le Marché Noir est fermé un instant. Réessaie.
        </p>
```

Ligne 11 (commentaire) :
```typescript
// US-18/US-53 : le Marché Noir (Character Select + tenues). Solde d'or dérivé,
// possession lue depuis unlocked_heroes/unlocked_skins, équipé depuis profiles.
```

- [ ] **Step 2: Vérifier visuellement**

Run: `npm run dev`, visiter `/echoppe` : titre d'onglet "Le Marché Noir — Dodojo".

- [ ] **Step 3: Commit**

```bash
git add app/echoppe/page.tsx
git commit -m "feat: renomme l'Échoppe en Le Marché Noir (issue #51)"
```

---

### Task 18: Renommer le Manuel du Dojo → Le Guide

**Files:**
- Modify: `app/guide/page.tsx`
- Modify: `app/guide/[slug]/page.tsx`
- Modify: `components/combat/Arena.tsx` (lien d'aide, ~ligne 738)
- Modify: `components/combat/StreakBadge.tsx:5` (commentaire uniquement)

**Interfaces:**
- Aucune interface publique affectée — route `/guide` inchangée.

- [ ] **Step 1: `app/guide/page.tsx`**

```typescript
export const metadata = { title: "Le Guide" };

export default async function GuidePage() {
  const articles = await chargerIndexGuide();
  const sections = grouperParSection(articles);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-6">
      <h1 className="text-center font-display text-lg uppercase tracking-wide text-ink">
        Le Guide
      </h1>
      {sections.length === 0 ? (
        <p className="text-center text-sm text-muted">Guide en préparation.</p>
      ) : (
```

(le reste du fichier est inchangé)

- [ ] **Step 2: `app/guide/[slug]/page.tsx`**

Ligne 32 :
```typescript
  if (!meta) return { title: "Le Guide" };
```
Ligne 33 :
```typescript
  return { title: `${meta.titre} — Le Guide` };
```
Ligne 47 (`BackLink`) :
```typescript
      <BackLink href="/guide" label="Tout le Guide" />
```

- [ ] **Step 3: `Arena.tsx` — lien d'aide**

```typescript
      <Link
        href="/guide"
        aria-label="Le Guide"
        className="absolute right-3 top-3 z-40 text-xs text-faint hover:text-ink"
      >
        ?
      </Link>
```

- [ ] **Step 4: `StreakBadge.tsx` — commentaire uniquement**

```typescript
// US-12 : compteur de série + alerte « en danger » (jokers de la semaine épuisés).
// Renvoie vers l'article « Séries & jokers » du Guide (issue #68).
```

- [ ] **Step 5: Vérifier visuellement**

Run: `npm run dev`, visiter `/guide` (titre "Le Guide"), un article (`/guide/streak`, bouton retour "Tout le Guide"), et l'Arène (lien "?" toujours présent, aria-label "Le Guide").

- [ ] **Step 6: Commit**

```bash
git add app/guide/page.tsx "app/guide/[slug]/page.tsx" components/combat/Arena.tsx components/combat/StreakBadge.tsx
git commit -m "feat: renomme Manuel du Dojo en Le Guide (issue #51)"
```

---

### Task 19: Réécrire le contenu du Guide (articles + catégorie "Rituels")

**Files:**
- Modify: `content/guide/index.json`
- Modify: `content/guide/principe.md`
- Modify: `content/guide/xp.md`
- Modify: `content/guide/streak.md`
- Modify: `content/guide/agressivite.md`
- Modify: `content/guide/reveil.md` (titre index seulement, corps déjà neutre)
- Modify: `content/guide/crepuscule.md` (titre index seulement, corps déjà neutre)
- Modify: `content/guide/or.md` (titre index seulement, corps déjà neutre)
- Modify: `content/guide/pantheon.md`
- Modify: `lib/guide.ts:34-41` (`ORDRE_SECTIONS`)
- Modify: `scripts/pull-guide.mjs:52` (miroir de `ORDRE_SECTIONS`)
- Test: `e2e/guide.spec.ts` (couvert en Task 22 si des assertions y référencent ces titres)

**Interfaces:**
- Produit : `ORDRE_SECTIONS` renommé (`"Rituels"` → `"Journée"`) — les deux fichiers DOIVENT rester synchronisés (déjà documenté par les commentaires miroir existants).

- [ ] **Step 1: Renommer la catégorie dans `lib/guide.ts`**

```typescript
export const ORDRE_SECTIONS = [
  "Démarrage",
  "Combat",
  "Journée",
  "Progression",
  "Réglages",
  "Intégrations",
] as const;
```

- [ ] **Step 2: Renommer le miroir dans `scripts/pull-guide.mjs`**

```javascript
const ORDRE_SECTIONS = ["Démarrage", "Combat", "Journée", "Progression", "Réglages", "Intégrations"];
```

- [ ] **Step 3: Mettre à jour `content/guide/index.json`**

Remplacer l'entrée `reveil` (section + titre) :
```json
  {
    "titre": "Le Réveil",
    "slug": "reveil",
    "section": "Journée",
    "ordre": 10,
    "resume": "Ce qui solde les restes de la veille à l'ouverture, avant de reprendre le combat.",
    "motsCles": [
      "journee"
    ],
    "majLe": "2026-07-24T07:26:00.000Z"
  },
```

Remplacer l'entrée `crepuscule` :
```json
  {
    "titre": "Dernier Round",
    "slug": "crepuscule",
    "section": "Journée",
    "ordre": 20,
    "resume": "Clôturer sa journée : victoire, retraite ou défaite.",
    "motsCles": [
      "journee"
    ],
    "majLe": "2026-07-24T07:26:00.000Z"
  },
```

Remplacer l'entrée `or` (titre seulement) :
```json
    "titre": "Or & Marché Noir",
```

Remplacer l'entrée `pantheon` (titre seulement) :
```json
    "titre": "Tableau de Chasse",
```

Remplacer l'entrée `agressivite` :
```json
  {
    "titre": "Régler ton Volume Intérieur",
    "slug": "agressivite",
    "section": "Réglages",
    "ordre": 10,
    "resume": "Régler le ton de la Voix et du Boss (Volume Intérieur).",
    "motsCles": [
      "reglage"
    ],
    "majLe": "2026-07-24T07:26:00.000Z"
  },
```

- [ ] **Step 4: Réécrire `content/guide/principe.md` (l'article "Le principe", explique la mécanique centrale)**

```markdown
Chaque jour, quelque chose traîne encore dans ta tête — non tranché, non fait. C'est ton Boss du jour. Tes tâches sont ses points de vie : plus tu en ajoutes, plus il est coriace. Chaque tâche accomplie lui rentre dedans. Vide sa jauge avant le soir et ta tête est libre.
```

- [ ] **Step 5: Réécrire `content/guide/xp.md`**

```markdown
Chaque tâche accomplie te rapporte 30 XP. Assez d'XP et tu montes de niveau (seuil = niveau × 100).

Décocher une tâche rend l'XP au Boss : pas de triche possible, chaque coup compte pour de vrai.
```

- [ ] **Step 6: Réécrire `content/guide/streak.md`**

```markdown
Enchaîne les victoires pour bâtir ta série. La marge d'erreur est généreuse : tu peux te louper jusqu'à 2 fois par semaine (jokers) sans casser la série — la 3e non-victoire la brise.

Aux paliers 7 / 30 / 100, tu gagnes un titre : Calme, Silence, Esprit Vide.
```

- [ ] **Step 7: Réécrire `content/guide/agressivite.md`**

```markdown
La Voix et le Boss adaptent leur ton à ta préférence : réglable dès l'onboarding, modifiable à tout moment dans la section « Volume Intérieur » du Vestiaire.

- Doux : philosophe et zen, jamais de juron

- Direct : franc-parler, le ton par défaut de Dodojo

- Brut : arcade et sans filtre, jurons et piques assumés — toujours dirigés contre le Boss ou la situation, jamais contre toi
```

- [ ] **Step 8: Réécrire `content/guide/pantheon.md`**

```markdown
Ton tableau de chasse : record de série, Boss vaincus, dégâts et or cumulés, meilleur jour, et le journal de tes combats. Accessible depuis le Vestiaire.
```

- [ ] **Step 9: Vérifier les tests d'intégrité du script de pull**

Run: `node scripts/pull-guide.mjs --dry-run` (si le script supporte ce flag) ou à défaut `npx vitest run lib/guide.test.ts` s'il existe
Expected: pas d'erreur "Section inconnue" — confirme que `index.json` n'utilise plus que des sections listées dans `ORDRE_SECTIONS`.

- [ ] **Step 10: Vérifier visuellement**

Run: `npm run dev`, visiter `/guide` : la catégorie "Journée" regroupe "Le Réveil" et "Dernier Round" ; `/guide/principe`, `/guide/xp`, `/guide/streak`, `/guide/agressivite`, `/guide/pantheon` affichent le nouveau contenu.

- [ ] **Step 11: Commit**

```bash
git add content/guide/index.json content/guide/principe.md content/guide/xp.md content/guide/streak.md content/guide/agressivite.md content/guide/pantheon.md lib/guide.ts scripts/pull-guide.mjs
git commit -m "content: réécrit les articles du Guide avec le nouveau lexique (issue #51)"
```

---

### Task 20: Réécrire l'accroche d'onboarding et le reveal du tuto de l'Arène

**Files:**
- Modify: `app/welcome/page.tsx:18-21`
- Modify: `app/welcome/WelcomeSignup.tsx` (bouton submit, ~ligne 85)
- Modify: `components/combat/ArenaCoach.tsx:18-35`

**Interfaces:**
- Aucune interface publique affectée — texte uniquement.

- [ ] **Step 1: Réécrire l'accroche de `/welcome`**

```typescript
      <p className="max-w-[30ch] text-sm text-muted">
        Ce qui traîne dans ta tête a un nom. Et des HP. Choisis ton nom, ton
        combattant, et entre dans l&apos;Arène.
      </p>
```

- [ ] **Step 2: Renommer le bouton "Rejoindre le dojo" (mot commun "dojo" à purger)**

```typescript
        {pending ? "…" : "Entrer dans l'Arène"}
```

- [ ] **Step 3: Réécrire le reveal du tuto `ArenaCoach.tsx`**

```typescript
        {step === "add" ? (
          <>
            <p className="text-sm text-ink">
              Ajoute ta première tâche — tout ce qui traîne nourrit le Boss du jour.
            </p>
            <button
              type="button"
              onClick={onSuggest}
              className="rounded-md border border-hp px-4 py-2 font-display text-xs uppercase tracking-wide text-hp-text"
            >
              ⚡ Prendre en main Dodojo
            </button>
          </>
        ) : (
          <p className="text-sm text-ink">
            Regarde, il vient de grandir. Coche la tâche pour le frapper : dégâts au Boss + XP pour toi.
          </p>
        )}
```

- [ ] **Step 4: Vérifier visuellement**

Run: `npm run dev`, parcourir `/welcome` (accroche visible) puis un onboarding complet jusqu'au premier ajout de tâche dans l'Arène (le coach affiche le reveal "il vient de grandir").

- [ ] **Step 5: Commit**

```bash
git add app/welcome/page.tsx app/welcome/WelcomeSignup.tsx components/combat/ArenaCoach.tsx
git commit -m "feat: réécrit l'accroche d'onboarding et le reveal du tuto (issue #51)"
```

---

### Task 21: Purger "dojo" des derniers écrans (login, hors-ligne, messages d'erreur d'action)

**Files:**
- Modify: `app/login/page.tsx:91`
- Modify: `app/offline/page.tsx:11`
- Modify: `app/actions/profile.ts:44`
- Modify: `app/onboarding/actions.ts:51`

**Interfaces:**
- Aucune interface publique affectée — texte uniquement. Le bouton de `app/login/page.tsx` doit rester matchable par `e2e/fixtures.ts` (`login()`, corrigé en Task 22).

- [ ] **Step 1: Renommer le bouton de connexion**

`app/login/page.tsx:91` :
```typescript
          {pending ? "Connexion…" : "Entrer dans l'Arène"}
```

- [ ] **Step 2: Renommer l'écran hors-ligne**

`app/offline/page.tsx` :
```typescript
      <h1 className="font-display text-lg uppercase tracking-wide text-ink">
        Dodojo est hors ligne
      </h1>
```

- [ ] **Step 3: Renommer le message d'erreur de `updateAggressivityLevel`**

`app/actions/profile.ts:44` :
```typescript
  if (error) return { error: "Dodojo n'a pas pu enregistrer ton réglage. Réessaie." };
```

- [ ] **Step 4: Renommer le message d'erreur de `createProfile`**

`app/onboarding/actions.ts:51` :
```typescript
  if (error) {
    return { error: "Dodojo n'a pas pu enregistrer ton nom. Réessaie." };
  }
```

- [ ] **Step 5: Vérifier visuellement**

Run: `npm run dev`, visiter `/login` (bouton "Entrer dans l'Arène") et couper le réseau pour voir `/offline` ("Dodojo est hors ligne").

- [ ] **Step 6: Commit**

```bash
git add app/login/page.tsx app/offline/page.tsx app/actions/profile.ts app/onboarding/actions.ts
git commit -m "fix: purge les dernières occurrences de 'dojo' (login, offline, erreurs) (issue #51)"
```

---

### Task 22: Mettre à jour les tests e2e

**Files:**
- Modify: `e2e/dojo-gauge.spec.ts` → renommé `e2e/volume-interieur.spec.ts`
- Modify: `e2e/wake-up-ritual.spec.ts:8,15,36`
- Modify: `e2e/crepuscule-recap.spec.ts:4,6,34,36,53,54`
- Modify: `e2e/onboarding.spec.ts:17,26-29,32`
- Modify: `e2e/fixtures.ts:55`
- Modify: `e2e/guide.spec.ts:4,8,10,20`

**Interfaces:**
- Aucune — tests end-to-end contre l'UI déjà renommée dans les tâches précédentes (Tasks 12-21).

- [ ] **Step 1: `e2e/fixtures.ts` — synchroniser le helper `login()` (Task 21, Step 1)**

Ligne 55 :
```typescript
  await page.getByRole("button", { name: "Entrer dans l'Arène" }).click();
```

- [ ] **Step 2: Renommer et réécrire le test de la jauge**

```bash
git mv e2e/dojo-gauge.spec.ts e2e/volume-interieur.spec.ts
```

Contenu de `e2e/volume-interieur.spec.ts` :
```typescript
import { test, expect } from "@playwright/test";
import { login } from "./fixtures";

// Bug #70 (prod) : la migration `add_profile_aggressivity_level` n'était pas
// appliquée en production → toute écriture de `profiles.aggressivity_level`
// (onboarding et QG) échouait. Ce test couvre le chemin Vestiaire (mise à
// jour du Volume Intérieur à tout moment, US-54) pour empêcher une
// régression silencieuse de ce type.
test("Volume Intérieur : changer le ton depuis le Vestiaire persiste sans erreur (US-54)", async ({ page }) => {
  await login(page);
  await page.goto("/qg");

  // Scope volontaire à la section "Volume Intérieur" : `page.getByRole("alert")`
  // seul matche aussi l'annonceur de route interne de Next.js (role="alert"
  // caché, présent sur toute page après navigation) — faux positif sans
  // rapport avec `AggressivityLevelSection`.
  const volumeSection = page.locator("section", { hasText: "Volume Intérieur" });
  const brutOption = volumeSection.getByRole("button", { name: /Brut/ });
  const directOption = volumeSection.getByRole("button", { name: /Direct/ });

  await brutOption.click();
  await expect(brutOption).toHaveAttribute("aria-pressed", "true");
  await expect(volumeSection.getByRole("alert")).toHaveCount(0);

  await page.reload();
  const volumeSectionAfterReload = page.locator("section", { hasText: "Volume Intérieur" });
  await expect(
    volumeSectionAfterReload.getByRole("button", { name: /Brut/ }),
  ).toHaveAttribute("aria-pressed", "true");

  // Remet le défaut ("direct", cf. profiles.aggressivity_level) pour ne pas
  // polluer les autres tests du compte e2e fixe partagé (ADR-04).
  await volumeSectionAfterReload.getByRole("button", { name: /Direct/ }).click();
  await expect(volumeSectionAfterReload.getByRole("alert")).toHaveCount(0);
});
```

- [ ] **Step 3: `e2e/wake-up-ritual.spec.ts` — renommer les assertions**

Ligne 8 :
```typescript
test.describe("Le Réveil (US-08)", () => {
```
Lignes 15 et 36 :
```typescript
      const ritual = page.getByRole("alertdialog", { name: "Le Réveil" });
```

- [ ] **Step 4: `e2e/crepuscule-recap.spec.ts` — renommer les assertions**

Ligne 4 (commentaire) :
```typescript
// US-07 : clôturer la journée (Dernier Round) écrit un day_result et
```
Ligne 6 :
```typescript
test.describe("Dernier Round (US-07)", () => {
```
Lignes 34, 53 :
```typescript
    await page.getByRole("button", { name: "Dernier Round" }).click();
```
Lignes 36, 54 :
```typescript
    const recap = page.getByRole("dialog", { name: "Dernier Round" });
```

- [ ] **Step 5: `e2e/onboarding.spec.ts` — renommer le bouton d'inscription, le commentaire et le bouton de niveau**

Ligne 17 :
```typescript
  await page.getByRole("button", { name: /Entrer dans l'Arène/ }).click();
```
Lignes 26-29 (commentaire) :
```typescript
  // Bug #70 (prod) : cette étape "Volume Intérieur" écrit `profiles.aggressivity_level`
  // à la création du profil — la migration manquante en prod faisait échouer
  // TOUT l'insert (message "Dodojo n'a pas pu enregistrer ton nom"), pas
  // seulement le réglage. Ce test doit donc réellement traverser l'étape
  // (elle ne l'était pas avant, laissant ce chemin non couvert).
```
Ligne 32 :
```typescript
  await page.getByRole("button", { name: "Brut" }).click();
```

- [ ] **Step 6: `e2e/guide.spec.ts` — renommer les assertions**

Ligne 4 :
```typescript
test.describe("Le Guide (issue #68)", () => {
```
Ligne 8 :
```typescript
    await page.getByRole("link", { name: /Le Guide/ }).click();
```
Ligne 10 :
```typescript
    await expect(page.getByRole("heading", { name: "Le Guide" })).toBeVisible();
```
Ligne 20 :
```typescript
    await page.getByRole("link", { name: /Tout le Guide/ }).click();
```

- [ ] **Step 7: Lancer la suite e2e complète**

Run: `npm run build && npx playwright test`
Expected: tous les tests passent (en série, serveur de prod — cf. CLAUDE.md, piège e2e).

- [ ] **Step 8: Commit**

```bash
git add e2e/fixtures.ts e2e/volume-interieur.spec.ts e2e/wake-up-ritual.spec.ts e2e/crepuscule-recap.spec.ts e2e/onboarding.spec.ts e2e/guide.spec.ts
git commit -m "test: met à jour les e2e avec le nouveau lexique (issue #51)"
```

---

### Task 23: Réécrire le spec "Tone of Voice"

**Files:**
- Modify: `docs/superpowers/specs/2026-07-08-tone-of-voice-design.md`

**Interfaces:**
- Aucune — documentation uniquement.

- [ ] **Step 1: Réécrire le document en entier**

```markdown
# Tone of Voice — Dodojo

> Date : 2026-07-08 (révisé 2026-07-24, issue #51 — reframe "Démon Intérieur")
> Statut : Validé

## Décision

Direction révisée le 2026-07-24 (remplace "Dojo de Rue"/vibe Ryu-Ken, jugée trop plaquée en vernis martial-arts externe pour un concept devenu intime). Nouvelle ambiance : "Le Démon Intérieur" — le Boss n'est pas un rival extérieur, c'est tout ce qui traîne encore, non tranché, dans ta tête. Détail complet du reframe : `docs/superpowers/specs/2026-07-24-demon-interieur-identite-design.md`.

## Deux voix distinctes

### La Voix
Ta propre discipline, qui te parle depuis l'intérieur — pas un mentor externe qui commente de loin. Commente tes combats quotidiens (actions du joueur, stats, transitions d'écran : heal, dégâts, level up, Réveil, Dernier Round). Point de vue "je sens qu'on avance" (même corps, même tête), jamais "je t'ai vu progresser" (regard extérieur). Tutoie systématiquement, s'adresse au joueur par son **pseudo/prénom défini au profil** (`profiles.username`) — jamais par "Héros" ou autre appellation générique.

### Voix Boss
Nargue le joueur en 1ère personne aux moments clés (notifications, attaques surprises, ricanements sur rage quit). Antagoniste interne : ce n'est plus un rival de rue, c'est le doute qui vient de toi qui te parle ("tu vas encore lâcher, comme d'habitude").

## Registre & vocabulaire

- Tutoiement systématique, adresse par `{pseudo}` partout où La Voix/le Boss s'adresse au joueur.
- Références arcade universelles (pas martial-arts/japonaises) : K.O., Combo, Perfect, Round.
- Ton constant sur toute l'app (onboarding, erreurs techniques, réglages inclus) — jamais de bascule vers un registre corporate/neutre.

## Dosage des jurons (règle clé)

Jurons légers autorisés dans toute l'app (`putain`, `bordel`, `enfoiré`) mais **réservés aux pics émotionnels réels** :
- Level up, Perfect (Boss K.O.), victoire du jour (Dernier Round), erreur technique frustrante.

**Jamais** sur les actions routinières (ajout de tâche, validation normale, navigation, empty states) — le juron doit sonner comme une réaction vraie et rare, pas un tic de langage mécanique sur chaque ligne. Révisé par le palier `brut` de la jauge Volume Intérieur (US-49/US-54) — voir `docs/superpowers/specs/2026-07-23-agressivite-copy-design.md`.

## Limite dure (garde-fou)

Les jurons/piques ciblent toujours le Boss, la tâche ou la situation — **jamais une attaque personnelle réelle contre le joueur**. Pas de vocabulaire plus fort que le trio putain/bordel/enfoiré au palier `doux`/`direct` (aucune insulte à caractère sexuel, raciste, etc., à aucun palier).

## Exemples de référence par contexte

| Contexte | Voix | Exemple |
|---|---|---|
| Heal (ajout tâche, US-06) | La Voix | "Le Boss se soigne, +20 HP. Encore un truc qui traîne, {pseudo}." |
| Dégât (validation, US-21) | La Voix | "PAN ! -20 HP. Combo enclenché !" |
| Level up (US-09) | La Voix | "Putain, LEVEL UP ! Niveau 2 débloqué, {pseudo}." |
| Dernier Round, victoire (US-07) | La Voix | "Journée bouclée. Le Boss est à terre, va te reposer, {pseudo}." |
| Le Réveil (US-08) | La Voix | "Ces tâches d'hier te collent aux basques. On annihile ou on reporte ?" |
| Rage Quit (US-15) | Boss | "Tâche abandonnée. -5 XP. Le Boss ricane." |
| Perfect (US-16) | La Voix | "PERFECT, bordel ! Le Boss explose en pixels. T'es une machine, {pseudo}." |
| Erreur technique | La Voix | "Bordel, ça a planté côté serveur. Réessaie." |
| Empty state (aucune tâche) | La Voix | "Aucun monstre à l'horizon. Balance ta première quête." |
| Notification (US-11) | Boss | "Je ricane depuis ta poche. Encore 3 monstres avant le Dernier Round." |
| Attaque surprise (US-05) | Boss | "14h00 pétantes. T'as pas coché à temps, tant pis pour tes HP." |

## Impact

- Toute copie UI (microcopy, toasts, punchlines) doit utiliser `{pseudo}` dynamique et respecter la règle de dosage des jurons ci-dessus.
- Le profil permet de définir un pseudo/prénom dès l'onboarding — pas de fallback "Héros".

## Hors scope

- Copie exhaustive de tous les écrans (à faire au fil de l'implémentation des US, en respectant ce guide).
- Design des animations/flash accompagnant ces textes.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-07-08-tone-of-voice-design.md
git commit -m "docs: réécrit le tone-of-voice pour le reframe Démon Intérieur (issue #51)"
```

---

### Task 24: Réécrire le spec "Agressivité / copy"

**Files:**
- Modify: `docs/superpowers/specs/2026-07-23-agressivite-copy-design.md`

**Interfaces:**
- Aucune — documentation uniquement.

- [ ] **Step 1: Mettre à jour les sections obsolètes**

Remplacer le bloc "Modèle de données" :
```markdown
## Modèle de données

Migration dédiée single-column, même patron que `timezone` / `equipped_hero_id` :

\`\`\`sql
-- supabase/migrations/<timestamp>_add_profile_aggressivity_level.sql
alter table public.profiles
  add column aggressivity_level text not null default 'direct'
  check (aggressivity_level in ('doux', 'direct', 'brut'));
\`\`\`

> Révisé le 2026-07-24 (issue #51, reframe "Démon Intérieur") : les valeurs
> d'origine (`sensei`/`sparring`/`street`) ont été renommées en
> `doux`/`direct`/`brut` par la migration
> `supabase/migrations/20260724160000_rename_aggressivity_levels.sql`.

`types/index.ts` : `AggressivityLevel = 'doux' | 'direct' | 'brut'` et le champ `aggressivity_level: AggressivityLevel` sur `Profile`.

Pas de policy RLS spécifique nécessaire : colonne couverte par les policies existantes de `profiles` (lecture/écriture par le propriétaire), pas de donnée soumise à RG-04 (préférence réversible, comme `equipped_hero_id`).
```

Remplacer le bloc "Onboarding" :
```markdown
## Onboarding

`app/onboarding/OnboardingFlow.tsx` : le type `step` est `"pseudo" | "avatar" | "agressivite"`. Étape insérée entre `"avatar"` et la soumission finale (`createProfile`). Sélecteur à 3 cartes (Doux / Direct / Brut), chaque carte avec son nom + une courte description (Philosophe/Zen, Franc-parler, Arcade/Sans filtre). Pas de slider continu.

`app/onboarding/actions.ts` (`createProfile`) : accepte et persiste `aggressivity_level` choisi (fallback `direct` si l'étape est sautée/non atteinte).
```

Remplacer le bloc "Réglage à tout moment" :
```markdown
## Réglage à tout moment (Le Vestiaire)

`app/qg/page.tsx` : section "Volume Intérieur" (aux côtés d'`IntegrationsSection`), même sélecteur à 3 cartes que l'onboarding, composant client dédié `components/qg/AggressivityLevelSection.tsx`. Modification immédiate via `updateAggressivityLevel(level: AggressivityLevel)` (`app/actions/profile.ts`).
```

Remplacer le bloc "Règle des jurons" (dernier paragraphe uniquement, aligner le vocabulaire) :
```markdown
## Règle des jurons — révision de la spec 2026-07-08

Remplace la section "Dosage des jurons" de `docs/superpowers/specs/2026-07-08-tone-of-voice-design.md` (ce fichier reste la référence historique, mais cette section-ci fait foi désormais) :

- **Paliers `doux` et `direct`** : règle inchangée — jurons du trio `putain` / `bordel` / `enfoiré`, réservés aux pics émotionnels réels (level up, Perfect, victoire, échec net, erreur technique frustrante). Jamais sur actions routinières.
- **Palier `brut`** : override — jurons/registre cru autorisés même sur actions routinières (empty state, erreurs techniques inclus). Vocabulaire élargi : `merde`, `con`, `connard`, `foutre`, en plus du trio existant.
- **Garde-fou inchangé à tous les paliers** : jurons/piques toujours dirigés vers le Boss, la tâche ou la situation — jamais une attaque personnelle réelle contre le joueur. Aucune insulte à caractère sexuel ou raciste, à aucun palier.
```

Remplacer la ligne de titre en tête de fichier (ligne 1) et le résumé de contexte (ligne 11), remplaçant "Dojo Gauge" par "Volume Intérieur" et "Sensei / Sparring / Street" par "Doux / Direct / Brut" partout où ces mots apparaissent dans le reste du document (notamment la table de migration §"Migration des textes existants" et §"Boss").

- [ ] **Step 2: Vérifier qu'il ne reste aucune occurrence obsolète**

Run: `grep -niE "sensei|sparring|\\bstreet\\b|dojo gauge" "docs/superpowers/specs/2026-07-23-agressivite-copy-design.md"`
Expected: aucune occurrence (hors renvoi historique explicite vers l'ancien nom si nécessaire).

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-07-23-agressivite-copy-design.md
git commit -m "docs: aligne le spec agressivité-copy sur Volume Intérieur/doux-direct-brut (issue #51)"
```

---

### Task 25: Mettre à jour `PRODUCT.md` et `DESIGN.md`

**Files:**
- Modify: `PRODUCT.md`
- Modify: `DESIGN.md`

**Interfaces:**
- Aucune — documentation uniquement.

- [ ] **Step 1: Réécrire "Product Purpose" et "Brand Personality" dans `PRODUCT.md`**

```markdown
## Product Purpose

Transformer la liste de tâches quotidienne en combat contre ce qui traîne dans ta tête : chaque tâche ajoutée nourrit le Boss du jour (tout ce qui reste non tranché), chaque tâche complétée lui inflige des dégâts. Succès = terminer sa journée de travail l'esprit léger, la tête vidée, plutôt qu'une liste qui s'accumule silencieusement.

## Brand Personality

"Le Démon Intérieur" — le Boss n'est pas un rival extérieur, c'est tout ce qui traîne encore, non tranché, dans ta tête, rendu visible et combattable. Il change de masque chaque jour (le roster de monstres existant), mais reste toujours la même chose en dessous. La Voix qui commente ton combat n'est pas un mentor externe : c'est ta propre discipline, qui te parle depuis l'intérieur. Le Boss garde son franc-parler et ses piques, mais elles visent le doute qui vient de toi, jamais un rival de rue. Jurons légers dosés aux pics émotionnels réels (level up, victoire, échec), jamais en tic de langage mécanique. Détail complet : `docs/superpowers/specs/2026-07-24-demon-interieur-identite-design.md`.
```

- [ ] **Step 2: Mettre à jour "Anti-references" dans `PRODUCT.md` (aucun changement de fond, vérifier la cohérence de ton)**

Vérifier que le paragraphe "Anti-references" ne mentionne pas "dojo"/"rue" de façon incohérente avec le nouveau reframe — laisser tel quel si déjà générique (l'esthétique pixel-art/arcade reste valide).

- [ ] **Step 3: Mettre à jour l'overview de `DESIGN.md` (§1, "Creative North Star")**

Remplacer :
```markdown
**Creative North Star: "Le Démon Intérieur"**

Ce qui traîne dans ta tête, rendu visible et combattable — la discipline d'un HUD lisible et d'un feedback net rencontre l'énergie brute d'un combat d'arcade façon Street Fighter II. Le système est bâti sur une palette pleine et fonctionnelle (rouge combat, indigo néon, or), une police pixel-art pour l'impact et une police monospace pour la lisibilité opérationnelle, et un fond sombre de cabinet d'arcade en toute occasion. Le motion est chorégraphié par coup porté (flash, secousse, texte flottant), jamais une simple transition d'état.

Ce système rejette explicitement l'esthétique SaaS/outil de productivité épuré (Notion, Linear) : Dodojo n'est pas un tableur déguisé, c'est un écran de combat.
```

Ne rien changer d'autre dans `DESIGN.md` (palette/typographie/composants inchangés, cf. Global Constraints).

- [ ] **Step 4: Commit**

```bash
git add PRODUCT.md DESIGN.md
git commit -m "docs: aligne PRODUCT.md/DESIGN.md sur le reframe Démon Intérieur (issue #51)"
```

---

### Task 26: Mettre à jour `CLAUDE.md` et `CHANGELOG.md`

**Files:**
- Modify: `CLAUDE.md` (nouvelle entrée "Pièges et décisions")
- Modify: `CHANGELOG.md` (`## [Unreleased]`)

**Interfaces:**
- Aucune — documentation uniquement.

- [ ] **Step 1: Ajouter une entrée dans `CLAUDE.md`, section "Pièges et décisions non-évidentes"**

```markdown
**Reframe "Le Démon Intérieur" — vocabulaire complet renommé, pas juste le sens (issue #51)** — Le concept narratif est passé de "Dojo de Rue" (Sensei mentor externe, Boss rival de rue, vibe Ryu/Ken) à "Le Démon Intérieur" : le Boss est tout ce qui traîne non tranché dans la tête du joueur, "La Voix" (ex-Sensei) est sa propre discipline qui lui parle depuis l'intérieur. **Tout le vocabulaire japonais/martial-arts a été purgé**, pas seulement recadré en sens — identifié en cours de brainstorming comme un vernis externe plaqué, incohérent avec un concept devenu intime : `Sensei` → **La Voix** (voix intérieure) / **Doux** (palier Volume Intérieur), `Dojo Gauge` → **Volume Intérieur**, `Sparring`/`Street` → **Direct**/**Brut**, `Rituel du Réveil` → **Le Réveil**, `Rituel du Crépuscule` → **Dernier Round**, `Ceinture Jaune`/`Ceinture Noire`/`Sensei` (titres streak) → **Calme**/**Silence**/**Esprit Vide**, `QG` → **Le Vestiaire**, `Échoppe` → **Le Marché Noir**, `Panthéon` → **Tableau de Chasse**, `Manuel du Dojo` → **Le Guide**. Restent inchangés (vocabulaire gaming universel, pas martial-arts) : `Dodojo` (nom de l'app), `Boss`, `Héros`, `Arène`, `K.O.`, `Perfect`, `Combo`, `Rage Quit`. **Deux migrations de données** ont été nécessaires (`profiles.aggressivity_level` et `profiles.current_title`, valeurs déjà persistées pour les profils existants) — tout futur ajout de palier/titre doit garder le lexique en tête, ne jamais réintroduire de vocabulaire dojo/japonais. Spec complet : `docs/superpowers/specs/2026-07-24-demon-interieur-identite-design.md`.
```

- [ ] **Step 2: Ajouter la ligne `CHANGELOG.md`**

Sous `## [Unreleased]`, ajouter :
```markdown
- feat: refonte identité "Le Démon Intérieur" — nouveau logo, jauge Volume Intérieur (Doux/Direct/Brut), Le Réveil/Dernier Round, titres de streak Calme/Silence/Esprit Vide, Le Vestiaire/Le Marché Noir/Tableau de Chasse/Le Guide (issue #51)
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md CHANGELOG.md
git commit -m "docs: documente le reframe Démon Intérieur dans CLAUDE.md/CHANGELOG.md (issue #51)"
```

---

## Vérification finale

- [ ] **Step 1: Suite complète**

Run: `npx vitest run && npx tsc --noEmit && npm run build && npx playwright test`
Expected: tout passe, zéro référence résiduelle à `sensei`/`sparring`/`street`/`Ceinture`/`Dojo Gauge`/`Rituel du` en dehors des docs historiques explicitement marquées comme telles.

- [ ] **Step 2: Recherche résiduelle**

Run: `grep -rniE "\\bsensei\\b|\\bsparring\\b|dojo gauge|ceinture (jaune|noire)|rituel du (réveil|crépuscule)" --include="*.ts" --include="*.tsx" --include="*.md" --include="*.json" .`
Expected: seules des occurrences historiques explicitement commentées comme telles (ex. renvoi "remplace X" dans les docs) — aucune dans le code applicatif actif.
