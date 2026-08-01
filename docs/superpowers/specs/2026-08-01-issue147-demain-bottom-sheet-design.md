# Issue #147 — Sortir "Demain" de l'Arène figée : bandeau + bottom sheet

> Date : 2026-08-01
> Issue : #147 (reprendre le design de l'ajout de tâches au lendemain)
> Dépend de / n'invalide pas : US-116 (issue #116, `docs/superpowers/specs/2026-07-31-issue116-planifier-lendemain-design.md`) — logique métier (`day_date`, `deferred_at`, `reportToTomorrow`/`bringToToday`) inchangée, seul le chrome UI change.

---

## Contexte

L'issue signalait un rendu "split screen" entre tâches du jour et tâches de demain, jugé peu exploitable sur mobile. Vérification faite via Playwright (login compte e2e fixe, viewport iPhone 13, screenshot) + lecture de `components/combat/Arena.tsx`.

### Root cause (pas une question de style, un bug de layout)

`<main>` de l'Arène (`Arena.tsx` ligne ~1549) : `h-dvh overflow-hidden` — hauteur figée au viewport, **jamais scrollable** au niveau page. La seule zone scrollable est le `<ul>` de `TaskList.tsx` (`flex-1 min-h-0 overflow-y-auto`) : elle absorbe tout l'espace restant une fois les autres enfants du flex-col (`VersusScene`, bannières, `AddTaskForm`, bouton "Terminer la journée", section `TomorrowSection` entière, `BottomNav`) posés.

`TomorrowSection` (titre + copy voix + liste + formulaire d'ajout) est un sibling de hauteur **variable et potentiellement grande** de `TaskList` dans ce même flex-col fixe. Plus son contenu grossit (deadlines, sous-tâches sur les tâches de demain), plus elle grignote l'espace du `flex-1`, compressant la liste du jour jusqu'à n'afficher qu'une poignée de lignes.

Repro : compte e2e (38 tâches actives accumulées, RG-04 interdit tout DELETE) → liste du jour réduite à **1 seule ligne visible** dans sa mini-boîte scrollable, le reste de l'écran fixe étant occupé par `TomorrowSection`.

### Décision de design (validée par l'utilisateur)

Demain sort complètement du flux figé de l'Arène. Approche retenue : **bandeau compact toujours présent (si débloqué) + bottom sheet plein écran à l'ouverture**, plutôt qu'un 4e onglet `BottomNav` (dilue le nav pour une feature secondaire, pose la question de l'état "pas encore débloqué") ou qu'un drawer/accordéon ancré (complexité de geste supplémentaire sans bénéfice net face à un patron déjà standard dans ce repo — overlay plein écran).

---

## Composants

### `TomorrowBanner` (nouveau)

Remplace le rendu inline de `TomorrowSection` dans `Arena.tsx`. Placé dans le flux normal du flex-col, juste avant `BottomNav` (à la place où vivait `TomorrowSection` aujourd'hui). Hauteur **constante** (une ligne) — ne recompresse plus jamais `TaskList`, ce qui règle la cause racine sans y toucher directement.

Chrome neutre (pas de copy "voix" — cf. convention Volume Intérieur : seul le contenu de la sheet reste levelé) :
- 0 tâche planifiée : `"Demain — rien de prévu →"`
- ≥ 1 tâche planifiée : `"Demain · N tâche(s) →"`

Rendu **uniquement** si `planningUnlocked` est vrai — gating horaire (`profiles.plan_tomorrow_after_hour`) strictement inchangé, même condition qu'aujourd'hui. Tap → ouvre la sheet.

### `TomorrowSheet` (nouveau)

Overlay `fixed inset-0 z-50`, header `← Demain` + bouton `×`. Contenu = **`TomorrowSection` réutilisé sans modification interne** (voice line `planningUnlockedLine`, liste `TomorrowTaskRow`, `AddTaskForm`) — le composant existant devient l'intérieur de la sheet, aucune logique dupliquée.

- `useFocusTrap` avec `onEscape` fourni → **dismissable** (contrairement au Réveil, `WakeUpRitual`, qui est volontairement bloquant). Fermeture via bouton `×` explicite ou Echap — pas de clic sur un "backdrop" : la sheet est plein-bleed (`fixed inset-0`, même patron que `WakeUpRitual`), il n'existe pas de zone de fond distincte du contenu à cliquer.
- Monte du bas (`translate-y`), transition CSS ; instantané sous `prefers-reduced-motion` — même convention que les overlays existants (`PerfectOverlay`, `LevelUpOverlay`, etc.).
- Scroll interne libre (contenu de la sheet peut dépasser le viewport sans contrainte — plus de partage d'espace avec quoi que ce soit d'autre).

---

## State (`Arena.tsx`)

- Nouvel état `tomorrowSheetOpen: boolean` remplace `tomorrowSectionRef`/`scrollToTomorrowSection` (mécanisme de scroll-to devenu inutile).
- `onPlanTomorrow`, déjà branché sur `PerfectOverlay` et `CrepusculeRecap` (CTA post-victoire), ouvre directement `tomorrowSheetOpen = true` au lieu de scroller.
- Aucune donnée nouvelle : `activeTomorrowTasks` et tous les handlers (`onAdd`, `onAddSubtask`, `onSetDeadline`, `onAnnihilate`, `onBringToToday`) déjà passés à `TomorrowSection` sont simplement relayés tels quels à travers `TomorrowSheet`.

---

## Hors scope

- Aucun changement à la logique métier US-116 (`day_date`, `deferred_at`, `reportToTomorrow`, `bringToToday`, génération récurrente).
- Pas de geste de swipe-to-dismiss sur la sheet (aucun autre overlay du repo n'en a, cohérence avant nouveauté).
- Pas de nouvel indicateur/notification au-delà du compteur texte du bandeau (YAGNI — badge visuel, icône, etc. non demandés).

---

## Impact tests

Les e2e existants qui ciblent `section[aria-label="Demain"]` en DOM inline (issue #116 : `e2e/planifier-lendemain.spec.ts` ou équivalent) devront être adaptés pour ouvrir la sheet via le bandeau avant d'interagir avec son contenu — à couvrir dans le plan d'implémentation, pas dans ce spec.

Tests à ajouter :
- [ ] Vitest/composant : `TomorrowBanner` affiche le bon texte selon `activeTomorrowTasks.length` (0 vs N).
- [ ] Vitest/composant : `TomorrowBanner` ne rend rien si `planningUnlocked` est faux.
- [ ] e2e : ouverture de la sheet via le bandeau, ajout d'une tâche demain, fermeture, réouverture → tâche toujours présente.
- [ ] e2e : `onPlanTomorrow` depuis `PerfectOverlay` (K.O.) ouvre directement la sheet.
- [ ] e2e (non-régression) : avec un compte ayant beaucoup de tâches actives (repro du bug), la liste du jour occupe tout l'espace disponible sous `VersusScene`, le bandeau reste une ligne fixe visible sans écraser la liste.
