# Spec — US-12 : Système de Streaks (Séries de Boss abattus)

> Date : 2026-07-20 · Statut : validé (brainstorming) · Sprint 2
> Dépend de : `day_results` (Cycle de la Journée) · alimente le bonus d'or (US-18) et le Panthéon (US-10).

## 1. Contexte & problème

`lib/game-engine.ts:currentStreak()` existe déjà mais en **lecture seule triviale** (A8 du Cycle) : compte les victoires consécutives, tout jour non-victoire casse. Ce spec livre la **mécanique complète** : tolérance hebdomadaire, persistance, affichage, danger, jalons.

## 2. Décisions de cadrage (tranchées)

| # | Décision |
|---|----------|
| D1 | **Streak = victoires consécutives**, mais les jours **non-victoire sont tolérés** dans une limite hebdomadaire. |
| D2 | **Budget unique : 2 non-victoires tolérées par semaine calendaire** (lundi→dimanche, **fuseau local** via `dayKey`). Une non-victoire = `retreat` **ou** `defeat` (jour raté backfillé). |
| D3 | **La 3ᵉ non-victoire d'une même semaine casse** la série (remise à 0). |
| D4 | **Longueur de streak = nombre de jours de victoire** dans la chaîne. Les jours tolérés **bridgent** la chaîne mais **ne l'incrémentent pas**. |
| D5 | **Rétroactif borné (hérité du Cycle)** : un « Terminé » au Réveil ne peut transformer en victoire qu'un jour **sans `day_result`** (gap → backfill). Un jour **déjà enregistré** (retreat/manual) n'est jamais réécrit. L'algo streak lit les `day_results` **après** backfill. |
| D6 | **`best_streak` persisté** sur `profiles` (record all-time), màj quand `currentStreak` le dépasse. |

### Améliorations retenues

| # | Amélioration |
|---|--------------|
| A1 | **Indicateur « série en danger »** : quand les 2 jokers de la semaine courante sont consommés, badge/flamme d'alerte — la prochaine non-victoire casse. |
| A2 | **Jalons de streak → titres** (7 / 30 / 100 j) débloquant un `current_title`, affichés au Panthéon (bloc Titres). |
| A3 | **Effet visuel de flammes** (BDD) à l'incrément de série, joué au moment de la victoire (overlay PERFECT / carte Crépuscule). |

### Baselines techniques

- **B1 — Pure & déterministe.** Tout le calcul (streak, jokers, danger) est pur dans `game-engine.ts`, testé Vitest.
- **B2 — Semaine locale.** La frontière de semaine est calculée dans le fuseau `profiles.timezone`, jamais UTC.
- **B3 — Source unique = `day_results`.** Le streak est **dérivé** ; `profiles.streak_days` / `best_streak` sont des caches rafraîchis, jamais la vérité.

## 3. Algorithme (remplace `currentStreak`)

```ts
// Semaine ISO locale : lundi 00:00 → dimanche 23:59 dans `timezone`.
weekKey(dayDate, timezone): string   // ex. "2026-W30"

currentStreak(dayResults, today, timezone): {
  length: number;          // jours de victoire dans la chaîne
  jokersUsedThisWeek: number;
  atRisk: boolean;         // jokersUsedThisWeek >= 2 (A1)
}
```

Walk-back depuis `today` (ou la veille si aujourd'hui n'a pas encore de résultat) :

1. Pour chaque jour en remontant, lire l'issue dans `day_results` (indexée par `day_date`).
2. **Victoire** → `length++`, continuer.
3. **Non-victoire** (retreat/defeat) → incrémenter le compteur de jokers **de la semaine locale de ce jour** ; si le compteur de cette semaine dépasse **2**, **stop** (série cassée à ce point). Sinon, le jour est toléré (bridge) → continuer sans incrémenter `length`.
4. **Aucun `day_result`** pour un jour passé = ne devrait pas arriver (backfill comble), mais par sécurité = traité comme non-victoire tolérable.
5. `atRisk` = jokers consommés **dans la semaine courante** ≥ 2.

Note : le comptage de jokers est **par semaine calendaire** ; en franchissant un lundi (en remontant), le compteur de la nouvelle semaine repart à 0.

## 4. Persistance & écriture

- `currentStreak` recalculé à la volée à chaque lecture (Crépuscule, Panthéon, header QG).
- À la clôture (`closeDay`) et en fin de Réveil (`backfillMissedDays`) : recalculer `length`, mettre à jour le cache `profiles.streak_days` et `profiles.best_streak = max(best_streak, length)`.
- Le **bonus d'or streak** (US-18 §3) lit `streakOnThatDay` = `length` au jour concerné.

## 5. Affichage

- **Header QG** : « 🔥 Série : N jours » + état danger (A1 : couleur/flamme alerte si `atRisk`).
- **Panthéon** (US-10) : record `best_streak` en trophée + jalons/titres (A2).
- **Victoire** (overlay PERFECT / carte Crépuscule) : animation flammes (A3) si la série s'incrémente, + « Nᵉ victoire d'affilée » (déjà en preview A8).
- **`prefers-reduced-motion`** : flammes remplacées par un état statique.

### 3 états UI
- Loading : compteur en squelette. Error : masquer le compteur, ne pas bloquer l'Arène. Empty : nouvel utilisateur (0 `day_results`) → « Série : 0 » sans alerte.

## 6. Modèle de données

### Modif `profiles`
- `best_streak int not null default 0`.
- `streak_days` (existant) : conservé comme cache de la série courante.
- `current_title` (existant) : màj par les jalons (A2).

Migration Supabase dédiée.

## 7. Découpage technique

### `lib/game-engine.ts` (pur, Vitest)
- `weekKey(dayDate, timezone)`.
- `currentStreak(dayResults, today, timezone)` → `{ length, jokersUsedThisWeek, atRisk }` (remplace l'actuel).
- `titleForStreak(bestStreak): string | null` (A2 : jalons 7/30/100).

### `app/actions/day.ts` (modif)
- `closeDay` / `backfillMissedDays` : après upsert, recalculer streak → màj caches `streak_days`, `best_streak`, `current_title`.

### Composants
- Header QG : compteur + danger.
- Overlay victoire : flammes (A3) + reduced-motion.

### Docs (même commit)
- `CLAUDE.md` : mécanique streak (budget jokers hebdo, best_streak, titres dérivés).
- `CHANGELOG.md` : ligne US-12.
- `SPECS_FONCTIONNELLES.md` : préciser la BDD US-12 (tolérance hebdo).

## 8. Tests

### Vitest (pur)
- `weekKey` : frontières lundi/dimanche, fuseaux ±, changement d'année ISO.
- `currentStreak` :
  - victoires pures → length croissante ;
  - 1 et 2 non-victoires dans la semaine → série tient, length inchangée sur ces jours ;
  - 3ᵉ non-victoire même semaine → cassure ;
  - non-victoires réparties sur 2 semaines (2+2) → série tient (budget par semaine) ;
  - `atRisk` vrai à 2 jokers dans la semaine courante ;
  - aujourd'hui sans résultat → part de la veille.
- `titleForStreak` : paliers exacts.

### Playwright e2e (série, prod)
- Étendre `crepuscule-recap.spec.ts` : victoires consécutives → compteur incrémente ; une retraite tolérée → série tient ; badge danger après 2 non-victoires.
- ⚠️ Compte e2e unique : nécessite de **semer des `day_results`** contrôlés (fixture) — sinon non déterministe.

## 9. Hors scope

- Streak freeze **achetable** / gel manuel → future.
- Récompenses de streak autres que titres (héros, or exceptionnel) → future.

## 10. Vérification

1. Vitest vert (cas jokers hebdo inclus).
2. `build` + `lint` propres.
3. e2e série vert en local.
4. Manuel : simuler une semaine avec 2 retraites (série tient) puis une 3ᵉ (cassure) ; badge danger ; record `best_streak` figé ; bonus d'or reflète la série au jour J.
