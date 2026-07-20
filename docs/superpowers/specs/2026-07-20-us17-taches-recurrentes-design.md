# Spec — US-17 : Mode Entraînement (Tâches récurrentes)

> Date : 2026-07-20 · Statut : validé (brainstorming) · Sprint 2
> S'intègre au Rituel du Réveil (US-08). Respecte la forward-compat B4 du Cycle.

## 1. Contexte & problème

`tasks.is_recurring` existe mais **aucune logique** ne recrée les quêtes quotidiennes. Ce spec livre le **Mode Entraînement** : des routines (quêtes) qui se régénèrent selon des **jours de la semaine choisis**, générées au Réveil du jour courant.

## 2. Décisions de cadrage (tranchées)

| # | Décision |
|---|----------|
| D1 | **Récurrence par jours de la semaine sélectionnables** (ex. lun/mer/ven). Pas seulement quotidien. |
| D2 | **Table dédiée `recurring_templates`** (le template n'est pas une tâche du jour). Les instances sont des lignes `tasks` normales. |
| D3 | **Génération au Réveil (US-08) du jour courant uniquement** : pour chaque template actif dont la règle inclut le jour local courant, créer **une** instance `tasks` (`day_date = aujourd'hui`). |
| D4 | **Instance non faite au changement de jour = reste à résoudre** au Réveil (comme toute tâche : Terminé / Reporter / Annihiler). |
| D5 | **Anti-doublon — 1 instance / routine / jour** : si un reste d'une routine est **Reporté** vers aujourd'hui, la génération fraîche de cette routine est **sautée** (le report gagne). Terminé/Annihilé → instance fraîche générée. |
| D6 | **Aucune génération rétroactive** : le backfill des jours ratés **n'invente jamais** d'instances. Seul le jour courant en génère → une absence longue ne crée pas N restes. |
| D7 | **Pas de sous-tâches sur un template** en v1 (instance = tâche racine simple). |

### Améliorations retenues

| # | Amélioration |
|---|--------------|
| A1 | **Icône 🔁** sur les instances récurrentes → distinguables des one-shot dans l'Arène et le Réveil. |
| A2 | **Jour de repos planifié** : possibilité de **passer** une routine pour un jour donné sans que ça devienne un reste forcé (désamorce la douleur du rollover-en-reste, D4). |

### Baselines techniques

- **B1 — Génération idempotente.** Rejouer le Réveil le même jour ne duplique pas : une instance par `(template_id, day_date)` (garde applicative + anti-doublon D5).
- **B2 — Réutilise le heal.** Une instance générée est une tâche normale → elle **soigne le Boss** (+20, RG-02) et compte dans l'issue du jour.
- **B3 — Pas de contrainte SQL bloquante** ajoutée sur le report (respecte B4 du Cycle).
- **B4 — Édition = futur seulement.** Renommer / changer les jours / désactiver un template n'affecte que les instances **à venir**, jamais les instances déjà créées.

## 3. Règle de récurrence

```ts
// weekdays : ensemble de 0..6 (lundi..dimanche, semaine locale).
shouldGenerate(template, dayDate, timezone): boolean
// true si template.is_active && weekdayOf(dayDate, timezone) ∈ template.weekdays
//      && !restDay(template, dayDate)        // A2 jour de repos
```

## 4. Génération au Réveil (intégration US-08)

En **fin** de traitement du Réveil (après résolution des restes, avant déblocage de l'Arène), pour le **jour courant** :

1. Charger les `recurring_templates` actifs de l'utilisateur.
2. Pour chacun, si `shouldGenerate(template, today, tz)` :
   - **sauter** si une instance de ce template existe déjà pour `today` (déjà générée, ou reste **Reporté** de cette routine → D5) ;
   - sinon insérer une `tasks` (`day_date=today`, `is_recurring=true`, `recurring_template_id=template.id`, `title` copié, `position` dérivée de `template.position`).
3. Les instances générées soignent le Boss du jour (B2).

Ordre vs restes : la génération vient **après** les résolutions pour que la règle anti-doublon (D5) voie les reports déjà appliqués.

## 5. Gestion des templates

- **Créer** : depuis l'Arène, marquer une nouvelle tâche « quête récurrente » → crée un `recurring_template` + (si aujourd'hui matche) l'instance du jour.
- **Éditer / changer les jours / désactiver** : `is_active=false` ou modifier `weekdays` — effet **futur seulement** (B4). Pas de DELETE (esprit RG-04) → désactivation.
- **Jour de repos** (A2) : marquer un `(template, day)` sauté → n'apparaît pas ce jour, pas un reste.

## 6. Modèle de données

### Nouvelle table `recurring_templates`

| Colonne | Type | Rôle |
|---------|------|------|
| `id` | uuid PK | |
| `user_id` | uuid FK profiles | |
| `title` | text | |
| `weekdays` | int[] (ou bitmask) | jours 0..6 (lundi=0), semaine locale |
| `is_active` | bool default true | désactivation (pas de DELETE) |
| `position` | int | ordre par défaut des instances |
| `created_at` | timestamptz | |

### Nouvelle table `recurring_rest_days` (A2)
`(user_id, template_id, day_date)` — jours de repos planifiés. Pas de DELETE requis (ou toggle).

### Modif `tasks`
- `recurring_template_id uuid` (nullable, FK `recurring_templates.id`) — lie l'instance à son template.
- `is_recurring` (existant) : `true` sur les instances générées (pour l'icône A1).

- **RLS** : select/insert/update own sur `recurring_templates` ; **pas de DELETE** (RG-04). Migrations Supabase dédiées.

## 7. Découpage technique

### `lib/game-engine.ts` (pur, Vitest)
- `weekdayOf(dayDate, timezone)`, `shouldGenerate(template, dayDate, timezone, restDays)`.
- `planRecurringGeneration(templates, today, existingInstances, restDays, timezone)` → liste des templates à instancier (applique D5/D6 en pur, sans I/O).

### `app/actions/recurring.ts`
- `createRecurringTemplate({title, weekdays})`, `updateRecurringTemplate`, `deactivateRecurringTemplate`, `toggleRestDay(templateId, day)`.

### `app/actions/day.ts` (modif Réveil)
- En fin de Réveil : appeler `planRecurringGeneration` puis insérer les instances manquantes (idempotent B1).

### Composants
- Toggle « quête récurrente » + sélecteur de jours à la création.
- Icône 🔁 (A1) sur les instances (Arène + Réveil).
- Gestion des routines (liste, désactiver, jour de repos) — écran léger (QG ou section Arène).

### Docs (même commit)
- `CLAUDE.md` : Mode Entraînement (génération au Réveil, anti-doublon 1/routine/jour, pas de rétro, tables `recurring_templates`/`recurring_rest_days`, `recurring_template_id`).
- `CHANGELOG.md` : ligne US-17.
- `SPECS_FONCTIONNELLES.md` : préciser la BDD US-17 (jours sélectionnables, rollover-en-reste, anti-doublon).

## 8. Tests

### Vitest (pur)
- `weekdayOf` : mapping local correct (fuseaux ±, frontière de jour).
- `shouldGenerate` : jour inclus/exclu, template inactif, jour de repos.
- `planRecurringGeneration` :
  - génère pour les templates du jour ;
  - **saute** si instance déjà présente (idempotence) ;
  - **saute** si un reste reporté de la routine est déjà sur aujourd'hui (D5) ;
  - **aucune** génération pour jours passés (D6).

### Playwright e2e (série, prod)
- `recurring.spec.ts` : créer une routine lun/mer/ven ; simuler un nouveau jour matchant → instance générée + Boss soigné ; instance non faite au jour suivant → apparaît dans le Réveil ; Reporter → pas de doublon ce jour (D5) ; absence de plusieurs jours → pas de N restes (D6).
- ⚠️ Compte unique série : contrôler date locale simulée + templates via fixture ; nettoyer les templates entre specs.

## 9. Hors scope

- Récurrence mensuelle / intervalles (« tous les 3 jours ») → future.
- Sous-tâches récurrentes (D7).
- Statistiques de complétion d'habitude (streak par routine) → future.

## 10. Vérification

1. Vitest vert (génération + anti-doublon + no-rétro).
2. `build` + `lint` propres.
3. e2e série vert en local.
4. Manuel : routine sur jours choisis → générée le bon jour, soigne le Boss, icône 🔁 ; non faite → reste au Réveil ; Reporter sans doublon ; jour de repos = pas de reste ; absence longue = pas d'accumulation.
