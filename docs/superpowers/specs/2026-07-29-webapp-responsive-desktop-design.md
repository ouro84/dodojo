# Design — Webapp responsive desktop/tablette large (issue #112)

> Date création : 2026-07-29
> Statut : VALIDÉ (brainstorming)
> Issue : [#112](https://github.com/ouro84/dodojo/issues/112)
> Branche : `worktree-claude-session`

---

## Problème

Sur mobile, l'app rend bien (mobile-first, cf. PRODUCT.md). Sur desktop, chaque écran est centré dans une colonne `max-w-md` (448px) — au-delà, seul le fond `--color-bg` (oklch(0.14 0.015 25), très sombre) est visible : sur un écran 1920px, ~75% de la largeur est une bande vide de chaque côté. L'app est quasi inutilisable/perçue comme cassée hors mobile/petite tablette.

## Objectif

Exploiter la largeur disponible à partir d'un vrai desktop (≥1024px), sans dégrader l'expérience mobile-first existante (<1024px, y compris tablette portrait/paysage jusqu'à 1024px).

## Contraintes produit

- PRODUCT.md rejette explicitement l'esthétique SaaS/outil de productivité épuré (Notion, Linear) — l'identité "borne d'arcade" doit dominer. Ceci exclut un redesign complet en grille desktop générique ; la structure verticale connue (scène de combat puis liste) est conservée, juste élargie.
- Mobile-first, une main (PRODUCT.md §3) : aucune classe de base (sans préfixe `lg:`) ne doit changer.
- Aucun fichier touché par le refactor Inngest en cours (GLM, issues #102/#114) ne doit être modifié en profondeur — voir section Overlap.

---

## Décisions validées (brainstorming)

| Décision | Choix retenu |
|---|---|
| Direction UX | Layout desktop élargi (pas juste du cadrage décoratif) |
| Breakpoint de bascule | `lg` (1024px) — tablette (768-1024px) garde l'UX mobile actuelle (bottom nav + colonne étroite) |
| Réagencement Arène | Empilement vertical conservé (VersusScene puis TaskList), juste élargi — pas de 2 zones côte à côte |
| Largeur cible desktop | `max-w-2xl` (672px), **uniforme** sur tous les écrans (pas d'exception Guide) |
| Tests | Pas de smoke Playwright dédié pour l'instant — vérification manuelle aux breakpoints |

---

## Architecture

### 1. Colonne de contenu

Chaque `<main>` passe de :
```
mx-auto flex w-full max-w-md flex-1 flex-col gap-{n} px-4 py-{n}
```
à :
```
mx-auto flex w-full max-w-md lg:max-w-2xl flex-1 flex-col gap-{n} px-4 py-{n} lg:pl-24
```
(le `lg:pl-24` (6rem) réserve la place du rail nav fixe, lui-même `lg:w-20` (5rem) — voir §2 ; la marge de 1rem restante évite que le contenu touche le bord du rail).

**Dédup** : le fragment `mx-auto flex w-full max-w-md flex-1 flex-col` est dupliqué à l'identique dans ~15 fichiers (`app/page.tsx` via `Arena.tsx`, `app/vestiaire/{page,loading,error}.tsx`, `app/vestiaire/entrainement/{page,loading,error}.tsx`, `app/marche-noir/page.tsx`, `app/guide/{page,loading,error}.tsx`, `app/guide/[slug]/{page,loading,error}.tsx`, `app/tableau-de-chasse/page.tsx`, `app/roster-preview-8f3a2c9d/page.tsx`, `app/skins-preview-4c7a1e9b/page.tsx`). Puisque tous ces fichiers sont déjà touchés pour ajouter le breakpoint, extraction en une classe Tailwind v4 partagée (`@layer components` dans `app/globals.css`, ex. `.screen-main`) plutôt que 15 copier-coller de la variante `lg:`. Chaque fichier garde son `gap`/`py` propre en className additionnelle.

### 2. Navigation (`components/ui/BottomNav.tsx`)

Constat : `BottomNav` est actuellement un **enfant** de `<main>` (pas un sibling dans le `<body>`) — vérifié dans `app/vestiaire/page.tsx:107` (`<BottomNav active="qg" />` fermé par `</main>` juste après). Elle est donc contrainte par le `max-w-md`/`max-w-2xl` du parent.

Sur `≥1024px`, le nav devient un **rail fixe** :
```
sticky bottom-0 z-30 mt-auto flex justify-around border-t border-border bg-bg pt-2.5
→
lg:fixed lg:inset-y-0 lg:left-0 lg:top-0 lg:bottom-auto lg:z-30 lg:flex lg:w-20 lg:flex-col lg:justify-start lg:gap-1 lg:border-t-0 lg:border-r lg:border-border lg:bg-bg lg:pt-6
(classes mobiles `sticky bottom-0 ... justify-around` restent actives <1024px)
```
`position: fixed` sort du flux normal et se positionne relativement au viewport — **pas besoin de sortir `BottomNav` de `<main>` dans le JSX**, elle échappe visuellement à la largeur du parent sans restructuration.

Chaque item nav (`Link`) passe de icône+label empilés horizontalement (pastille + label sous la pastille, actuellement déjà en colonne via `flex-col`) à un style rail vertical — ajustement de spacing/taille au moment de l'implémentation (détail visuel délégué à impeccable).

### 3. Layout body (`app/layout.tsx`)

Aucun changement structurel nécessaire — `body` reste `flex flex-col`, le rail fixe se superpose via `position: fixed` indépendamment du flux body.

---

## Fichiers touchés

- `app/globals.css` — nouvelle classe `.screen-main` (`@layer components`)
- `components/ui/BottomNav.tsx` — variantes `lg:*` rail
- `app/page.tsx` (via `components/combat/Arena.tsx:880`)
- `app/vestiaire/page.tsx` (+ `loading.tsx`, `error.tsx`)
- `app/vestiaire/entrainement/page.tsx` (+ `loading.tsx`, `error.tsx`)
- `app/marche-noir/page.tsx`
- `app/guide/page.tsx` (+ `loading.tsx`, `error.tsx`)
- `app/guide/[slug]/page.tsx` (+ `loading.tsx`, `error.tsx`)
- `app/tableau-de-chasse/page.tsx`
- `app/roster-preview-8f3a2c9d/page.tsx`, `app/skins-preview-4c7a1e9b/page.tsx` (cohérence, écrans internes)

## Overlap avec le refactor Inngest (GLM, branche `docs/102-114-push-inngest-plan`)

Aucun fichier `lib/inngest/**`, `app/api/inngest/**`, `app/actions/push.ts`, `components/qg/PushReminderToggle.tsx` n'est touché. Seul point de contact potentiel : `app/vestiaire/page.tsx` — GLM y ajoute un appel `ensureUserReminderSchedule` dans le corps du composant serveur (effet de bord), ce refactor ne touche que le `className` du `<main>` (JSX de rendu). Zones différentes du même fichier ; conflit git peu probable mais à vérifier au commit (`git diff main -- app/vestiaire/page.tsx` avant de merger).

## Non-régression mobile

Toute modification est un ajout de variante `lg:`. Aucune classe de base (sans préfixe) n'est retirée ou modifiée. Risque de régression visuelle <1024px : nul par construction.

## Vérification

Manuelle aux breakpoints 375 / 768 / 1024 / 1440 / 1920px (`npm run dev`), + `npm run build` (aucune erreur Tailwind/Next). Pas de tooling de régression visuelle dans le repo — décision explicite de ne pas en ajouter pour ce scope (pas de smoke Playwright dédié).

## Hors scope (YAGNI)

- Réagencement 2 colonnes de l'Arène (boss/tâches côte à côte) — écarté en brainstorming.
- Largeur différenciée par écran (Guide plus étroit) — écarté, largeur uniforme.
- Comportement tablette dédié — tablette reste sur l'UX mobile jusqu'à 1024px.
