# Onboarding (US-29) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tunnel d'entrée (accueil Sensei → compte email+mdp → pseudo → avatar → 1er combat coaché) et économie « starter = seul héros gratuit ».

**Architecture:** `/welcome` (non auth) pour signup ; `/onboarding` (auth, sans profil) multi-étapes pseudo→avatar ; `createProfile` insère profil + starter offert ; coach-marks sur l'Arène réelle piloté par `profiles.has_seen_tutorial`.

**Tech Stack:** Next.js 16 App Router, Supabase Auth, TypeScript strict, Vitest, Playwright.

## Global Constraints
- TypeScript strict, pas de `any`.
- Français, ton dojo + rue (`docs/superpowers/specs/2026-07-08-tone-of-voice-design.md`) ; jamais « Héros » générique.
- RG-04 : aucun DELETE applicatif sur tasks/profiles.
- Confirmation email Supabase **OFF** (config dashboard, hors code) — signup connecte directement.
- Toute PR livrant la feature met à jour `CHANGELOG.md` (`[Unreleased]`) dans le même commit.

---

### Task 1: Migration `has_seen_tutorial`

**Files:**
- Create: `supabase/migrations/20260721140000_add_has_seen_tutorial.sql`

- [ ] **Step 1: Écrire la migration**

```sql
-- US-29 : le coach du 1er combat ne se joue qu'une fois. Flag par profil.
alter table public.profiles
  add column if not exists has_seen_tutorial boolean not null default false;
```

- [ ] **Step 2: Appliquer sur le distant**

Run: `echo "Y" | supabase db push` puis `supabase migration list | grep 20260721140000`
Expected: la migration figure côté Remote.

- [ ] **Step 3: Type**

Modifier `types/index.ts` interface `Profile` : ajouter `has_seen_tutorial: boolean;`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260721140000_add_has_seen_tutorial.sql types/index.ts
git commit -m "feat(onboarding): colonne profiles.has_seen_tutorial"
```

---

### Task 2: Économie « starter = seul gratuit » (isHeroOwned + prix fire_knight)

**Files:**
- Modify: `lib/heroes.ts` (isHeroOwned, prix fire_knight)
- Modify: `lib/heroes.test.ts`
- Modify: `e2e/fixtures.ts` (resetShopState : granter fire_knight)

**Interfaces:**
- Produces: `isHeroOwned(heroId, ownedIds)` = `ownedIds.includes(heroId)` (plus de cas spécial défaut).

- [ ] **Step 1: Test d'abord**

Dans `lib/heroes.test.ts`, remplacer/ajouter :
```ts
test("fire_knight n'est PAS possédé sans ligne (économie starter, US-29)", () => {
  expect(isHeroOwned("fire_knight", [])).toBe(false);
  expect(isHeroOwned("fire_knight", ["fire_knight"])).toBe(true);
});
test("possession strictement par ownedIds", () => {
  expect(isHeroOwned("water_priestess", ["water_priestess"])).toBe(true);
  expect(isHeroOwned("water_priestess", [])).toBe(false);
});
```
(Supprimer un éventuel test affirmant que fire_knight est possédé d'office.)

- [ ] **Step 2: Run — must fail**

Run: `npx vitest run lib/heroes.test.ts`
Expected: FAIL sur le nouveau test (fire_knight renvoie true).

- [ ] **Step 3: Implémenter**

Dans `lib/heroes.ts` :
```ts
// Possession strictement en base : le starter choisi à l'onboarding est offert
// (ligne unlocked_heroes à 0). Plus de héros gratuit implicite (US-29).
export function isHeroOwned(heroId: string, ownedIds: string[]): boolean {
  return ownedIds.includes(heroId);
}
```
Et donner un prix non nul à `fire_knight` (sinon gratuit à l'Échoppe) : `price: 150` (garder `isDefault: true` pour le fallback de rendu).

- [ ] **Step 4: Run — must pass**

Run: `npx vitest run lib/heroes.test.ts`
Expected: PASS.

- [ ] **Step 5: Fixture e2e — granter fire_knight au compte fixe**

Dans `e2e/fixtures.ts` `resetShopState`, après avoir supprimé les `unlocked_heroes`, insérer la possession du starter du compte e2e :
```ts
await admin.from("unlocked_heroes").upsert(
  { user_id: uid, hero_id: "fire_knight", price_paid: 0 },
  { onConflict: "user_id,hero_id" },
);
```
(Le compte e2e fixe garde ainsi fire_knight équipé ET possédé.)

- [ ] **Step 6: Seed des profils existants (data migration ponctuelle)**

Créer `supabase/migrations/20260721140100_seed_starter_ownership.sql` :
```sql
-- US-29 : les profils existants équipés d'un héros sans ligne de possession
-- reçoivent une ligne offerte (price_paid=0), cohérent avec le nouveau modèle.
insert into public.unlocked_heroes (user_id, hero_id, price_paid)
select p.id, p.equipped_hero_id, 0
from public.profiles p
where not exists (
  select 1 from public.unlocked_heroes u
  where u.user_id = p.id and u.hero_id = p.equipped_hero_id
)
on conflict (user_id, hero_id) do nothing;
```
Appliquer : `echo "Y" | supabase db push`.

- [ ] **Step 7: Commit**

```bash
git add lib/heroes.ts lib/heroes.test.ts e2e/fixtures.ts supabase/migrations/20260721140100_seed_starter_ownership.sql
git commit -m "feat(onboarding): starter = seul héros gratuit (isHeroOwned + seed)"
```

---

### Task 3: Création de compte — signup client-side + écran `/welcome` + entrée A1

**Files:**
- Create: `app/welcome/page.tsx` (serveur)
- Create: `app/welcome/WelcomeSignup.tsx` (client)
- Modify: `app/login/page.tsx` (lien vers /welcome)
- Modify: `app/page.tsx` (A1 : non-auth → /welcome)

**Interfaces:**
- Pas de server action : le signup est **client-side** (miroir du login `app/login/page.tsx`), via `createClient()` navigateur → `supabase.auth.signUp` → `router.replace("/onboarding")`.

⚠️ **Prérequis dur** : Supabase Auth « Confirm email » **OFF** (sinon `signUp` ne renvoie pas de session et le flux casse). Vérifier avant : un signup de test doit connecter immédiatement.

- [ ] **Step 1: `app/welcome/WelcomeSignup.tsx` (client, patron du login)**

```tsx
"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function WelcomeSignup() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password.length < 8) { setError("Mot de passe : 8 caractères minimum."); return; }
    setPending(true);
    const supabase = createClient();
    const { error: signUpError } = await supabase.auth.signUp({ email, password });
    if (signUpError) {
      setError(/registered/i.test(signUpError.message)
        ? "Ce mail a déjà un compte. Connecte-toi."
        : "Impossible de créer le compte. Réessaie.");
      setPending(false);
      return;
    }
    router.replace("/onboarding");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-xs flex-col gap-4">
      {/* champs email + password (mêmes classes/labels que /login), bouton "Rejoindre le dojo" */}
      {/* ... inputs id=email type=email required ; id=password type=password required minLength=8 ... */}
      {error && <p role="alert" className="text-sm text-alert">{error}</p>}
      <button type="submit" disabled={pending} className="rounded-md bg-hp px-4 py-2 font-display uppercase tracking-wide text-ink disabled:opacity-50">
        {pending ? "…" : "Rejoindre le dojo"}
      </button>
      <Link href="/login" className="text-center text-xs text-faint underline">Déjà un compte ? Se connecter</Link>
    </form>
  );
}
```
(Copier la structure exacte des `<div><label><input></div>` depuis `app/login/page.tsx` pour email/password.)

- [ ] **Step 2: `app/welcome/page.tsx` (serveur)**

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import WelcomeSignup from "./WelcomeSignup";

export default async function WelcomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/");
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-12 text-center">
      <h1 className="font-display text-xl uppercase tracking-wide text-ink">Dodojo</h1>
      <p className="max-w-[28ch] text-sm text-muted">Le dojo t'attend. Choisis ton nom, ton combattant, et entre dans l'Arène.</p>
      <WelcomeSignup />
    </main>
  );
}
```

- [ ] **Step 3: Lien depuis `/login`**

Ajouter dans `app/login/page.tsx` (sous le formulaire) : `<Link href="/welcome" className="text-xs text-faint underline">Pas encore de compte ? Crée ton combattant</Link>` (importer `Link`).

- [ ] **Step 4: A1 — entrée non-auth vers /welcome**

Dans `app/page.tsx`, remplacer `redirect("/login")` par `redirect("/welcome")`. (Les autres pages protégées gardent `/login`.)

- [ ] **Step 5: Build**

Run: `npm run build 2>&1 | grep -E "welcome|error|Compiled"`
Expected: route `/welcome` générée, sans erreur.

- [ ] **Step 6: Commit**

```bash
git add app/welcome app/login/page.tsx app/page.tsx
git commit -m "feat(onboarding): signup client-side + /welcome + entrée non-auth"
```

---

### Task 4: Tunnel `/onboarding` (pseudo → avatar) + createProfile étendu

**Files:**
- Modify: `app/onboarding/page.tsx` (garde profil existant → `/`)
- Create: `app/onboarding/OnboardingFlow.tsx` (remplace OnboardingForm)
- Create: `components/combat/OnboardingAvatarPicker.tsx`
- Modify: `app/onboarding/actions.ts` (createProfile étendu)
- Delete (logique) : usage de `OnboardingForm.tsx` (remplacé par OnboardingFlow)

**Interfaces:**
- Consumes: `HEROES`, `getHero`, `DEFAULT_HERO_ID` (heroes.ts) ; `HeroIdle`.
- Produces: `createProfile(_prev, formData)` lit `username`, `timezone`, `starterId`.

- [ ] **Step 1: `OnboardingAvatarPicker.tsx` (client)**

Réutilise le motif de `CharacterSelect` **sans or/achat** :
```tsx
"use client";
import { useState } from "react";
import { HEROES, getHero, DEFAULT_HERO_ID } from "@/lib/heroes";
import HeroIdle from "@/components/combat/HeroIdle";

export default function OnboardingAvatarPicker({
  value, onChange,
}: { value: string; onChange: (id: string) => void }) {
  const [selectedId, setSelectedId] = useState(value || DEFAULT_HERO_ID);
  const selected = getHero(selectedId) ?? getHero(DEFAULT_HERO_ID)!;
  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-black/40 p-4">
        <HeroIdle hero={selected} className="h-28" />
        <div className="font-display text-sm uppercase tracking-wide text-ink">{selected.name}</div>
        <div className="text-xs text-muted">Élément : {selected.element}</div>
      </div>
      <div className="mx-auto flex max-w-[240px] flex-wrap justify-center gap-1.5">
        {HEROES.map((h) => (
          <button key={h.id} type="button" aria-label={h.name} aria-pressed={h.id === selectedId}
            onClick={() => { setSelectedId(h.id); onChange(h.id); }}
            className={`h-11 w-11 overflow-hidden rounded border-2 bg-black/40 ${h.id === selectedId ? "border-gold" : "border-border"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/sprites/mc/${h.slug}/portrait.png`} alt="" className="h-full w-full object-contain p-0.5 [image-rendering:pixelated]" />
          </button>
        ))}
      </div>
    </div>
  );
}
```
(Appeler `onChange(DEFAULT_HERO_ID)` à l'init côté parent, ou traiter la valeur par défaut au submit.)

- [ ] **Step 2: `OnboardingFlow.tsx` (client, 2 étapes)**

Machine à état `step: "pseudo" | "avatar"`. Capture timezone (`Intl`, `useEffect`). Étape pseudo : input + bouton « Continuer » (valide non vide). Étape avatar : `<OnboardingAvatarPicker>` + bouton « Entrer dans l'Arène ». Soumission finale via un `<form action={createProfile}>` avec `username`, `timezone`, `starterId` en hidden inputs (valeurs portées par l'état). Rendu `state.error`.

- [ ] **Step 3: `createProfile` étendu**

Dans `app/onboarding/actions.ts` :
```ts
const starterId = String(formData.get("starterId") ?? "").trim();
// ... après validation username ...
if (!getHero(starterId)) return { error: "Choisis un combattant." };

const { error } = await supabase.from("profiles").insert({
  id: user.id, username, timezone, equipped_hero_id: starterId,
});
if (error) return { error: "Le dojo n'a pas pu enregistrer ton nom. Réessaie." };

await supabase.from("unlocked_heroes").insert({
  user_id: user.id, hero_id: starterId, price_paid: 0,
});
redirect("/");
```
(Importer `getHero` de `@/lib/heroes`.)

- [ ] **Step 4: Garde `/onboarding`**

`app/onboarding/page.tsx` : si `auth` absent → `/login` ; si profil déjà présent → `/` ; sinon rend `<OnboardingFlow />`.

- [ ] **Step 5: Build + lint**

Run: `npm run build 2>&1 | grep -E "onboarding|error|Compiled"` puis `npx eslint app/onboarding components/combat/OnboardingAvatarPicker.tsx`
Expected: compilé, lint propre.

- [ ] **Step 6: Commit**

```bash
git add app/onboarding components/combat/OnboardingAvatarPicker.tsx
git commit -m "feat(onboarding): tunnel pseudo → avatar + starter offert"
```

---

### Task 5: Coach 1er combat (ArenaCoach + markTutorialSeen)

**Files:**
- Create: `app/actions/profile.ts`
- Create: `components/combat/ArenaCoach.tsx`
- Modify: `app/page.tsx` (passer `hasSeenTutorial`)
- Modify: `components/combat/Arena.tsx` (monter le coach, exposer add + état tâches, flag firstVictory)
- Modify: `components/combat/PerfectOverlay.tsx` (A3 : sous-texte 1re victoire)

**Interfaces:**
- Consumes: `Arena` expose `handleAdd(title)` et l'existence de tâches actives + la complétion.
- Produces: `markTutorialSeen(): Promise<{ error: string | null }>`.

- [ ] **Step 1: `app/actions/profile.ts`**

```ts
"use server";
import { createClient } from "@/lib/supabase/server";
export async function markTutorialSeen(): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: null };
  await supabase.from("profiles").update({ has_seen_tutorial: true }).eq("id", user.id);
  return { error: null };
}
```

- [ ] **Step 2: `ArenaCoach.tsx` (client)**

Props : `step: "add" | "strike"`, `onSuggest: () => void` (ajoute « Prendre en main Dodojo »), `onSkip: () => void` (A2). Overlay non bloquant en surimpression basse :
- step `add` : « Ajoute ta première tâche pour défier le Boss. » + bouton « ⚡ Prendre en main Dodojo » (→ `onSuggest`).
- step `strike` : « Coche-la pour frapper : dégâts + XP. »
- **Bouton « Passer » (A2)** discret à toute étape → `onSkip`.
Respecte `prefers-reduced-motion`. Pas de fond opaque bloquant (l'utilisateur peut agir).

- [ ] **Step 3: A3 — sous-texte 1re victoire dans `PerfectOverlay.tsx`**

Ajouter une prop optionnelle `firstVictory?: boolean`. Quand `true`, remplacer le sous-texte standard par « Premier sang, {username} ! » (garder le tier PERFECT/K.O. et le CTA). `username` est déjà une prop de l'overlay.

- [ ] **Step 4: Câbler dans `Arena.tsx`**

- Nouvelle prop `hasSeenTutorial: boolean`. État local `tutorialActive` initialisé à `!hasSeenTutorial`.
- État `coachStep`: si `tutorialActive` → `"add"` tant qu'aucune tâche active ; `"strike"` dès qu'une tâche active non complétée existe ; `null` dès qu'une tâche est complétée (ou skip).
- Fin du coach (complétion **ou** skip) → `markTutorialSeen()` **une seule fois** (garde `useRef`) + `setTutorialActive(false)`.
- `onSuggest` = `handleAdd("Prendre en main Dodojo")` ; `onSkip` = terminer le coach.
- **A3** : au moment où `koOutcome` produit un tier, capturer `firstVictory = tutorialActive` et le stocker dans `koState` ; passer `firstVictory={koState.firstVictory}` à `<PerfectOverlay>`.
- Monter `<ArenaCoach>` quand `coachStep !== null`.

- [ ] **Step 5: `app/page.tsx`**

Passer `hasSeenTutorial={profile.has_seen_tutorial}` à `<Arena>`.

- [ ] **Step 6: Build + lint**

Run: `npm run build 2>&1 | grep -E "error|Compiled"` puis `npx eslint components/combat/ArenaCoach.tsx components/combat/Arena.tsx components/combat/PerfectOverlay.tsx app/page.tsx app/actions/profile.ts`
Expected: compilé, lint propre.

- [ ] **Step 7: Commit**

```bash
git add app/actions/profile.ts components/combat/ArenaCoach.tsx components/combat/Arena.tsx components/combat/PerfectOverlay.tsx app/page.tsx
git commit -m "feat(onboarding): coach 1er combat (add → strike, passer, 1re victoire)"
```

---

### Task 6: Compte e2e onboarding + spec + docs

**Files:**
- Modify: `.env.local` (creds compte onboarding — NON committé)
- Modify: `.env.example` (noms des variables)
- Modify: `e2e/fixtures.ts` (`resetOnboardingUser`)
- Create: `e2e/onboarding.spec.ts`
- Modify: `CHANGELOG.md`, `CLAUDE.md`

**Interfaces:**
- Produces: `resetOnboardingUser()` — supprime le user auth de test onboarding (admin) pour repartir d'un signup vierge.

- [ ] **Step 1: Créer le compte + creds**

Choisir des identifiants dédiés. Ajouter à `.env.local` (jamais committé) :
```
E2E_ONBOARDING_EMAIL=onboarding-e2e@dodojo.test
E2E_ONBOARDING_PASSWORD=<mot de passe fort généré>
```
Et documenter les noms dans `.env.example` (valeurs vides).

- [ ] **Step 2: `resetOnboardingUser` (fixture admin)**

Dans `e2e/fixtures.ts` :
```ts
export async function resetOnboardingUser(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PRIVATE_KEY_SUPABASE;
  const email = process.env.E2E_ONBOARDING_EMAIL;
  if (!url || !key || !email) throw new Error("Creds onboarding e2e manquants (.env.local).");
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const { data } = await admin.auth.admin.listUsers();
  const u = data?.users.find((x) => x.email === email);
  if (u) await admin.auth.admin.deleteUser(u.id); // cascade profiles/unlocked_heroes (FK on delete cascade)
}
```

- [ ] **Step 3: `e2e/onboarding.spec.ts`**

```ts
import { test, expect } from "@playwright/test";
import { resetOnboardingUser } from "./fixtures";

test.beforeAll(async () => { await resetOnboardingUser(); });

test("Onboarding complet (US-29) : signup → pseudo → avatar → coach", async ({ page }) => {
  const email = process.env.E2E_ONBOARDING_EMAIL!;
  const password = process.env.E2E_ONBOARDING_PASSWORD!;

  await page.goto("/welcome");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: /Rejoindre le dojo/ }).click();

  await page.waitForURL("/onboarding");
  await page.getByLabel(/pseudo/i).fill("Ryu Test");
  await page.getByRole("button", { name: /Continuer/ }).click();
  await page.getByRole("button", { name: "Prêtresse de l'Eau" }).click();
  await page.getByRole("button", { name: /Entrer dans l'Arène/ }).click();

  await page.waitForURL("/");
  // Coach étape add → suggestion
  await page.getByRole("button", { name: /Prendre en main Dodojo/ }).click();
  // Coach étape strike → cocher la tâche
  await page.getByLabel(/Marquer "Prendre en main Dodojo"/).check();
  // Le coach disparaît
  await expect(page.getByText(/Coche-la pour frapper/)).toBeHidden();
});
```
⚠️ Compte dédié, série (workers:1). Ne touche pas au compte e2e fixe.

- [ ] **Step 4: Lancer e2e complet**

Run: `E2E_PORT=3100 npx playwright test`
Expected: toutes séries vertes (dont onboarding.spec).

- [ ] **Step 5: Docs**

- `CHANGELOG.md` Produit : US-29 (tunnel accueil→compte→pseudo→avatar→coach ; starter = seul héros gratuit).
- `CHANGELOG.md` Technique : `has_seen_tutorial`, `/welcome` signup, comptes e2e onboarding, changement isHeroOwned.
- `CLAUDE.md` : piège « Onboarding & économie starter » (isHeroOwned sans défaut implicite, starter offert, has_seen_tutorial, Confirm email OFF).

- [ ] **Step 6: Commit**

```bash
git add .env.example e2e/fixtures.ts e2e/onboarding.spec.ts CHANGELOG.md CLAUDE.md
git commit -m "feat(onboarding): compte e2e dédié, spec e2e, docs"
```

---

## Self-Review
- Spec coverage : compte **client-side** (T3), pseudo+avatar (T4), starter=seul gratuit (T2), coach add→strike + suggestion + Passer A2 (T5), flourish 1re victoire A3 (T5), entrée /welcome A1 (T3 Step 4), has_seen_tutorial (T1/T5), e2e+docs (T6). ✓
- Placeholders : composants UI décrits (props + comportement + code clé) ; WelcomeSignup copie la structure d'input du login (référence explicite) ; mot de passe e2e à générer (secret). ✓
- Types : `Profile.has_seen_tutorial` (T1) → Arena (T5) ; `isHeroOwned(id, ownedIds)` (T2) ; `createProfile` lit `starterId` (T4) ; `PerfectOverlay.firstVictory?` (T5). Cohérent. ✓
- Auth : signup **client-side** (miroir login), pas de server action — évite les soucis de propagation de cookie.
- Prérequis dur : « Confirm email » OFF côté Supabase — vérifié en début de T3 (un signup de test doit connecter direct).
