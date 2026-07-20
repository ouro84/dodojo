# Spec — Le Cycle de la Journée (US-07 + US-08)

> Date : 2026-07-20 · Statut : validé (brainstorming) · Issues : #4 (US-07), #5 (US-08)
> Remplace les BDD isolées d'US-07 / US-08 par un modèle unifié.

## 1. Contexte & problème

US-07 et US-08 n'étaient que des squelettes BDD, non implémentables tels quels. Elles ne sont pas deux features isolées mais **les deux bornes d'un même cycle** : une fin de journée (Crépuscule) laisse des tâches non résolues, qui deviennent les « restes » traités au démarrage du lendemain (Réveil). Ce spec modélise d'abord la machine à états du jour, puis en dérive les deux rituels.

Aujourd'hui la boucle de combat quotidienne (créer/valider/abandonner, XP, VFX) est livrée, mais **rien ne clôture ni ne reset la journée**. Conséquence : pas de victoire ressentie, pas de socle pour le streak (US-12) ni le partage (US-20), et la jauge de HP du Héros reste décorative (dette assumée dans `CLAUDE.md`).

**Renommage** : le « Rituel Obi-Wan » devient le **Rituel du Crépuscule** (fin de journée sereine, non-punitive), en symétrie avec le **Rituel du Réveil** (aube). Obi-Wan disparaît du vocabulaire produit.

## 2. Décisions de cadrage (tranchées)

| # | Décision |
|---|----------|
| D1 | **Un seul spec** « Cycle de la Journée » ; US-07 et US-08 en découlent. |
| D2 | **Bascule de jour automatique par date** (RG-03). Le Crépuscule ne conditionne pas le passage au jour suivant. |
| D3 | Le **Crépuscule (US-07) est optionnel / cérémoniel**, jamais bloquant. |
| D4 | Le **Réveil (US-08) est le seul chemin bloquant** : tant qu'il reste des restes, l'Arène du jour est inaccessible. |
| D5 | **« Reporter »** un reste → `day_date = jour local courant` : la tâche revient dans la liste du jour et **soigne le Boss** (+20/+10 HP, RG-02). Snowball assumé = coût de la procrastination. |
| D6 | **« Annihiler »** = `is_abandoned = true`, **jamais** de `DELETE` (RG-04). |
| D7 | **On persiste l'état de fin de journée** dès maintenant via une table `day_results` (fondation Panthéon US-10 / Streak US-12 / Partage US-20). |
| D8 | **Backfill au Réveil** : chaque jour passé non clôturé avec des restes reçoit un `day_result` (`outcome=defeat`) → historique sans trous. |

### Améliorations retenues (au-delà des BDD d'origine)

| # | Amélioration |
|---|--------------|
| A1 | **3e option « Terminé » au Réveil** : marquer un reste `is_completed` rétroactivement → inflige les dégâts au Boss de son jour d'origine, peut transformer un `defeat` en `victory` tardive. |
| A2 | **Fix fuseau horaire** : le « jour » est le jour **local** de l'utilisateur (voir §6), plus l'UTC de `todayIso()`. Solde le piège « décalage horaire » de `CLAUDE.md`. |
| A3 | **Récap Crépuscule conçu dès maintenant comme carte de score arcade** (self-contained), prêt pour l'export PNG d'US-20 sans refonte. |
| A4 | **Anti « mur de la honte »** : au Réveil, actions groupées (« Tout reporter », « Tout annihiler les jours > 2j ») accessibles en un geste + liste scrollable cappée. |
| A5 | **Coût tangible animé** : la jauge Héro descend à l'ouverture du Réveil et **remonte** à chaque reste résolu. |
| A6 | **Lien narratif** entre rituels : au Crépuscule Boss vivant, « il te reste N monstres, ils t'attendront demain » ; au Réveil, le Boss fui ricane. |
| A7 | **`prefers-reduced-motion`** : variante mouvement réduit sur les deux overlays. |
| A8 | **Streak preview (lecture seule)** au Crépuscule : « Nᵉ victoire d'affilée », calculé depuis `day_results`, sans la mécanique complète US-12. |

### Baselines techniques (non négociables)

- **B1 — Annihiler ≠ échec (ton).** Même colonne `is_abandoned` que le Rage Quit (US-15), mais émotion opposée : « on tourne la page », serein. Le ton distingue.
- **B2 — Reprise au fil de l'eau.** Chaque action du Réveil = server action immédiate. Aucune transaction « tout ou rien » : fermer l'app à 3/10 restes traités → reprise propre.
- **B3 — Chiffres recalculés, jamais accumulés.** `day_result.damage_dealt` / `xp_earned` / `tasks_*` sont **recalculés depuis les tâches** du jour à chaque écriture (idempotence sur reclose). Source de vérité unique = table `tasks`.
- **B4 — Forward-compat récurrentes (US-17).** Le modèle de report ne doit pas empêcher une future logique de recréation de tâches récurrentes. Aucune contrainte SQL bloquante ajoutée sur ce point.

## 3. Machine à états du jour

Un jour est identifié par `(user_id, day_local)`.

```
  OUVERT (day_local == aujourd'hui)
    │  Arène normale : add / complete / abandon
    │
    ├──► Crépuscule (US-07, optionnel) ──► CLÔTURÉ
    │        upsert day_result (victory | retreat), closed_manually=true
    │        récap figé, NON-verrouillant (add tâche ré-ouvre ; reclose = upsert)
    │
    └──► minuit local (RG-03) ──► PASSÉ
             ├─ résolu (tout completed/abandoned OU day_result présent) → rien
             └─ restes (incomplete & !abandoned) → RÉVEIL au prochain launch

  RÉVEIL (US-08, bloquant)
    Chaque reste : Terminé (A1) | Reporter (→ jour J, heal Boss) | Annihiler (is_abandoned)
    + backfill day_result (outcome=defeat, closed_manually=false) par jour passé raté
    → restes vidés → Arène débloquée, jauge Héro remontée (A5)
```

**Étanchéité (RG-03)** : le Boss du jour est calculé uniquement sur les tâches `day_local == aujourd'hui`. Un combat non fini à minuit reste en suspens.

## 4. Rituel du Réveil (US-08)

- **Déclencheur** : au launch, s'il existe ≥1 tâche `day_local < aujourd'hui` & `!is_completed` & `!is_abandoned`. Ces `overdueTasks` sont déjà chargées dans `app/page.tsx:45-51`.
- **UI** — overlay **bloquant** (patron `PerfectOverlay` / `LevelUpOverlay`), Arène inerte derrière :
  - Restes listés **par tâche racine** (sous-tâches incomplètes nichées dessous), **groupés par jour** (« Hier », « Il y a N jours »).
  - Jauge Héro affichée en tête, animée (A5) : part du HP pénalisé, remonte à chaque résolution.
  - Intro voix **Sensei** + pique du **Boss** fui (A6). Ton **non-punitif** (B1).
- **Actions par reste** (chacune = server action immédiate, B2), cascade sur sous-tâches (réutilise `computeToggleCascade`) :
  - **Terminé** (A1) → `is_completed = true` sur le jour d'origine.
  - **Reporter** → `day_date = jour local courant`, nouvelle `position` ; soigne le Boss du jour (D5).
  - **Annihiler** → `is_abandoned = true` (D6).
- **Actions groupées** (A4) : « Tout reporter », « Tout annihiler les jours > 2j ». Liste scrollable, pas de mur infini.
- **Backfill** (D8) : le `day_result` d'un jour passé est écrit **après** que ses restes ont été traités, en une passe. **Règle d'issue** : `outcome = victory` **seulement si toutes** les tâches de ce jour finissent `is_completed` (via « Terminé » ou déjà validées) ; une tâche **Reportée** (elle quitte son jour d'origine) ou **Annihilée** compte comme non-gagnée → le jour reste `defeat`. Un jour ne peut donc devenir victoire tardive que si tous ses restes sont passés en « Terminé ».
- **Sortie** : plus aucun reste → overlay se ferme → Arène du jour débloquée.
- **États UI** : Loading (traitement en cours), Error (échec server action → retry, tâche inchangée), Empty (aucun reste → pas de Réveil, cas nominal du nouvel utilisateur).

## 5. Rituel du Crépuscule (US-07)

- **Déclencheur** : bouton « Rituel du Crépuscule » dans l'Arène, visible dès ≥1 tâche créée le jour même (sinon rien à clôturer). Libellé/ton adaptés à l'état (Boss K.O. vs vivant).
- **Écran récap figé — carte de score arcade** (A3, self-contained pour US-20) :
  - Dégâts infligés, tâches validées / abandonnées, XP gagné du jour.
  - Issue : `victory` (Boss 0 HP) → réutilise `PerfectOverlay` (explosion, « PERFECT ») ; `retreat` (Boss vivant) → ton apaisé, digne, jamais culpabilisant.
  - Si Boss vivant : « il te reste N monstres, ils t'attendront demain » (A6).
  - **Streak preview** (A8) : « Nᵉ victoire d'affilée » calculé depuis `day_results` (lecture seule).
- **Persistance** : **upsert** `day_result` sur `(user_id, day_local)`, `closed_manually=true`. Idempotent (B3).
- **Non-verrouillant** (D3) : fermer le récap, ajouter une tâche reprend l'Arène ; au prochain Crépuscule, l'upsert met à jour le snapshot (un `victory` peut redevenir `retreat` si on rouvre et laisse un reste — comportement assumé).
- **Voix** : Sensei (félicitation sobre / retraite digne) + réplique Boss. Jurons réservés au pic victoire (tone doc).
- **États UI** : Loading, Error (échec upsert → retry), Empty (aucune tâche du jour → bouton absent).

## 6. Fuseau horaire — le « jour local » (A2)

Problème actuel : `todayIso()` (`app/page.tsx:6`) = `new Date().toISOString().slice(0,10)` → date **UTC**. Un utilisateur français à 00h30 locale est encore « hier » en UTC → Réveil et étanchéité (RG-03) se déclenchent au mauvais moment.

**Solution retenue** : colonne `timezone` (IANA, ex. `Europe/Paris`) sur `profiles`, captée à l'onboarding via `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- Helper pur `dayKey(date, timezone)` dans `lib/game-engine.ts` → calcule la date calendaire locale (`YYYY-MM-DD`).
- Toutes les requêtes/écritures `day_date` et la comparaison « restes = jour local < aujourd'hui » passent par ce helper.
- Corrige aussi le piège « voyage / changement de fuseau » (`CLAUDE.md`).
- *À challenger en relecture* : alternative = offset envoyé par cookie client. La colonne `profiles.timezone` est retenue pour une source unique et stable.

## 7. Modèle de données

### Nouvelle table `day_results`
Une ligne par `(user_id, day_date)`.

| Colonne | Type | Rôle |
|---------|------|------|
| `id` | uuid PK | |
| `user_id` | uuid FK profiles | |
| `day_date` | date | jour **local** ; **unique (user_id, day_date)** |
| `outcome` | text | `victory` \| `retreat` \| `defeat` |
| `damage_dealt` | int | somme HP des tâches complétées ce jour |
| `boss_max_hp` | int | Boss max du jour (snapshot) |
| `tasks_completed` | int | |
| `tasks_abandoned` | int | |
| `xp_earned` | int | XP gagné le jour |
| `closed_manually` | bool | true = Crépuscule, false = backfill Réveil |
| `closed_at` | timestamptz | |

- **RLS** : select / insert / update own. **Pas de policy DELETE** (RG-04).
- Écriture idempotente (upsert sur la contrainte unique).

### Modif `profiles`
- Ajout colonne `timezone text` (IANA), écrite à l'onboarding.

Deux migrations Supabase dédiées.

## 8. Découpage technique

### `lib/game-engine.ts` (pur, testé Vitest)
- `dayKey(date, timezone): string` — date calendaire locale.
- `summarizeDay(tasks): { damage_dealt, boss_max_hp, tasks_completed, tasks_abandoned, outcome }` — réutilise `taskHpValue`, `calculateBossMaxHp`.
- `planWakeUp(overdueTasks, timezone): { groupsByDay, cascadePlan }` — groupage par jour local + plan de cascade sous-tâches.
- Réutilise `computeToggleCascade`, `nextSiblingPosition`, `calculateHeroHp`.

### `app/actions/tasks.ts` (patron `abandonTask` / `reorderSiblings`)
- `completeOverdueTask(id)` (A1), `deferOverdueTask(id)` (D5), `annihilateOverdueTask(id)` (D6).
- Variantes bulk : `deferAllOverdue()`, `annihilateOverdueOlderThan(days)` (A4).
- `closeDay()` — upsert `day_result` `closed_manually=true` (B3).
- `backfillMissedDays()` — appelé pendant le traitement du Réveil (D8).

### Composants (`components/combat/`)
- `WakeUpRitual.tsx` — overlay bloquant (Réveil), jauge Héro animée, groupes, actions.
- `CrepusculeRecap.tsx` — carte de score arcade (récap Crépuscule), self-contained.
- Câblage dans `Arena.tsx` : monter le Réveil au boot si restes ; bouton + récap Crépuscule. 3 états UI respectés, `prefers-reduced-motion` (A7).

### Docs (même commit)
- `CLAUDE.md` : solde dette jauge Héro, nouvelle table `day_results`, colonne `profiles.timezone`, fix fuseau, renommage Crépuscule.
- `CHANGELOG.md` : lignes US-07 / US-08 sous `[Unreleased]`.
- `SPECS_FONCTIONNELLES.md` : renommer Obi-Wan → Crépuscule, aligner les BDD sur ce spec.

## 9. Tests

### Vitest (pur)
- `dayKey` : dates limites (23h/01h locale, TZ ±, changement de jour).
- `summarizeDay` : victoire / retraite / défaite, dégâts, sous-tâches (10 HP), idempotence.
- `planWakeUp` : groupage multi-jours, cascade sous-tâches, tri.

### Playwright e2e (série, serveur prod)
- `wake-up-ritual.spec.ts` : ouvrir avec restes → overlay bloquant → **Terminé** inflige les dégâts au jour d'origine ; **Reporter** ramène au jour J et soigne le Boss ; **Annihiler** marque `is_abandoned` (vérif en base : ligne **toujours présente**, RG-04) ; backfill `day_result` écrit ; Arène débloquée après vidage.
- `crepuscule-recap.spec.ts` : Boss K.O. → clôture → `day_result` `victory` ; clôture Boss vivant → `retreat` ; reclose = upsert idempotent.

## 10. Hors scope (repoussé)

- Mécanique complète de Streak (US-12) — seule la lecture (A8) est ici.
- Export PNG / partage (US-20) — le récap est conçu pour, mais l'export n'est pas livré.
- Clôture auto à minuit par cron (job planifié) — le backfill au Réveil couvre le besoin sans infra.
- Recréation des tâches récurrentes (US-17) — seule la forward-compat (B4) est garantie.

## 11. Vérification (fin d'implémentation)

1. `npm run test` (Vitest) vert, nouveaux cas inclus.
2. `npm run build` sans erreur (TS strict).
3. `npm run lint` propre.
4. `npx playwright test` (série, serveur prod) : specs existantes + 2 nouvelles vertes en local.
5. Manuel : simuler un jour local à 00h30 (TZ) → Réveil correct ; Terminé/Reporter/Annihiler ; jauge Héro remonte ; Crépuscule victoire vs retraite ; reclose idempotent.
6. Base : tâches annihilées `is_abandoned=true` **et toujours présentes** (RG-04) ; `day_results` peuplée sans trous (backfill).
