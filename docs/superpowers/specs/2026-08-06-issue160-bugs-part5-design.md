# Issue #160 — « les bugs part5 » — design

> Date : 2026-08-06
> Issue : [#160](https://github.com/ouro84/dodojo/issues/160)
> Portée : une seule PR. Cinq bugs (4 de l'issue + 1 remonté en cours de brainstorm), cinq causes racines indépendantes.

---

## 1. Cadre

| # | Symptôme remonté | Cause racine | Section |
|---|---|---|---|
| 1 | Le boss affiché change à l'ajout de la 1ère tâche | `resolveDailyBoss` : check-then-insert non atomique, race avec le `revalidatePath("/")` d'`addTask` | [§2](#2-a--boss-qui-change-en-cours-de-journée) |
| 2 | « En danger, jokers de la semaine épuisés » affiché à tort (compte 100% victoire) | `backfillMissedDays` gatée derrière Le Réveil, qui ne se monte jamais pour un compte sans retard → jours gagnés mais jamais clôturés restent des trous permanents | [§3](#3-b--jokers-de-série-consommés-à-tort) |
| 3 | Écran VS/FIGHT trop court | Timeline `VsIntroOverlay` à rallonger de 2s (3000ms → 5000ms) | [§4](#4-c--écran-vsfight-trop-court) |
| 4 | Boss mal orienté sur l'écran VS/FIGHT | `VsIntroOverlay` n'applique jamais `boss.flip` sur le bust, contrairement à `VersusScene` en combat | [§5](#5-d--orientation-du-boss-sur-lécran-vsfight) |
| 5 | Rappel push 17h30 : « 20 tâches restantes » alors qu'il en reste 1 (et 20 HP au boss) | HP du Boss injecté dans des templates de comptage de tâches — et 2 des 6 templates violent la fiction (un seul Boss/jour, jamais plusieurs monstres) | [§6](#6-e--rappel-push--unité-erronée--wording-à-revoir) |

**Règle transverse imposée pour cette PR (même patron que #156) : chaque bug corrigé porte au moins un test qui échoue avant le correctif et passe après.** Matrice récapitulative en [§7](#7-matrice-de-couverture-de-tests).

---

## 2. A — Boss qui change en cours de journée

### Cause

`resolveDailyBoss` (`app/actions/boss.ts:51-98`) fait un **check-then-insert non atomique** :

1. `SELECT` sur `daily_boss` pour `(user_id, today)`.
2. Si absent : tire un boss random (`pickDailyBoss`), `INSERT`.
3. Si l'`INSERT` échoue (conflit PK), relit la ligne (`raced`) — mais si cette relecture échoue aussi (`raced` est `null`, ex. latence/erreur transitoire), retombe sur `{ bossId: boss.id, backgroundId }`, c'est-à-dire **le pick local de CET appel**, jamais persisté.

Cette fenêtre de course est déclenchée en pratique par `app/actions/tasks.ts` (`addTask`), qui finit par `revalidatePath("/")` — ce qui re-rend `app/page.tsx` et donc rappelle `resolveDailyBoss()` une seconde fois, quasi simultanément avec le premier chargement de l'Arène. Deux appels concurrents peuvent chacun tirer un boss différent avant que l'un des deux `INSERT` échoue sur la contrainte `(user_id, day_date)`.

### Correctif

Remplacer le triptyque SELECT → INSERT → (relecture conditionnelle en fallback) par : **upsert idempotent, puis relecture systématique et inconditionnelle** — jamais de pick local en secours tant que la relecture réussit.

```ts
const boss = pickDailyBoss(recentBossIds);
const backgroundId = pickBackgroundId(boss);

await supabase.from("daily_boss").upsert(
  { user_id: user.id, day_date: today, boss_id: boss.id, background_id: backgroundId },
  { onConflict: "user_id,day_date", ignoreDuplicates: true },
);

const { data: persisted } = await supabase
  .from("daily_boss")
  .select("boss_id, background_id")
  .eq("user_id", user.id)
  .eq("day_date", today)
  .maybeSingle();

selection = persisted
  ? { bossId: persisted.boss_id, backgroundId: persisted.background_id }
  : { bossId: boss.id, backgroundId }; // extrême : upsert ET relecture ont échoué (panne DB)
```

`ignoreDuplicates: true` fait du conflit un no-op silencieux (pas d'erreur `23505` à intercepter). La relecture qui suit est **inconditionnelle** : que l'upsert de cet appel ait gagné la course ou perdu contre un appel concurrent, elle renvoie toujours la ligne réellement persistée — les deux appels concurrents convergent nécessairement vers la même valeur. Le seul cas où le pick local resurgit est une double panne DB (upsert et select échouent tous les deux), un cas déjà présent dans le comportement actuel et non aggravé.

Aucun changement de schéma : la table a toujours zéro policy UPDATE/DELETE (immuable une fois écrite), seule la voie d'écriture initiale change.

---

## 3. B — Jokers de série consommés à tort

### Cause

`currentStreak` (`lib/game-engine.ts:836-880`) traite tout jour sans ligne `day_results` comme une non-victoire ("trou", tolérée par le budget de 2 jokers/semaine — comportement **documenté et volontaire**, cf. `CLAUDE.md`). Le problème n'est pas cette règle, mais la façon dont un jour finit — ou non — par obtenir sa ligne :

- `closeDay` écrit la ligne du jour **uniquement** si l'utilisateur clique explicitement « Terminer la journée ».
- `backfillMissedDays` (`app/actions/day.ts:116-186`) rattrape les jours passés sans ligne — mais elle n'est appelée **que** depuis `WakeUpRitual.tsx:97`, à la fin du traitement du Réveil, et **Le Réveil ne se monte que s'il existe des tâches en retard** (`overdueTasks`, `app/page.tsx`).

Un compte qui gagne systématiquement n'a par construction jamais de tâche en retard : Le Réveil ne se monte jamais, `backfillMissedDays` ne tourne jamais. Tout jour où l'utilisateur ferme l'appli sans cliquer « Terminer la journée » — même après un K.O. complet du Boss — reste **un trou permanent** en base.

Ce trou est invisible du Tableau de Chasse (`tableauChasseStats`, `lib/game-engine.ts`), dont le `winRate` ne s'calcule que sur les lignes **existantes** (`totalDays = dayResults.length`) — un jour absent n'entre simplement pas dans le dénominateur, donc n'abaisse jamais le taux affiché. Mais `currentStreak`, qui parcourt le calendrier jour par jour, le voit et consomme un joker de la semaine correspondante. D'où la contradiction rapportée : 100% de victoire au Tableau de Chasse, jokers épuisés au Vestiaire.

Vérifié : ceci est indépendant de la race du §2 — `resolveDailyBoss`/`daily_boss` n'écrit jamais dans `day_results`, aucun chemin mécanique commun.

### Correctif

Appeler `backfillMissedDays()` en **inconditionnel** au chargement d'`app/page.tsx`, dans le même bloc que `resolveDailyBoss()`/`generateRecurringInstances()` — même patron déjà établi (lazy, idempotent, no-op si aucune tâche passée sans ligne, cf. `backfillMissedDays` ligne 129 : `if (!pastTasks || pastTasks.length === 0) return { error: null }`).

`backfillMissedDays` reste **aussi** appelée à la fin du Réveil (`WakeUpRitual`) — nécessaire pour que « Terminé » ait pu transformer un jour en `victory` avant le backfill de ce jour précis. L'appel ajouté au chargement de la page est un filet supplémentaire, pas un remplacement : pour un compte avec des restes, Le Réveil s'affiche toujours en premier (bloquant) et son propre appel en fin de traitement reste la source de vérité pour les jours qu'il vient de résoudre. L'appel eager au chargement ne backfille que les jours **antérieurs** à aujourd'hui déjà résolus par ailleurs (aucune tâche en retard dessus) — il ne peut donc jamais écrire un résultat prématuré pour un jour que Le Réveil est sur le point de traiter, puisque ce jour a justement des tâches en retard qui l'excluent du calcul de `byDay` seulement s'il n'y a **aucune** tâche non soldée ce jour-là. Si un jour a des tâches encore actives et en retard, il apparaît dans `pastTasks`, et l'appel eager le backfillerait avec l'état **actuel** (potentiellement encore `retreat`/`defeat` puisque non résolu) — c'est déjà le comportement actuel de `backfillMissedDays` quel que soit l'appelant : idempotent, recalculé à chaque upsert, donc sans risque de corruption si Le Réveil le retraite ensuite avec un état différent après résolution.

Aucune migration, aucun changement de signature.

---

## 4. C — Écran VS/FIGHT trop court

### Cause

Constat neutre : la timeline actuelle de `VsIntroOverlay.tsx:46-57` totalise 3000ms (portraits 0-450ms, VS 450-1600ms, FIGHT 1600-2500ms visible puis fondu 2500-3000ms), garde-fou de démontage forcé à 5000ms. Le dismiss-au-tap (`dismissEarly`, ligne 59-74) est **conservé tel quel** (déjà tranché en amont du brainstorm) — seule la timeline nominale s'allonge.

### Correctif

+2000ms répartis sur les deux phases de lecture (VS et FIGHT), slide-in d'entrée inchangé (c'est une animation, pas un temps de lecture) :

| Étape | Avant | Après |
|---|---|---|
| Slide-in portraits | 0 → 450ms | inchangé |
| Phase VS visible | 450 → 1600ms (1150ms) | 450 → **2600ms** (2150ms) |
| Phase FIGHT visible | 1600 → 2500ms (900ms) | 2600 → **4500ms** (1900ms) |
| Fondu + fin (`finish()`) | 2500 → 3000ms | 4500 → **5000ms** |
| Garde-fou démontage forcé | 5000ms | **7000ms** (même marge de 2000ms au-delà du nominal) |

```ts
const timers = [
  setTimeout(() => setPhase("vs"), 450),
  setTimeout(() => setPhase("fight"), 2600),
  setTimeout(() => setFading(true), 4500),
  setTimeout(finish, 5000),
  setTimeout(finish, 7000),
];
```

Aucun autre changement de comportement (dismiss, badge première rencontre, ligne d'enjeu).

---

## 5. D — Orientation du boss sur l'écran VS/FIGHT

### Cause

`VersusScene.tsx:245` applique déjà `flip={bossFlip}` (→ `scaleX(-1)` via `CharacterSprite`) sur le sprite de combat, selon `boss.flip` (`lib/bosses.ts`, "vrai pour les sprites qui regardent à droite", mirorés pour regarder le héros à gauche). `VsIntroOverlay.tsx:93-97` affiche `bossBustSrc` **sans jamais appliquer ce miroir** — aucune prop `flip` n'existe sur ce composant.

Conséquence : pour tout boss à `flip=true` (23 des 27 boss du roster, dont `idler`/Pan, confirmé cassé en usage réel), le bust glisse dans l'intro dans son orientation **brute** (non miroitée), puis le même personnage apparaît **miroité** une fraction de seconde plus tard en combat — incohérence visible à chaque combat contre un de ces 23 boss, pas seulement les 2 initialement suspectés sur lecture de sprite statique. Les héros n'ont pas de champ `flip` (toujours la même orientation) : seul le bust du Boss est concerné.

### Correctif

Ajouter une prop `bossFlip: boolean` à `VsIntroOverlayProps`, alimentée depuis `Arena.tsx` par `boss.flip` (déjà en scope à la ligne 173, `const boss = getBoss(bossId) ?? ...`).

**Piège à éviter, découvert en lisant le CSS existant** : `bossBustSrc` est actuellement rendu directement sur l'élément qui porte la classe `vs-slide-in-right` (`animation: vs-slide-in-right 450ms ... forwards`, `app/globals.css:429-431`). Cette animation anime la propriété `transform` (`translateX`) avec un fill-mode `forwards` — poser un `transform: scaleX(-1)` **inline sur ce même élément** serait silencieusement écrasé par l'animation CSS pour toute la durée de vie du nœud (avant, pendant et après la keyframe, `forwards` compris), exactement le même écueil que celui déjà documenté dans `CLAUDE.md` pour l'ancrage horizontal des sprites en combat (« trois niveaux d'imbrication nécessaires pour ne pas écraser des transform entre eux »). Le miroir doit donc être posé sur un **wrapper distinct**, imbriqué :

```tsx
{/* eslint-disable-next-line @next/next/no-img-element -- sprite pixel-art fixe, next/image inutile */}
<div className="vs-slide-in-right absolute right-4 w-[38vw] max-w-[220px]">
  <img
    src={bossBustSrc}
    alt=""
    className="[image-rendering:pixelated] w-full h-full"
    style={{ transform: bossFlip ? "scaleX(-1)" : undefined }}
  />
</div>
```

Le `<div>` externe porte seul l'animation de slide (`transform: translateX`), l'`<img>` interne porte seul le miroir statique — les deux transforms ne se disputent jamais la même déclaration CSS. Le bust héros n'est pas touché (pas de wrapper supplémentaire nécessaire, aucune prop `flip`).

---

## 6. E — Rappel push : unité erronée + wording à revoir

### Cause

`send-reminder.ts:123` calcule `const remaining = calculateBossCurrentHp(candidate.todayTasks)` — le **HP restant du Boss**, pas un nombre de tâches — et l'injecte dans `buildReminderPayload(remainingTasks, ...)` (`lib/copy/notifications.ts`), dont le paramètre s'appelle `remainingTasks` et dont 5 des 6 familles de templates parlent en unités de comptage (« tâche(s) », « monstre(s) », « adversaire(s) »). D'où « 20 tâches restantes » pour 1 tâche réelle (20 = le HP du Boss ce jour-là), et « 140 adversaires » un jour à forte charge de tâches (140 = HP du Boss, pas un décompte de monstres).

C'est le **seul** call site de tout le code où `calculateBossCurrentHp`/`calculateBossMaxHp` alimente un template de texte plutôt qu'une barre de progression UI (vérifié : tous les autres call sites sont dans `Arena.tsx`/`lib/game-engine.ts` pour du rendu HP, et `lib/push-eligibility.ts:49` s'en sert seulement pour un test booléen `> 0`, jamais affiché). Les autres fichiers de `lib/copy/` (`combat.ts`, `rituals.ts`, `rage-quit.ts`, `deadline.ts`) ont chacun un seul paramètre numérique cohérent entre call site et templates — aucun autre mélange d'unités trouvé.

**Second défaut, indépendant de l'unité** : 2 des 6 familles de templates personnifient plusieurs « monstres »/« adversaires » distincts, alors que la fiction du jeu n'a qu'un seul Boss par jour (cf. reframe « Le Démon Intérieur », `CLAUDE.md`). Le reste du vocabulaire de l'app (`lib/copy/combat.ts`, ex. « Pas d'adversaire aujourd'hui ») n'utilise ces mots qu'au singulier, comme synonyme du Boss lui-même — jamais en pluriel comptable.

### Correctif

**Deux métriques calculées séparément** au call site (`send-reminder.ts`), à partir de `candidate.todayTasks` déjà disponible :

```ts
const remainingTaskCount = candidate.todayTasks.filter(
  (t) => !t.is_completed && !t.is_abandoned,
).length;
const remainingHp = calculateBossCurrentHp(candidate.todayTasks);
const payload = buildReminderPayload(
  { remainingTaskCount, remainingHp },
  profile.aggressivity_level,
  () => event.data.variantIndex,
);
```

`buildReminderPayload` change de signature (`remainingTasks: number` → `{ remainingTaskCount: number; remainingHp: number }`) ; chaque template pioche la métrique qui correspond à sa formulation.

**Familles #0 et #1 réécrites**, les 4 autres (#2, #3, #4, #5) inchangées (déjà conformes — comptage de tâches ou HP, jamais de pluriel-créature) :

Famille #0 — passe intégralement en comptage de tâches (`doux` l'était déjà) :

```ts
{
  doux: (n) => `Il te reste ${n} ${pluralize(n, "tâche", "tâches")} avant la fin de la journée. À ton rythme.`,
  direct: (n) => `Le Boss ricane, il te reste ${n} ${pluralize(n, "tâche", "tâches")} avant ce soir !`,
  brut: (n) => `Le Boss se marre, il te reste ${n} ${pluralize(n, "tâche", "tâches")} avant ce soir, bouge-toi !`,
}
```

Famille #1 — bascule en HP du Boss (répartition finale : 2 familles HP sur 6, contre 1 avant — variété volontairement rééquilibrée) :

```ts
{
  doux: (n) => `Ta tête t'attend, sans te presser : le Boss a encore ${n} ${pluralize(n, "point de vie", "points de vie")}.`,
  direct: (n) => `Ta tête t'attend : le Boss tient encore avec ${n} ${pluralize(n, "point de vie", "points de vie")}.`,
  brut: (n) => `Ta tête t'attend, putain : le Boss tient encore avec ${n} ${pluralize(n, "point de vie", "points de vie")}.`,
}
```

`REMINDER_TEMPLATES` devient un tableau où chaque entrée sait quelle métrique elle consomme — la fonction `buildReminderPayload` route `remainingTaskCount` ou `remainingHp` vers le template sélectionné selon un flag par famille (`unit: "tasks" | "hp"`), plutôt que de deviner depuis l'index.

---

## 7. Matrice de couverture de tests

| Bug | Test | Nature | Ce qu'il verrouille |
|---|---|---|---|
| #1 — boss qui change | `lib/bosses.test.ts` (inchangé) + nouveau test d'action | Vitest | `resolveDailyBoss` n'est pas pure (accès Supabase) : le test porte sur le comportement observable via un scénario e2e ci-dessous, pas une unité isolée. |
| #1 — boss qui change | `e2e/boss-race.spec.ts` (nouveau) | Playwright | Deux requêtes concurrentes vers `/` (chargement + ajout de tâche quasi simultané) résolvent au **même** `bossId`, relu depuis `daily_boss` après coup. |
| #2 — jokers à tort | `lib/game-engine.test.ts` (`currentStreak`, cas existants inchangés) | Vitest | Non-régression : la sémantique "trou = joker" reste inchangée, seule sa cause d'apparition est corrigée côté action serveur. |
| #2 — jokers à tort | `e2e/streaks.spec.ts` (cas ajouté) | Playwright | Compte avec plusieurs jours de victoire **jamais clôturés manuellement**, aucun retard : au chargement suivant, `day_results` a une ligne `victory` pour chacun (backfill eager), le Vestiaire n'affiche pas l'alerte jokers. |
| #3 — timeline trop courte | `components/combat/VsIntroOverlay.test.tsx` (cas existants mis à jour) | Vitest | VS apparaît à 450ms (inchangé), FIGHT à 2600ms, `onDone` à 5000ms pile (pas avant), garde-fou à 7000ms. |
| #4 — orientation boss | `components/combat/VsIntroOverlay.test.tsx` (cas ajouté) | Vitest | Avec `bossFlip=true`, le `<img>` du bust boss porte `style.transform === "scaleX(-1)"` ; avec `bossFlip=false`, aucun `transform`. Le bust héros n'a jamais de `transform`. |
| #4 — orientation boss | `e2e/vs-intro.spec.ts` (cas ajouté) | Playwright | Sur un boss connu `flip=true` (ex. `idler`), le bust affiché en intro et le sprite affiché en combat ont la même orientation visuelle (assertion sur le `transform` calculé, pas un pixel-diff). |
| #5 — unité erronée | `lib/copy/notifications.test.ts` (réécrit) | Vitest | `remainingTaskCount` et `remainingHp` routés vers le bon template par famille ; familles #0/#1 ne contiennent plus jamais "monstre"/"adversaire" ; les 4 autres familles inchangées. |
| #5 — wording | `lib/copy/notifications.test.ts` (cas ajouté) | Vitest | Aucun template, toutes familles/niveaux confondus, ne contient "monstre" ou "adversaire" (regex de non-régression — empêche une réintroduction future). |

---

## 8. Documentation et clôture

Dans le même commit que l'implémentation :

- **`CLAUDE.md`** — entrée « Cycle de la Journée » : mention de l'appel eager à `backfillMissedDays()` au chargement, en plus de la fin du Réveil. Entrée « Roster de Boss » : le miroir `flip` s'applique aussi au bust de l'intro VS/FIGHT, pas seulement au sprite de combat — et le piège transform-écrasé-par-animation.
- **`CHANGELOG.md`** — une ligne sous `[Unreleased]`.
- **Issue #160** — clôturée par la PR, avec le détail des 5 corrections.

**Pas de documentation utilisateur.** Cinq correctifs, aucun changement de règle de jeu, de barème ou de comportement visible en tant que *nouvelle fonctionnalité* — seul le contenu de textes déjà existants change de formulation. Hors périmètre de la règle du Guide (issue #68).

---

## 9. Risques assumés

**Bug #2 — pas de garantie a posteriori sur les trous déjà existants.** Le correctif empêche les **futurs** trous pour un compte sans retard ; il ne rétro-backfill pas automatiquement un historique déjà troué **sauf** au prochain chargement de page (l'appel eager couvre alors tout jour passé avec au moins une tâche). Un jour strictement sans aucune tâche créée reste indétectable par construction (rien à backfiller) — c'est la sémantique "trou" documentée, inchangée par cette PR.

**Bug #1 — le test e2e de concurrence est intrinsèquement sensible au timing.** Deux requêtes "quasi simultanées" ne garantissent pas de reproduire la fenêtre de course à 100% sur un runner CI plus lent ou plus rapide que prévu ; si le test ne reproduit pas la race de façon fiable, la garantie de correction repose sur la relecture inconditionnelle elle-même (raisonnement, pas seulement le test) — cf. `CLAUDE.md` sur les flakes de concurrence déjà rencontrés côté routines récurrentes (issue #156).

**Bug #5 — changement de signature de `buildReminderPayload`.** Seul `send-reminder.ts` appelle cette fonction en production ; `lib/copy/notifications.test.ts` est le seul autre consommateur. Aucun autre call site à migrer.
