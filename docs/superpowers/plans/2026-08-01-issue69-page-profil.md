# Page Profil (issue #69) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Créer `/vestiaire/profil`, hub centralisé des réglages de compte (pseudo, titre équipé, timezone, mot de passe, email, Volume Intérieur, Planifier Demain, intégrations, déconnexion), en déplaçant plusieurs sections déjà existantes hors du Vestiaire.

**Architecture:** Une nouvelle route Server Component (`app/vestiaire/profil/page.tsx`) qui fetch le profil et assemble des petits composants client autonomes (1 composant = 1 réglage, pattern déjà en place pour `AggressivityLevelSection`/`PlanTomorrowSection`). Le Vestiaire (`app/vestiaire/page.tsx`) redevient un pur hub de navigation.

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions), Supabase (auth + Postgres), Tailwind v4, TypeScript strict, Vitest.

## Global Constraints

- TypeScript strict : jamais de `any`, tout type explicite.
- Toute communication utilisateur (labels, messages d'erreur) en français.
- Commits Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`).
- `BottomNav` : la clé de l'onglet Vestiaire est `"qg"` (legacy), pas `"vestiaire"` — `components/ui/BottomNav.tsx:3`.
- Aucune policy DELETE à toucher ici (pas de mutation de tâches).
- Le spec de référence est `docs/superpowers/specs/2026-08-01-issue69-page-profil-design.md` (déjà posté en commentaire sur l'issue #69).
- **Portée des tests** : seuls les server actions (`app/actions/profile.ts`) et la logique pure (`EquippedTitlePreview`) ont des tests dédiés dans ce plan — cohérent avec l'existant (`AggressivityLevelSection`/`PlanTomorrowSection` n'ont pas de test dédié ; seul `PushReminderToggle` en a un, pour sa logique async non triviale). Les nouveaux composants de formulaire (Username/Timezone/Password/Email/Logout) suivent ce même patron, pas de test ajouté.
- Avant toute PR : `npm run lint`, `npm test`, `npx tsc --noEmit`, `npm run build` doivent passer localement (règle projet, cf. CLAUDE.md « Workflow Git »).

---

## File Structure

- Modify: `app/actions/profile.ts` — ajoute `updateUsername`, `updateTimezone`.
- Create: `app/actions/profile.test.ts` — tests des 2 nouvelles actions.
- Create: `components/qg/UsernameSection.tsx` — édition pseudo.
- Create: `components/qg/EquippedTitlePreview.tsx` — aperçu lecture-seule du titre équipé + lien.
- Create: `components/qg/EquippedTitlePreview.test.tsx` — tests de la résolution de libellé.
- Create: `components/qg/TimezoneSection.tsx` — édition fuseau horaire.
- Create: `components/qg/PasswordSection.tsx` — changement mot de passe (client-side, reconfirmation).
- Create: `components/qg/EmailSection.tsx` — changement email (client-side, reconfirmation, double confirmation Supabase).
- Create: `components/qg/LogoutSection.tsx` — déconnexion.
- Create: `app/vestiaire/profil/page.tsx` — assemble toutes les sections.
- Create: `app/vestiaire/profil/loading.tsx` — squelette de chargement.
- Modify: `app/vestiaire/page.tsx` — retire les sections déplacées, ajoute le lien Profil.

`app/vestiaire/error.tsx` existe déjà et est générique (pas de contexte spécifique à une page) : Next.js le réutilise automatiquement pour `/vestiaire/profil` sans rien créer de nouveau.

---

### Task 1: Server actions `updateUsername` / `updateTimezone`

**Files:**
- Modify: `app/actions/profile.ts`
- Test: `app/actions/profile.test.ts` (create)

**Interfaces:**
- Produces: `updateUsername(username: string): Promise<{ error: string | null }>`
- Produces: `updateTimezone(timezone: string): Promise<{ error: string | null }>`

- [ ] **Step 1: Write the failing tests**

Create `app/actions/profile.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

type UpdatePatch = Record<string, unknown>;

let updateCalls: UpdatePatch[] = [];
let shouldError = false;
let currentUser: { id: string } | null = { id: "u1" };

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: currentUser } }),
    },
    from: () => ({
      update: (patch: UpdatePatch) => {
        updateCalls.push(patch);
        return {
          eq: () => Promise.resolve({ error: shouldError ? new Error("boom") : null }),
        };
      },
    }),
  }),
}));

beforeEach(() => {
  updateCalls = [];
  shouldError = false;
  currentUser = { id: "u1" };
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("updateUsername", () => {
  test("rejette un pseudo vide sans appeler Supabase", async () => {
    const { updateUsername } = await import("./profile");
    const result = await updateUsername("   ");
    expect(result.error).toMatch(/pseudo/i);
    expect(updateCalls.length).toBe(0);
  });

  test("rejette un pseudo de plus de 24 caractères", async () => {
    const { updateUsername } = await import("./profile");
    const result = await updateUsername("a".repeat(25));
    expect(result.error).toBeTruthy();
    expect(updateCalls.length).toBe(0);
  });

  test("enregistre un pseudo valide, trim appliqué", async () => {
    const { updateUsername } = await import("./profile");
    const result = await updateUsername("  Ryu  ");
    expect(result.error).toBeNull();
    expect(updateCalls).toEqual([{ username: "Ryu" }]);
  });

  test("retourne une erreur générique si Supabase échoue", async () => {
    shouldError = true;
    const { updateUsername } = await import("./profile");
    const result = await updateUsername("Ryu");
    expect(result.error).toMatch(/Réessaie/);
  });

  test("retourne une erreur si la session est expirée", async () => {
    currentUser = null;
    const { updateUsername } = await import("./profile");
    const result = await updateUsername("Ryu");
    expect(result.error).toMatch(/Session expirée/);
    expect(updateCalls.length).toBe(0);
  });
});

describe("updateTimezone", () => {
  test("rejette un fuseau horaire inconnu", async () => {
    const { updateTimezone } = await import("./profile");
    const result = await updateTimezone("Mars/Olympus_Mons");
    expect(result.error).toMatch(/invalide/i);
    expect(updateCalls.length).toBe(0);
  });

  test("enregistre un fuseau IANA valide", async () => {
    const { updateTimezone } = await import("./profile");
    const result = await updateTimezone("Europe/Paris");
    expect(result.error).toBeNull();
    expect(updateCalls).toEqual([{ timezone: "Europe/Paris" }]);
  });

  test("retourne une erreur générique si Supabase échoue", async () => {
    shouldError = true;
    const { updateTimezone } = await import("./profile");
    const result = await updateTimezone("Europe/Paris");
    expect(result.error).toMatch(/Réessaie/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/actions/profile.test.ts`
Expected: FAIL — `updateUsername`/`updateTimezone` not exported from `./profile`.

- [ ] **Step 3: Implement `updateUsername` and `updateTimezone`**

Append to `app/actions/profile.ts` (le fichier existe déjà avec `markTutorialSeen`, `updateAggressivityLevel`, `updatePlanTomorrowAfterHour` — ajouter à la suite) :

```ts
const MAX_USERNAME_LENGTH = 24;

// Issue #69 : pseudo éditable à tout moment depuis Le Profil (fixé une seule
// fois à l'onboarding jusqu'ici). Pas de contrainte d'unicité (aucune en
// base sur profiles.username). Cap à 24 caractères : aligné sur la
// troncature défensive déjà faite côté affichage (lib/share-card.ts).
export async function updateUsername(username: string): Promise<{ error: string | null }> {
  const trimmed = username.trim();
  if (!trimmed) {
    return { error: "Un pseudo, ça se choisit. Tape quelque chose." };
  }
  if (trimmed.length > MAX_USERNAME_LENGTH) {
    return { error: `Le pseudo ne peut pas dépasser ${MAX_USERNAME_LENGTH} caractères.` };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const { error } = await supabase.from("profiles").update({ username: trimmed }).eq("id", user.id);
  if (error) return { error: "Dodojo n'a pas pu enregistrer ton pseudo. Réessaie." };
  return { error: null };
}

// Issue #69 : fuseau horaire éditable à tout moment (fixé une seule fois à
// l'onboarding jusqu'ici, via Intl côté navigateur). Valide contre la même
// liste IANA que le sélecteur (Intl.supportedValuesOf, dispo Node ≥18).
export async function updateTimezone(timezone: string): Promise<{ error: string | null }> {
  if (!Intl.supportedValuesOf("timeZone").includes(timezone)) {
    return { error: "Fuseau horaire invalide." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const { error } = await supabase.from("profiles").update({ timezone }).eq("id", user.id);
  if (error) return { error: "Dodojo n'a pas pu enregistrer ton fuseau. Réessaie." };
  return { error: null };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/actions/profile.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add app/actions/profile.ts app/actions/profile.test.ts
git commit -m "feat: pseudo et fuseau horaire éditables depuis le profil (#69)"
```

---

### Task 2: `UsernameSection`

**Files:**
- Create: `components/qg/UsernameSection.tsx`

**Interfaces:**
- Consumes: `updateUsername(username: string): Promise<{ error: string | null }>` (Task 1)
- Produces: `<UsernameSection initialUsername={string} />` — rendu, pas de valeur retournée pour les tâches suivantes.

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useState, useTransition } from "react";
import { updateUsername } from "@/app/actions/profile";

interface UsernameSectionProps {
  initialUsername: string;
}

const MAX_LENGTH = 24;

// Issue #69 : édition du pseudo, jusqu'ici fixé une seule fois à l'onboarding.
// Save explicite (pas de save-on-blur) pour laisser le temps de corriger une
// faute de frappe avant l'appel serveur.
export default function UsernameSection({ initialUsername }: UsernameSectionProps) {
  const [username, setUsername] = useState(initialUsername);
  const [saved, setSaved] = useState(initialUsername);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    const trimmed = username.trim();
    if (!trimmed) {
      setError("Un pseudo, ça se choisit. Tape quelque chose.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updateUsername(trimmed);
      if (result.error) {
        setError(result.error);
        setUsername(saved);
      } else {
        setSaved(trimmed);
        setUsername(trimmed);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="profil-username" className="text-xs text-muted">
        Pseudo
      </label>
      <div className="flex items-center gap-2">
        <input
          id="profil-username"
          type="text"
          value={username}
          maxLength={MAX_LENGTH}
          disabled={isPending}
          onChange={(event) => setUsername(event.target.value)}
          className="flex-1 rounded border border-border bg-transparent px-2 py-1 text-sm text-ink disabled:opacity-50"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending || username.trim() === saved}
          className="rounded bg-hp px-3 py-1 text-xs uppercase tracking-wide text-ink disabled:opacity-40"
        >
          Enregistrer
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-alert">
          {error}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: aucune nouvelle erreur.

- [ ] **Step 3: Commit**

```bash
git add components/qg/UsernameSection.tsx
git commit -m "feat: composant UsernameSection (#69)"
```

---

### Task 3: `EquippedTitlePreview`

**Files:**
- Create: `components/qg/EquippedTitlePreview.tsx`
- Test: `components/qg/EquippedTitlePreview.test.tsx`

**Interfaces:**
- Consumes: `ALL_ACHIEVEMENT_DEFS: AchievementDef[]` (`lib/achievements.ts`, déjà exporté — `AchievementDef.code: string`, `AchievementDef.title: string`).
- Produces: `<EquippedTitlePreview titleCode={string | null} />`.

- [ ] **Step 1: Write the failing test**

Create `components/qg/EquippedTitlePreview.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import EquippedTitlePreview from "./EquippedTitlePreview";

afterEach(cleanup);

describe("EquippedTitlePreview", () => {
  test("affiche 'Aucun titre équipé' quand titleCode est null", () => {
    render(<EquippedTitlePreview titleCode={null} />);
    expect(screen.getByText(/Aucun titre équipé/)).toBeInTheDocument();
  });

  test("affiche 'Aucun titre équipé' quand le code est inconnu du catalogue", () => {
    render(<EquippedTitlePreview titleCode="code-inexistant-xyz" />);
    expect(screen.getByText(/Aucun titre équipé/)).toBeInTheDocument();
  });

  test("résout le libellé du titre depuis le catalogue (ex: streak 7 jours 'Calme')", () => {
    render(<EquippedTitlePreview titleCode="streak_7" />);
    expect(screen.getByText(/Calme/)).toBeInTheDocument();
  });

  test("affiche toujours un lien vers /tableau-de-chasse/succes", () => {
    render(<EquippedTitlePreview titleCode={null} />);
    expect(screen.getByRole("link", { name: /Changer/ })).toHaveAttribute(
      "href",
      "/tableau-de-chasse/succes",
    );
  });
});
```

> Note pour l'implémenteur : vérifier le `code` exact du succès "Calme" (palier streak 7 jours) dans `lib/achievements.ts` avant de lancer le test — si le code diffère de `streak_7`, ajuster le test en conséquence (grep `"Calme"` dans `lib/achievements.ts` pour trouver le code réel).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/qg/EquippedTitlePreview.test.tsx`
Expected: FAIL — le module `./EquippedTitlePreview` n'existe pas encore.

- [ ] **Step 3: Implement the component**

```tsx
import Link from "next/link";
import { ALL_ACHIEVEMENT_DEFS } from "@/lib/achievements";

interface EquippedTitlePreviewProps {
  titleCode: string | null;
}

// Issue #69 : aperçu lecture seule du titre équipé (affiché à côté du pseudo
// dans l'Arène, cf. VersusScene). Le vrai picker (radiogroup, issue #153)
// reste exclusivement sur /tableau-de-chasse/succes — il a besoin du
// catalogue complet des succès (mystère/progression, raretés), qu'on ne
// duplique pas ici. Composant pur, pas de "use client" nécessaire.
export default function EquippedTitlePreview({ titleCode }: EquippedTitlePreviewProps) {
  const label = titleCode
    ? (ALL_ACHIEVEMENT_DEFS.find((def) => def.code === titleCode)?.title ?? null)
    : null;

  return (
    <div className="flex items-center justify-between gap-2 text-sm text-ink">
      <span>Titre : {label ?? "Aucun titre équipé"}</span>
      <Link href="/tableau-de-chasse/succes" className="text-xs text-muted underline underline-offset-4">
        Changer
      </Link>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/qg/EquippedTitlePreview.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add components/qg/EquippedTitlePreview.tsx components/qg/EquippedTitlePreview.test.tsx
git commit -m "feat: aperçu du titre équipé sur le profil (#69)"
```

---

### Task 4: `TimezoneSection`

**Files:**
- Create: `components/qg/TimezoneSection.tsx`

**Interfaces:**
- Consumes: `updateTimezone(timezone: string): Promise<{ error: string | null }>` (Task 1), `useBrowserTimezone(): string` (`hooks/useBrowserTimezone.ts`, existant).
- Produces: `<TimezoneSection initialTimezone={string} />`.

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import { updateTimezone } from "@/app/actions/profile";
import { useBrowserTimezone } from "@/hooks/useBrowserTimezone";

interface TimezoneSectionProps {
  initialTimezone: string;
}

// Issue #69 : fuseau horaire éditable, jusqu'ici fixé une seule fois à
// l'onboarding. Liste déroulante native (Intl.supportedValuesOf, aucune
// liste à maintenir) + bouton Redétecter qui réutilise le hook existant.
export default function TimezoneSection({ initialTimezone }: TimezoneSectionProps) {
  const [timezone, setTimezone] = useState(initialTimezone);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const browserTimezone = useBrowserTimezone();

  const zones = useMemo(() => {
    const all = Intl.supportedValuesOf("timeZone");
    return all.includes(timezone) ? all : [timezone, ...all];
  }, [timezone]);

  function save(next: string) {
    const previous = timezone;
    setTimezone(next);
    setError(null);
    startTransition(async () => {
      const result = await updateTimezone(next);
      if (result.error) {
        setTimezone(previous);
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="profil-timezone" className="text-xs text-muted">
        Fuseau horaire
      </label>
      <div className="flex items-center gap-2">
        <select
          id="profil-timezone"
          value={timezone}
          disabled={isPending}
          onChange={(event) => save(event.target.value)}
          className="flex-1 rounded border border-border bg-transparent px-2 py-1 text-sm text-ink disabled:opacity-50"
        >
          {zones.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={isPending || browserTimezone === timezone}
          onClick={() => save(browserTimezone)}
          className="rounded border border-border px-2 py-1 text-xs text-muted disabled:opacity-40"
        >
          Redétecter
        </button>
      </div>
      <p className="text-xs text-faint">
        Change le calcul du jour en cours si tu voyages ou changes de fuseau.
      </p>
      {error && (
        <p role="alert" className="text-xs text-alert">
          {error}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: aucune nouvelle erreur.

- [ ] **Step 3: Commit**

```bash
git add components/qg/TimezoneSection.tsx
git commit -m "feat: composant TimezoneSection (#69)"
```

---

### Task 5: `PasswordSection`

**Files:**
- Create: `components/qg/PasswordSection.tsx`

**Interfaces:**
- Consumes: `createClient()` (`@/lib/supabase/client`, existant — client-side, jamais de server action pour l'auth, cf. `/login`/`/welcome`).
- Produces: `<PasswordSection />`.

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

// Issue #69 : changement de mot de passe, client-side pur (une server action
// ne propage pas le cookie de session, même contrainte que /login et
// /welcome). Reconfirmation par mot de passe actuel avant tout changement.
export default function PasswordSection() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(false);
    if (newPassword.length < 8) {
      setError("Nouveau mot de passe : 8 caractères minimum.");
      return;
    }
    setPending(true);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) {
      setError("Session expirée. Reconnecte-toi.");
      setPending(false);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (signInError) {
      setError("Mot de passe actuel incorrect.");
      setPending(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setPending(false);
    if (updateError) {
      setError("Dodojo n'a pas pu changer ton mot de passe. Réessaie.");
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setSuccess(true);
  }

  return (
    <section className="flex w-full max-w-sm flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <p className="font-display text-xs uppercase tracking-wide text-muted">Mot de passe</p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <label htmlFor="profil-current-password" className="text-xs text-muted">
          Mot de passe actuel
        </label>
        <input
          id="profil-current-password"
          type="password"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          className="rounded border border-border bg-transparent px-2 py-1 text-sm text-ink"
        />
        <label htmlFor="profil-new-password" className="text-xs text-muted">
          Nouveau mot de passe
        </label>
        <input
          id="profil-new-password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          className="rounded border border-border bg-transparent px-2 py-1 text-sm text-ink"
        />
        {error && (
          <p role="alert" className="text-xs text-alert">
            {error}
          </p>
        )}
        {success && <p className="text-xs text-hp-text">Mot de passe mis à jour.</p>}
        <button
          type="submit"
          disabled={pending}
          className="self-start rounded bg-hp px-3 py-1.5 text-xs uppercase tracking-wide text-ink disabled:opacity-50"
        >
          {pending ? "…" : "Changer le mot de passe"}
        </button>
      </form>
    </section>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: aucune nouvelle erreur.

- [ ] **Step 3: Commit**

```bash
git add components/qg/PasswordSection.tsx
git commit -m "feat: changement de mot de passe depuis le profil (#69)"
```

---

### Task 6: `EmailSection`

**Files:**
- Create: `components/qg/EmailSection.tsx`

**Interfaces:**
- Consumes: `createClient()` (`@/lib/supabase/client`).
- Produces: `<EmailSection />`.

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

// Issue #69 : changement d'email, même contrainte client-side que
// PasswordSection. ⚠️ supabase/config.toml a double_confirm_changes=true :
// Supabase exige une confirmation depuis l'ancienne ET la nouvelle adresse
// avant que le changement soit effectif — le message de succès reflète ça,
// pas un changement immédiat. À vérifier manuellement en prod avant merge
// (le config.toml local ne garantit pas la config du projet hébergé).
export default function EmailSection() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(false);
    setPending(true);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) {
      setError("Session expirée. Reconnecte-toi.");
      setPending(false);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (signInError) {
      setError("Mot de passe actuel incorrect.");
      setPending(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ email: newEmail });
    setPending(false);
    if (updateError) {
      setError("Dodojo n'a pas pu changer ton email. Réessaie.");
      return;
    }
    setCurrentPassword("");
    setNewEmail("");
    setSuccess(true);
  }

  return (
    <section className="flex w-full max-w-sm flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <p className="font-display text-xs uppercase tracking-wide text-muted">Email</p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <label htmlFor="profil-email-password" className="text-xs text-muted">
          Mot de passe actuel
        </label>
        <input
          id="profil-email-password"
          type="password"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          className="rounded border border-border bg-transparent px-2 py-1 text-sm text-ink"
        />
        <label htmlFor="profil-new-email" className="text-xs text-muted">
          Nouvel email
        </label>
        <input
          id="profil-new-email"
          type="email"
          autoComplete="email"
          required
          value={newEmail}
          onChange={(event) => setNewEmail(event.target.value)}
          className="rounded border border-border bg-transparent px-2 py-1 text-sm text-ink"
        />
        {error && (
          <p role="alert" className="text-xs text-alert">
            {error}
          </p>
        )}
        {success && (
          <p className="text-xs text-hp-text">
            Vérifie ta boîte mail actuelle et ta nouvelle adresse : clique sur les deux liens de
            confirmation pour valider le changement.
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="self-start rounded bg-hp px-3 py-1.5 text-xs uppercase tracking-wide text-ink disabled:opacity-50"
        >
          {pending ? "…" : "Changer l'email"}
        </button>
      </form>
    </section>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: aucune nouvelle erreur.

- [ ] **Step 3: Commit**

```bash
git add components/qg/EmailSection.tsx
git commit -m "feat: changement d'email depuis le profil (#69)"
```

---

### Task 7: `LogoutSection`

**Files:**
- Create: `components/qg/LogoutSection.tsx`

**Interfaces:**
- Consumes: `createClient()` (`@/lib/supabase/client`), `useRouter()` (`next/navigation`).
- Produces: `<LogoutSection />`.

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Issue #69 : aucun bouton de déconnexion n'existait nulle part dans l'app
// avant cette page (zéro signOut() dans le code, vérifié).
export default function LogoutSection() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    setPending(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <section className="flex w-full max-w-sm flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <p className="font-display text-xs uppercase tracking-wide text-muted">Compte</p>
      <button
        type="button"
        onClick={handleLogout}
        disabled={pending}
        className="self-start rounded border border-alert px-3 py-1.5 text-xs uppercase tracking-wide text-alert disabled:opacity-50"
      >
        {pending ? "…" : "Se déconnecter"}
      </button>
    </section>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: aucune nouvelle erreur.

- [ ] **Step 3: Commit**

```bash
git add components/qg/LogoutSection.tsx
git commit -m "feat: bouton de déconnexion (#69)"
```

---

### Task 8: Page `app/vestiaire/profil/page.tsx` + `loading.tsx`

**Files:**
- Create: `app/vestiaire/profil/page.tsx`
- Create: `app/vestiaire/profil/loading.tsx`

**Interfaces:**
- Consumes : tous les composants des Tasks 2-7, `AggressivityLevelSection`/`PlanTomorrowSection`/`IntegrationsSection`/`PushReminderToggle`/`WebhookTokenSection`/`GeminiConnectionSection` (existants, inchangés), `isGeminiConnected` (`@/lib/oauth-gemini`), `resolveAggressivityLevel` (`@/lib/aggressivity`).
- Produces : route `/vestiaire/profil`.

- [ ] **Step 1: Create `app/vestiaire/profil/loading.tsx`**

```tsx
// Issue #69 : état de chargement (règle projet n°3) — squelettes des 7 blocs.
export default function ProfilLoading() {
  return (
    <main className="flex flex-1 flex-col gap-3 px-4 py-6">
      <div className="skeleton h-6 w-40 self-center rounded" />
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="skeleton h-24 w-full rounded-lg" />
      ))}
    </main>
  );
}
```

- [ ] **Step 2: Create `app/vestiaire/profil/page.tsx`**

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BottomNav from "@/components/ui/BottomNav";
import BackLink from "@/components/ui/BackLink";
import UsernameSection from "@/components/qg/UsernameSection";
import EquippedTitlePreview from "@/components/qg/EquippedTitlePreview";
import TimezoneSection from "@/components/qg/TimezoneSection";
import PasswordSection from "@/components/qg/PasswordSection";
import EmailSection from "@/components/qg/EmailSection";
import AggressivityLevelSection from "@/components/qg/AggressivityLevelSection";
import PlanTomorrowSection from "@/components/qg/PlanTomorrowSection";
import IntegrationsSection from "@/components/qg/IntegrationsSection";
import PushReminderToggle from "@/components/qg/PushReminderToggle";
import WebhookTokenSection from "@/components/qg/WebhookTokenSection";
import GeminiConnectionSection from "@/components/qg/GeminiConnectionSection";
import LogoutSection from "@/components/qg/LogoutSection";
import { isGeminiConnected } from "@/lib/oauth-gemini";
import { resolveAggressivityLevel } from "@/lib/aggressivity";

export const metadata: Metadata = { title: "Profil — Dodojo" };

// Issue #69 : hub centralisé des réglages de compte. Regroupe des sections
// jusqu'ici éparpillées (Le Vestiaire) + 5 nouveaux réglages (pseudo, titre,
// timezone, mot de passe, email) + déconnexion (gap comblé, aucune n'existait).
export default async function ProfilPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: profile, error: profileError },
    geminiConnected,
    { count: subscriptionCount, error: subscriptionError },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "username, timezone, aggressivity_level, plan_tomorrow_after_hour, equipped_title_code, webhook_token_hash, webhook_token_last_used_at",
      )
      .eq("id", user.id)
      .maybeSingle(),
    isGeminiConnected(supabase, user.id),
    supabase
      .from("push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
  ]);

  if (profileError || subscriptionError) {
    throw profileError ?? subscriptionError;
  }
  if (!profile) {
    redirect("/onboarding");
  }

  return (
    <main className="screen-main gap-4 px-4 py-8">
      <BackLink href="/vestiaire" label="Retour au Vestiaire" />
      <h1 className="text-center font-display text-lg uppercase tracking-wide text-ink">Profil</h1>

      <section className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-border bg-surface p-4">
        <p className="font-display text-xs uppercase tracking-wide text-muted">Identité</p>
        <UsernameSection initialUsername={profile.username} />
        <EquippedTitlePreview titleCode={profile.equipped_title_code} />
        <TimezoneSection initialTimezone={profile.timezone} />
      </section>

      <PasswordSection />
      <EmailSection />

      <AggressivityLevelSection initialLevel={resolveAggressivityLevel(profile.aggressivity_level)} />
      <PlanTomorrowSection initialHour={profile.plan_tomorrow_after_hour ?? 18} />

      <IntegrationsSection>
        <PushReminderToggle hasSubscription={(subscriptionCount ?? 0) > 0} />
        <WebhookTokenSection
          hasToken={Boolean(profile.webhook_token_hash)}
          lastUsedAt={profile.webhook_token_last_used_at ?? null}
        />
        <GeminiConnectionSection isConnected={geminiConnected} />
      </IntegrationsSection>

      <LogoutSection />

      <BottomNav active="qg" />
    </main>
  );
}
```

- [ ] **Step 3: Manual check**

Run: `npm run dev`, naviguer sur `/vestiaire/profil` connecté. Vérifier : les 7 blocs s'affichent, pseudo/timezone modifiables et persistés après refresh, Volume Intérieur/Planifier Demain/Intégrations fonctionnent comme avant (juste déplacés), déconnexion renvoie vers `/login`.

- [ ] **Step 4: Commit**

```bash
git add app/vestiaire/profil/page.tsx app/vestiaire/profil/loading.tsx
git commit -m "feat: page Profil /vestiaire/profil (#69)"
```

---

### Task 9: Nettoyage `app/vestiaire/page.tsx`

**Files:**
- Modify: `app/vestiaire/page.tsx`

**Interfaces:**
- Consumes : rien de nouveau — retire des imports/usages existants.

- [ ] **Step 1: Remplacer le contenu de `app/vestiaire/page.tsx`**

Nouveau contenu complet (remplace le fichier existant) :

```tsx
import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentStreak, dayKey } from "@/lib/game-engine";
import StreakBadge from "@/components/combat/StreakBadge";
import InstallCta from "@/components/pwa/InstallCta";
import BottomNav from "@/components/ui/BottomNav";

export const metadata: Metadata = { title: "Le Vestiaire — Dodojo" };

// Issue #69 : redevient un pur hub de navigation — les réglages de compte
// (Volume Intérieur, Planifier Demain, Intégrations, pseudo, mdp, email...)
// ont déménagé vers /vestiaire/profil.
const SECTIONS: Array<{ href: string; icon: string; label: string }> = [
  { href: "/vestiaire/profil", icon: "👤", label: "Profil" },
  { href: "/tableau-de-chasse", icon: "🏆", label: "Tableau de Chasse" },
  { href: "/vestiaire/entrainement", icon: "🔁", label: "Mes Routines" },
  { href: "/marche-noir", icon: "🛒", label: "Le Marché Noir" },
  { href: "/guide", icon: "📖", label: "Le Guide" },
];

export default async function QgPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile, error: profileError }, { data: dayResults, error: dayError }] =
    await Promise.all([
      supabase.from("profiles").select("best_streak, timezone").eq("id", user.id).maybeSingle(),
      supabase.from("day_results").select("day_date, outcome").eq("user_id", user.id),
    ]);

  if (profileError || dayError) {
    throw profileError ?? dayError;
  }

  const today = dayKey(new Date(), profile?.timezone ?? "UTC");
  const streak = currentStreak(dayResults ?? [], today);

  return (
    <main className="screen-main gap-4 px-4 py-8">
      <h1 className="text-center font-display text-lg uppercase tracking-wide text-ink">
        Le Vestiaire
      </h1>
      <div className="flex flex-col items-center gap-4">
        <StreakBadge state={streak} />
        <InstallCta />
      </div>

      <nav aria-label="Sections du Vestiaire" className="flex flex-col gap-2">
        <p className="text-center text-xs text-muted">Record : {profile?.best_streak ?? 0} jours</p>
        {SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-3 text-sm text-ink hover:border-ink"
          >
            <span className="flex items-center gap-2">
              <span aria-hidden="true">{section.icon}</span>
              {section.label}
            </span>
            <span aria-hidden="true" className="text-faint">
              ›
            </span>
          </Link>
        ))}
      </nav>

      <BottomNav active="qg" />
    </main>
  );
}
```

- [ ] **Step 2: Manual check**

Run: `npm run dev`, naviguer sur `/vestiaire`. Vérifier : plus de Volume Intérieur/Planifier Demain/Intégrations sur cette page, lien "Profil" en premier dans la liste, streak badge toujours affiché.

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: PASS (aucune régression — `app/vestiaire/page.tsx` n'a pas de test dédié, mais vérifie qu'aucun autre test n'importe ses exports).

- [ ] **Step 4: Commit**

```bash
git add app/vestiaire/page.tsx
git commit -m "chore: Le Vestiaire redevient un hub de navigation pur (#69)"
```

---

### Task 10: Vérification finale, docs, CHANGELOG

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `CLAUDE.md` (si un comportement non-évident a été découvert en implémentant, ex. si `double_confirm_changes` s'avère différent en prod — cf. note dans `EmailSection.tsx`)

- [ ] **Step 1: Vérifier manuellement le comportement email en prod**

Créer un compte de test, changer son email via `/vestiaire/profil`, vérifier si Supabase exige bien les 2 confirmations (`double_confirm_changes`) comme documenté dans `supabase/config.toml`. Si le comportement réel diffère, ajuster le message de `EmailSection.tsx` et ajouter une entrée "Piège" dans `CLAUDE.md`.

- [ ] **Step 2: Lancer la suite complète**

Run: `npm run lint && npm test && npx tsc --noEmit && npm run build`
Expected: tout passe.

- [ ] **Step 3: Ajouter l'entrée CHANGELOG**

Dans `CHANGELOG.md`, sous `## [Unreleased]` :

```md
- feat: page Profil (`/vestiaire/profil`) — pseudo, titre équipé, fuseau horaire, mot de passe, email, déconnexion, en plus des réglages déjà existants déplacés depuis Le Vestiaire (#69)
```

- [ ] **Step 4: Commit final**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog page Profil (#69)"
```

---

## Self-Review Notes

- **Spec coverage** : les 5 blocs du spec (Identité, Sécurité, Préférences de jeu, Intégrations, Compte) sont couverts Tasks 2-9. Le gap "logout absent" et la décision "titre en aperçu lecture-seule" sont couverts (Task 7, Task 3).
- **Placeholder scan** : aucun "TBD"/"TODO" — la seule note ouverte (double_confirm_changes à vérifier en prod) est traitée comme une étape explicite de vérification manuelle (Task 10), pas un renvoi vague.
- **Type consistency** : `updateUsername`/`updateTimezone` (Task 1) ont la même signature `Promise<{ error: string | null }>` que `updateAggressivityLevel`/`updatePlanTomorrowAfterHour` existants, réutilisée à l'identique dans Tasks 2/4. `profile.equipped_title_code`/`profile.username`/`profile.timezone` correspondent aux colonnes réelles de `types/index.ts` (`Profile`).
