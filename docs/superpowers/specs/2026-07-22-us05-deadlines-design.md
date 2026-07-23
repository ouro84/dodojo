# US-05 — Deadlines horaires (design)

> Date : 2026-07-22
> Statut : validé pour passage en plan d'implémentation

## Périmètre

En tant que Héros défié par le temps, je veux lier une heure limite à une tâche pour
simuler une attaque imminente. Une deadline non tenue inflige un malus de HP au
Héros et déclenche une animation « Attaque Surprise ».

La colonne `tasks.deadline_at` existe déjà en base (`supabase/migrations/20260708134344_init_schema.sql`,
`types/index.ts`) — non utilisée jusqu'ici (stub `deadline_at: null` dans les créations
optimistes de `Arena.tsx`). Aucune migration nécessaire pour ce champ.

**Deadline = heure du jour courant uniquement** (pas de date à choisir : les tâches
sont scopées à `day_date`, cohérent avec l'exemple du spec original "réglée à 14h00").
UI : un sélecteur d'heure natif (`<input type="time">`), pas un datetime complet.

---

## UI de saisie

Aucune UI d'édition de tâche n'existe aujourd'hui (`TaskRow` est figé : checkbox,
titre, sous-tâche, abandon). Ajout d'une icône ⏰ sur chaque `TaskRow` (tâche racine
**et** sous-tâche) qui ouvre un popover inline avec un sélecteur d'heure pour
fixer/modifier/effacer la deadline. Cohérent avec le style icônes existant (🔁
récurrence). Modifiable à tout moment après création — pas de champ dans
`AddTaskForm`/`SubtaskForm` pour ne pas alourdir la saisie rapide ("Balance ta
tâche…").

**Indicateur agrégé (amélioration retenue)** : un badge près de la jauge Boss
("⏰ 3 deadlines à venir aujourd'hui") — sans lui, une deadline reste invisible tant
qu'on n'a pas rouvert le popover de chaque tâche une par une. Dérivé d'une fonction
pure comptant les tâches actives à `deadline_at` non nul et non dépassé pour le jour
courant.

---

## Mécanique HP — réutilisation du pool Héros existant

`calculateHeroHp` (`lib/game-engine.ts`) est une fonction pure qui recompte à chaque
rendu les tâches non résolues d'une liste donnée (`-20 HP` par tâche, plancher 0).
Aujourd'hui alimentée uniquement par les tâches reportées d'un jour précédent
(`overdueTasks`, calculées pour le Rituel du Réveil).

**Décision** : les tâches du jour courant dont `deadline_at` est dépassé et qui ne
sont ni complétées ni abandonnées sont ajoutées à ce même pool, avec un poids
distinct : **-10 HP** (contre -20 pour un vrai retard reporté au lendemain — une
deadline manquée en cours de journée est un avertissement, pas un retard acté).
Nécessite un second paramètre de poids dans `calculateHeroHp` (ou l'équivalent :
la fonction accepte une liste de `{ task, weight }` plutôt qu'une liste unique à
poids fixe — détail laissé au plan).

**Auto-résolution ("temporaire")** : comme `calculateHeroHp` est pure et recalculée
en direct, cocher (ou abandonner) la tâche fait disparaître son malus instantanément
— pas de logique de restauration séparée à écrire. Ça réconcilie le mot "temporaire"
du spec original avec la réutilisation du pool existant.

**Interaction avec le Rituel du Réveil ("Reporter")** : quand une tâche est reportée
au jour courant depuis le Réveil, sa `deadline_at` (déjà passée la veille) est
**effacée** (`null`) au moment du report. Évite un cumul du malus "deadline ratée"
(-10) avec le malus "retard reporté" (-20) déjà appliqué par le mécanisme existant
sur la même tâche. L'utilisateur peut refixer une nouvelle deadline après coup si
besoin.

---

## Détection live du franchissement

Polling client léger (interval ~30-60s) pendant que l'Arène est montée : compare
`deadline_at` des tâches actives non résolues à l'heure courante. Au franchissement
détecté pendant que l'app est ouverte → déclenche l'animation « Attaque Surprise ».

**Pas de replay au chargement** : si l'app était fermée/en arrière-plan au moment du
dépassement, aucune animation rejouée à la réouverture — la jauge Héros reflète
simplement le malus déjà actif, silencieusement (la relance à distance viendra avec
US-11, notifications push, hors scope ici).

---

## Effet visuel « Attaque Surprise »

Nouvel effet côté Héros, même famille que les pulses existants côté Boss (`Pulse`
"damage"/"heal", `FloatingText`, `ImpactVfx` dans `Arena.tsx`) mais avec un nouveau
point d'ancrage côté Héros dans `VersusScene` (jusqu'ici les pulses ne ciblaient que
le Boss) :
- La jauge HP du Héros clignote brièvement.
- Un texte flottant "-10 HP" apparaît près du sprite du Héros (réutilise
  `FloatingText`, `kind="damage"`).
- Variante douce sous `prefers-reduced-motion` (cohérent avec le reste de l'Arène :
  combo, Perfect/K.O.).

Pas de secousse d'écran globale (`hit-flash-overlay` réservé aux dégâts infligés au
Boss) pour ne pas confondre visuellement "je frappe le Boss" et "le Boss me
surprend".

**Action rapide de report (amélioration retenue)** : l'animation porte un bouton
"Repousser +1h" qui met à jour `deadline_at` directement (heure courante + 1h), sans
obliger à rouvrir le popover ⏰ de la tâche. Réduit la friction pour se remettre du
malus immédiatement après l'avoir subi.

---

## Edge cases

- Deadline fixée dans le passé (erreur de saisie ou minuit approchant) : acceptée
  sans blocage — elle compte comme immédiatement ratée au prochain tick de polling.
- Sous-tâche avec deadline ratée : contribue au même pool Héros (poids -10), le
  parent n'hérite pas d'un malus distinct (juste la sienne propre si elle en a une).
- Tâche abandonnée (Rage Quit ou Annihiler) après deadline ratée : sort du calcul
  immédiatement (déjà couvert par le filtre `!is_abandoned` de `calculateHeroHp`).

---

## Tests

- **Vitest** : extension de `calculateHeroHp` (ou nouvelle fonction de poids) —
  cas overdue seul, deadline seule, les deux combinés, plancher à 0, résolution
  (tâche complétée retire son malus).
- **Vitest** : fonction pure de détection "deadline dépassée et non résolue" à partir
  d'une liste de tâches + horodatage courant (paramétrable, testable sans horloge
  système réelle).
- Pas de test e2e sur le polling en temps réel (fragile, temporisation) — couvrir
  uniquement la fonction pure de détection et le rendu conditionnel de l'icône ⏰.
