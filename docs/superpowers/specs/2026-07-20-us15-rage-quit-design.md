# Spec — US-15 : Le « Rage Quit » de tâche (Micro-punition)

> Date : 2026-07-20 · Statut : validé (brainstorming) · Sprint 2
> Cousin d'« Annihiler » (Réveil) : même colonne `is_abandoned`, émotion opposée (B1 du Cycle).

## 1. Contexte & problème

Abandonner une tâche **active du jour**, en cours de combat, doit coûter — sinon l'abandon est gratuit. `is_abandoned` existe et `applyXpDelta` gère déjà le négatif, mais aucune action « Rage Quit » n'est câblée. Ce spec définit l'action, sa punition, et sa distinction d'avec l'« Annihiler » serein du Réveil.

## 2. Décisions de cadrage (tranchées)

| # | Décision |
|---|----------|
| D1 | **Rage Quit** = abandonner une tâche `day_date == aujourd'hui`, `!is_completed`, `!is_abandoned`. |
| D2 | **Le Boss rétrécit** : `is_abandoned = true` → la tâche sort de `calculateBossMaxHp`/`CurrentHp` → HP max **et** actuels baissent de sa valeur (20 racine / 10 sous-tâche). Cohérent avec le moteur et « Annihiler ». |
| D3 | **Malus = −5 XP, sans de-level** : `xp = max(0, xp − 5)`, **niveau inchangé**. Helper dédié (≠ `applyXpDelta` qui, lui, peut redescendre de niveau). |
| D4 | **Cascade sous-tâches** : rage-quit d'une racine → ses sous-tâches actives passent aussi `is_abandoned` (réutilise la logique de cascade). Une sous-tâche peut être rage-quit seule. |
| D5 | **Confirmation obligatoire** (action punitive) + **undo même-jour** : annuler restaure `is_abandoned = false`, ré-ajoute les HP au Boss et **rembourse** le −5 XP. Pas de DELETE (RG-04). |
| D6 | **Distinction en base** d'avec « Annihiler » (reste sans malus) via un flag, pour les stats. |

### Améliorations retenues

| # | Amélioration |
|---|--------------|
| A1 | **Flag `abandon_reason`** (`rage_quit` \| `annihilated`) sur `tasks` → le Panthéon peut distinguer « abandons de rage » des restes nettoyés sereinement (sinon indistinguables). |
| A2 | **Punchline du Boss** (tone-of-voice) au Rage Quit : « le Boss ricane » (BDD) — réplique tirée du spec ToV. |

### Baselines techniques

- **B1 — Émotion opposée à Annihiler.** Même `is_abandoned`, mais Rage Quit = punitif (malus + ricanement) ; Annihiler = serein (aucun malus). Le `abandon_reason` + le ton portent la différence.
- **B2 — Idempotence.** Rage-quit d'une tâche déjà abandonnée = no-op (pas de double malus). Le refund n'est possible que si la tâche a bien été rage-quit (`abandon_reason='rage_quit'`).
- **B3 — Malus pur.** Le calcul XP (clamp) est pur, testé.

## 3. Mécanique

- Action `rageQuitTask(id)` :
  1. Vérifier tâche active du jour (D1), sinon refus.
  2. Cascade (D4) : rassembler la tâche + sous-tâches actives.
  3. `is_abandoned = true`, `abandon_reason = 'rage_quit'` (A1) sur l'ensemble.
  4. Appliquer **une fois** le malus −5 XP clampé (D3) au profil.
  5. Revalidate → Boss rétréci (D2), punchline (A2).
- Action `undoRageQuit(id)` (même jour) : `is_abandoned = false`, `abandon_reason = null`, **+5 XP** (rétabli, clampé), cascade inverse sur sous-tâches. Bornée au jour courant.

Note : le malus est **par action de rage quit**, pas par tâche cascadée (rage-quit d'un parent à 3 enfants = −5 XP, pas −20).

## 4. Interaction avec le reste

- **Étanchéité (RG-03)** : ne concerne que le jour courant. Les restes de la veille passent par « Annihiler » (Réveil), pas Rage Quit → pas de malus.
- **US-16 PERFECT** : rage-quitter des tâches réduit le Boss ; s'il tombe à 0 par ce biais (plus aucune tâche active non complétée), **ce n'est pas une victoire** au sens combat (aucun dégât infligé sur ces tâches) — l'issue reste pilotée par `summarizeDay` (victory seulement si `currentHp==0 && bossMaxHp>0` via dégâts). Cas limite à couvrir en test : jour où tout est soit complété soit rage-quit.
- **Or / streak** : abandons comptés dans `tasks_abandoned` du `day_result` ; l'issue et l'or en découlent (US-18).

## 5. Modèle de données

### Modif `tasks`
- `abandon_reason text` (nullable) : `'rage_quit'` | `'annihilated'` | `null`. Renseigné par Rage Quit (US-15) et par « Annihiler » (Réveil, à mettre à jour pour poser `'annihilated'`).

Migration Supabase dédiée. Pas de nouvelle policy DELETE (RG-04 inchangé).

## 6. Découpage technique

### `lib/game-engine.ts` (pur, Vitest)
- `applyRageQuitPenalty(state: XpState): XpState` — `{ level, xp: max(0, xp−5) }`, niveau inchangé (D3).
- Constante `RAGE_QUIT_XP_PENALTY = 5`.
- Réutilise `computeToggleCascade`-like pour lister les sous-tâches à abandonner.

### `app/actions/tasks.ts` (patron existant)
- `rageQuitTask(id)`, `undoRageQuit(id)` (§3).
- Mettre à jour `annihilateOverdueTask` (Réveil) pour poser `abandon_reason='annihilated'` (A1).

### Composants (`components/combat/`)
- Bouton « Abandonner (Rage Quit) » par tâche active + **modale de confirmation** (D5).
- Toast « annuler » (undo) après action.
- Punchline Boss + micro-anim ricanement (A2), `prefers-reduced-motion`.

### Docs (même commit)
- `CLAUDE.md` : Rage Quit vs Annihiler (`abandon_reason`), malus clampé sans de-level.
- `CHANGELOG.md` : ligne US-15.
- `SPECS_FONCTIONNELLES.md` : préciser la BDD US-15 (Boss rétrécit, malus sans de-level, undo).

## 7. Tests

### Vitest (pur)
- `applyRageQuitPenalty` : xp≥5 → −5 ; xp<5 → 0 sans de-level ; xp=0 niveau>1 → reste niveau, xp 0.
- Cascade : parent + N enfants actifs → tous ciblés ; sous-tâche seule ; enfants déjà complétés/abandonnés exclus.
- HP : Boss rétréci de la valeur exacte après abandon (via `calculateBossMaxHp`).

### Playwright e2e (série, prod)
- `rage-quit.spec.ts` : rage-quit d'une tâche active → `is_abandoned=true` + `abandon_reason='rage_quit'` (ligne **toujours présente**, RG-04) + Boss rétréci + XP −5 ; undo → restauré + XP +5 ; rage-quit d'un parent cascade sur enfants.
- ⚠️ Compte unique série : réinitialiser l'état XP/tâches en fixture.

## 8. Hors scope

- Malus d'or sur Rage Quit → non (punition = XP + ricanement).
- Statistiques avancées d'abandon au Panthéon (juste rendues possibles par `abandon_reason`).

## 9. Vérification

1. Vitest vert (clamp + cascade + HP).
2. `build` + `lint` propres.
3. e2e série vert en local.
4. Manuel : rage quit (confirmation, Boss rétrécit, −5 XP, Boss ricane) ; undo (+5, tâche revient) ; parent cascade ; à niveau 2 avec <5 XP → pas de de-level.
