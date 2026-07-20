# Changelog

Toutes les features notables (produit et technique) de "Boss de la Journée" sont documentées ici.

Format des versions : `XX.YY.ZZ` (Majeure.Mineure.Fix), aligné sur les releases GitHub.
Chaque feature livrée est ajoutée sous `[Unreleased]` dans le même commit/PR que son
implémentation ; à chaque release GitHub, le contenu d'`[Unreleased]` bascule dans une
nouvelle section versionnée et datée.

## [Unreleased]

### Produit
- US-01 : Saisie de tâche textuelle classique
- US-06 : Recalcul dynamique des HP du Boss (heal +20 HP à l'ajout d'une tâche)
- US-21 : Validation de tâche & feedback flash combat (secousse d'écran, texte flottant)
- US-09 : Progression XP & niveaux (écran LEVEL UP)
- US-14 : Authentification & compte e2e fixe
- Refonte de l'Arène façon versus street-fighter (héros vs boss)
- US-04 : Sous-tâches à 2 niveaux (dégâts partagés, 10 HP au lieu de 20)
- US-19 : Drag & Drop d'imbrication et de réordonnancement (glisser une tâche sous une autre pour l'imbriquer, réordonner des tâches au même niveau, ou repromouvoir une sous-tâche en tâche racine)
- US-02 : Bouton Micro In-App (dictée vocale, Web Speech API)
- Cascade de complétion parent/sous-tâches : cocher toutes les sous-tâches coche automatiquement la tâche parente, et inversement décocher l'une d'elles la décoche ; cocher/décocher la tâche parente coche/décoche toutes ses sous-tâches
- US-08 : Rituel du Réveil (overlay bloquant au démarrage pour traiter les restes de la veille : Terminé / Reporter / Annihiler + actions groupées, backfill de l'historique)
- US-07 : Rituel du Crépuscule (ex-"Obi-Wan", clôture cérémonielle non-bloquante avec récap type carte de score arcade et streak preview)
- US-18 : L'Échoppe façon Character Select (débloquer/équiper des héros) + économie d'or (or gagné à la clôture du jour, solde dérivé, possession `unlocked_heroes`, héros affiché dans l'Arène via `equipped_hero_id`)
- US-12 : Système de streaks (série de victoires, budget de 2 non-victoires tolérées/semaine, record `best_streak`, compteur + alerte « en danger » au QG, titres de jalon, flammes à la victoire)

### Technique
- Initialisation du projet (Next.js 16, Supabase, Tailwind v4, Vitest, Playwright)
- Schéma BDD initial (`profiles`, `tasks`) avec RLS appliquant RG-04 (pas de suppression destructive)
- Premier test e2e Playwright (ADR-04, boucle de combat quotidienne)
- Ajout de `@dnd-kit/core` / `@dnd-kit/utilities` pour le drag & drop (US-19)
- Intégration continue GitHub Actions (`.github/workflows/ci.yml`) : lint + Vitest + build, puis e2e Playwright, sur chaque PR et push `main`
- `CONTRIBUTING.md` : procédure de vérification locale obligatoire avant toute PR et liste des secrets CI requis
- Stabilisation des e2e Playwright : exécution en série (`workers: 1`, compte e2e fixe partagé) sur serveur de production (`build && start`), fiabilisant le run parallèle qui échouait ; ignore ESLint du dossier `assets/` (packs tiers)
- Dependabot (`.github/dependabot.yml`) : mises à jour mensuelles des dépendances npm et des actions GitHub (bumps mineurs/patch regroupés)
- Table `day_results` (issue du jour, dégâts, XP ; fondation Panthéon/streak/partage) + colonne `profiles.timezone` ; le "jour" devient le jour local de l'utilisateur (`dayKey`) au lieu de l'UTC (RG-03)
