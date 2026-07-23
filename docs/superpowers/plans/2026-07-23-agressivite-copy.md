# Jauge d'agressivité (Dojo Gauge) + Registre de copy centralisé Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centraliser tous les textes "voix" (Sensei/Boss) de l'app dans un registre `lib/copy/` à 3 variantes de ton (Sensei/Sparring/Street), piloté par un nouveau réglage `profiles.aggressivity_level` réglable dès l'onboarding et à tout moment au QG — résout #49 (audit + dictionnaire) et #54 (jauge d'agressivité) en un seul chantier.

**Architecture:** Un module pur par domaine sous `lib/copy/` (même convention que `lib/bosses.ts`/`lib/push-copy.ts`), chaque scénario exportant une fonction `(level, args) => string`. Les composants qui affichent déjà ces textes reçoivent `aggressivityLevel` en prop et appellent le registre au lieu de littéraux JSX. Seuls les textes "voix" sont concernés — le chrome UI neutre (labels de boutons) reste inline, inchangé.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase (migration SQL), Vitest.

## Global Constraints

- TypeScript strict : jamais de `any` (règle de code #1 du CLAUDE.md).
- Toute logique de copy est pure et vit sous `lib/copy/` (règle de code #2) — testable sans rendu React.
- Import relatif uniquement dans `lib/` (jamais `@/...`) — convention déjà en place dans `lib/game-engine.ts`, `lib/push-eligibility.ts`.
- Niveau par défaut : `sparring`. Le texte `sparring` de chaque scénario = le texte **actuellement en production**, inchangé (pas de réécriture silencieuse du ton par défaut).
- Jurons : `sensei`/`sparring` gardent la règle existante (trio `putain`/`bordel`/`enfoiré`, réservé aux pics émotionnels). `street` élargit à `merde`/`con`/`connard`/`foutre` et autorise le registre cru même hors pic émotionnel. **À tous les niveaux** : jamais d'attaque personnelle réelle contre le joueur (le Boss peut le charrier en fiction, jamais l'app elle-même) ; aucune insulte sexuelle/raciste.
- Commits `type: description courte` (Conventional Commits, cf. CLAUDE.md).
- Chaque tâche livrant une feature met à jour `CHANGELOG.md` sous `[Unreleased]` dans le même commit (dernière tâche du plan).

---

## Task 1: Colonne `aggressivity_level` + type partagé

**Files:**
- Create: `supabase/migrations/20260723130000_add_profile_aggressivity_level.sql`
- Modify: `types/index.ts:1` (ajout du type + champ `Profile`)

**Interfaces:**
- Produces: `AggressivityLevel = "sensei" | "sparring" | "street"` (exporté depuis `types/index.ts`), consommé par toutes les tâches suivantes via import relatif `../../types` (depuis `lib/copy/*.ts`) ou `@/types` (depuis `app/`/`components/`).
- Produces: `Profile.aggressivity_level: AggressivityLevel`.

- [ ] **Step 1: Écrire la migration**

```sql
-- supabase/migrations/20260723130000_add_profile_aggressivity_level.sql
alter table public.profiles
  add column aggressivity_level text not null default 'sparring'
  check (aggressivity_level in ('sensei', 'sparring', 'street'));
```

- [ ] **Step 2: Ajouter le type et le champ dans `types/index.ts`**

En haut du fichier, avant `export interface Profile {`, ajouter :

```ts
export type AggressivityLevel = "sensei" | "sparring" | "street";
```

Dans `Profile`, après la ligne `timezone: string;` :

```ts
  aggressivity_level: AggressivityLevel;
```

- [ ] **Step 3: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur (le champ est optionnel-compatible avec l'existant, `select("*")` ramène déjà toutes les colonnes).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260723130000_add_profile_aggressivity_level.sql types/index.ts
git commit -m "feat: ajoute la colonne profiles.aggressivity_level"
```

---

## Task 2: `lib/copy/combat.ts` — empty state, level up, Perfect/K.O.

**Files:**
- Create: `lib/copy/combat.ts`
- Test: `lib/copy/combat.test.ts`

**Interfaces:**
- Consumes: `AggressivityLevel` (Task 1, `../../types`).
- Produces (consommé par Task 8/10/12) :
  - `emptyStateTitle(level: AggressivityLevel): string`
  - `emptyStateBody(level: AggressivityLevel): string`
  - `levelUpTitle(level: AggressivityLevel): string`
  - `levelUpBody(level: AggressivityLevel, newLevel: number): string`
  - `koHeader(level: AggressivityLevel, isPerfect: boolean): string`
  - `koLine(level: AggressivityLevel, args: { isPerfect: boolean; firstVictory: boolean; username: string; bossName: string }): string`
  - `milestoneLine(level: AggressivityLevel, milestone: number): string`

- [ ] **Step 1: Écrire les tests (échec attendu)**

```ts
// lib/copy/combat.test.ts
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

describe("empty state", () => {
  test("sparring = texte actuel de production", () => {
    expect(emptyStateTitle("sparring")).toBe("Terrain vague.");
    expect(emptyStateBody("sparring")).toBe(
      "Aucun monstre à l'horizon. La rue est calme… trop calme.",
    );
  });
  test("street est plus cru que sensei", () => {
    expect(emptyStateBody("street")).toContain("défonce");
    expect(emptyStateBody("sensei")).not.toMatch(/putain|bordel|merde|con|connard|foutre/);
  });
});

describe("level up", () => {
  test("sparring = texte actuel", () => {
    expect(levelUpTitle("sparring")).toBe("Level Up !");
    expect(levelUpBody("sparring", 4)).toBe(
      "Niveau 4. Le dojo t'a appris quelque chose de plus.",
    );
  });
  test("street jure, sensei jamais", () => {
    expect(levelUpBody("street", 4)).toMatch(/putain/);
    expect(levelUpBody("sensei", 4)).not.toMatch(/putain|bordel|merde|con|connard|foutre/);
  });
});

describe("Perfect / K.O.", () => {
  test("sparring = textes actuels", () => {
    expect(koHeader("sparring", true)).toBe("Perfect !");
    expect(koHeader("sparring", false)).toBe("K.O. !");
    expect(
      koLine("sparring", {
        isPerfect: true,
        firstVictory: false,
        username: "Thomas",
        bossName: "le Gardien de Glace",
      }),
    ).toBe("Sans une égratignure, Thomas. le Gardien de Glace est au tapis.");
    expect(
      koLine("sparring", {
        isPerfect: false,
        firstVictory: false,
        username: "Thomas",
        bossName: "le Gardien de Glace",
      }),
    ).toBe("le Gardien de Glace a mordu la poussière. Tu l'as eu, Thomas.");
    expect(
      koLine("sparring", {
        isPerfect: true,
        firstVictory: true,
        username: "Thomas",
        bossName: "le Gardien de Glace",
      }),
    ).toBe("Premier sang, Thomas ! le Gardien de Glace est au tapis. Bienvenue dans l'Arène.");
  });

  test("jamais d'attaque personnelle contre le joueur, même en street", () => {
    const line = koLine("street", {
      isPerfect: true,
      firstVictory: false,
      username: "Thomas",
      bossName: "le Gardien de Glace",
    });
    expect(line).not.toMatch(/connard|con\b/);
  });

  test("milestone sparring = texte actuel", () => {
    expect(milestoneLine("sparring", 7)).toBe("Série de 7 ! Le dojo se souviendra.");
  });
});
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `npx vitest run lib/copy/combat.test.ts`
Expected: FAIL — `Cannot find module './combat'`

- [ ] **Step 3: Implémenter**

```ts
// lib/copy/combat.ts
import type { AggressivityLevel } from "../../types";

export function emptyStateTitle(level: AggressivityLevel): string {
  const titles: Record<AggressivityLevel, string> = {
    sensei: "Le dojo est calme.",
    sparring: "Terrain vague.",
    street: "Tu glandes ou quoi ?",
  };
  return titles[level];
}

export function emptyStateBody(level: AggressivityLevel): string {
  const bodies: Record<AggressivityLevel, string> = {
    sensei: "Aucune bataille à livrer pour l'instant. Le silence est aussi un entraînement.",
    sparring: "Aucun monstre à l'horizon. La rue est calme… trop calme.",
    street: "Balance tes tâches qu'on les défonce. Y'a rien à taper là.",
  };
  return bodies[level];
}

export function levelUpTitle(level: AggressivityLevel): string {
  const titles: Record<AggressivityLevel, string> = {
    sensei: "Palier franchi.",
    sparring: "Level Up !",
    street: "LEVEL UP, putain !",
  };
  return titles[level];
}

export function levelUpBody(level: AggressivityLevel, newLevel: number): string {
  const bodies: Record<AggressivityLevel, string> = {
    sensei: `Niveau ${newLevel}. Une leçon de plus, assimilée en silence.`,
    sparring: `Niveau ${newLevel}. Le dojo t'a appris quelque chose de plus.`,
    street: `Niveau ${newLevel} ! Tu montes en grade, machine.`,
  };
  return bodies[level];
}

export function koHeader(level: AggressivityLevel, isPerfect: boolean): string {
  const headers: Record<AggressivityLevel, [string, string]> = {
    sensei: ["Perfect.", "K.O."],
    sparring: ["Perfect !", "K.O. !"],
    street: ["PERFECT !", "K.O. !!"],
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

export function koLine(level: AggressivityLevel, args: KoLineArgs): string {
  const { isPerfect, firstVictory, username, bossName } = args;

  if (firstVictory) {
    const lines: Record<AggressivityLevel, string> = {
      sensei: `Premier combat mené à son terme, ${username}. ${bossName} s'incline. Bienvenue dans l'Arène.`,
      sparring: `Premier sang, ${username} ! ${bossName} est au tapis. Bienvenue dans l'Arène.`,
      street: `Premier sang, ${username} ! ${bossName} est en miettes, putain. Bienvenue dans la rue.`,
    };
    return lines[level];
  }

  if (isPerfect) {
    const lines: Record<AggressivityLevel, string> = {
      sensei: `Pas une égratignure, ${username}. L'esprit clair suffit à faire tomber ${bossName}.`,
      sparring: `Sans une égratignure, ${username}. ${bossName} est au tapis.`,
      street: `Sans une seule égratignure, ${username}. ${bossName} s'est fait démonter, bordel.`,
    };
    return lines[level];
  }

  const lines: Record<AggressivityLevel, string> = {
    sensei: `${bossName} est tombé. Le chemin compte plus que la marque laissée, ${username}.`,
    sparring: `${bossName} a mordu la poussière. Tu l'as eu, ${username}.`,
    street: `${bossName} a mangé le trottoir. Tu l'as buté, ${username}.`,
  };
  return lines[level];
}

export function milestoneLine(level: AggressivityLevel, milestone: number): string {
  const lines: Record<AggressivityLevel, string> = {
    sensei: `Série de ${milestone}. Le dojo retient ce genre de constance.`,
    sparring: `Série de ${milestone} ! Le dojo se souviendra.`,
    street: `Série de ${milestone}, putain ! Le dojo va en parler pendant des semaines.`,
  };
  return lines[level];
}
```

- [ ] **Step 4: Lancer les tests, vérifier le succès**

Run: `npx vitest run lib/copy/combat.test.ts`
Expected: PASS (tous les tests verts)

- [ ] **Step 5: Commit**

```bash
git add lib/copy/combat.ts lib/copy/combat.test.ts
git commit -m "feat: registre de copy combat.ts (empty state, level up, Perfect/K.O.)"
```

---

## Task 3: `lib/copy/rituals.ts` — Réveil & Crépuscule

**Files:**
- Create: `lib/copy/rituals.ts`
- Test: `lib/copy/rituals.test.ts`

**Interfaces:**
- Consumes: `AggressivityLevel` (Task 1).
- Produces (consommé par Task 9/11) :
  - `wakeUpSubtitle(level: AggressivityLevel): string`
  - `crepusculeHeader(level: AggressivityLevel, victory: boolean): string`
  - `crepusculeLine(level: AggressivityLevel, args: { victory: boolean; username: string; bossName: string }): string`

- [ ] **Step 1: Écrire les tests**

```ts
// lib/copy/rituals.test.ts
import { describe, expect, test } from "vitest";
import { wakeUpSubtitle, crepusculeHeader, crepusculeLine } from "./rituals";

describe("Rituel du Réveil", () => {
  test("sparring = texte actuel", () => {
    expect(wakeUpSubtitle("sparring")).toBe(
      "Les monstres que tu as fuis hier sont revenus. Règle tes comptes avant d'entrer dans l'Arène.",
    );
  });
  test("sensei reste sans juron", () => {
    expect(wakeUpSubtitle("sensei")).not.toMatch(/putain|bordel|merde|con|connard|foutre/);
  });
});

describe("Rituel du Crépuscule", () => {
  test("sparring = textes actuels", () => {
    expect(crepusculeHeader("sparring", true)).toBe("Perfect !");
    expect(crepusculeHeader("sparring", false)).toBe("Crépuscule");
    expect(
      crepusculeLine("sparring", { victory: true, username: "Thomas", bossName: "le Zombie" }),
    ).toBe("Thomas, tu as terrassé le Zombie. La rue est calme pour ce soir.");
    expect(crepusculeLine("sparring", { victory: false, username: "Thomas", bossName: "le Zombie" })).toBe(
      "Thomas, tu poses les armes. Pas de honte — demain est un autre combat.",
    );
  });
  test("street élargit le vocabulaire sans viser le joueur", () => {
    const line = crepusculeLine("street", { victory: true, username: "Thomas", bossName: "le Zombie" });
    expect(line).toMatch(/putain/);
    expect(line).not.toMatch(/connard|con\b/);
  });
});
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `npx vitest run lib/copy/rituals.test.ts`
Expected: FAIL — module introuvable

- [ ] **Step 3: Implémenter**

```ts
// lib/copy/rituals.ts
import type { AggressivityLevel } from "../../types";

export function wakeUpSubtitle(level: AggressivityLevel): string {
  const lines: Record<AggressivityLevel, string> = {
    sensei: "Les tâches d'hier attendent encore une réponse. Prends un instant, règle-les avant d'avancer.",
    sparring: "Les monstres que tu as fuis hier sont revenus. Règle tes comptes avant d'entrer dans l'Arène.",
    street: "Tes monstres d'hier sont pas partis, ils t'ont attendu. Nettoie ce bordel avant d'entrer.",
  };
  return lines[level];
}

export function crepusculeHeader(level: AggressivityLevel, victory: boolean): string {
  const headers: Record<AggressivityLevel, [string, string]> = {
    sensei: ["Journée accomplie.", "Crépuscule."],
    sparring: ["Perfect !", "Crépuscule"],
    street: ["NETTOYÉ !", "Crépuscule."],
  };
  const [victoryHeader, retreatHeader] = headers[level];
  return victory ? victoryHeader : retreatHeader;
}

interface CrepusculeLineArgs {
  victory: boolean;
  username: string;
  bossName: string;
}

export function crepusculeLine(level: AggressivityLevel, args: CrepusculeLineArgs): string {
  const { victory, username, bossName } = args;

  if (victory) {
    const lines: Record<AggressivityLevel, string> = {
      sensei: `${username}, ${bossName} s'est incliné. Repose-toi, la rue attendra ta prochaine sortie.`,
      sparring: `${username}, tu as terrassé ${bossName}. La rue est calme pour ce soir.`,
      street: `${username}, ${bossName} est au tapis, putain. La rue te doit le respect ce soir.`,
    };
    return lines[level];
  }

  const lines: Record<AggressivityLevel, string> = {
    sensei: `${username}, tu poses les armes pour ce soir. Aucune honte à ça — demain reste un autre combat.`,
    sparring: `${username}, tu poses les armes. Pas de honte — demain est un autre combat.`,
    street: `${username}, tu esquives ce soir ? D'accord. Mais ce combat t'attend au tournant, demain.`,
  };
  return lines[level];
}
```

- [ ] **Step 4: Lancer, vérifier le succès**

Run: `npx vitest run lib/copy/rituals.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/copy/rituals.ts lib/copy/rituals.test.ts
git commit -m "feat: registre de copy rituals.ts (Réveil, Crépuscule)"
```

---

## Task 4: `lib/copy/rage-quit.ts`

**Files:**
- Create: `lib/copy/rage-quit.ts`
- Test: `lib/copy/rage-quit.test.ts`

**Interfaces:**
- Consumes: `AggressivityLevel` (Task 1).
- Produces (consommé par Task 8) :
  - `rageQuitConfirmBody(level: AggressivityLevel, args: { taskTitle: string; penalty: number }): string`
  - `rageQuitPunchline(level: AggressivityLevel): string`

- [ ] **Step 1: Écrire les tests**

```ts
// lib/copy/rage-quit.test.ts
import { describe, expect, test } from "vitest";
import { rageQuitConfirmBody, rageQuitPunchline } from "./rage-quit";

describe("Rage Quit", () => {
  test("sparring = textes actuels", () => {
    expect(rageQuitConfirmBody("sparring", { taskTitle: "Facture client", penalty: 5 })).toBe(
      "Abandonner « Facture client » coûte −5 XP. Le Boss rétrécit, mais il ricanera.",
    );
    expect(rageQuitPunchline("sparring")).toBe("Le Boss ricane : « Déjà à terre ? Relève-toi. »");
  });

  test("sensei reste sans juron", () => {
    expect(rageQuitConfirmBody("sensei", { taskTitle: "X", penalty: 5 })).not.toMatch(
      /putain|bordel|merde|con|connard|foutre/,
    );
    expect(rageQuitPunchline("sensei")).not.toMatch(/putain|bordel|merde|con|connard|foutre/);
  });

  test("street élargit le vocabulaire sans viser le joueur", () => {
    expect(rageQuitPunchline("street")).not.toMatch(/connard|con\b/);
  });
});
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `npx vitest run lib/copy/rage-quit.test.ts`
Expected: FAIL — module introuvable

- [ ] **Step 3: Implémenter**

```ts
// lib/copy/rage-quit.ts
import type { AggressivityLevel } from "../../types";

interface RageQuitConfirmArgs {
  taskTitle: string;
  penalty: number;
}

export function rageQuitConfirmBody(level: AggressivityLevel, args: RageQuitConfirmArgs): string {
  const { taskTitle, penalty } = args;
  const lines: Record<AggressivityLevel, string> = {
    sensei: `Abandonner « ${taskTitle} » coûte −${penalty} XP. Une pause consciente, pas un échec — le Boss retrouve un peu de terrain.`,
    sparring: `Abandonner « ${taskTitle} » coûte −${penalty} XP. Le Boss rétrécit, mais il ricanera.`,
    street: `Lâcher « ${taskTitle} », ça pique −${penalty} XP direct. Le Boss va se foutre de ta gueule.`,
  };
  return lines[level];
}

export function rageQuitPunchline(level: AggressivityLevel): string {
  const lines: Record<AggressivityLevel, string> = {
    sensei: "Le Boss hausse les épaules : « Une pause. Reviens quand tu es prêt. »",
    sparring: "Le Boss ricane : « Déjà à terre ? Relève-toi. »",
    street: "Le Boss se marre : « Déjà cuit ? Merde, relève-toi et reviens te battre. »",
  };
  return lines[level];
}
```

- [ ] **Step 4: Lancer, vérifier le succès**

Run: `npx vitest run lib/copy/rage-quit.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/copy/rage-quit.ts lib/copy/rage-quit.test.ts
git commit -m "feat: registre de copy rage-quit.ts"
```

---

## Task 5: `lib/copy/deadline.ts`

**Files:**
- Create: `lib/copy/deadline.ts`
- Test: `lib/copy/deadline.test.ts`

**Interfaces:**
- Consumes: `AggressivityLevel` (Task 1).
- Produces (consommé par Task 8) : `deadlineAlertLine(level: AggressivityLevel, args: { taskTitle: string; damage: number }): string`

- [ ] **Step 1: Écrire les tests**

```ts
// lib/copy/deadline.test.ts
import { describe, expect, test } from "vitest";
import { deadlineAlertLine } from "./deadline";

describe("Attaque Surprise (deadline ratée)", () => {
  test("sparring = texte actuel", () => {
    expect(deadlineAlertLine("sparring", { taskTitle: "Appeler le client", damage: 10 })).toBe(
      "⏰ Attaque Surprise : « Appeler le client » a raté sa deadline (−10 HP).",
    );
  });
  test("sensei reste sans juron, street élargit sans viser le joueur", () => {
    expect(deadlineAlertLine("sensei", { taskTitle: "X", damage: 10 })).not.toMatch(
      /putain|bordel|merde|con|connard|foutre/,
    );
    const street = deadlineAlertLine("street", { taskTitle: "X", damage: 10 });
    expect(street).toMatch(/merde/);
    expect(street).not.toMatch(/connard|con\b/);
  });
});
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `npx vitest run lib/copy/deadline.test.ts`
Expected: FAIL — module introuvable

- [ ] **Step 3: Implémenter**

```ts
// lib/copy/deadline.ts
import type { AggressivityLevel } from "../../types";

interface DeadlineAlertArgs {
  taskTitle: string;
  damage: number;
}

export function deadlineAlertLine(level: AggressivityLevel, args: DeadlineAlertArgs): string {
  const { taskTitle, damage } = args;
  const lines: Record<AggressivityLevel, string> = {
    sensei: `⏰ Le temps a filé : « ${taskTitle} » a dépassé son heure (−${damage} HP).`,
    sparring: `⏰ Attaque Surprise : « ${taskTitle} » a raté sa deadline (−${damage} HP).`,
    street: `⏰ Attaque Surprise, merde : « ${taskTitle} » a foiré sa deadline (−${damage} HP).`,
  };
  return lines[level];
}
```

- [ ] **Step 4: Lancer, vérifier le succès**

Run: `npx vitest run lib/copy/deadline.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/copy/deadline.ts lib/copy/deadline.test.ts
git commit -m "feat: registre de copy deadline.ts"
```

---

## Task 6: `lib/copy/errors.ts`

**Files:**
- Create: `lib/copy/errors.ts`
- Test: `lib/copy/errors.test.ts`

**Interfaces:**
- Consumes: `AggressivityLevel` (Task 1).
- Produces (consommé par Task 13) : `technicalErrorLine(level: AggressivityLevel): string`

- [ ] **Step 1: Écrire les tests**

```ts
// lib/copy/errors.test.ts
import { describe, expect, test } from "vitest";
import { technicalErrorLine } from "./errors";

describe("Erreur technique", () => {
  test("sparring = texte actuel", () => {
    expect(technicalErrorLine("sparring")).toBe(
      "Connexion coupée avec le dojo. Impossible de récupérer ton combat.",
    );
  });
  test("street jure, sensei jamais", () => {
    expect(technicalErrorLine("street")).toMatch(/putain/);
    expect(technicalErrorLine("sensei")).not.toMatch(/putain|bordel|merde|con|connard|foutre/);
  });
});
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `npx vitest run lib/copy/errors.test.ts`
Expected: FAIL — module introuvable

- [ ] **Step 3: Implémenter**

```ts
// lib/copy/errors.ts
import type { AggressivityLevel } from "../../types";

export function technicalErrorLine(level: AggressivityLevel): string {
  const lines: Record<AggressivityLevel, string> = {
    sensei: "Le dojo est injoignable pour l'instant. Respire, réessaie dans un instant.",
    sparring: "Connexion coupée avec le dojo. Impossible de récupérer ton combat.",
    street: "Putain, connexion coupée avec le dojo. Impossible de choper ton combat.",
  };
  return lines[level];
}
```

- [ ] **Step 4: Lancer, vérifier le succès**

Run: `npx vitest run lib/copy/errors.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/copy/errors.ts lib/copy/errors.test.ts
git commit -m "feat: registre de copy errors.ts"
```

---

## Task 7: `lib/copy/notifications.ts` — remplace `lib/push-copy.ts`

**Files:**
- Create: `lib/copy/notifications.ts`
- Test: `lib/copy/notifications.test.ts`
- Delete: `lib/push-copy.ts`, `lib/push-copy.test.ts`
- Modify: `app/api/cron/push-reminders/route.ts:6,18-22,70,123`
- Modify: `app/api/cron/push-reminders/route.test.ts` (adapter les imports/mocks au nouveau nom si le fichier référence `push-copy`)

**Interfaces:**
- Consumes: `AggressivityLevel` (Task 1).
- Produces (consommé par Task 7 cron route) :
  - `interface PushReminderPayload { title: string; body: string; url: string }`
  - `buildReminderPayload(remainingTasks: number, level: AggressivityLevel, pickIndex?: (templateCount: number) => number): PushReminderPayload`

- [ ] **Step 1: Écrire les tests**

```ts
// lib/copy/notifications.test.ts
import { describe, expect, test } from "vitest";
import { buildReminderPayload } from "./notifications";

describe("buildReminderPayload — sparring (comportement actuel inchangé)", () => {
  test("titre et deep-link fixes, quel que soit le gabarit tiré", () => {
    const payload = buildReminderPayload(3, "sparring", () => 0);
    expect(payload.title).toBe("Dodojo — Le Boss t'attend");
    expect(payload.url).toBe("/");
  });

  test("accorde au singulier quand il reste 1 tâche", () => {
    const payload = buildReminderPayload(1, "sparring", () => 0);
    expect(payload.body).toContain("1 monstre à");
    expect(payload.body).not.toContain("monstres");
  });

  test("accorde au pluriel quand il reste plusieurs tâches", () => {
    const payload = buildReminderPayload(4, "sparring", () => 0);
    expect(payload.body).toContain("4 monstres à");
  });

  test("pickIndex sélectionne le gabarit correspondant (index 2)", () => {
    const payload = buildReminderPayload(2, "sparring", () => 2);
    expect(payload.body).toContain("Crépuscule approche");
  });

  test("pickIndex hors bornes retombe sur le premier gabarit", () => {
    const payload = buildReminderPayload(5, "sparring", () => 99);
    expect(payload.body).toContain("Le Boss ricane");
  });
});

describe("buildReminderPayload — niveaux", () => {
  test("sensei reste sans juron sur tous les gabarits", () => {
    for (let i = 0; i < 4; i++) {
      const payload = buildReminderPayload(3, "sensei", () => i);
      expect(payload.body).not.toMatch(/putain|bordel|merde|con|connard|foutre/);
    }
  });

  test("street élargit le vocabulaire", () => {
    const payload = buildReminderPayload(3, "street", () => 0);
    expect(payload.body).toMatch(/marre/);
  });
});
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `npx vitest run lib/copy/notifications.test.ts`
Expected: FAIL — module introuvable

- [ ] **Step 3: Implémenter**

```ts
// lib/copy/notifications.ts
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
    sensei: (n) => `Il te reste ${n} ${pluralize(n, "tâche", "tâches")} avant le Rituel du Crépuscule. À ton rythme.`,
    sparring: (n) =>
      `Le Boss ricane, il te reste ${n} ${pluralize(n, "monstre", "monstres")} à abattre avant le Rituel du Crépuscule !`,
    street: (n) =>
      `Le Boss se marre, il te reste ${n} ${pluralize(n, "monstre", "monstres")} à défoncer avant le Crépuscule, bouge-toi !`,
  },
  {
    sensei: (n) =>
      `Le dojo t'attend, sans te presser : ${n} ${pluralize(n, "adversaire", "adversaires")} ${pluralize(n, "patiente", "patientent")} encore.`,
    sparring: (n) =>
      `Le Dojo t'attend : ${n} ${pluralize(n, "adversaire", "adversaires")} ${pluralize(n, "tient", "tiennent")} encore debout.`,
    street: (n) =>
      `Le Dojo t'attend, putain : ${n} ${pluralize(n, "adversaire", "adversaires")} ${pluralize(n, "tient", "tiennent")} encore debout.`,
  },
  {
    sensei: (n) =>
      `Le Crépuscule approche. ${n} ${pluralize(n, "tâche restante", "tâches restantes")}, quand tu es prêt.`,
    sparring: (n) =>
      `Le Crépuscule approche et ton Boss respire encore (${n} ${pluralize(n, "tâche restante", "tâches restantes")}).`,
    street: (n) =>
      `Le Crépuscule approche et ton Boss respire encore, merde (${n} ${pluralize(n, "tâche restante", "tâches restantes")}).`,
  },
  {
    sensei: (n) =>
      `${n} ${pluralize(n, "point de vie", "points de vie")} encore à récupérer aujourd'hui, si le cœur t'en dit.`,
    sparring: (n) =>
      `Termine-le : ${n} ${pluralize(n, "point de vie", "points de vie")} planqué${n <= 1 ? "" : "s"} dans tes tâches du jour.`,
    street: (n) =>
      `Termine-le, bordel : ${n} ${pluralize(n, "point de vie", "points de vie")} planqué${n <= 1 ? "" : "s"} dans tes tâches du jour.`,
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

- [ ] **Step 4: Lancer, vérifier le succès**

Run: `npx vitest run lib/copy/notifications.test.ts`
Expected: PASS

- [ ] **Step 5: Supprimer l'ancien module**

```bash
git rm lib/push-copy.ts lib/push-copy.test.ts
```

- [ ] **Step 6: Mettre à jour la route cron**

Dans `app/api/cron/push-reminders/route.ts`, remplacer l'import (ligne 6) :

```ts
import { buildReminderPayload } from "@/lib/copy/notifications";
```

Ajouter `aggressivity_level` à l'interface `ProfileRow` (ligne 18-22) :

```ts
interface ProfileRow {
  id: string;
  timezone: string;
  last_reminder_sent_on: string | null;
  aggressivity_level: "sensei" | "sparring" | "street";
}
```

Ajouter la colonne à la requête (ligne 70) :

```ts
    supabase.from("profiles").select("id, timezone, last_reminder_sent_on, aggressivity_level").in("id", userIds),
```

Passer le niveau à `buildReminderPayload` (ligne 123) :

```ts
    const payload = JSON.stringify(buildReminderPayload(remaining, profile.aggressivity_level));
```

- [ ] **Step 7: Vérifier le test existant de la route**

Run: `npx vitest run app/api/cron/push-reminders/route.test.ts`
Expected: PASS (si le test mocke `profiles`, ajouter `aggressivity_level: "sparring"` aux fixtures mockées ; si un test échoue avec `undefined is not assignable`, c'est le signal qu'un mock de profil doit être complété avec ce champ)

- [ ] **Step 8: Vérifier la compilation globale**

Run: `npx tsc --noEmit`
Expected: aucune erreur

- [ ] **Step 9: Commit**

```bash
git add lib/copy/notifications.ts lib/copy/notifications.test.ts app/api/cron/push-reminders/route.ts app/api/cron/push-reminders/route.test.ts
git commit -m "feat: remplace lib/push-copy.ts par lib/copy/notifications.ts (3 niveaux)"
```

---

## Task 8: Wire `Arena.tsx`

**Files:**
- Modify: `components/combat/Arena.tsx`

**Interfaces:**
- Consumes: `emptyStateTitle`, `emptyStateBody` (Task 2) ; `rageQuitConfirmBody`, `rageQuitPunchline` (Task 4) ; `deadlineAlertLine` (Task 5) ; `AggressivityLevel` (Task 1).
- Produces: `Arena` calcule `const level = profile.aggressivity_level;` et le transmet aux enfants (Task 9-12).

- [ ] **Step 1: Ajouter les imports**

Après la ligne `import { buildShareCardParams } from "@/lib/share-card";` (ligne 49), ajouter :

```ts
import { emptyStateTitle, emptyStateBody } from "@/lib/copy/combat";
import { rageQuitConfirmBody, rageQuitPunchline } from "@/lib/copy/rage-quit";
import { deadlineAlertLine } from "@/lib/copy/deadline";
```

- [ ] **Step 2: Définir `level` dans le corps du composant**

Juste après la ligne `const [profile, setProfile] = useState<Profile>(initialProfile);` (ligne 126), ajouter :

```ts
  const level = profile.aggressivity_level;
```

- [ ] **Step 3: Remplacer la punchline de confirmation Rage Quit**

Remplacer (lignes 859-864) :

```tsx
            <p className="text-xs text-muted">
              Abandonner «{" "}
              {tasks.find((task) => task.id === rageQuitConfirmId)?.title}{" "}
              » coûte −{RAGE_QUIT_XP_PENALTY} XP. Le Boss rétrécit, mais il
              ricanera.
            </p>
```

par :

```tsx
            <p className="text-xs text-muted">
              {rageQuitConfirmBody(level, {
                taskTitle: tasks.find((task) => task.id === rageQuitConfirmId)?.title ?? "",
                penalty: RAGE_QUIT_XP_PENALTY,
              })}
            </p>
```

- [ ] **Step 4: Remplacer le ricanement (undoState.punchline)**

Remplacer (ligne 618) :

```ts
      punchline: "Le Boss ricane : « Déjà à terre ? Relève-toi. »",
```

par :

```ts
      punchline: rageQuitPunchline(level),
```

- [ ] **Step 5: Remplacer l'alerte deadline**

Remplacer (lignes 906-909) :

```tsx
          <span>
            ⏰ Attaque Surprise : « {deadlineAlert.taskTitle} » a raté sa deadline
            (−{HERO_DAMAGE_PER_MISSED_DEADLINE} HP).
          </span>
```

par :

```tsx
          <span>
            {deadlineAlertLine(level, {
              taskTitle: deadlineAlert.taskTitle,
              damage: HERO_DAMAGE_PER_MISSED_DEADLINE,
            })}
          </span>
```

- [ ] **Step 6: Remplacer l'empty state**

Remplacer (lignes 930-936) :

```tsx
          <p className="font-display text-lg uppercase tracking-wide text-ink">
            Terrain vague.
          </p>
          <p className="max-w-[24ch] text-sm text-muted">
            Aucun monstre à l&apos;horizon. La rue est calme… trop calme.
          </p>
```

par :

```tsx
          <p className="font-display text-lg uppercase tracking-wide text-ink">
            {emptyStateTitle(level)}
          </p>
          <p className="max-w-[24ch] text-sm text-muted">{emptyStateBody(level)}</p>
```

- [ ] **Step 7: Transmettre `level` aux enfants**

Dans le JSX de `WakeUpRitual` (lignes 704-708), ajouter la prop :

```tsx
        <WakeUpRitual
          overdueTasks={overdueTasks}
          timezone={profile.timezone}
          aggressivityLevel={level}
          onResolved={() => setShowWakeUp(false)}
        />
```

Dans le JSX de `CrepusculeRecap` (lignes 711-731), ajouter la prop juste après `bossName={bossName}` :

```tsx
          aggressivityLevel={level}
```

Dans le JSX de `PerfectOverlay` (lignes 790-818), ajouter la prop juste après `bossName={bossName}` :

```tsx
              aggressivityLevel={level}
```

Dans le JSX de `LevelUpOverlay` (lignes 820-824), ajouter la prop :

```tsx
            <LevelUpOverlay
              newLevel={levelUpValue}
              aggressivityLevel={level}
              onDismiss={() => setLevelUpValue(null)}
            />
```

- [ ] **Step 8: Vérifier la compilation (échouera tant que Tasks 9-12 ne sont pas faites)**

Run: `npx tsc --noEmit`
Expected: erreurs sur les props `aggressivityLevel` inconnues de `WakeUpRitual`/`CrepusculeRecap`/`PerfectOverlay`/`LevelUpOverlay` — normal, corrigé aux tâches suivantes. Ne pas commit avant Task 12.

---

## Task 9: Wire `WakeUpRitual.tsx`

**Files:**
- Modify: `components/combat/WakeUpRitual.tsx`

**Interfaces:**
- Consumes: `wakeUpSubtitle` (Task 3), `AggressivityLevel` (Task 1).

- [ ] **Step 1: Ajouter l'import et la prop**

Ajouter en haut du fichier, après `import type { Task } from "@/types";` (ligne 4) :

```ts
import type { AggressivityLevel } from "@/types";
import { wakeUpSubtitle } from "@/lib/copy/rituals";
```

Modifier l'interface (lignes 21-25) :

```ts
interface WakeUpRitualProps {
  overdueTasks: Task[];
  timezone: string;
  aggressivityLevel: AggressivityLevel;
  onResolved: () => void;
}
```

Modifier la signature du composant (ligne 42) :

```ts
export default function WakeUpRitual({
  overdueTasks,
  timezone,
  aggressivityLevel,
  onResolved,
}: WakeUpRitualProps) {
```

- [ ] **Step 2: Remplacer le sous-titre**

Remplacer (lignes 88-91) :

```tsx
        <p className="text-sm text-muted">
          Les monstres que tu as fuis hier sont revenus. Règle tes comptes avant
          d&apos;entrer dans l&apos;Arène.
        </p>
```

par :

```tsx
        <p className="text-sm text-muted">{wakeUpSubtitle(aggressivityLevel)}</p>
```

- [ ] **Step 3: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: plus d'erreur sur `WakeUpRitual` (des erreurs subsistent sur les composants pas encore migrés)

- [ ] **Step 4: Commit**

```bash
git add components/combat/WakeUpRitual.tsx
git commit -m "feat: branche le niveau d'agressivité sur WakeUpRitual"
```

---

## Task 10: Wire `PerfectOverlay.tsx`

**Files:**
- Modify: `components/combat/PerfectOverlay.tsx`

**Interfaces:**
- Consumes: `koHeader`, `koLine`, `milestoneLine` (Task 2), `AggressivityLevel` (Task 1).

- [ ] **Step 1: Ajouter l'import et la prop**

Après `import type { KoTier } from "@/lib/game-engine";` (ligne 3), ajouter :

```ts
import type { AggressivityLevel } from "@/types";
import { koHeader, koLine, milestoneLine } from "@/lib/copy/combat";
```

Modifier l'interface (lignes 7-22), ajouter après `bossName: string;` :

```ts
  aggressivityLevel: AggressivityLevel;
```

Modifier la signature (lignes 28-39), ajouter `aggressivityLevel,` après `bossName,`.

- [ ] **Step 2: Remplacer le header Perfect/K.O.**

Remplacer (ligne 63) :

```tsx
        {isPerfect ? "Perfect !" : "K.O. !"}
```

par :

```tsx
        {koHeader(aggressivityLevel, isPerfect)}
```

- [ ] **Step 3: Remplacer la ligne principale**

Remplacer (lignes 67-71) :

```tsx
        {firstVictory
          ? `Premier sang, ${username} ! ${bossName} est au tapis. Bienvenue dans l'Arène.`
          : isPerfect
            ? `Sans une égratignure, ${username}. ${bossName} est au tapis.`
            : `${bossName} a mordu la poussière. Tu l'as eu, ${username}.`}
```

par :

```tsx
        {koLine(aggressivityLevel, { isPerfect, firstVictory, username, bossName })}
```

- [ ] **Step 4: Remplacer la ligne de palier**

Remplacer (lignes 75-77) :

```tsx
        <p className="font-display text-xs uppercase tracking-wide text-gold">
          Série de {milestone} ! Le dojo se souviendra.
        </p>
```

par :

```tsx
        <p className="font-display text-xs uppercase tracking-wide text-gold">
          {milestoneLine(aggressivityLevel, milestone)}
        </p>
```

- [ ] **Step 5: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: plus d'erreur sur `PerfectOverlay`

- [ ] **Step 6: Commit**

```bash
git add components/combat/PerfectOverlay.tsx
git commit -m "feat: branche le niveau d'agressivité sur PerfectOverlay"
```

---

## Task 11: Wire `CrepusculeRecap.tsx`

**Files:**
- Modify: `components/combat/CrepusculeRecap.tsx`

**Interfaces:**
- Consumes: `crepusculeHeader`, `crepusculeLine` (Task 3), `AggressivityLevel` (Task 1).

- [ ] **Step 1: Ajouter l'import et la prop**

Après `import type { DayOutcome } from "@/types";` (ligne 3), ajouter :

```ts
import type { AggressivityLevel } from "@/types";
import { crepusculeHeader, crepusculeLine } from "@/lib/copy/rituals";
```

Modifier l'interface (lignes 7-20), ajouter après `bossName: string;` :

```ts
  aggressivityLevel: AggressivityLevel;
```

Modifier la signature (lignes 25-37), ajouter `aggressivityLevel,` après `bossName,`.

- [ ] **Step 2: Remplacer le header**

Remplacer (ligne 52) :

```tsx
        {victory ? "Perfect !" : "Crépuscule"}
```

par :

```tsx
        {crepusculeHeader(aggressivityLevel, victory)}
```

- [ ] **Step 3: Remplacer la ligne principale**

Remplacer (lignes 55-57) :

```tsx
        {victory
          ? `${username}, tu as terrassé ${bossName}. La rue est calme pour ce soir.`
          : `${username}, tu poses les armes. Pas de honte — demain est un autre combat.`}
```

par :

```tsx
        {crepusculeLine(aggressivityLevel, { victory, username, bossName })}
```

- [ ] **Step 4: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: plus d'erreur sur `CrepusculeRecap`

- [ ] **Step 5: Commit**

```bash
git add components/combat/CrepusculeRecap.tsx
git commit -m "feat: branche le niveau d'agressivité sur CrepusculeRecap"
```

---

## Task 12: Wire `LevelUpOverlay.tsx` + finaliser `Arena.tsx`

**Files:**
- Modify: `components/combat/LevelUpOverlay.tsx`

**Interfaces:**
- Consumes: `levelUpTitle`, `levelUpBody` (Task 2), `AggressivityLevel` (Task 1).

- [ ] **Step 1: Ajouter l'import et la prop**

En haut du fichier, ajouter :

```ts
import type { AggressivityLevel } from "@/types";
import { levelUpTitle, levelUpBody } from "@/lib/copy/combat";
```

Modifier l'interface (lignes 1-4) :

```ts
interface LevelUpOverlayProps {
  newLevel: number;
  aggressivityLevel: AggressivityLevel;
  onDismiss: () => void;
}
```

Modifier la signature (ligne 6) :

```ts
export default function LevelUpOverlay({ newLevel, aggressivityLevel, onDismiss }: LevelUpOverlayProps) {
```

- [ ] **Step 2: Remplacer les textes**

Remplacer (lignes 14-19) :

```tsx
      <p className="font-display text-2xl uppercase tracking-wide text-xp">
        Level Up !
      </p>
      <p className="max-w-[26ch] text-sm text-muted">
        Niveau {newLevel}. Le dojo t&apos;a appris quelque chose de plus.
      </p>
```

par :

```tsx
      <p className="font-display text-2xl uppercase tracking-wide text-xp">
        {levelUpTitle(aggressivityLevel)}
      </p>
      <p className="max-w-[26ch] text-sm text-muted">{levelUpBody(aggressivityLevel, newLevel)}</p>
```

- [ ] **Step 3: Vérifier la compilation complète (Arena + tous les enfants)**

Run: `npx tsc --noEmit`
Expected: aucune erreur

- [ ] **Step 4: Lancer la suite Vitest complète**

Run: `npx vitest run`
Expected: PASS (tous les tests existants + nouveaux)

- [ ] **Step 5: Commit (Arena.tsx + LevelUpOverlay.tsx)**

```bash
git add components/combat/Arena.tsx components/combat/LevelUpOverlay.tsx
git commit -m "feat: branche le niveau d'agressivité sur Arena et LevelUpOverlay"
```

---

## Task 13: Wire `ArenaError.tsx` + `app/page.tsx`

**Files:**
- Modify: `components/combat/ArenaError.tsx`
- Modify: `app/page.tsx:26,51,63`

**Interfaces:**
- Consumes: `technicalErrorLine` (Task 6), `AggressivityLevel` (Task 1).

- [ ] **Step 1: Réécrire `ArenaError.tsx`**

```tsx
import Link from "next/link";
import type { AggressivityLevel } from "@/types";
import { technicalErrorLine } from "@/lib/copy/errors";

interface ArenaErrorProps {
  aggressivityLevel?: AggressivityLevel;
}

// Niveau `sparring` par défaut : utilisé quand le profil lui-même n'a pas pu
// être chargé (aucun aggressivity_level disponible à ce stade).
export default function ArenaError({ aggressivityLevel = "sparring" }: ArenaErrorProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center">
      <div
        role="alert"
        className="w-full max-w-xs rounded-md border border-alert bg-surface px-3 py-2 text-sm text-alert"
      >
        {technicalErrorLine(aggressivityLevel)}
      </div>
      <Link
        href="/"
        className="rounded-md bg-alert px-4 py-2 font-display text-xs uppercase tracking-wide text-[oklch(0.15_0.02_55)]"
      >
        Réessayer
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Passer le niveau depuis `app/page.tsx` quand le profil est disponible**

Ligne 26 (échec du fetch profil lui-même, pas de niveau disponible) : **ne pas modifier**, `<ArenaError />` reste tel quel (fallback `sparring`).

Lignes 50-52 et 62-64 (échec du fetch tasks/overdueTasks, le profil EST disponible) : remplacer chacune des deux occurrences de :

```tsx
    return <ArenaError />;
```

par :

```tsx
    return <ArenaError aggressivityLevel={profile.aggressivity_level} />;
```

- [ ] **Step 3: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur

- [ ] **Step 4: Commit**

```bash
git add components/combat/ArenaError.tsx app/page.tsx
git commit -m "feat: branche le niveau d'agressivité sur ArenaError"
```

---

## Task 14: Server action `updateAggressivityLevel`

**Files:**
- Modify: `app/actions/profile.ts`

**Interfaces:**
- Produces (consommé par Task 15 et Task 16) : `updateAggressivityLevel(level: AggressivityLevel): Promise<{ error: string | null }>`

- [ ] **Step 1: Ajouter la fonction**

Dans `app/actions/profile.ts`, après l'import existant, ajouter :

```ts
import type { AggressivityLevel } from "@/types";
```

À la fin du fichier, ajouter :

```ts
// US-54 : réglage modifiable à tout moment (onboarding ou QG), pas de contrainte
// one-shot contrairement au pseudo.
export async function updateAggressivityLevel(
  level: AggressivityLevel,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const { error } = await supabase
    .from("profiles")
    .update({ aggressivity_level: level })
    .eq("id", user.id);

  if (error) return { error: "Le dojo n'a pas pu enregistrer ton réglage. Réessaie." };
  return { error: null };
}
```

- [ ] **Step 2: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur

- [ ] **Step 3: Commit**

```bash
git add app/actions/profile.ts
git commit -m "feat: server action updateAggressivityLevel"
```

---

## Task 15: Section QG — réglage à tout moment

**Files:**
- Create: `components/qg/AggressivityLevelSection.tsx`
- Modify: `app/qg/page.tsx:22-53`

**Interfaces:**
- Consumes: `updateAggressivityLevel` (Task 14), `AggressivityLevel` (Task 1).

- [ ] **Step 1: Créer le composant**

```tsx
// components/qg/AggressivityLevelSection.tsx
"use client";

import { useState, useTransition } from "react";
import type { AggressivityLevel } from "@/types";
import { updateAggressivityLevel } from "@/app/actions/profile";

interface AggressivityLevelSectionProps {
  initialLevel: AggressivityLevel;
}

const LEVELS: Array<{ value: AggressivityLevel; name: string; description: string }> = [
  { value: "sensei", name: "Sensei", description: "Philosophe, zen." },
  { value: "sparring", name: "Sparring", description: "Franc-parler, équilibré." },
  { value: "street", name: "Street", description: "Arcade, sans filtre." },
];

// US-54 : jauge d'agressivité (Dojo Gauge), réglable à tout moment depuis le
// QG — même sélecteur à 3 cartes que l'onboarding.
export default function AggressivityLevelSection({ initialLevel }: AggressivityLevelSectionProps) {
  const [level, setLevel] = useState<AggressivityLevel>(initialLevel);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function select(next: AggressivityLevel) {
    const previous = level;
    setLevel(next);
    setError(null);
    startTransition(async () => {
      const result = await updateAggressivityLevel(next);
      if (result.error) {
        setLevel(previous);
        setError(result.error);
      }
    });
  }

  return (
    <section className="flex w-full max-w-sm flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <p className="font-display text-xs uppercase tracking-wide text-muted">Dojo Gauge</p>
      <div className="grid grid-cols-3 gap-2">
        {LEVELS.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={isPending}
            onClick={() => select(option.value)}
            aria-pressed={level === option.value}
            className={`flex flex-col gap-1 rounded-md border px-2 py-2 text-left text-xs disabled:opacity-50 ${
              level === option.value ? "border-hp text-ink" : "border-border text-muted"
            }`}
          >
            <span className="font-display uppercase tracking-wide">{option.name}</span>
            <span className="text-[0.65rem] text-faint">{option.description}</span>
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-xs text-alert">
          {error}
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Ajouter la colonne à la requête du QG et monter le composant**

Dans `app/qg/page.tsx`, ligne 23, ajouter `aggressivity_level` à la sélection :

```ts
    .select("best_streak, timezone, webhook_token_hash, webhook_token_last_used_at, aggressivity_level")
```

Ajouter l'import (après ligne 10) :

```ts
import AggressivityLevelSection from "@/components/qg/AggressivityLevelSection";
```

Monter le composant après `<InstallCta />` (ligne 45) :

```tsx
      <AggressivityLevelSection initialLevel={profile?.aggressivity_level ?? "sparring"} />
```

- [ ] **Step 3: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur

- [ ] **Step 4: Commit**

```bash
git add components/qg/AggressivityLevelSection.tsx app/qg/page.tsx
git commit -m "feat: réglage de la jauge d'agressivité au QG (US-54)"
```

---

## Task 16: Étape onboarding "agressivité"

**Files:**
- Modify: `app/onboarding/OnboardingFlow.tsx`
- Modify: `app/onboarding/actions.ts`

**Interfaces:**
- Consumes: `AggressivityLevel` (Task 1).
- Produces: `createProfile` persiste `aggressivity_level` choisi (fallback `sparring`).

- [ ] **Step 1: Étendre le state machine de `OnboardingFlow.tsx`**

Modifier la ligne 12 :

```ts
  const [step, setStep] = useState<"pseudo" | "avatar" | "agressivite">("pseudo");
```

Ajouter un état pour le niveau choisi, après la ligne `const [starterId, setStarterId] = useState(DEFAULT_HERO_ID);` (ligne 14) :

```ts
  const [aggressivityLevel, setAggressivityLevel] = useState<"sensei" | "sparring" | "street">(
    "sparring",
  );
```

- [ ] **Step 2: Modifier la navigation de l'étape "avatar"**

Remplacer le bouton de soumission de l'étape avatar (lignes 69-84) — le bouton "Retour" reste, mais le bouton final devient un passage à l'étape suivante plutôt qu'un submit direct :

```tsx
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setStep("pseudo")}
          className="rounded-md border border-border px-3 py-2 text-xs uppercase tracking-wide text-muted"
        >
          Retour
        </button>
        <button
          type="button"
          onClick={() => setStep("agressivite")}
          className="flex-1 rounded-md bg-hp px-4 py-2 font-display uppercase tracking-wide text-ink"
        >
          Continuer
        </button>
      </div>
```

Retirer `<form action={formAction} ...>` de l'étape avatar (elle devient un simple `<div>`, le vrai `<form>` de soumission passe à l'étape "agressivite") : remplacer l'ouverture (ligne 56) `<form action={formAction} className="flex w-full max-w-xs flex-col gap-4">` par `<div className="flex w-full max-w-xs flex-col gap-4">`, et sa fermeture (ligne 85) `</form>` par `</div>`. Retirer aussi le bloc `{state.error && (...)}` de cette étape (il se déplace à l'étape suivante, seule à soumettre désormais) — supprimer les lignes 64-68.

- [ ] **Step 3: Ajouter l'étape "agressivite" (nouveau bloc, avant le dernier `return`)**

Ajouter, après le `return` de l'étape "avatar" et avant le dernier `}` du composant :

```tsx
  return (
    <form action={formAction} className="flex w-full max-w-xs flex-col gap-4">
      <input type="hidden" name="username" value={trimmed} readOnly />
      <input type="hidden" name="starterId" value={starterId} readOnly />
      <input type="hidden" name="aggressivityLevel" value={aggressivityLevel} readOnly />
      <input ref={tzRef} type="hidden" name="timezone" defaultValue="UTC" />
      <p className="text-center text-xs uppercase tracking-wide text-faint">
        Le ton du Dojo, {trimmed}
      </p>
      <div className="grid grid-cols-1 gap-2">
        {(
          [
            { value: "sensei" as const, name: "Sensei", description: "Philosophe, zen." },
            { value: "sparring" as const, name: "Sparring", description: "Franc-parler, équilibré." },
            { value: "street" as const, name: "Street", description: "Arcade, sans filtre." },
          ]
        ).map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setAggressivityLevel(option.value)}
            aria-pressed={aggressivityLevel === option.value}
            className={`flex flex-col gap-1 rounded-md border px-3 py-2 text-left text-sm ${
              aggressivityLevel === option.value ? "border-hp text-ink" : "border-border text-muted"
            }`}
          >
            <span className="font-display uppercase tracking-wide">{option.name}</span>
            <span className="text-xs text-faint">{option.description}</span>
          </button>
        ))}
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-alert">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setStep("avatar")}
          className="rounded-md border border-border px-3 py-2 text-xs uppercase tracking-wide text-muted"
        >
          Retour
        </button>
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-md bg-hp px-4 py-2 font-display uppercase tracking-wide text-ink disabled:opacity-50"
        >
          {pending ? "…" : "Entrer dans l'Arène"}
        </button>
      </div>
    </form>
  );
}
```

(Ce bloc remplace le dernier `return (...)` existant du fichier — l'étape "avatar" garde son propre `return` séparé plus haut, désormais un simple `<div>` non-soumissif comme modifié au Step 2.)

- [ ] **Step 4: Persister le champ dans `createProfile`**

Dans `app/onboarding/actions.ts`, ajouter après la ligne 17 (`const starterId = ...`) :

```ts
  const aggressivityLevelRaw = String(formData.get("aggressivityLevel") ?? "sparring").trim();
  const aggressivityLevel: "sensei" | "sparring" | "street" = (
    ["sensei", "sparring", "street"] as const
  ).includes(aggressivityLevelRaw as "sensei" | "sparring" | "street")
    ? (aggressivityLevelRaw as "sensei" | "sparring" | "street")
    : "sparring";
```

Ajouter le champ à l'insert (ligne 36-41) :

```ts
  const { error } = await supabase.from("profiles").insert({
    id: user.id,
    username,
    timezone,
    equipped_hero_id: starterId,
    aggressivity_level: aggressivityLevel,
  });
```

- [ ] **Step 5: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur

- [ ] **Step 6: Vérification manuelle du tunnel onboarding**

Run: `npm run dev`, ouvrir `/welcome`, créer un compte de test, vérifier que l'étape "Le ton du Dojo" apparaît entre l'avatar et l'entrée dans l'Arène, que le choix est bien persisté (`profiles.aggressivity_level` en base) et que le bouton "Retour" ramène à l'étape avatar sans perdre le pseudo.
Expected: les 3 étapes s'enchaînent, le profil créé porte le niveau choisi.

- [ ] **Step 7: Commit**

```bash
git add app/onboarding/OnboardingFlow.tsx app/onboarding/actions.ts
git commit -m "feat: étape de choix du niveau d'agressivité à l'onboarding (US-54)"
```

---

## Task 17: Section Guide utilisateur — Dojo Gauge

**Files:**
- Modify: `content/guide.json`

**Interfaces:**
- Aucune (contenu statique, pas de code).

- [ ] **Step 1: Ajouter la section au guide**

Dans `content/guide.json`, ajouter un nouvel objet à la fin du tableau `sections` (après la section `"gemini"`, avant le `]` fermant), et mettre à jour `updatedAt` :

Remplacer la ligne 2 :

```json
  "updatedAt": "2026-07-23",
```

Remplacer la fin du fichier (après la section `"gemini"`, ligne 146 `    }` avant `  ]`) en ajoutant une virgule et la nouvelle section :

```json
    },
    {
      "id": "agressivite",
      "title": "Régler le ton du Dojo",
      "blocks": [
        { "type": "p", "text": "Le Sensei et le Boss adaptent leur ton à ta préférence : réglable dès l'onboarding, modifiable à tout moment dans la section « Dojo Gauge » du QG." },
        { "type": "ul", "items": ["Sensei : philosophe et zen, jamais de juron", "Sparring : franc-parler, le ton par défaut de Dodojo", "Street : arcade et sans filtre, jurons et piques assumés — toujours dirigés contre le Boss ou la situation, jamais contre toi"] }
      ]
    }
  ]
}
```

- [ ] **Step 2: Valider le JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('content/guide.json', 'utf8')); console.log('OK')"`
Expected: `OK`

- [ ] **Step 3: Vérifier les tests du guide**

Run: `npx vitest run lib/guide.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add content/guide.json
git commit -m "docs: section Manuel du Dojo pour le réglage du ton (Dojo Gauge)"
```

---

## Task 18: Audit #49 — table exhaustive + dictionnaire des notions

**Files:**
- Create: `docs/superpowers/specs/2026-07-23-audit-textes-dictionnaire.md`

**Interfaces:** Aucune (document interne, non exposé en UI — cf. décision de portée du design).

- [ ] **Step 1: Écrire le document d'audit**

```markdown
# Audit des textes & dictionnaire des notions — Dodojo (US-49)

> Date : 2026-07-23
> Statut : Livrable interne, non exposé en UI. Base pour une revue produit marketing du ton, hors périmètre de ce document.

## 1. Table des textes "voix" (Sensei/Boss) — migrés vers `lib/copy/`

| Scénario | Voix | Ancien emplacement | Nouveau (`lib/copy/`) |
|---|---|---|---|
| Écran vide (aucune tâche) | Sensei | `components/combat/Arena.tsx` (empty state) | `lib/copy/combat.ts` (`emptyStateTitle`/`emptyStateBody`) |
| Level Up | Sensei | `components/combat/LevelUpOverlay.tsx` | `lib/copy/combat.ts` (`levelUpTitle`/`levelUpBody`) |
| Perfect / K.O. / Premier sang | Sensei | `components/combat/PerfectOverlay.tsx` | `lib/copy/combat.ts` (`koHeader`/`koLine`) |
| Palier de série au K.O. | Sensei | `components/combat/PerfectOverlay.tsx` | `lib/copy/combat.ts` (`milestoneLine`) |
| Rituel du Réveil (sous-titre) | Sensei | `components/combat/WakeUpRitual.tsx` | `lib/copy/rituals.ts` (`wakeUpSubtitle`) |
| Rituel du Crépuscule (victoire/retraite) | Sensei | `components/combat/CrepusculeRecap.tsx` | `lib/copy/rituals.ts` (`crepusculeHeader`/`crepusculeLine`) |
| Confirmation Rage Quit | Sensei | `components/combat/Arena.tsx` | `lib/copy/rage-quit.ts` (`rageQuitConfirmBody`) |
| Ricanement Rage Quit (undo) | Boss | `components/combat/Arena.tsx` | `lib/copy/rage-quit.ts` (`rageQuitPunchline`) |
| Attaque Surprise (deadline ratée) | Boss | `components/combat/Arena.tsx` | `lib/copy/deadline.ts` (`deadlineAlertLine`) |
| Erreur technique (Arène) | Sensei | `components/combat/ArenaError.tsx` | `lib/copy/errors.ts` (`technicalErrorLine`) |
| Notifications de rappel (4 gabarits) | Boss | `lib/push-copy.ts` | `lib/copy/notifications.ts` (`buildReminderPayload`) |

## 2. Chrome UI neutre — recensé, non leveled (décision de portée du design)

| Fichier | Exemples | Justification |
|---|---|---|
| `components/combat/WakeUpRitual.tsx` | "Tout reporter", "Terminé", "Reporter", "Annihiler" | Labels d'action fonctionnels, pas de ton narratif |
| `components/combat/ArenaError.tsx` | "Réessayer" | Label neutre |
| `components/combat/CrepusculeRecap.tsx` | "Continuer", libellés de la carte de score ("Dégâts", "Monstres vaincus"...) | Chrome de carte de score, pas de voix |
| `components/combat/PerfectOverlay.tsx` | "🌙 Rituel du Crépuscule", "Continuer le combat" | Labels de CTA |
| `components/combat/ArenaCoach.tsx` | "Passer" | Label neutre |
| `components/qg/PushReminderToggle.tsx`, `WebhookTokenSection.tsx` | Libellés de formulaire/toggle | Paramétrage technique, pas narratif |
| `app/onboarding/OnboardingFlow.tsx` | "Continuer", "Retour", labels de champ | Navigation de formulaire |
| `lib/game-engine.ts` (`comboLabel`) | "DOUBLE COUP !", "COMBO ×N" | Juice arcade visuel, absent de la matrice de ton fournie dans #54, non concerné |

## 3. Dictionnaire des notions

| Notion | Texte vu par l'utilisateur | Définition / usage |
|---|---|---|
| Rituel du Réveil | "Rituel du Réveil" (overlay bloquant) | Traite au démarrage les tâches non résolues de la veille (Terminé / Reporter / Annihiler), avant tout accès à l'Arène. |
| Rituel du Crépuscule | "🌙 Rituel du Crépuscule" / "Crépuscule" | Clôture cérémonielle non-bloquante de la journée ; calcule et persiste le `day_result` (victoire/retraite). |
| Rage Quit | "Rage Quit ?" (confirmation), "Le Boss ricane" | Abandon punitif d'une tâche active en cours de journée : −5 XP, cascade sur les sous-tâches actives, annulable le jour même. |
| Annihiler | "Annihiler" | Nettoyage serein d'un reste au Réveil (`is_abandoned=true`, `abandon_reason="annihilated"`) — sans malus, distinct du Rage Quit. |
| Perfect | "Perfect !" | K.O. du Boss sans qu'aucune deadline/reste n'ait entamé le Héros. |
| K.O. | "K.O. !" | Boss vaincu, mais le Héros a subi des dégâts (deadlines ratées/retards) avant le coup final. |
| Combo | "COMBO ×N" | Compteur visuel de tâches terminées à la chaîne ; purement décoratif, n'affecte ni XP ni or. |
| Attaque Surprise | "⏰ Attaque Surprise" | Le Boss inflige −10 HP au Héros quand une deadline horaire est franchie sans être résolue. |
| Dojo Gauge | "Dojo Gauge" (QG), "Le ton du Dojo" (onboarding) | Réglage à 3 niveaux (Sensei/Sparring/Street) du ton du Sensei et du Boss dans toute l'app. |
| Panthéon | "🏆 Le Panthéon" | Écran lecture seule des statistiques agrégées (streaks, or, titres, journal de combat). |
| Échoppe | "🛒 L'Échoppe" | Boutique de héros (et tenues) débloquables avec l'or gagné en clôturant des journées. |
| Manuel du Dojo | "📖 Manuel du Dojo" | Guide utilisateur in-app (barème, rituels, streaks, or, Échoppe, roster). |
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-07-23-audit-textes-dictionnaire.md
git commit -m "docs: audit des textes + dictionnaire des notions (US-49)"
```

---

## Task 19: CHANGELOG + CLAUDE.md

**Files:**
- Modify: `CHANGELOG.md:10`
- Modify: `CLAUDE.md` (section "Pièges et décisions non-évidentes")

**Interfaces:** Aucune.

- [ ] **Step 1: Ajouter l'entrée CHANGELOG**

Dans `CHANGELOG.md`, après la ligne `### Produit` (ligne 12), ajouter en tête de liste :

```markdown
- US-49/US-54 : Jauge d'agressivité (Dojo Gauge) réglable à tout moment (Sensei/Sparring/Street), réglable dès l'onboarding et modifiable au QG — pilote le ton du Sensei et du Boss sur tous les scénarios "voix" de l'app (heal, Perfect/K.O., rituels, Rage Quit, Attaque Surprise, notifications, erreurs). Registre de copy centralisé `lib/copy/` + audit interne exhaustif des textes de l'app.
```

- [ ] **Step 2: Ajouter l'entrée CLAUDE.md**

À la fin de la section "Pièges et décisions non-évidentes" (juste avant `## URL de production`), ajouter :

```markdown
**Jauge d'agressivité (Dojo Gauge) & registre de copy (US-49/US-54)** — Tous les textes "voix" (narration Sensei + répliques Boss) sont centralisés dans `lib/copy/` (un fichier pur par domaine : `combat.ts`, `rituals.ts`, `rage-quit.ts`, `deadline.ts`, `errors.ts`, `notifications.ts`), chaque scénario exportant une fonction `(level, args) => string` sur `AggressivityLevel = "sensei" | "sparring" | "street"` (`types/index.ts`, colonne `profiles.aggressivity_level`, défaut `sparring`). **Seuls les textes "voix" sont leveled** — le chrome UI neutre (labels de boutons, placeholders) reste inline, non concerné, recensé mais pas migré (cf. audit `docs/superpowers/specs/2026-07-23-audit-textes-dictionnaire.md`). Le texte `sparring` de chaque scénario est **exactement le texte de production préexistant** — aucune réécriture silencieuse du ton par défaut à l'introduction des niveaux. Règle des jurons **révisée** par rapport à la spec initiale du 2026-07-08 : `sensei`/`sparring` gardent le dosage historique (trio putain/bordel/enfoiré, réservé aux pics émotionnels réels) ; `street` **override** cette règle (jurons/registre cru autorisés même sur actions routinières type empty state/erreur technique) et **élargit le vocabulaire** (`merde`/`con`/`connard`/`foutre` en plus du trio) — mais le garde-fou reste inchangé à tous les niveaux : jamais d'attaque personnelle réelle contre le joueur, aucune insulte sexuelle/raciste. Réglable dès l'onboarding (nouvelle étape entre avatar et soumission) et à tout moment via la section « Dojo Gauge » du QG (`updateAggressivityLevel`, `app/actions/profile.ts`) — pas de contrainte one-shot comme le pseudo. Le dictionnaire des notions de l'app (Rituel du Réveil, Rage Quit, Perfect, Combo...) produit pour l'audit #49 est un **document interne**, jamais exposé en UI ni ajouté au Guide (seule l'existence du réglage Dojo Gauge lui-même est documentée dans le Manuel du Dojo, section « Régler le ton du Dojo »).
```

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md CLAUDE.md
git commit -m "docs: CHANGELOG + CLAUDE.md pour la jauge d'agressivité (US-49/US-54)"
```

---

## Self-Review (fait au moment d'écrire ce plan)

**Couverture spec :**
- Modèle de données → Task 1.
- Registre `lib/copy/` par domaine → Tasks 2-7.
- Règle des jurons révisée → intégrée dans chaque module de copy (Tasks 2-7) + documentée (Task 19).
- Boss variant aussi selon le niveau → Tasks 4 (rage-quit), 5 (deadline), 7 (notifications) portent des voix Boss.
- Onboarding → Task 16.
- Réglage à tout moment (QG) → Tasks 14-15.
- Audit + dictionnaire → Task 18.
- Doc utilisateur du Guide (nouvelle feature visible, convention CLAUDE.md) → Task 17.
- CHANGELOG + CLAUDE.md → Task 19.

**Aucun placeholder** : chaque étape de code contient le texte réel, pas de TBD.

**Cohérence des types** : `AggressivityLevel` défini une seule fois (Task 1, `types/index.ts`), réimporté à l'identique (`../../types` en `lib/`, `@/types` en `app/`/`components/`) dans toutes les tâches suivantes — noms de fonctions (`emptyStateTitle`, `koLine`, `crepusculeLine`, `rageQuitPunchline`, `deadlineAlertLine`, `technicalErrorLine`, `buildReminderPayload`) cohérents entre leur définition (Tasks 2-7) et leur usage (Tasks 8-13).

**Portée** : chantier unique combinant #49/#54 sans sous-découpage supplémentaire — cohérent avec la décision de brainstorming ("un seul chantier combiné").
