# Spec — Issue #72 : Système de Succès & Titres

> Date : 2026-07-31 · Statut : validé (brainstorming) · Remplace `titleForStreak`/`current_title`.
> Dépend de : `day_results` (US-07/US-12), `daily_boss` (roster boss/décors), `unlocked_heroes` (US-18).

## 1. Contexte & problème

L'issue #72 demande un vrai système de succès/titres déblocables (par héros, par streak, par niveau, par exploration boss/décors), au-delà du seul `titleForStreak` (`lib/game-engine.ts:857`) qui ne couvre que 3 paliers de streak, avec un titre **unique auto-écrasé**, jamais choisi par le joueur.

Un premier jet de spec (commentaire de l'issue, généré par un assistant externe) proposait une architecture proche mais avec deux problèmes bloquants, tranchés ci-dessous :
- Noms d'exemple puisant dans la pop-culture externe (Super Saiyan, Spectre/Mass Effect, Praise the Sun/Dark Souls) — contredit le reframe **Démon Intérieur** (issue #51, cf. `CLAUDE.md`) qui a justement purgé tout vernis externe (dojo/japonais **et** pop-culture) pour un univers intime.
- Déclenchement « synchrone à chaque event » suggérait potentiellement une logique de condition côté SQL (triggers) — contredit la règle de code n°2 du projet (« tout algorithme de calcul de jeu doit résider dans `lib/game-engine.ts` »), pattern absent partout ailleurs dans ce repo.

## 2. Décisions de cadrage (tranchées)

| # | Décision |
|---|----------|
| D1 | **Système complet**, pas une extension légère : catalogue de succès, 4 raretés, titre **équipable manuellement**. Remplace `titleForStreak`/`profiles.current_title`. |
| D2 | **Toute la logique de condition en TypeScript pur** (`lib/achievements.ts` + `lib/game-engine.ts`), jamais de trigger SQL. La table de déblocage est un **journal append-only** (comme `unlocked_heroes`/`unlocked_skins`), jamais de logique métier embarquée en base. |
| D3 | **4 checkpoints serveur** évaluent les conditions : complétion de tâche, clôture de journée (+ backfill), résolution du boss du jour, déblocage d'un héros (achat **ou** starter d'onboarding). Aucun nouveau système d'event, aucune évaluation au chargement de l'Arène. |
| D4 | **4 raretés : Bronze / Argent / Or / Platine.** Platine = méta-succès unique, débloqué à 100 % des succès **hors easter eggs de niveau extrême** (nouveau champ catalogue `countsTowardPlatinum`) — ces paliers sont mathématiquement hors d'atteinte (D5), les exclure du calcul est nécessaire pour que Platine reste réellement obtenable. |
| D5 | **Paliers de niveau extrêmes (212/666/777/1000/9001) gardés tels quels**, formule XP (`xpThresholdForLevel`) inchangée. Assumés comme trophées « flex », quasi jamais obtenus en jeu réel (niveau 100 ≈ 9 ans de jeu régulier au rythme actuel) — pas un problème d'équilibrage à corriger. |
| D6 | **Textes fixes** (nom + description d'une phrase par succès) : pas de déclinaison par niveau d'agressivité (doux/direct/brut). Traité comme contenu catalogue, pas comme « voix » réactive. |
| D7 | **UI en sous-page de Tableau de Chasse** (`/tableau-de-chasse/succes`), pas de nouvel onglet `BottomNav`. |
| D8 | **Équipement manuel « sticky après 1er choix »** : tant que le joueur n'a jamais équipé de titre lui-même, le plus prestigieux débloqué s'affiche automatiquement (comportement actuel préservé). Dès qu'il équipe un titre manuellement une fois, l'auto-écrasement s'arrête définitivement pour ce profil (`profiles.title_manually_set`). |
| D9 | **Notification de déblocage** : nouveau composant `AchievementToast`, même famille visuelle que `LevelUpOverlay`/`PerfectOverlay` (non-bloquant, empilable si plusieurs déblocages simultanés, variante `prefers-reduced-motion`, badge de rareté). |
| D10 | **« Boss vus »/« décors vus » dérivés**, pas de nouvelle colonne de tracking par item : requête `DISTINCT` sur l'historique complet de `daily_boss` (déjà permanent, jamais update/delete). |
| D11 | **Dépendance de séquencement avec l'issue #74** (extension roster boss 12→27, `docs/superpowers/specs/2026-07-30-issue74-boss-hero-sizing-roster-design.md`). `ALL_BOSSES`/`HALF_BOSSES` (nouveau, §3) lisent `BOSSES.length` **dynamiquement**, jamais un nombre en dur. Mais il est recommandé de **livrer #74 avant #72** : sinon ces deux succès se débloquent sur l'ancien roster de 12 (moitié = 6, pas 14) et restent acquis pour toujours (B2) même après l'extension à 27 — ils perdent leur valeur pour les premiers joueurs. |

### Baselines techniques
- **B1 — Pur & déterministe.** `evaluateAchievements` est une fonction pure testée Vitest, comme `currentStreak`/`goldBalance`.
- **B2 — Jamais de révocation.** Un succès débloqué le reste pour toujours, même si l'état source régresse ensuite (ex: décocher une tâche qui a fait passer un niveau ne retire pas le succès de niveau). Cohérent avec RG-04 (pas de DELETE) et avec le comportement déjà établi de `unlocked_heroes`/`unlocked_skins`.
- **B3 — Catalogue statique en code**, comme `lib/heroes.ts`/`lib/bosses.ts`/`lib/backgrounds.ts` : pas de table `achievements` en base, seulement une table d'état (`unlocked_achievements`).

## 3. Catalogue (`lib/achievements.ts`)

26 succès. **Noms tels qu'édités par toi** — aucune contrainte technique n'est liée au libellé, éditables librement sans toucher au code (`code` est la clé stable, `title`/`description` sont de simples chaînes).

| Code | Catégorie | Rareté | Titre | Condition | Compte pour Platine ? |
|---|---|---|---|---|---|
| `HERO_FIRE_KNIGHT` … `HERO_METAL_BLADEKEEPER` (×7) | Héros débloqué | Bronze | Flamme Intérieure, Marée Calme, Racines, Souffle, Mue, Facette, Lame Froide | `hero_id ∈ unlocked_heroes` (ou starter) | Oui |
| `ALL_HEROES` | Collection | Or | Ensemble on est plus fort | `unlocked_heroes.count == heroes.length` (7) | Oui |
| `FIRST_VICTORY` | Progression | Bronze | Aube | `day_results.outcome == 'victory'` existe (≥1) | Oui |
| `STREAK_7` / `STREAK_30` / `STREAK_100` | Streak | Argent / Argent / Or | Calme / Silence / Esprit Vide *(inchangés — repris tels quels)* | `best_streak >= 7/30/100` | Oui |
| `HALF_BOSSES` **(nouveau)** | Exploration | Bronze | La moitié du chemin | `DISTINCT boss_id` sur `daily_boss` >= `Math.ceil(BOSSES.length / 2)` — **14** une fois l'issue #74 livrée (27 boss), actuellement 6 sur les 12 boss du roster courant (cf. D11) | Oui |
| `ALL_BOSSES` | Exploration | Or | A vaincu une armée | `DISTINCT boss_id` sur `daily_boss` == `BOSSES.length` — **27** une fois l'issue #74 livrée, actuellement 12 (cf. D11 ; le premier jet du commentaire d'issue supposait 12 à tort, 15 boss de moins que le roster cible) | Oui |
| `ALL_BACKGROUNDS` | Exploration | Argent | Chaque Paysage | `DISTINCT background_id` sur `daily_boss` == 16 | Oui |
| `LEVEL_10` / `_20` / `_50` / `_84` | Niveau | Bronze → Argent | Level UP, Rigueur, Ténacité, Trad's | `level >= N` | Oui |
| `LEVEL_100` | Niveau | Argent | Enfin ! | `level >= 100` | Oui |
| `LEVEL_212` / `_666` / `_777` / `_1000` / `_9001` | Niveau (easter egg) | Or | Prom's, Damné, Veinard, Mythe, Super Saiyan | `level >= N` | **Non** (D4/D5 — mathématiquement hors d'atteinte, exclu du calcul Platine) |
| `PLATINUM` | Méta | **Platine** | Démon Vaincu | tous les succès `countsTowardPlatinum: true` débloqués (**20/20**, cf. D4) | — |

## 4. Algorithme

```ts
// lib/achievements.ts — pur, testé Vitest
export interface AchievementContext {
  level: number;
  bestStreak: number;
  hasVictory: boolean;              // au moins un day_results.outcome === 'victory'
  unlockedHeroIds: string[];        // depuis unlocked_heroes (+ starter)
  seenBossIds: string[];            // DISTINCT boss_id, historique daily_boss
  seenBackgroundIds: string[];      // DISTINCT background_id, historique daily_boss
}

// Chaque entrée du catalogue statique porte un champ `countsTowardPlatinum: boolean`
// (false uniquement pour les 5 paliers de niveau easter egg, D4/D5).
// Retourne les codes qui deviennent vrais, en excluant ceux déjà dans alreadyUnlocked.
// PLATINUM est évalué en dernier : vrai ssi tous les codes `countsTowardPlatinum` sont
// dans alreadyUnlocked ∪ le résultat courant.
export function evaluateAchievements(
  ctx: AchievementContext,
  alreadyUnlocked: Set<string>
): string[]
```

`evaluateAchievements` ne fait AUCUN accès base — tout le contexte est assemblé par l'appelant (server action) avant l'appel, comme pour `currentStreak(dayResults, today, timezone)`.

### Sélection du titre auto-affiché (D8)
```ts
// « meilleur » parmi tous les codes débloqués : rareté la plus haute,
// égalité départagée par unlocked_at le plus récent.
export function bestTitleCode(unlocked: { code: string; unlockedAt: string }[]): string | null
```

## 5. Checkpoints & server actions

| Checkpoint | Fichier | Catégories évaluées |
|---|---|---|
| Complétion de tâche | `app/actions/tasks.ts` (`setTaskCompleted`) | Niveau (10→9001) |
| Clôture de journée / backfill | `app/actions/day.ts` (`closeDay`, `backfillMissedDays`) | Streak (7/30/100), Première victoire |
| Résolution du boss du jour | `app/actions/boss.ts` (`resolveDailyBoss`) | Moitié des boss vus, Tous les boss vus, Tous les décors vus |
| Déblocage d'un héros | `app/actions/shop.ts` (`unlockHero`) **et** `app/onboarding/actions.ts` (`createProfile`, héros starter) | Héros individuel, Tous les héros |

Chaque checkpoint, après sa mutation habituelle : assemble l'`AchievementContext` pertinent (pas besoin de tout recalculer à chaque fois — ex: pas besoin de `seenBossIds` au checkpoint tâche), appelle `evaluateAchievements`, insère les nouveaux codes dans `unlocked_achievements` (upsert idempotent sur la contrainte unique), réévalue `PLATINUM` si les 20 succès `countsTowardPlatinum` sont tous acquis, applique D8 (auto-équipe si `title_manually_set == false`), et renvoie la liste des codes **nouvellement** débloqués à l'appelant client pour déclencher `AchievementToast` (même pattern que `TaskActionResult.deferredTasks`, US-08 : le retour explicite de la server action, jamais un refetch implicite).

## 6. Modèle de données

### Nouvelle table `unlocked_achievements`
```sql
create table unlocked_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  code text not null,
  unlocked_at timestamptz not null default now(),
  unique (user_id, code)
);
-- RLS : select/insert propre utilisateur uniquement. Aucune policy UPDATE/DELETE (RG-04, même patron que unlocked_heroes/unlocked_skins).
```

### Modif `profiles`
- `equipped_title_code text null` — code du succès dont le titre est affiché (remplace `current_title`).
- `title_manually_set boolean not null default false` — D8.
- **Suppression de `current_title`** après migration des données (pas de colonne morte conservée « au cas où »).

### Migration de données (profils existants)
**Backfill complet, pas seulement streak** — un profil existant a déjà potentiellement rempli d'autres conditions (héros possédés, victoire déjà obtenue, boss/décors déjà vus dans l'historique `daily_boss`, niveau déjà atteint). Se limiter à la streak (comme dans un premier jet) en oublierait la majorité :
1. Pour chaque profil, assembler l'`AchievementContext` complet (§4) depuis les tables sources existantes — pas seulement `best_streak`.
2. Appeler `evaluateAchievements` avec `alreadyUnlocked = ∅` → insérer toutes les lignes `unlocked_achievements` qui en ressortent (idempotent, `unlocked_at = now()` faute d'historique exact — acceptable, c'est la première évaluation).
3. Réévaluer `PLATINUM` sur le résultat.
4. `equipped_title_code` = code du meilleur (D8's `bestTitleCode`) **seulement si** l'ancien `current_title` n'était pas vide (préserve l'affichage existant) ; sinon `null`. `title_manually_set = false` dans tous les cas.

Résultat : un profil existant peut découvrir plusieurs succès rétroactifs d'un coup à la première visite du nouvel écran (pas de `AchievementToast` rétroactif — le toast ne se déclenche que sur les checkpoints live, §5), mais son titre affiché ne change jamais silencieusement.

## 7. UI

- **`/tableau-de-chasse/succes`** : catalogue groupé par catégorie, compteur global (« X / 26 »), succès verrouillés grisés, succès débloqués affichent leur date (`unlocked_at`). Sélecteur de titre : liste des titres débloqués + option « Aucun », le titre actif est mis en évidence. Choisir un titre pose `title_manually_set = true`.
- **3 états UI obligatoires** (règle projet n°3) : Loading (squelette catalogue), Error (message, ne bloque pas la nav), Empty (0 succès débloqué → catalogue entièrement grisé, pas un état spécial séparé).
- **`AchievementToast`** (D9) : apparaît sur l'écran courant (Arène incluse) au retour d'une server action contenant des codes nouvellement débloqués. Empilable (plusieurs succès d'un coup, ex: `ALL_HEROES` + `PLATINUM` au même achat). Badge rareté (couleur/icône par tier), titre + description, son court. Variante statique sous `prefers-reduced-motion`.
- Accès : lien depuis Tableau de Chasse (déjà atteint via Le Vestiaire, `BottomNav` reste sur `active="vestiaire"`, cf. audit UX 2026-07-24).

## 8. Découpage technique

### `lib/achievements.ts` (nouveau, pur)
- Catalogue statique (26 entrées : code, rareté, catégorie, titre, description, `countsTowardPlatinum`, condition déclarative ou fonction).
- `evaluateAchievements(ctx, alreadyUnlocked)`.
- `bestTitleCode(unlocked)`.

### `lib/game-engine.ts` (modif)
- Suppression de `titleForStreak` (remplacé par les entrées `STREAK_7`/`STREAK_30`/`STREAK_100` du catalogue).

### Server actions (modif, cf. §5)
- `app/actions/tasks.ts`, `app/actions/day.ts`, `app/actions/boss.ts`, `app/actions/shop.ts`, `app/onboarding/actions.ts`.
- Nouveau `app/actions/achievements.ts` : `equipTitle(code)`, helper `assembleAchievementContext(userId)` partagé par les checkpoints.

### Composants
- `app/tableau-de-chasse/succes/page.tsx` (+ `loading.tsx`).
- `components/combat/AchievementToast.tsx`.
- Sélecteur de titre (dans la nouvelle page, pas de composant séparé nécessaire).

### Migration Supabase
- Création `unlocked_achievements` (+ RLS select/insert only).
- Ajout `profiles.equipped_title_code`, `profiles.title_manually_set`.
- Backfill données (§6) puis suppression `profiles.current_title`.
- ⚠️ Vérifier `npx supabase migration list --linked` avant merge (piège déjà documenté, bug prod #70).

### Docs à mettre à jour dans la même PR d'implémentation
- `CLAUDE.md` : nouvelle entrée « Système de succès & titres » (remplace la mention `titleForStreak` existante).
- `CHANGELOG.md` : ligne sous `[Unreleased]`.
- `SPECS_FONCTIONNELLES.md` : nouvelle US (succès/titres).
- Le Guide (Notion) : nouvel article si les succès sont une mécanique visible documentée (probable, à trancher au moment de la PR selon la règle habituelle).
- Tous les call-sites lisant `current_title` (`app/tableau-de-chasse/page.tsx:85`, `components/combat/Arena.tsx:1066,1171`, `lib/share-card.ts:22`) migrés vers le titre résolu (`equipped_title_code` → lookup catalogue).

## 9. Tests

### Vitest (pur)
- `evaluateAchievements` : un cas par catégorie (héros individuel, tous les héros, première victoire, chaque palier streak, moitié des boss, tous les boss, tous les décors, chaque palier niveau).
- Platine : débloqué à 20/20 `countsTowardPlatinum`, **pas** débloqué à 19/20 ; un profil qui a les 5 easter eggs de niveau mais pas les 20 autres n'a **jamais** Platine (vérifie que D4 exclut bien les easter eggs du calcul, pas juste de l'affichage).
- `ALL_BOSSES`/`HALF_BOSSES` : test avec un pool `BOSSES` mocké de taille différente (ex: 4 boss) pour vérifier que le seuil suit `BOSSES.length` dynamiquement — aucun nombre en dur (D11).
- `evaluateAchievements` idempotent : un contexte qui remplit déjà des conditions dans `alreadyUnlocked` ne les re-retourne pas.
- `bestTitleCode` : égalité de rareté → le plus récent gagne ; aucun débloqué → `null`.

### Playwright e2e
- Un parcours minimal : débloquer un succès facilement atteignable en fixture (ex: première victoire) → `AchievementToast` apparaît → titre auto-affiché change.
- Équipement manuel d'un titre → reste affiché même après déblocage d'un succès plus prestigieux ensuite (D8, sticky).
- Le reste du catalogue (26 conditions) n'a **pas** vocation à être couvert en e2e un par un — coût/bénéfice mauvais vu la contrainte compte e2e unique (cf. flakes déjà documentés). Couverture exhaustive = Vitest sur `evaluateAchievements`.
- **Prévoir un helper de reset** (`resetAchievementsState`, même famille que `resetShopState`/`resetOnboardingUser`) qui vide `unlocked_achievements` et réinitialise `equipped_title_code`/`title_manually_set` pour le compte e2e fixe — sans ça, les succès s'accumulent sur le compte partagé (RG-04, jamais de DELETE en usage normal, mais un reset de test dédié reste nécessaire) et polluent les assertions des runs suivants.

## 10. Hors scope

- Déclinaison des textes de succès par niveau d'agressivité (D6).
- Récompenses matérielles liées à un succès (or, héros gratuit) — un succès ne débloque qu'un titre, rien d'autre.
- Partage social d'un succès débloqué (distinct du partage de victoire US-20).
- Réajustement de la formule XP pour rendre les paliers extrêmes atteignables (D5).

## 11. Vérification

1. Vitest vert (toutes les catégories + idempotence + `bestTitleCode`).
2. `build` + `lint` + `tsc --noEmit` propres.
3. `npx supabase migration list --linked` sans écart après la migration.
4. e2e vert (parcours minimal §9).
5. Manuel : débloquer plusieurs succès d'un coup (empilement `AchievementToast`) ; équiper un titre puis débloquer un succès plus rare (le titre équipé manuellement ne bouge pas) ; atteindre 20/20 (hors easter eggs) → `PLATINUM` se débloque dans la foulée (même pattern que le Platine Ultime du commentaire d'issue) sans jamais nécessiter les paliers 212+ ; profil existant avec `current_title` migré → titre identique affiché sans action, plus les succès rétroactifs visibles au premier passage sur `/tableau-de-chasse/succes`.

## 12. Pistes d'amélioration (proposées, non tranchées)

Trois idées à considérer pour une itération future — pas engagées dans le scope ci-dessus, à activer seulement sur décision explicite :

1. **Succès de niveau easter egg masqués tant que non approchés** (« succès mystère ») : `LEVEL_666`/`_777`/`_1000`/`_9001` (et leur titre) restent grisés **sans révéler le libellé** dans le catalogue avant que le joueur soit à portée réaliste (ex: à 20 % du seuil). Évite de spoiler la blague avant même d'avoir une chance d'y penser — pattern courant dans les jeux à trophées (succès secrets).
2. **Barre de progression sur les succès à compteur** (`ALL_BOSSES`/`HALF_BOSSES`/`ALL_BACKGROUNDS`/`ALL_HEROES`) : afficher « 8/12 démons rencontrés » plutôt qu'un simple verrou binaire. Donne un sentiment de progression continue au lieu de tout-ou-rien, cohérent avec le compteur global déjà prévu (§7).
3. **Widget « prochain succès à portée »** sur Tableau de Chasse (ex: « à 2 tâches du niveau 20 », « à 1 boss de la moitié du chemin ») : même logique que `StreakBadge`/« série en danger » (US-12) mais côté motivation positive plutôt qu'alerte — crée un objectif immédiat sans attendre l'ouverture du catalogue complet.
