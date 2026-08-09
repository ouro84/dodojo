# Issue #183 (bugs part7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corriger les 8 fixes du groupe A/B/C de l'issue #183 (spec : `docs/superpowers/specs/2026-08-09-issue183-bugs-part7-design.md`), en une seule PR sur la branche `fix/issue-183-bugs-part7`.

**Architecture:** Aucun changement d'architecture — 7 correctifs indépendants (copy, CSS, un composant SVG neuf, une restructuration de layout locale, deux diagnostics live avant tout fix). Groupe A (fix direct confirmé) d'abord, Groupe B (hypothèse forte, vérif visuelle) ensuite, Groupe C (cause non confirmée, diagnostic obligatoire avant tout code) en dernier.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Tailwind CSS v4, Vitest, Playwright.

## Global Constraints

- TypeScript strict, jamais de `any`.
- Commits `type: description courte` (Conventional Commits), en français.
- Ce repo ne pose pas de test Vitest dédié pour un pur changement de classes Tailwind ou de copy statique (convention établie, ex. issues #167/#145) — la vérification passe par `tsc --noEmit` + `lint` + `build` + capture d'écran manuelle quand la modif est visuelle. Un test est ajouté seulement là où une régression e2e/Vitest existante pourrait casser, ou si le groupe C aboutit à un vrai fix de logique.
- Ne jamais fabriquer un correctif sur une cause non confirmée (Groupe C) : diagnostiquer d'abord, appliquer un fix seulement si la cause devient claire, sinon documenter honnêtement "non reproduit" dans la PR (précédent du projet, cf. issue #146 sous-bug 3).
- `CLAUDE.md` doit être mis à jour dans le même commit si un nouveau piège non-évident est découvert pendant l'implémentation (règle du projet).

---

### Task 1: Renommer le succès "Ensemble on est plus fort"

**Files:**
- Modify: `lib/achievements.ts:72`

**Interfaces:**
- Consumes: rien (chaîne statique).
- Produces: rien (aucun autre fichier ne référence ce libellé — vérifié par `grep -rn "Ensemble on est plus fort"`, seul `lib/achievements.ts` matche hors specs/plans).

- [ ] **Step 1: Modifier le titre**

Dans `lib/achievements.ts`, ligne 72 :

```ts
    title: "Ensemble on est plus fort",
```

devient :

```ts
    title: "Attrapez les tous !",
```

- [ ] **Step 2: Vérifier qu'aucun test ne référence l'ancien libellé**

```bash
grep -rn "Ensemble on est plus fort" --include="*.ts" --include="*.tsx" .
```
Expected: aucune occurrence restante (hors `docs/superpowers/specs/2026-08-09-issue183-bugs-part7-design.md`, qui cite l'ancien titre à titre de contexte historique — ne pas le modifier).

- [ ] **Step 3: Commit**

```bash
git add lib/achievements.ts
git commit -m "fix: renomme le succès Ensemble on est plus fort en Attrapez les tous (#183)"
```

---

### Task 2: `min-w-0` sur le select fuseau horaire (déborde sur mobile)

**Files:**
- Modify: `components/qg/TimezoneSection.tsx:44-49`

**Interfaces:**
- Consumes: rien.
- Produces: rien.

- [ ] **Step 1: Ajouter `min-w-0` au `<select>`**

Dans `components/qg/TimezoneSection.tsx`, la balise `<select>` (ligne 44-49) :

```tsx
        <select
          id="profil-timezone"
          value={timezone}
          disabled={isPending}
          onChange={(event) => save(event.target.value)}
          className="flex-1 rounded border border-border bg-transparent px-2 py-1 text-sm text-ink disabled:opacity-50"
        >
```

devient :

```tsx
        <select
          id="profil-timezone"
          value={timezone}
          disabled={isPending}
          onChange={(event) => save(event.target.value)}
          className="min-w-0 flex-1 rounded border border-border bg-transparent px-2 py-1 text-sm text-ink disabled:opacity-50"
        >
```

- [ ] **Step 2: Vérifier visuellement sur mobile**

```bash
npm run build && npm run start
```
Ouvrir `http://localhost:3000/vestiaire/profil` avec les DevTools en émulation mobile (ex. 360px de large, iPhone SE). Confirmer que le bouton "Redétecter" reste dans la grille, ne dépasse plus horizontalement.

- [ ] **Step 3: Commit**

```bash
git add components/qg/TimezoneSection.tsx
git commit -m "fix: empeche le select fuseau horaire de deborder sur mobile (#183)"
```

---

### Task 3: Badge "équipé" du Marché Noir — crop + forme hors design system

**Files:**
- Modify: `components/shop/SkinCarousel.tsx:162-169`

**Interfaces:**
- Consumes: rien.
- Produces: `data-testid="skin-equipped-badge"` reste inchangé — `e2e/echoppe-skins.spec.ts:43` fait `expect(page.getByTestId("skin-equipped-badge")).toBeVisible()`, ne pas renommer ce testid.

- [ ] **Step 1: Réduire la taille et l'offset du badge, changer sa forme**

Dans `components/shop/SkinCarousel.tsx`, lignes 162-169 :

```tsx
                  {equippedHere && (
                    <span
                      data-testid="skin-equipped-badge"
                      aria-hidden="true"
                      className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-xp text-[10px] text-ink"
                    >
                      ✓
                    </span>
                  )}
```

devient :

```tsx
                  {equippedHere && (
                    <span
                      data-testid="skin-equipped-badge"
                      aria-hidden="true"
                      className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded bg-xp text-[10px] text-ink"
                    >
                      ✓
                    </span>
                  )}
```

Note : `bg-xp` est conservé (DESIGN.md sanctionne explicitement l'indigo comme couleur "équipé" au Marché Noir, déjà réutilisé en `border-xp` sur la matrice de héros du même composant — ne pas y toucher). Seule la forme (`rounded-full` → `rounded`, 6px cohérent avec le reste de l'app) et la taille/offset (réduits pour rester dans les bornes visibles du slide plutôt que déborder du viewport Embla `overflow-hidden`) changent.

- [ ] **Step 2: Lancer le test e2e existant qui couvre ce badge**

```bash
npx playwright test e2e/echoppe-skins.spec.ts
```
Expected: PASS (le test vérifie seulement la visibilité du testid, pas sa forme/taille).

- [ ] **Step 3: Vérifier visuellement que le cercle n'est plus cropé**

Capture d'écran de `/marche-noir` sur un héros avec tenue équipée (ex. `water_priestess`), zoomée sur le badge, avant/après. Confirmer un cercle/carré arrondi complet, aucun bord tronqué par le viewport du carrousel.

- [ ] **Step 4: Commit**

```bash
git add components/shop/SkinCarousel.tsx
git commit -m "fix: badge equipe Marche Noir non crope et coherent design system (#183)"
```

---

### Task 4: Icône des routines — remplacer l'emoji 🔁 par un SVG cohérent

**Files:**
- Create: `components/ui/RecurringIcon.tsx`
- Modify: `components/combat/TaskRow.tsx:133-137`
- Modify: `components/combat/TomorrowTaskRow.tsx:57-61`
- Modify: `components/combat/RecurringManager.tsx:133`
- Modify: `app/vestiaire/page.tsx:15,18`

**Interfaces:**
- Produces: `RecurringIcon({ className }: { className?: string })` — composant SVG 16×16, `stroke="currentColor"`, `aria-hidden="true"` posé sur le `<svg>` lui-même (l'appelant garde son propre `aria-label`/`title` sur le wrapper, pas de duplication d'annonce a11y).
- Consumes (Task 4d) : `ReactNode` importé de `"react"`.

- [ ] **Step 1: Créer le composant `RecurringIcon`**

Créer `components/ui/RecurringIcon.tsx` :

```tsx
// Issue #183 : remplace l'emoji 🔁 (hors design system — DESIGN.md n'a
// qu'un seul précédent d'icône, MicButton.tsx, un SVG 16x16 dessiné à la
// main). Trait plutôt que fill (contrairement à MicButton) : un pictogramme
// de cycle/boucle se lit mieux en contour qu'en silhouette pleine.
export default function RecurringIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M2 8a6 6 0 0 1 6-6 6.5 6.5 0 0 1 4.5 1.8L14 5" />
      <path d="M14 2v3h-3" />
      <path d="M14 8a6 6 0 0 1-6 6 6.5 6.5 0 0 1-4.5-1.8L2 11" />
      <path d="M2 14v-3h3" />
    </svg>
  );
}
```

- [ ] **Step 2: Intégrer dans `TaskRow.tsx`**

Ajouter l'import (après les imports existants, ligne 8) :

```tsx
import RecurringIcon from "@/components/ui/RecurringIcon";
```

Remplacer (lignes 133-137) :

```tsx
        {task.is_recurring && (
          <span aria-label="Quête récurrente" title="Quête récurrente" className="mr-1">
            🔁
          </span>
        )}
```

par :

```tsx
        {task.is_recurring && (
          <span
            aria-label="Quête récurrente"
            title="Quête récurrente"
            className="mr-1 inline-flex items-center"
          >
            <RecurringIcon className="h-3.5 w-3.5" />
          </span>
        )}
```

- [ ] **Step 3: Intégrer dans `TomorrowTaskRow.tsx`**

Ajouter l'import (après ligne 4) :

```tsx
import RecurringIcon from "@/components/ui/RecurringIcon";
```

Remplacer (lignes 57-61) :

```tsx
        {task.is_recurring && (
          <span aria-label="Quête récurrente" title="Quête récurrente" className="mr-1">
            🔁
          </span>
        )}
```

par le même bloc que Step 2 (avec `<RecurringIcon className="h-3.5 w-3.5" />`).

- [ ] **Step 4: Intégrer dans `RecurringManager.tsx`**

Ajouter l'import en haut du fichier (après ligne 1, avant les autres imports) :

```tsx
import RecurringIcon from "@/components/ui/RecurringIcon";
```

Remplacer ligne 133 :

```tsx
                  <span className="text-sm text-ink">🔁 {t.title}</span>
```

par :

```tsx
                  <span className="flex items-center gap-1 text-sm text-ink">
                    <RecurringIcon className="h-3.5 w-3.5" />
                    {t.title}
                  </span>
```

- [ ] **Step 5: Intégrer dans `app/vestiaire/page.tsx`**

Ajouter les imports (après ligne 1) :

```tsx
import type { ReactNode } from "react";
import RecurringIcon from "@/components/ui/RecurringIcon";
```

Élargir le type de `SECTIONS` (ligne 15) — de :

```tsx
const SECTIONS: Array<{ href: string; icon: string; label: string }> = [
  { href: "/vestiaire/profil", icon: "👤", label: "Profil" },
  { href: "/tableau-de-chasse", icon: "🏆", label: "Tableau de Chasse" },
  { href: "/vestiaire/entrainement", icon: "🔁", label: "Mes Routines" },
  { href: "/vestiaire/artisans", icon: "🎨", label: "Les Artisans" },
  { href: "/marche-noir", icon: "🛒", label: "Le Marché Noir" },
  { href: "/guide", icon: "📖", label: "Le Guide" },
  { href: "/informations-legales", icon: "⚖️", label: "Informations légales" },
];
```

à :

```tsx
const SECTIONS: Array<{ href: string; icon: ReactNode; label: string }> = [
  { href: "/vestiaire/profil", icon: "👤", label: "Profil" },
  { href: "/tableau-de-chasse", icon: "🏆", label: "Tableau de Chasse" },
  {
    href: "/vestiaire/entrainement",
    icon: <RecurringIcon className="h-4 w-4" />,
    label: "Mes Routines",
  },
  { href: "/vestiaire/artisans", icon: "🎨", label: "Les Artisans" },
  { href: "/marche-noir", icon: "🛒", label: "Le Marché Noir" },
  { href: "/guide", icon: "📖", label: "Le Guide" },
  { href: "/informations-legales", icon: "⚖️", label: "Informations légales" },
];
```

Les 6 autres entrées restent des emoji (chaîne de caractères — un `string` est un `ReactNode` valide, aucune autre modif nécessaire sur le `.map` qui les rend, ligne 63-66) : ce point de l'issue ne concerne que "Mes Routines", ne pas y toucher (scope creep).

- [ ] **Step 6: Vérifier qu'aucun texte/test ne référence encore l'emoji**

```bash
grep -rn "🔁" --include="*.ts" --include="*.tsx" . | grep -v node_modules
```
Expected: 0 occurrence (les 4 fichiers modifiés ne doivent plus contenir le glyphe).

- [ ] **Step 7: `tsc` + lint**

```bash
npx tsc --noEmit
npm run lint
```
Expected: 0 erreur (le changement de type `icon: string` → `icon: ReactNode` ne casse rien d'autre, `SECTIONS` n'est utilisé que dans ce fichier).

- [ ] **Step 8: Commit**

```bash
git add components/ui/RecurringIcon.tsx components/combat/TaskRow.tsx components/combat/TomorrowTaskRow.tsx components/combat/RecurringManager.tsx app/vestiaire/page.tsx
git commit -m "fix: remplace l'emoji routines par une icone SVG coherente avec le design system (#183)"
```

---

### Task 5: Position du BottomNav — aligner Le Vestiaire sur le patron plein-écran de l'Arène

**Files:**
- Modify: `app/vestiaire/page.tsx:46-75`

**Interfaces:**
- Consumes: rien.
- Produces: rien — changement de structure DOM locale à cette page uniquement (pas de changement des classes CSS partagées `.screen-main`/`.arena-shell`, pour ne pas affecter les 23 autres écrans qui utilisent `.screen-main` et n'ont pas été signalés comme buggés).

**Note de scope (déviation mineure du spec) :** le spec (§B1) évoquait "aligner les écrans `.screen-main`" au pluriel. Ce plan restreint le fix à `app/vestiaire/page.tsx`, seul écran explicitement signalé par l'utilisateur (comparé à l'Arène) — les 23 autres consommateurs de `.screen-main` (Le Guide, CGU, Tableau de Chasse...) n'ont pas ce bug rapporté et ont des profils de contenu différents (texte long qui doit scroller sur toute la page) ; les modifier sans signal explicite serait du scope creep avec un risque de régression non testé.

- [ ] **Step 1: Restructurer le `<main>` en shell plein-écran avec une seule zone scrollable**

Dans `app/vestiaire/page.tsx`, remplacer (lignes 46-75) :

```tsx
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

      <BottomNav active="vestiaire" />
    </main>
  );
```

par :

```tsx
  return (
    <main className="screen-main h-dvh gap-3 overflow-hidden px-4 py-4">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-2">
        <h1 className="text-center font-display text-lg uppercase tracking-wide text-ink">
          Le Vestiaire
        </h1>
        <div className="flex flex-col items-center gap-4">
          <StreakBadge state={streak} />
          <InstallCta />
        </div>

        <nav aria-label="Sections du Vestiaire" className="flex flex-col gap-2">
          <p className="text-center text-xs text-muted">
            Record : {profile?.best_streak ?? 0} jours
          </p>
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
      </div>

      <BottomNav active="vestiaire" />
    </main>
  );
```

Ce patron reprend exactement celui de l'Arène (`components/combat/Arena.tsx:1725` : `<main className="arena-shell ... h-dvh ... overflow-hidden ...">`, une seule zone interne `flex-1 min-h-0 overflow-y-auto`, `BottomNav` en dernier enfant hors de cette zone) — `.screen-main` fournit déjà `display:flex; flex-direction:column` (cf. `app/globals.css:64-71`), les classes `h-dvh`/`overflow-hidden`/`gap-3`/`px-4 py-4` s'ajoutent normalement à cette classe sans conflit.

- [ ] **Step 2: Vérifier avec contenu court (état normal)**

```bash
npm run build && npm run start
```
Ouvrir `/vestiaire` en émulation mobile (ex. iPhone SE 375×667). `BottomNav` doit toucher exactement le bas du viewport (comparer visuellement avec `/` — l'Arène).

- [ ] **Step 3: Vérifier avec contenu long (scroll interne)**

Même écran, réduire la hauteur du viewport (DevTools, ex. 375×400) pour forcer le contenu (7 sections + streak badge) à dépasser l'espace disponible. Confirmer que seule la zone `nav`/sections scrolle, que `BottomNav` reste fixé en bas, ne scrolle jamais hors champ.

- [ ] **Step 4: Lancer les e2e qui touchent Le Vestiaire**

```bash
npx playwright test e2e/journey-full-day.spec.ts e2e/onboarding.spec.ts
```
Expected: PASS (ces specs cliquent sur la navigation `BottomNav`/liens du Vestiaire, aucun ne dépend de la structure DOM interne au-delà du rôle `navigation`/des `href`).

- [ ] **Step 5: Commit**

```bash
git add app/vestiaire/page.tsx
git commit -m "fix: aligne le BottomNav du Vestiaire sur le patron plein-ecran de l'Arene (#183)"
```

---

### Task 6: Diagnostic live — bouton "équiper" un héros sans effet (C1)

**Files:**
- Create (temporaire, non commité si non reproduit) : `e2e/debug-equip-hero.spec.ts`
- Modify (seulement si cause confirmée) : `components/shop/CharacterSelect.tsx` et/ou `app/actions/shop.ts`

**Interfaces:**
- Consumes : `login(page)`, `resetShopState()`, `purchaseHero`/helpers déjà exportés par `e2e/fixtures.ts`.

- [ ] **Step 1: Écrire un script de repro piloté (pas un fix à l'aveugle)**

Créer `e2e/debug-equip-hero.spec.ts` :

```ts
import { test, expect } from "@playwright/test";
import { login, resetShopState } from "./fixtures";

test("diagnostic C1 : switch héros équipé", async ({ page }) => {
  await resetShopState(); // fire_knight possédé + équipé, 1500 or
  await login(page);
  await page.goto("/marche-noir");

  // Sélectionne un autre héros possédable et l'achète pour avoir 2 héros
  // possédés à switcher (fire_knight étant déjà équipé par défaut).
  await page.locator("[data-hero-cell]").nth(1).click();
  const ctaBefore = page.getByTestId("hero-cta");
  const label = await ctaBefore.textContent();
  if (label?.includes("Débloquer")) {
    await ctaBefore.click();
    await page.getByRole("button", { name: "Confirmer" }).click();
  }

  await expect(ctaBefore).toHaveText("Équiper", { timeout: 10_000 });

  const [response] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST"),
    ctaBefore.click(),
  ]);
  console.log("STATUS", response.status());
  console.log("BODY", await response.text().catch(() => "<no body>"));

  await expect(ctaBefore).toHaveText("✓ Équipé", { timeout: 10_000 });
});
```

- [ ] **Step 2: Exécuter et observer**

```bash
npx playwright test e2e/debug-equip-hero.spec.ts --headed --project=chromium
```

- [ ] **Step 3: Décision selon le résultat observé**

- **Si le test PASSE** (le bouton fonctionne dans ce scénario scripté) : cause probablement liée à un état UI spécifique non couvert ici (overlay `AchievementToast`/`confirmSkin` ouvert en même temps, clic pendant `pending`). Ajouter une variante du test qui ouvre le carrousel de tenues juste avant de cliquer "Équiper" pour vérifier un chevauchement de z-index ; si toujours vert, documenter "non reproduit en conditions scriptées" dans la description de la PR et laisser une trace dans un commentaire sur l'issue #183 (ne pas fabriquer de fix).
- **Si le test ÉCHOUE au `expect(ctaBefore).toHaveText("✓ Équipé"...)`** : inspecter `STATUS`/`BODY` du log — un statut non-200 ou une erreur dans le body pointe vers `app/actions/shop.ts` (`equipHero`) ; un statut 200 mais un texte de bouton qui ne change jamais pointe vers un problème de revalidation côté `CharacterSelect.tsx` (le prop `equippedId` ne se met jamais à jour après l'action). Appliquer le fix correspondant à la cause réellement observée (pas avant), puis convertir ce script en test de régression permanent (renommer sans le préfixe `debug-`, retirer les `console.log`).

- [ ] **Step 4: Nettoyer ou committer selon le résultat**

Si non reproduit : `rm e2e/debug-equip-hero.spec.ts` (script jetable, ne pas le committer).
Si reproduit et corrigé : renommer en `e2e/equip-hero-switch.spec.ts`, retirer les logs de debug, committer avec le fix :

```bash
git add app/actions/shop.ts components/shop/CharacterSelect.tsx e2e/equip-hero-switch.spec.ts
git commit -m "fix: <cause reelle observee> - bouton equiper un heros (#183)"
```

---

### Task 7: Diagnostic live — notifications (C2a rappel deadline jamais reçu, C2b rappel 17h30 en retard)

**Files:**
- Aucun fichier modifié tant que la cause n'est pas confirmée.

**Interfaces:**
- Aucune (diagnostic pur).

- [ ] **Step 1: Vérifier si les fonctions Inngest sont synchronisées côté prod**

CLAUDE.md documente un piège déjà vécu : la sync Inngest↔Vercel casse silencieusement après certains déploiements. Avant de suspecter le code, faire :

```bash
curl -s https://dodojo.vercel.app/api/inngest | head -c 2000
```

Une réponse contenant la liste des fonctions enregistrées (`schedule-deadline-reminder`, `reminder-fanout`, `send-reminder`) confirme une sync saine. Une erreur ou une liste vide confirme l'hypothèse du piège documenté — dans ce cas, le fix n'est **pas** du code : resynchroniser manuellement depuis le dashboard Inngest (section Apps → "Sync new app", URL `https://dodojo.vercel.app/api/inngest`), action qui nécessite un accès au dashboard Inngest (hors de portée de cette session — à signaler à l'utilisateur, ne pas tenter de la simuler).

- [ ] **Step 2: Si la sync est saine, vérifier le fuseau horaire réel du profil concerné (C2b)**

Le décalage de +1h pile suggère un `profiles.timezone` incorrect plutôt qu'un bug de calcul (la fonction `isWithinReminderWindow` est DST-safe, cf. spec). Demander à l'utilisateur de confirmer, dans `/vestiaire/profil`, la valeur affichée par le sélecteur de fuseau horaire — si elle ne correspond pas au fuseau réel (ex. `Europe/London` au lieu de `Europe/Paris`, ou un fuseau sans DST alors que la France est en heure d'été), la cause est confirmée : un mauvais fuseau stocké en base pour ce compte, pas un bug de code. Fix éventuel = corriger la donnée via le sélecteur existant (déjà livré par l'issue #69), pas de changement de code.

- [ ] **Step 3: Si la sync est saine ET le fuseau est correct, comparer les timestamps réels**

Nécessite un accès au dashboard Inngest (historique des runs `reminder-fanout`/`schedule-deadline-reminder`) pour comparer l'heure d'exécution réelle du run contre l'heure de réception de la notif — hors de portée de cette session (pas d'accès dashboard). Documenter cette limite explicitement dans la PR : "C2a/C2b non résolus, cause probable identifiée (sync Inngest ou fuseau profil) mais confirmation finale nécessite un accès dashboard Inngest / vérification utilisateur — voir commentaire ajouté sur l'issue #183."

- [ ] **Step 4: Mettre à jour l'issue #183 avec les constats du diagnostic**

```bash
gh issue comment 183 --body "Diagnostic C2a/C2b (bugs part7) : <résumé exact de ce qui a été trouvé aux steps 1-3, sync Inngest OK/KO, fuseau profil correct/incorrect>. <Action manquante nécessitant un accès dashboard Inngest ou une confirmation utilisateur, le cas échéant>."
```

- [ ] **Step 5 (uniquement si une cause de code est confirmée) : appliquer le fix et committer**

Ne s'applique que si un des steps précédents révèle un vrai bug de code (peu probable au vu de la lecture statique de la spec, mais à ne pas exclure). Dans ce cas, écrire le test de régression correspondant avant le fix (TDD), puis :

```bash
git add <fichiers concernés>
git commit -m "fix: <cause reelle observee> - notifications (#183)"
```

---

### Task 8: Vérification finale et Pull Request

**Files:** Aucun (vérification + PR).

- [ ] **Step 1: Suite complète**

```bash
npx tsc --noEmit
npm run lint
npm run test
npm run build
```
Expected: 0 erreur sur les 4 commandes.

- [ ] **Step 2: E2E complet en local**

```bash
npm run test:e2e
```
Expected: tous les fichiers verts. Si un fichier échoue à cause d'un changement de ce plan (ex. structure DOM du Vestiaire, Task 5), corriger le sélecteur du test plutôt que revenir sur le fix — sauf si l'échec révèle une vraie régression, auquel cas corriger le code.

- [ ] **Step 3: Mettre à jour `CHANGELOG.md`**

Ajouter sous `## [Unreleased]` une ligne par fix livré (Groupe A + B, et Groupe C uniquement si un fix de code a réellement été appliqué) — convention du projet (`CLAUDE.md` § Changelog).

- [ ] **Step 4: Vérifier si une doc utilisateur (Le Guide) est nécessaire**

Convention du projet (`CLAUDE.md` § Documentation utilisateur) : ces 7 points sont des corrections de bugs sur des comportements déjà documentés (aucune nouvelle mécanique, aucun changement de barème) — pas de nouvel article ni de mise à jour du Guide nécessaire. Vérifier explicitement qu'aucun des fixes ne change un comportement déjà décrit dans un article existant avant de conclure.

- [ ] **Step 5: Push et création de la PR**

```bash
git push -u origin fix/issue-183-bugs-part7
gh pr create --title "fix: bugs part7 (issue #183)" --body "$(cat <<'EOF'
## Résumé
- Groupe A (fix confirmés) : renomme le succès "Ensemble on est plus fort" → "Attrapez les tous !", corrige le débordement du bouton "Redétecter" (fuseau horaire) sur mobile, corrige le crop + la forme du badge "équipé" du Marché Noir, remplace l'emoji 🔁 des routines par une icône SVG cohérente avec le design system.
- Groupe B (hypothèse forte, vérifiée par capture d'écran) : aligne la position du BottomNav du Vestiaire sur le patron plein-écran de l'Arène.
- Groupe C (diagnostic live) : <résumé réel selon Tasks 6/7 — reproduit+corrigé, ou non reproduit/nécessite accès dashboard Inngest, à détailler après exécution>.

Spec : docs/superpowers/specs/2026-08-09-issue183-bugs-part7-design.md
Closes #183 (partiellement si Groupe C reste ouvert — ne pas fermer l'issue dans ce cas, laisser un commentaire de suivi).

## Test plan
- [ ] tsc --noEmit
- [ ] lint
- [ ] vitest
- [ ] build
- [ ] e2e complet
- [ ] Capture d'écran mobile : bouton Redétecter, badge équipé Marché Noir, BottomNav Vestiaire vs Arène
EOF
)"
```

- [ ] **Step 6: Rendre la main à l'utilisateur**

Ne pas merger (cf. convention du projet — jamais de merge sans accord explicite). Signaler l'URL de la PR et l'état réel du Groupe C (reproduit/corrigé, ou ouvert avec commentaire de suivi sur l'issue).
