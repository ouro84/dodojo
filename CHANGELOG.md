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

### Technique
- Initialisation du projet (Next.js 16, Supabase, Tailwind v4, Vitest, Playwright)
- Schéma BDD initial (`profiles`, `tasks`) avec RLS appliquant RG-04 (pas de suppression destructive)
- Premier test e2e Playwright (ADR-04, boucle de combat quotidienne)
- Ajout de `@dnd-kit/core` / `@dnd-kit/utilities` pour le drag & drop (US-19)
