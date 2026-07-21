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
- US-16 : Animation « Perfect » / K.O. (célébration en direct quand le Boss tombe à 0 : **PERFECT** si Héro intact, **K.O.** si Héro entamé ; CTA Rituel du Crépuscule ; super-variante flammes au franchissement d'un palier de série ; variante douce `prefers-reduced-motion`)
- US-15 : Rage Quit de tâche (abandon punitif en cours de journée : modale de confirmation, malus −5 XP clampé sans de-level, Boss rétréci, cascade sur les sous-tâches actives, punchline « le Boss ricane », **undo** même-jour qui restaure et rembourse ; distingué de l'« Annihiler » serein du Réveil via `abandon_reason`)
- US-10 : Le Panthéon (écran lecture seule accessible depuis le QG — blocs Héros / Trophées / Trésor / Titres / Journal de combat paginé ; sparkline des dégâts, anneau de win-rate, meilleur jour ; 3 états Loading/Error/Empty)
- US-17 : Mode Entraînement / tâches récurrentes (routines à jours de la semaine sélectionnables, générées automatiquement au réveil du jour courant ; icône 🔁 sur les instances ; anti-doublon 1/routine/jour ; pas de génération rétroactive ; jour de repos planifiable ; écran de gestion `/qg/entrainement` : créer, désactiver, repos du jour)
- Système de Combo (juice arcade, esprit Street Fighter) : terminer des tâches à la chaîne fait monter un compteur de combo avec des punchlines escaladées (DOUBLE COUP ! → COMBO ×N → M-M-MONSTER COMBO !!) et un compteur persistant ; se brise si l'on décoche ou abandonne. Purement visuel — n'affecte ni l'XP ni l'or. Respecte `prefers-reduced-motion`.

### Technique
- Colonne `tasks.abandon_reason` (`rage_quit` | `annihilated`) : distingue en base l'abandon punitif du reste nettoyé sereinement (fondation des futures stats d'abandon du Panthéon)
- Tables `recurring_templates` (routines, `weekdays int[]`, désactivation sans DELETE) et `recurring_rest_days` (jours de repos, seul objet avec policy DELETE — préférence de planning, pas donnée de combat) + colonne `tasks.recurring_template_id` ; génération idempotente au chargement de l'Arène (`generateRecurringInstances`)
- Initialisation du projet (Next.js 16, Supabase, Tailwind v4, Vitest, Playwright)
- Schéma BDD initial (`profiles`, `tasks`) avec RLS appliquant RG-04 (pas de suppression destructive)
- Premier test e2e Playwright (ADR-04, boucle de combat quotidienne)
- Ajout de `@dnd-kit/core` / `@dnd-kit/utilities` pour le drag & drop (US-19)
- Intégration continue GitHub Actions (`.github/workflows/ci.yml`) : lint + Vitest + build, puis e2e Playwright, sur chaque PR et push `main`
- `CONTRIBUTING.md` : procédure de vérification locale obligatoire avant toute PR et liste des secrets CI requis
- Stabilisation des e2e Playwright : exécution en série (`workers: 1`, compte e2e fixe partagé) sur serveur de production (`build && start`), fiabilisant le run parallèle qui échouait ; ignore ESLint du dossier `assets/` (packs tiers)
- Dependabot (`.github/dependabot.yml`) : mises à jour mensuelles des dépendances npm et des actions GitHub (bumps mineurs/patch regroupés)
- Table `day_results` (issue du jour, dégâts, XP ; fondation Panthéon/streak/partage) + colonne `profiles.timezone` ; le "jour" devient le jour local de l'utilisateur (`dayKey`) au lieu de l'UTC (RG-03)
