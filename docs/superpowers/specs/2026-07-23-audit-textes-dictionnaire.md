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
