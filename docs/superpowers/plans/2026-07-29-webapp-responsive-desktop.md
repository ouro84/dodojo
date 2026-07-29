# Webapp responsive desktop/tablette large — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire en sorte que toutes les pages authentifiées de Dodojo exploitent la largeur d'un écran desktop/grand écran (≥1024px) — colonne de contenu élargie + nav en rail fixe — sans modifier l'expérience mobile/tablette (<1024px).

**Architecture:** Un breakpoint unique `lg` (1024px, natif Tailwind). Une classe CSS partagée `.screen-main` (Tailwind v4, `@layer components`) remplace le fragment dupliqué `mx-auto flex w-full max-w-md flex-1 flex-col` sur ~15 fichiers `<main>`, en ajoutant `max-w-2xl` + `padding-left` au-delà de 1024px. `BottomNav` passe de barre sticky en bas (mobile) à rail fixe à gauche (`position: fixed`, désktop) — un seul fichier à modifier, `position: fixed` échappe à la largeur du `<main>` parent sans toucher au JSX imbriqué.

**Tech Stack:** Next.js 16 App Router, Tailwind CSS v4, TypeScript strict. Pas de nouvelle dépendance.

## Global Constraints

- Aucune classe de base (sans préfixe `lg:`) ne doit être retirée ou modifiée — zéro régression <1024px (spec §Non-régression mobile).
- Largeur desktop uniforme partout : `max-w-2xl` (672px) — pas d'exception par écran (spec §Décisions validées).
- Ne pas toucher `lib/inngest/**`, `app/api/inngest/**`, `app/actions/push.ts`, `components/qg/PushReminderToggle.tsx` — zone du refactor Inngest en cours sur l'autre worktree (spec §Overlap).
- Pas de nouveau test automatisé/visuel pour ce scope (décision explicite, spec §Vérification) — la vérification se fait par `npx tsc --noEmit` (syntaxe) par tâche + vérification manuelle multi-breakpoints en fin de plan (les classNames Tailwind ne sont validées par aucun outil automatique existant dans ce repo).
- `npm run lint` / `npm run build` doivent rester verts à chaque étape (convention CLAUDE.md § Workflow Git).

---

## Task 1: Classe partagée `.screen-main` (Tailwind v4)

**Files:**
- Modify: `app/globals.css`

**Interfaces:**
- Produces: classe CSS `.screen-main` — utilisable en className à côté d'autres utilitaires Tailwind (`gap-*`, `px-*`, `py-*`). Comportement : `mx-auto flex w-full max-w-md flex-1 flex-col` en base, `max-w-2xl` + `padding-left: 6rem` à partir de 1024px.

- [ ] **Step 1: Ajouter la classe dans `app/globals.css`**

Insérer après le bloc `@theme { ... }` (après la ligne `}` qui le ferme, avant `html,\nbody {`) :

```css
@layer components {
  .screen-main {
    margin-inline: auto;
    display: flex;
    width: 100%;
    max-width: 28rem; /* max-w-md, mobile/tablette (<1024px) */
    flex: 1 1 0%;
    flex-direction: column;
  }

  @media (min-width: 1024px) {
    .screen-main {
      max-width: 42rem; /* max-w-2xl, desktop */
      padding-left: 6rem; /* réserve la place du rail nav fixe (w-20 = 5rem + 1rem de marge) */
    }
  }
}
```

- [ ] **Step 2: Vérifier la syntaxe**

Run: `npx tsc --noEmit`
Expected: PASS (aucun fichier TS touché, sanity check).

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "feat(css): ajoute la classe partagée .screen-main pour le layout desktop (issue #112)"
```

---

## Task 2: `BottomNav` devient un rail fixe sur desktop

**Files:**
- Modify: `components/ui/BottomNav.tsx`

**Interfaces:**
- Consumes: rien de nouveau (même props `{ active: NavKey }`).
- Produces: rendu inchangé <1024px ; à partir de 1024px, `<nav>` passe en `position: fixed`, rail vertical à gauche, largeur `5rem` (`w-20`).

- [ ] **Step 1: Modifier le className du `<nav>`**

Dans `components/ui/BottomNav.tsx`, remplacer :

```tsx
      className="sticky bottom-0 z-30 mt-auto flex justify-around border-t border-border bg-bg pt-2.5"
```

par :

```tsx
      className="sticky bottom-0 z-30 mt-auto flex justify-around border-t border-border bg-bg pt-2.5 lg:fixed lg:inset-y-0 lg:left-0 lg:mt-0 lg:w-20 lg:flex-col lg:items-center lg:justify-start lg:gap-1 lg:border-t-0 lg:border-r lg:pt-6"
```

(les classes sans préfixe restent actives <1024px ; les `lg:*` prennent le dessus à partir de 1024px — `lg:inset-y-0` avec `position: fixed` donne la pleine hauteur du viewport sans classe `h-*` supplémentaire).

Les `<Link>` internes (icône empilée sur le label, `flex-col items-center justify-center`) ne changent pas — ce pattern fonctionne déjà tel quel en rail vertical.

- [ ] **Step 2: Vérifier la syntaxe**

Run: `npx tsc --noEmit`
Expected: PASS.

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/ui/BottomNav.tsx
git commit -m "feat(nav): BottomNav devient un rail fixe a partir de 1024px (issue #112)"
```

---

## Task 3: Arène (`app/page.tsx` via `Arena.tsx`)

**Files:**
- Modify: `components/combat/Arena.tsx:880`

- [ ] **Step 1: Remplacer le className du `<main>`**

Remplacer :

```tsx
    <main className="relative mx-auto flex h-dvh w-full max-w-md flex-1 flex-col gap-3 overflow-hidden px-4 py-4">
```

par :

```tsx
    <main className="screen-main relative h-dvh gap-3 overflow-hidden px-4 py-4">
```

(`screen-main` fournit `mx-auto flex w-full max-w-md lg:max-w-2xl flex-1 flex-col` + `lg:pl-24` ; `relative`, `h-dvh`, `gap-3`, `overflow-hidden`, `px-4 py-4` restent des utilitaires propres à l'Arène, inchangés).

- [ ] **Step 2: Vérifier**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/combat/Arena.tsx
git commit -m "feat(arene): utilise la colonne responsive .screen-main (issue #112)"
```

---

## Task 4: Le Vestiaire (hub + Entraînement)

**Files:**
- Modify: `app/vestiaire/page.tsx:70`
- Modify: `app/vestiaire/loading.tsx:6`
- Modify: `app/vestiaire/error.tsx:15`
- Modify: `app/vestiaire/entrainement/page.tsx:61`
- Modify: `app/vestiaire/entrainement/loading.tsx:6`
- Modify: `app/vestiaire/entrainement/error.tsx:17`

- [ ] **Step 1: `app/vestiaire/page.tsx`**

Remplacer :
```tsx
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-8">
```
par :
```tsx
    <main className="screen-main gap-4 px-4 py-8">
```

- [ ] **Step 2: `app/vestiaire/loading.tsx`**

Remplacer :
```tsx
      className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-8"
```
par :
```tsx
      className="screen-main gap-4 px-4 py-8"
```

- [ ] **Step 3: `app/vestiaire/error.tsx`**

Remplacer :
```tsx
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-8 text-center">
```
par :
```tsx
    <main className="screen-main items-center justify-center gap-4 px-4 py-8 text-center">
```

- [ ] **Step 4: `app/vestiaire/entrainement/page.tsx`**

Remplacer :
```tsx
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-6">
```
par :
```tsx
    <main className="screen-main gap-4 px-4 py-6">
```

- [ ] **Step 5: `app/vestiaire/entrainement/loading.tsx`**

Remplacer :
```tsx
      className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-6"
```
par :
```tsx
      className="screen-main gap-4 px-4 py-6"
```

- [ ] **Step 6: `app/vestiaire/entrainement/error.tsx`**

Remplacer :
```tsx
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-8 text-center">
```
par :
```tsx
    <main className="screen-main items-center justify-center gap-4 px-4 py-8 text-center">
```

- [ ] **Step 7: Vérifier**

Run: `npx tsc --noEmit`
Expected: PASS.

**Attention overlap Inngest (spec §Overlap) :** avant de committer, lancer `git diff main -- app/vestiaire/page.tsx` — si GLM a déjà mergé son ajout de `ensureUserReminderSchedule` dans ce fichier sur `main` entre-temps, rebaser/re-fetch d'abord pour ne pas écraser son changement (zone différente du fichier attendue, mais à vérifier avant de commit).

- [ ] **Step 8: Commit**

```bash
git add app/vestiaire/page.tsx app/vestiaire/loading.tsx app/vestiaire/error.tsx app/vestiaire/entrainement/page.tsx app/vestiaire/entrainement/loading.tsx app/vestiaire/entrainement/error.tsx
git commit -m "feat(vestiaire): colonne responsive .screen-main sur le Vestiaire et Mes Routines (issue #112)"
```

---

## Task 5: Marché Noir

**Files:**
- Modify: `app/marche-noir/page.tsx:56`

- [ ] **Step 1: Remplacer le className**

Remplacer :
```tsx
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-8">
```
par :
```tsx
    <main className="screen-main gap-4 px-4 py-8">
```

- [ ] **Step 2: Vérifier**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/marche-noir/page.tsx
git commit -m "feat(marche-noir): colonne responsive .screen-main (issue #112)"
```

---

## Task 6: Le Guide (sommaire + article)

**Files:**
- Modify: `app/guide/page.tsx:13`
- Modify: `app/guide/loading.tsx:6`
- Modify: `app/guide/error.tsx:17`
- Modify: `app/guide/[slug]/page.tsx:46`
- Modify: `app/guide/[slug]/loading.tsx:6`
- Modify: `app/guide/[slug]/error.tsx:17`

- [ ] **Step 1: `app/guide/page.tsx`**

Remplacer :
```tsx
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-6">
```
par :
```tsx
    <main className="screen-main gap-6 px-4 py-6">
```

- [ ] **Step 2: `app/guide/loading.tsx`**

Remplacer :
```tsx
      className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-6"
```
par :
```tsx
      className="screen-main gap-6 px-4 py-6"
```

- [ ] **Step 3: `app/guide/error.tsx`**

Remplacer :
```tsx
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-8 text-center">
```
par :
```tsx
    <main className="screen-main items-center justify-center gap-4 px-4 py-8 text-center">
```

- [ ] **Step 4: `app/guide/[slug]/page.tsx`**

Remplacer :
```tsx
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-6">
```
par :
```tsx
    <main className="screen-main gap-4 px-4 py-6">
```

- [ ] **Step 5: `app/guide/[slug]/loading.tsx`**

Remplacer :
```tsx
      className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-6"
```
par :
```tsx
      className="screen-main gap-4 px-4 py-6"
```

- [ ] **Step 6: `app/guide/[slug]/error.tsx`**

Remplacer :
```tsx
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-8 text-center">
```
par :
```tsx
    <main className="screen-main items-center justify-center gap-4 px-4 py-8 text-center">
```

- [ ] **Step 7: Vérifier**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add app/guide/page.tsx app/guide/loading.tsx app/guide/error.tsx "app/guide/[slug]/page.tsx" "app/guide/[slug]/loading.tsx" "app/guide/[slug]/error.tsx"
git commit -m "feat(guide): colonne responsive .screen-main sur le sommaire et les articles (issue #112)"
```

---

## Task 7: Tableau de Chasse

**Files:**
- Modify: `app/tableau-de-chasse/page.tsx:107`

- [ ] **Step 1: Remplacer le className**

Remplacer :
```tsx
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-3 px-4 py-6">
```
par :
```tsx
    <main className="screen-main gap-3 px-4 py-6">
```

- [ ] **Step 2: Vérifier**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/tableau-de-chasse/page.tsx
git commit -m "feat(chasse): colonne responsive .screen-main sur le Tableau de Chasse (issue #112)"
```

---

## Task 8: Écrans de test internes (cohérence)

**Files:**
- Modify: `app/roster-preview-8f3a2c9d/page.tsx:23`
- Modify: `app/skins-preview-4c7a1e9b/page.tsx:20`

- [ ] **Step 1: `app/roster-preview-8f3a2c9d/page.tsx`**

Remplacer :
```tsx
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-6">
```
par :
```tsx
    <main className="screen-main gap-4 px-4 py-6">
```

- [ ] **Step 2: `app/skins-preview-4c7a1e9b/page.tsx`**

Ce fichier utilise actuellement `max-w-2xl` en dur (pas `max-w-md`) — c'était déjà large en permanence, y compris sur mobile, incohérent avec le reste de l'app. Remplacer :
```tsx
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-6">
```
par :
```tsx
    <main className="screen-main gap-4 px-4 py-6">
```

(devient responsive comme les autres écrans : étroit sur mobile, large à partir de 1024px — écran interne, `noindex`, jamais lié depuis l'UI, aucun impact utilisateur final).

- [ ] **Step 3: Vérifier**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/roster-preview-8f3a2c9d/page.tsx app/skins-preview-4c7a1e9b/page.tsx
git commit -m "chore: aligne les ecrans de test internes sur la colonne responsive .screen-main (issue #112)"
```

---

## Task 9: Vérification finale + CHANGELOG

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Suite de vérification complète**

Run: `npm run lint`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: PASS.

Run: `npm test`
Expected: PASS (aucun test existant ne référence ces classNames — non-régression).

Run: `npm run build`
Expected: PASS.

- [ ] **Step 2: Vérification manuelle multi-breakpoints**

Run: `npm run dev`, ouvrir chaque écran (Arène, Vestiaire, Mes Routines, Marché Noir, Le Guide + un article, Tableau de Chasse) dans le navigateur, redimensionner à 375 / 768 / 1024 / 1440 / 1920px (DevTools responsive mode). Vérifier :
- <1024px : rendu identique à avant (bottom nav, colonne étroite) — comparer avec `main` (avant ce plan) si doute.
- ≥1024px : colonne élargie centrée (672px), rail nav à gauche (pas de bottom bar), pas de chevauchement contenu/rail, pas de bande vide résiduelle disproportionnée.
- Transition à exactement 1024px : pas de saut visuel brutal (scrollbar, contenu qui saute).

- [ ] **Step 3: Ajouter la ligne CHANGELOG**

Dans `CHANGELOG.md`, sous `## [Unreleased]`, ajouter :
```markdown
- `feat: webapp responsive sur desktop/grand écran — colonne élargie + nav en rail fixe à partir de 1024px (issue #112)`
```

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: ajoute la ligne CHANGELOG pour le responsive desktop (issue #112)"
```

---

## Self-Review (fait par l'auteur du plan)

- **Couverture spec** : largeur uniforme `max-w-2xl` (Task 1) ✓, breakpoint `lg` uniquement (toutes tasks) ✓, empilement vertical Arène inchangé (Task 3, seul le className change, aucune restructuration JSX) ✓, rail nav via `position:fixed` sans toucher au JSX imbriqué (Task 2) ✓, tous les fichiers listés dans la spec sont couverts (Tasks 3-8) ✓, pas de smoke Playwright (Task 9 = manuel uniquement) ✓, CHANGELOG (Task 9) ✓.
- **Placeholders** : aucun "TBD"/"à ajuster" — toutes les valeurs (`42rem`, `6rem`, `5rem`/`w-20`) sont fixées explicitement dans Task 1/2.
- **Cohérence** : `screen-main` défini Task 1 est utilisé identiquement dans toutes les tasks suivantes (même nom de classe, jamais renommé).
