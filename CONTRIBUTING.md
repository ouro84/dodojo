# Contribuer — Boss de la Journée

## Vérification locale AVANT toute PR (obligatoire)

Règle non négociable (cf. `CLAUDE.md` › Workflow Git) : **aucune PR n'est poussée sur GitHub tant que les tests n'ont pas été passés en local et sont verts.** La CI GitHub Actions vient en double sécurité, pas en remplacement.

Depuis la branche de feature, dans l'ordre :

```bash
npm run lint        # ESLint
npm test            # Tests unitaires Vitest (lib/**)
npm run build       # Build Next.js — doit passer sans erreur
npm run e2e         # Tests e2e Playwright (nécessite .env.local, voir ci-dessous)
```

Si l'une de ces commandes échoue, **on ne pousse pas** : on corrige d'abord.

### Prérequis e2e en local
Les e2e Playwright ont besoin d'un backend Supabase réel et du compte e2e fixe (ADR-04). Renseigner dans `.env.local` (template : `.env.example`) :

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_KEY_SUPABASE`
- `E2E_TEST_EMAIL`, `E2E_TEST_PASSWORD` (utilisateur dédié créé dans Supabase Auth)

Playwright démarre lui-même un serveur de **production** (`npm run build && npm run start`, voir `playwright.config.ts`) — pas besoin de lancer le serveur à la main. Première fois : `npx playwright install chromium`.

Les tests tournent en **série** (`workers: 1`) : ils partagent l'unique compte e2e fixe (ADR-04) et interféreraient en parallèle. Ne pas repasser en `fullyParallel` sans isoler les comptes par worker.

Si un `next dev` tourne déjà sur `:3000`, lancer les e2e sur un autre port : `E2E_PORT=3001 npm run e2e`.

## Workflow de PR

1. Branche par feature : `feat/us-XX-nom-feature`.
2. Ajouter la ligne de changelog sous `## [Unreleased]` de `CHANGELOG.md`, **dans le même commit** que l'implémentation.
3. Commits en Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`).
4. Vérification locale ci-dessus → verte.
5. Ouvrir la PR. La CI (voir ci-dessous) doit être verte avant merge. **Zéro merge si la CI est rouge.**

## Intégration continue (GitHub Actions)

Workflow : `.github/workflows/ci.yml`, déclenché sur chaque `pull_request` vers `main` et chaque `push` sur `main`.

| Job | Contenu |
|-----|---------|
| `checks` | `npm run lint`, `npm test`, `npm run build` |
| `e2e` | `npm run e2e` (chromium) — ne tourne que si `checks` passe ; le rapport HTML est uploadé en artefact `playwright-report` |

### Secrets GitHub requis

À configurer dans **Settings › Secrets and variables › Actions › Repository secrets** avant que la CI ne puisse passer au vert :

| Secret | Usage |
|--------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Build + clients Supabase (`lib/supabase/*`) |
| `NEXT_PUBLIC_KEY_SUPABASE` | Build + clients Supabase |
| `E2E_TEST_EMAIL` | Login du compte e2e fixe (Playwright) |
| `E2E_TEST_PASSWORD` | Mot de passe du compte e2e fixe |

Ajout rapide via `gh` (une valeur ne doit **jamais** être committée) :

```bash
gh secret set NEXT_PUBLIC_SUPABASE_URL
gh secret set NEXT_PUBLIC_KEY_SUPABASE
gh secret set E2E_TEST_EMAIL
gh secret set E2E_TEST_PASSWORD
```

<!-- ci-skip-test -->
