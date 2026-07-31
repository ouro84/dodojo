# Planifier tâche du lendemain (issue #116)

> Statut : brainstorming validé, en attente de revue avant plan d'implémentation.
> Issue GitHub : https://github.com/ouro84/dodojo/issues/116

## Contexte & besoin

À partir d'une certaine heure en fin de journée, l'utilisateur veut pouvoir :

- **(A)** créer une nouvelle tâche directement pour **demain** au lieu d'aujourd'hui,
- **(B)** reporter une tâche déjà créée aujourd'hui vers **demain**.

Objectif produit : préremplir la journée suivante pour ne pas arriver devant un Boss vide au réveil, et ne pas perdre une tâche qui arrive tard dans la soirée en la créant sur le mauvais jour.

Ce spec traite **A et B ensemble** (même déclencheur temporel, même besoin). Hors scope : une action groupée "reporter tout à demain" (YAGNI, à réévaluer si demandé plus tard).

## Principe d'architecture

Aucun nouveau statut de tâche. Une tâche "pour demain" est une ligne `tasks` normale avec `day_date` = jour local suivant (calculé via `dayKey`/`profiles.timezone`, même logique que le reste du projet). Le lendemain, au chargement de l'Arène, elle redevient une tâche du jour courant par le simple jeu du filtre RG-03 déjà en place (`app/page.tsx` : `.eq("day_date", today)`) — aucune tâche de migration/rattrapage à écrire.

## 1. Réglage utilisateur — heure seuil

- Nouvelle colonne `profiles.plan_tomorrow_after_hour` (`int`, `12`-`23`, défaut `18`, `not null`).
- Nouvelle section au Vestiaire, même patron que `AggressivityLevelSection` (`components/qg/AggressivityLevelSection.tsx`) : composant dédié + server action `updatePlanTomorrowAfterHour` dans `app/actions/profile.ts`, réglable à tout moment (pas one-shot comme le pseudo).
- Sélecteur d'heure simple (select 12-23 ou `<input type="time">` arrondi à l'heure pleine, borné `min="12:00" max="23:00"` — à trancher en implémentation, pas structurant).
- **Borne produit `12`-`23`** (pas `0`-`23` libre) : empêche un réglage qui rendrait la section "Demain" quasi permanente (contraire à l'esprit "fin de journée" de l'issue). Contrainte posée à la fois côté UI (sélecteur) et en base (`CHECK (plan_tomorrow_after_hour BETWEEN 12 AND 23)`).
- Cette heure seuil **gate à la fois A et B** : avant l'heure seuil, l'Arène est strictement identique à aujourd'hui (aucune section "Demain", aucune icône de report).
- Calcul de "après l'heure seuil" côté client, dérivé de l'heure locale courante et de `profiles.timezone` (même fuseau que `dayKey`). Réévalué au même polling ~45s déjà utilisé pour la détection des deadlines (US-05, `Arena.tsx`) — la section "Demain" et l'icône de report apparaissent sans reload quand l'heure seuil est franchie pendant que l'app reste ouverte.
- **Assomption explicite — session ouverte à cheval sur minuit** : si l'utilisateur garde l'app ouverte au-delà de minuit, la section "Demain" ne se fusionne **pas** automatiquement dans le combat du nouveau jour (l'Arène ne recalcule jamais "aujourd'hui" côté client sans reload — limitation déjà existante, cf. bug #70 sur l'absence de refetch). Cohérent avec le reste de l'app : Le Réveil (US-08), seul mécanisme de bascule de jour, ne se déclenche qu'au prochain chargement. Pas de correctif spécifique à écrire pour cette feature ; documenté ici pour ne pas être (re)découvert comme un bug plus tard.

## 2. Feature A — créer une tâche pour demain

Après l'heure seuil, une **section "Demain" séparée** apparaît sous la liste des tâches du jour dans l'Arène, avec son propre champ d'ajout (composant dédié, ex. `TomorrowSection`). Choix délibéré vs un toggle sur le champ existant : ça matérialise visuellement que ce n'est pas le combat en cours (ton neutre/froid, pas de Boss affiché — cohérent avec le fait que `daily_boss` de demain n'est résolu que lazy, demain, comme aujourd'hui).

- Une tâche créée dans cette section a `day_date` = demain (réutilise `insertTaskForUser`, `lib/task-insertion.ts`, avec le jour cible en paramètre plutôt que codé en dur sur `today`).
- Elle **ne soigne pas** le Boss d'aujourd'hui : `calculateBossMaxHp`/`calculateBossCurrentHp` (`lib/game-engine.ts`) ne reçoivent que les tâches filtrées `day_date == today`, donc l'exclusion est automatique — pas de garde supplémentaire à écrire.
- Sous-tâches : la section "Demain" supporte l'ajout de sous-tâches comme l'Arène du jour (même règle de profondeur RG-01, `isNestableParent`/`planReorder`).
- Deadline horaire (US-05) : fonctionne sans changement — `deadlineIso(dayDate, timeHHMM, timezone)` prend déjà `dayDate` en paramètre explicite (jamais codé en dur sur "aujourd'hui"), donc fixer une deadline sur une tâche de demain marche par construction.
- **Abandon d'une tâche de la section "Demain"** : icône × identique à l'Arène, mais **toujours `abandon_reason: "annihilated"`, jamais de choix Rage Quit**. Justification : le Rage Quit (-5 XP) punit l'abandon d'un combat en cours (`Arena.tsx`) ; une tâche pas encore "aujourd'hui" n'est pas en combat, donc pas de malus possible ni de popup de confirmation à deux choix — un simple clic confirme l'annihilation (RG-04 : `is_abandoned=true`, jamais de DELETE).

## 3. Feature B — reporter une tâche du jour vers demain

Nouvelle icône sur `TaskRow` (racine et sous-tâche, aux côtés de ⏰ et ×), visible uniquement après l'heure seuil, sur toute tâche active du jour (`!is_completed && !is_abandoned`).

- Action **instantanée + toast "Annuler"** (fenêtre ~5s, même patron que le toast "Repousser +1h" des deadlines US-05) — pas de modale bloquante type confirmation Rage Quit, car ce n'est pas punitif.
- Nouvelle server action `reportToTomorrow(id)` (`app/actions/tasks.ts`), modélisée sur `deferOverdueTask` mais **sens inverse** :
  - `day_date` → demain (au lieu de "au jour courant").
  - `deadline_at` → `null` (même raison que `deferOverdueTask` : une heure de deadline d'aujourd'hui n'a plus de sens le lendemain).
  - **`deferred_at` reste `null`** — point de vigilance : `deferred_at` est le flag qui porte le malus -20 HP Héros du "reste reporté" par Le Réveil (`overdueHpPenalties`, filtré sur `deferred_at != null && !is_completed && !is_abandoned` dans `Arena.tsx`). Le report proactif vers demain est l'opération strictement inverse et ne doit **jamais** poser ce flag, sous peine de pénaliser à tort une action de planification comme si c'était une procrastination.
  - Position : recalculée en fin de fratrie de demain (`nextSiblingPosition`), comme `deferOverdueTask` le fait pour aujourd'hui.
  - Cascade : reporter un parent reporte aussi ses sous-tâches actives (même requête `.or(id.eq.${id},parent_id.eq.${id})` que `deferOverdueTask`/`completeOverdueTask`).
  - Retour explicite des lignes modifiées (`TaskActionResult.deferredTasks` ou équivalent) pour fusion côté client — **même piège que le bug #70** : `Arena.tsx` ne re-fetch jamais après une action, toute mutation doit soit renvoyer les lignes affectées pour merge dans le state client, soit déclencher un `router.refresh()`. **Précision** : la fusion doit retirer la tâche du state "liste du jour" **et** l'ajouter au state de la section "Demain" (deux states client distincts, cf. §2) — pas seulement l'un des deux, sinon la tâche disparaît visuellement de partout jusqu'au prochain reload.
- Undo (bouton "Annuler" du toast) : nouvelle action `undoReportToTomorrow(id)` qui restaure `day_date`/`deadline_at`/`position` d'origine (capturés côté client avant l'appel, comme le fait déjà `undoRageQuit` pour son propre cas — même fenêtre "même jour" pas nécessaire ici puisque c'est un aller-retour immédiat côté UI, pas une action différée). Merge client symétrique au point précédent (retire de "Demain", remet dans la liste du jour).
- **"Ramener à aujourd'hui"** (action permanente, distincte du toast d'annulation ci-dessus qui ne couvre que les ~5s suivant un report) : action miroir disponible en permanence sur toute tâche de la section "Demain", pas seulement juste après un report. Nouvelle server action `bringToToday(id)` — même mécanique que `reportToTomorrow` mais `day_date` → aujourd'hui, position en fin de fratrie du jour. Couvre le cas "j'ai changé d'avis plus tard dans la soirée" sans avoir à annihiler puis recréer la tâche. Cascade sous-tâches identique.

## 4. Impact règles de jeu (Boss HP / Hero HP)

- **Boss HP** : aucune pénalité au report. La tâche sort du pool du jour comme si elle n'avait jamais existé aujourd'hui (recalcul pur, déjà garanti par le filtre `day_date`).
- **Hero HP** : aucun malus (cf. §3, `deferred_at` non posé). C'est le point qui distingue cette feature du mécanisme existant "Reporter" du Réveil (US-08) : ce dernier gère une **procrastination déjà avérée** (tâche d'un jour passé, malus -20 tant que non résolue) ; celui-ci gère une **planification proactive avant la fin du jour courant** (aucune faute, aucun malus).

## 5. Interactions avec les features existantes

- **Récurrence (US-17)** : si la tâche reportée est une instance de routine (`is_recurring=true`, `recurring_template_id`), l'anti-doublon existant `planRecurringGeneration` (règle D5, `lib/game-engine.ts`) la traite déjà comme "instance déjà présente pour ce jour" une fois `day_date` = demain — aucune double génération demain matin, aucun code nouveau nécessaire pour ce cas.
- **Le Réveil (US-08)** : une tâche planifiée pour demain n'est jamais un reste à l'ouverture de l'app le lendemain — elle apparaît normalement comme une tâche fraîche du jour, non pénalisée. Le Réveil ne doit pas la voir passer par son propre pool `.lt("day_date", today)` puisqu'elle vaut alors `day_date == today`.
- **Deadlines (US-05)** : deadline effacée au report (cf. §3) ; l'utilisateur peut en refixer une nouvelle une fois la tâche redevenue "aujourd'hui".

## 6. CTA contextuel au K.O./clôture

En plus du déclenchement par heure seuil, la section "Demain" est mise en avant à deux moments narratifs déjà existants :

- **`PerfectOverlay`** (K.O., US-16) : ajout d'un bouton secondaire "Planifier demain" à côté du CTA existant "Terminer la journée" — visible uniquement si l'heure seuil est déjà franchie (sinon le bouton n'a pas de section à cibler). Scroll/focus vers la section "Demain".
- **`CrepusculeRecap`** (Dernier Round, US-07) : même bouton secondaire dans l'écran de clôture non-bloquante.

Raison : le K.O./la clôture sont les moments où l'utilisateur vient de finir sa journée — le moment le plus naturel pour préparer la suivante, plus fiable qu'un simple changement d'état silencieux déclenché par l'horloge. Le déclenchement par heure seuil reste la mécanique de fond (section toujours accessible après l'heure, CTA ou pas) ; ce point n'ajoute qu'un raccourci contextuel, aucune nouvelle règle de jeu.

## 7. Ligne de La Voix au déblocage

La première fois que la section "Demain" apparaît dans la journée (transition heure-seuil franchie, pas à chaque re-render du polling), une courte ligne de La Voix s'affiche en en-tête de section — nouveau scénario dans `lib/copy/` (fichier dédié, ex. `lib/copy/planning.ts`), leveled `doux`/`direct`/`brut` comme tout le reste du registre (US-49/US-54), pool de 5-6 variantes (`pickVariant`). **Seed calculé une fois à l'ouverture de la section pour la session courante** (pas recalculé à chaque poll ~45s), même piège de stabilité que documenté pour les autres overlays. Contenu purement narratif (renforce le worldbuilding "Démon Intérieur" / discipline intérieure) — aucune donnée de jeu n'en dépend, une régression sur ce texte ne casse rien de fonctionnel.

## 8. Cas limites à couvrir en tests (Vitest + Playwright)

- Report d'une tâche racine avec sous-tâches actives : cascade day_date + position, sous-tâches abandonnées non affectées.
- Report d'une tâche avec deadline fixée : deadline effacée, pas de double malus (ni -10 deadline manquée, ni -20 reste).
- Annulation via toast : retour exact à l'état d'origine (`day_date`, `deadline_at`, `position`).
- Récurrence : routine déjà reportée manuellement vers demain ne se régénère pas au chargement de demain (`planRecurringGeneration`).
- Bascule de l'heure seuil pendant une session ouverte : section "Demain" et icône de report apparaissent au bon moment sans reload (polling ~45s).
- Création dans la section "Demain" : n'impacte ni `calculateBossMaxHp` ni `calculateBossCurrentHp` du jour courant.
- Les 3 états UI (Loading/Error/Empty) sur la section "Demain" (règle de code n°3 du projet).
- Abandon d'une tâche de la section "Demain" : toujours `annihilated`, jamais de popup Rage Quit, jamais de malus XP.
- `bringToToday` : cascade sous-tâches, position en fin de fratrie du jour, deadline traitée comme un ajout normal (aucune deadline reprise automatiquement).
- CTA "Planifier demain" sur `PerfectOverlay`/`CrepusculeRecap` absent/masqué si l'heure seuil n'est pas encore franchie.
- Ligne de La Voix : n'apparaît qu'une fois par déblocage journalier (pas à chaque re-render du poll ~45s), les 3 niveaux d'agressivité rendent un texte non vide.

## 9. Hors scope (assumé, YAGNI)

- Action groupée "reporter tout à demain".
- Réglage de granularité plus fine que l'heure (ex. minutes) pour le seuil.
- Historique/audit de qui a été reporté quand (pas de table dédiée — `deferred_at`/`day_date` suffisent, cohérent avec RG-04 : jamais de DELETE, mais pas non plus de journal supplémentaire ici).
- Fusion automatique de la section "Demain" dans le combat au franchissement de minuit en session ouverte (cf. §1, assomption acceptée).

## Documentation à mettre à jour dans la même PR

- `CLAUDE.md` : nouvelle entrée "Pièges et décisions non-évidentes" documentant le flag `deferred_at` jamais posé par `reportToTomorrow`/`bringToToday` (distinction avec le report du Réveil) + le réglage `plan_tomorrow_after_hour` (borne 12-23h) + l'assomption minuit/session ouverte.
- `SPECS_FONCTIONNELLES.md` : nouvelle User Story si le projet en tient un registre numéroté pour cette feature (à vérifier lors du plan).
- `CHANGELOG.md` : ligne sous `## [Unreleased]`.
- Le Guide (Notion) : nouvel article (feature visible utilisateur, nouvel écran/mécanique) — catégorie à déterminer, slug stable.
