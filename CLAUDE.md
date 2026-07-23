# Contexte projet — Boss de la Journée (Projet Arcade To-Do)

> Dernière mise à jour : 2026-07-20
> Stack : Next.js 16 (App Router) + Supabase + Tailwind CSS v4 + Vercel (Hobby)

---

## Règle de mise à jour de ce fichier

Ce fichier est un critère de merge. Toute PR ou modification qui introduit un nouveau piège, modifie une convention, ou solde une dette documentée ici doit obligatoirement mettre ce fichier à jour dans le même commit.

Cas déclencheurs :
- Nouveau comportement non-évident découvert avec l'API Web Speech ou l'UI de combat.
- Modification de la structure de la table `tasks` ou `profiles` dans Supabase.
- Changement dans le comportement des calculs de HP ou d'XP.

---

## Ce projet en une phrase

Une application de productivité mobile-first de style RPG/Arcade 16-bits où chaque tâche créée soigne le Boss de la journée (+20 HP) et chaque tâche complétée lui inflige des dégâts, offrant une gratification immédiate pour vaincre la procrastination.

---

## Documents de référence — à lire avant tout code

| Fichier | Rôle |
|---------|------|
| `SPECS_FONCTIONNELLES.md` | Registre des 21 User Stories (Sprint 0 à 3), règles métier (RG-01 à RG-04) et modèle de données. |
| `ADR.md` | Choix technologiques validés (Next.js, Supabase, Tailwind v4, Vitest/Playwright). |
| `PRODUCT.md` | Contexte produit (impeccable) : users, purpose, brand personality, anti-références, principes de design, a11y. |
| `DESIGN.md` | Système de design (impeccable, actuellement en seed) : palette, typographie, motion, do's/don'ts visuels. |
| `ASSETS.md` | Cartographie du dossier `assets/` (sprites, boss, décors, VFX, icônes, police) : quel pack pour quel usage, licences, chemins. **À consulter avant toute recherche de sprite** — ne jamais explorer `assets/` au hasard. |

**Ne jamais improviser un choix ou une modification de règles que ces documents ont déjà tranché.**

**Avant d'intégrer un sprite/décor/effet/icône dans le code, consulter `ASSETS.md`** pour savoir quel pack utiliser, sous quelle licence, et quel chemin copier vers `public/`. Si `assets/` évolue (nouveaux packs ajoutés/supprimés), mettre `ASSETS.md` à jour dans le même commit (cf. règle de mise à jour ci-dessus).

---

## Stack technique

| Rôle | Techno | Version |
|------|--------|---------|
| Framework full-stack | Next.js (App Router) | 16.x |
| Base de données + Auth | Supabase (PostgreSQL) | — |
| Hébergement | Vercel (Hobby Tier) | — |
| CSS & Animations | Tailwind CSS v4 | — |
| Typage | TypeScript strict | — |
| Tests unitaires | Vitest | Phase MVP |
| Tests e2e | Playwright | Phase MVP (Compte fixe) |

---

## Structure de dossiers cible
boss-de-la-journee/
├── app/                        # Écrans de l'application (App Router)
│   ├── layout.tsx              # Configuration globale (font pixel, thèmes)
│   ├── page.tsx                # L'Arène (Écran principal du combat / To-Do)
│   ├── qg/page.tsx             # Le QG du Héros (Profil, Titres, Stats)
│   └── echoppe/page.tsx        # Le Shop (Sprint 2 - Skins de Boss)
├── components/
│   ├── ui/                     # Composants UI de base (Boutons pixel-art, jauges)
│   └── combat/                 # Composants interactifs de l'Arène (Animations flash, Boss)
├── lib/                        # Logique métier PURE (Sans UI, 100% testable de manière isolée)
│   ├── game-engine.ts          # Calculs des HP, XP, niveaux et dégâts (RG-01/02)
│   └── supabase/               # Clients d'API (Client.ts / Server.ts)
├── types/
│   └── index.ts                # Types TypeScript partagés (Task, Profile, Boss)
├── public/                     # Sprites pixel-art, effets sonores et polices
├── .env.local                  # Secrets (Exclus de Git)
├── .env.example                # Template des variables d'environnement
└── CLAUDE.md
---

## Outils disponibles

| Outil | Usage |
|-------|-------|
| `gh` (GitHub CLI) | Gestion des issues du backlog, création et validation de Pull Requests. |
| `supabase CLI` | Gestion des migrations locales PostgreSQL. |

---

## Conventions — non négociables

### Langue d'échange
Toute communication avec l'utilisateur se fait en français, sans exception. Les termes techniques, noms d'API, de librairies, de variables, de commandes et le vocabulaire spécifique (ex: "commit", "fetch", "hook", "state") restent en anglais quand c'est l'usage naturel du domaine.

### Changelog (`CHANGELOG.md`)
Toute PR qui livre une feature (produit ou technique) ajoute sa ligne sous `## [Unreleased]` de `CHANGELOG.md`, dans le même commit que l'implémentation — jamais après coup. Format des versions : `XX.YY.ZZ` (Majeure.Mineure.Fix), aligné sur les releases GitHub. À chaque release GitHub effective, le contenu d'`[Unreleased]` est basculé dans une nouvelle section versionnée et datée.

### Documentation utilisateur (Manuel du Dojo — US-28)
Avant de pousser une PR, **vérifier systématiquement si elle nécessite une doc utilisateur** et, le cas échéant, la produire **dans la même PR** :
- **Nouvelle feature visible par l'utilisateur** (écran, mécanique, règle de jeu) → **créer** la ou les sections correspondantes du guide.
- **Changement d'un comportement déjà documenté** (barème, rituels, streaks, or, combos, roster…) → **mettre à jour** les sections existantes.
- **Source = Notion** : éditer la page Notion du guide, puis `npm run sync:guide` pour régénérer `content/guide.json` (committé dans la PR). Si Notion n'est pas branché (`NOTION_TOKEN`/`NOTION_GUIDE_PAGE_ID` absents), éditer directement `content/guide.json` en respectant le schéma (`lib/guide.ts`) et en **gardant les `section.id` stables** (ce sont des ancres de deep-link, ex. `#streak`, `#or`).
- **Uniquement si pertinent** : une PR purement technique/refactor/infra (sans impact sur ce que voit ou comprend l'utilisateur) n'exige **pas** de doc utilisateur — ne pas en inventer.

### Commits (Conventional Commits)
Format strict : `type: description courte`
- `feat:` Nouvelle fonctionnalité (ex: `feat: add screen shake animation on damage`)
- `fix:` Correction de bug (ex: `fix: prevent negative gold balance`)
- `chore:` Tâches de maintenance (ex: `chore: setup vitest config`)
- `docs:` Documentation technique uniquement.

### Workflow Git
- `main` est protégée. Aucun commit direct. Déploiement automatique sur Vercel.
- Une branche par fonctionnalité : `feat/us-XX-nom-feature`.
- **Zéro merge si la CI est rouge.** Tous les tests Vitest et l'application doivent build sans erreur.
- **Zéro PR poussée sur GitHub tant que les tests (Vitest + Playwright e2e) n'ont pas été passés en local.** Une fois la CI en place, elle vient en double sécurité, pas en remplacement de cette vérification locale.

---

## Règles de code

1. **TypeScript Strict :** Interdiction d'utiliser `any`. Tout type doit être explicitement déclaré (notamment les états de tâches et profils).
2. **Logique isolée dans `lib/` :** Tout algorithme de calcul de jeu (formule d'XP, calcul dynamique des HP maximum du Boss) doit résider dans `lib/game-engine.ts` pour être testé sans dépendances de rendu UI.
3. **Gestion des 3 états UI :** Tout écran (Arène, QG) doit obligatoirement implémenter un état de chargement (Loading), un état d'erreur (Error), et un état vide (Empty - ex: quand le Boss est K.O.).
4. **Pas de suppression destructive :** Les tâches ne doivent jamais être supprimées via un `DELETE` SQL. Utiliser exclusivement la colonne `is_abandoned` ou `is_completed` pour maintenir l'historique et la jauge du Boss (RG-04).

---

## Pièges et décisions non-évidentes

**Décalage horaire et Étanchéité du jour** — Le "jour" du jeu est le **jour local** de l'utilisateur, pas l'UTC. Il est calculé via `dayKey(date, timezone)` (`lib/game-engine.ts`) à partir de la colonne `profiles.timezone` (IANA, captée à l'onboarding via `Intl`). Toutes les requêtes/écritures `day_date` (server actions, `app/page.tsx`) passent par ce jour local. Ceci corrige le bug UTC de l'ancien `todayIso()` (à 01h à Paris on était encore "hier" en UTC) et le cas voyage/changement de fuseau. Le Boss est calculé uniquement sur les tâches du jour local courant (RG-03) ; les restes d'un jour local passé passent par le processus bloquant du Rituel du Réveil (US-08) avant toute nouvelle action.

**`deadlineIso` (US-05) : l'offset DST doit être recalculé au point fixe, pas probé une seule fois** — `deadlineIso(dayDate, timeHHMM, timezone)` convertit une heure locale saisie (`<input type="time">`) en ISO UTC. Une première version calculait l'offset du fuseau une seule fois, à l'instant "naïf" (HH:MM interprété directement comme UTC) — correct la plupart du temps, mais faux pour une heure locale valide **avant** une transition DST si l'instant naïf tombe **après** celle-ci : ex. `deadlineIso("2026-03-29", "01:30", "Europe/Paris")` (jour de passage à l'heure d'été, transition à 01h00 UTC) probait l'offset à +2 (post-transition) au lieu de +1 (pré-transition, l'heure réellement demandée), et renvoyait un horodatage décalé d'1h sans erreur ni crash — corruption silencieuse, y compris au round-trip via `localTimeFromIso`. Le correctif recalcule l'offset **à l'instant candidat obtenu**, pas seulement à l'instant naïf de départ (itération à point fixe, 2 passes suffisent pour tout delta DST réel) ; no-op pour toute date loin d'une transition (offset stable → une seule itération change rien).

**Pas de policy DELETE en RLS** — Les tables `profiles` et `tasks` n'ont volontairement aucune policy Supabase RLS pour `DELETE`. Ceci applique RG-04 au niveau base de données, en plus de la convention côté application (colonnes `is_abandoned` / `is_completed`).

**Pas de trigger d'auto-création de profil** — Aucun trigger sur `auth.users` ne crée automatiquement une ligne `profiles` à l'inscription. Le pseudo doit être défini explicitement par l'utilisateur (voir tone of voice : pas de fallback générique type "Héros"), donc la création de la ligne `profiles` fait partie du flow d'onboarding applicatif (US-14), pas de la migration SQL.

**Jauge de HP du Héros — dette soldée par le Rituel du Réveil (US-08) + pool pondéré (US-05)** — La jauge de HP du Héros (`calculateHeroHp` dans `lib/game-engine.ts`) n'est plus purement décorative. **Depuis US-05, le pool accepte un poids par tâche** (`HeroHpPenaltyTask`, champ `weight`) au lieu d'un poids fixe -20 pour toute la liste : une tâche en retard reportée d'un jour précédent (`overdueHpPenalties`) pèse -20 HP, une deadline horaire ratée du jour courant et non résolue (`deadlineHpPenalties` + `missedDeadlineTasks`) pèse -10 HP — les deux pools se combinent dans un seul appel à `calculateHeroHp`, plancher à 0. Le Rituel du Réveil (`components/combat/WakeUpRitual.tsx`, US-08) traite les restes au démarrage via un overlay **bloquant** : Terminé / Reporter / Annihiler (+ actions groupées). Résoudre les restes (ou cocher/abandonner une tâche à deadline ratée) fait remonter la jauge instantanément (fonction pure recalculée à chaque rendu). La jauge ne peut donc plus rester à 0 indéfiniment sans action proposée. Voir le spec unifié `docs/superpowers/specs/2026-07-20-cycle-journee-design.md` et `docs/superpowers/specs/2026-07-22-us05-deadlines-design.md`.

**Cycle de la Journée & table `day_results`** — Les deux bornes du jour sont le Rituel du Réveil (US-08, ouverture, traitement des restes) et le Rituel du Crépuscule (US-07, ex-"Obi-Wan", clôture cérémonielle non-bloquante). La table `day_results` (une ligne par `(user_id, day_date)`, contrainte unique) enregistre l'issue du jour (`victory` / `retreat` / `defeat`), les dégâts, l'XP, etc. — fondation du Panthéon (US-10), des Streaks (US-12) et du partage (US-20). Écriture **idempotente** (upsert, chiffres recalculés depuis les tâches, jamais accumulés) via `app/actions/day.ts` (`closeDay` au Crépuscule, `backfillMissedDays` en fin de Réveil pour l'historique sans trous). **Aucune policy DELETE** sur `day_results` (RG-04). "Annihiler" un reste = `is_abandoned = true`, jamais un DELETE.

**Profondeur des sous-tâches (RG-01) appliquée uniquement côté applicatif** — La colonne `parent_id` de `tasks` n'a aucune contrainte SQL (check/trigger) limitant la profondeur à 2 niveaux. La garde repose entièrement sur `isNestableParent`/`planReorder` (`lib/game-engine.ts`), revérifiés à la fois côté UI (bouton "+" absent sur une sous-tâche, `planReorder` refuse d'imbriquer une tâche qui a déjà des enfants) et côté server action (`reorderSiblings` dans `app/actions/tasks.ts`). Dette assumée pour le Sprint 1 : une action serveur appelée directement (hors UI) reste la seule ligne de défense, pas de filet base de données.

**Web Speech API : geste utilisateur direct obligatoire** — `SpeechRecognition.start()` (`hooks/useSpeechToText.ts`) doit être appelée de façon synchrone dans le handler `onClick` du bouton micro, sans détour asynchrone avant l'appel. Safari/iOS rejette silencieusement l'activation du micro si `.start()` n'est pas directement dans la pile d'un geste utilisateur. La détection de support navigateur (`SpeechRecognition` absent de `lib.dom.d.ts`, typé dans `types/speech-recognition.d.ts`) passe par `useSyncExternalStore` avec un snapshot serveur toujours `false`, pour éviter un mismatch d'hydratation Next.js entre le rendu serveur (pas de `window`) et le rendu client.

**E2E Playwright : exécution en série + serveur de production obligatoires** — `playwright.config.ts` force `fullyParallel: false` / `workers: 1` et démarre un serveur **prod** (`npm run build && npm run start`), pas `next dev`. Deux raisons cumulées, diagnostiquées en reproduisant le bug (9/9 vert en série, 6-8/9 KO dès 4 workers) : (1) tous les tests partagent l'unique compte e2e fixe (ADR-04), donc en parallèle ils mutent le même état (tâches, boss du jour) et se marchent dessus (contrôles restés `disabled`, redirections manquées) ; (2) `next dev` compile les routes à la demande, et sous parallélisme tous les workers déclenchent cette compilation en même temps, saturent le CPU et font dépasser le timeout de navigation. Ne pas revenir à `fullyParallel` sans d'abord isoler un compte Supabase par worker. Port surchargeable via `E2E_PORT` pour cohabiter avec un `next dev` local sur `:3000`.

**dnd-kit : `autoScroll` par défaut fausse la détection de collision sur les gestes fins** — `DndContext` a `autoScroll={false}` explicitement. Avec l'auto-scroll par défaut de dnd-kit activé, un drag qui approche le bord de la zone scrollable déclenche un scroll automatique **pendant** le geste ; les coordonnées absolues utilisées pour décider moitié haute/moitié basse d'une ligne (`isTopHalfDrop` dans `Arena.tsx`) se retrouvent décalées d'autant, et le geste "réordonner avant" peut basculer silencieusement en "imbriquer". Bug reproduit et diagnostiqué en e2e (Playwright) : la logique pure (`planReorder`, testée en Vitest) était correcte, seule la position live du pointeur dérivait pendant le drag. Si l'auto-scroll doit revenir un jour (listes très longues), il faudra recalculer la géométrie à partir d'un événement `onDragMove` en direct plutôt que d'une capture figée avant le drag.

**Économie d'or dérivée & Échoppe de héros (US-18)** — L'or n'est jamais accumulé : `gold` = `SUM(day_results.gold_earned) − SUM(unlocked_heroes.price_paid)` (`goldBalance`, `lib/game-engine.ts`). `gold_earned` est écrit à la clôture (`closeDay`) et au backfill (traité **chronologiquement** pour un bonus streak correct) via `computeGoldEarned` (base par issue + part dégâts + bonus streak cappé). `profiles.gold` n'est qu'un **cache**. L'Échoppe vend des **héros** (et non des skins de Boss — BDD d'origine révisée) : catalogue **statique** `lib/heroes.ts` (pas de table admin), rendu idle via `components/combat/IdleSprite` (frames PNG `/sprites/mc/<slug>/idle/frameNNNN.png`, index base 0 sur 4 chiffres). Possession dans `unlocked_heroes` (unique `(user_id, hero_id)`, **aucune policy DELETE**, RG-04, achat idempotent). `fire_knight` possédé d'office sans ligne (`isHeroOwned`). `profiles.equipped_hero_id` = héros affiché dans l'Arène (`VersusScene`, câblé via `Arena`). Skins/tenues (recolors) = US future ; nav = **QG hub** (Panthéon/Échoppe via le QG).

**Streaks à budget de jokers hebdo (US-12)** — La série (`currentStreak`, `lib/game-engine.ts`) compte les victoires consécutives mais **tolère jusqu'à 2 non-victoires (retreat/defeat/trou) par semaine ISO** (lundi→dimanche, dérivée du `day_date` local via `weekKey`) ; la 3e casse. Retourne `{ length, jokersUsedThisWeek, atRisk }`. **Changement de sémantique** : un trou isolé n'est plus une rupture (joker toléré). Dérivée de `day_results` (source unique) ; `profiles.streak_days`/`best_streak`/`current_title` sont des **caches** rafraîchis à la clôture (`closeDay`) et au backfill. Titres de jalon (`titleForStreak` : 7/30/100 → Ceinture Jaune/Noire/Sensei) — écrasent `current_title` (provisoire, à fusionner avec d'éventuels titres de niveau). Compteur + alerte « en danger » au QG (`StreakBadge`), flammes à la victoire au Crépuscule (reduced-motion).

**Onboarding & économie du starter (US-29)** — Tunnel : `/welcome` (signup **client-side**, même patron que `/login` — jamais de server action pour l'auth, sinon le cookie de session ne se propage pas ; **« Confirm email » doit être OFF** côté Supabase) → `/onboarding` (pseudo → avatar) → Arène avec coach. Entrée non-auth : `/` redirige vers `/welcome` (les autres routes protégées gardent `/login`). **Changement d'économie** : `isHeroOwned(id, ownedIds)` ne renvoie **plus** `true` d'office pour le défaut — possession strictement via `unlocked_heroes`. Le starter choisi est offert (ligne `price_paid=0`) à `createProfile` ; `fire_knight` a désormais un prix non nul (sinon gratuit à l'Échoppe). Migration de seed pour les profils existants + fixture e2e (`resetShopState` grante `fire_knight`). Coach du 1er combat (`ArenaCoach`, piloté par `profiles.has_seen_tutorial`) : étape « add » (suggestion « Prendre en main Dodojo ») → « strike » → `markTutorialSeen()` une fois (garde `useRef`) ; bouton « Passer » ; punchline « Premier sang » sur `PerfectOverlay` quand le KO tombe coach actif. e2e onboarding = compte dédié recréé à chaque run (`resetOnboardingUser`, creds `.env.local`).

**Manuel du Dojo — statique, sync Notion au build (US-28)** — Le guide est **100% statique** : `content/guide.json` (committé) rendu par `app/guide/page.tsx`. **Jamais** de Notion au runtime — `@notionhq/client` est une **devDependency** importée dynamiquement uniquement dans `scripts/sync-guide.mjs` (`npm run sync:guide`, requiert `NOTION_TOKEN` + `NOTION_GUIDE_PAGE_ID`, sinon no-op sans écraser). Le mapper Notion→schéma est pur et testé (`lib/guide.ts`, `mapNotionBlocks`). Les `section.id` servent d'ancres de deep-link (`/guide#streak`, `/guide#or`) — garder ces ids stables si on réécrit le contenu. Accès : QG + « ? » dans l'Arène.

**Roster de Boss & décors dynamiques** — Le boss (et son décor) du jour ne sont plus codés en dur. Catalogues **purs** : `lib/bosses.ts` (12 boss ; chaque boss porte `idleFrameCount`, `backgroundThemes` = thèmes de décor **cohérents avec son lore**, et `flip` = miroir horizontal car le boss est à droite et doit regarder le héros) + `lib/backgrounds.ts` (16 variantes sur 7 **thèmes** ; chaque décor a un champ `theme`). Le décor du jour est tiré parmi **toutes les variantes des thèmes du boss** (`backgroundsForThemes`) → ajouter une variante d'un thème l'ajoute automatiquement au pool des boss ciblant ce thème. Les sprites idle et décors sont **extraits vers `public/`** par `scripts/copy-boss-sprites.mjs` (jamais servir depuis `assets/`) : boss "réels" = copie de frames individuelles ; boss "low boss" CraftPix = **découpe de spritesheet** (frameWidth = largeur/nb_frames, hauteur = pleine ; comptes de frames explicites par pack car non-carrés parfois, ex. mushroom 70×64). Le boss du jour est tiré **une fois puis figé** dans la table `daily_boss` (une ligne par `(user_id, day_date)`, **aucune policy UPDATE/DELETE**) via `resolveDailyBoss` (`app/actions/boss.ts`, lazy au chargement de l'Arène comme la génération récurrente), en **excluant les boss des 2 derniers jours** (`pickDailyBoss`, pur, testé). Le décor est tiré parmi les `backgroundIds` du boss (`pickBackgroundId`). `VersusScene` reçoit boss+décor en props (plus rien de codé en dur). **Écran de test interne** `app/roster-preview-8f3a2c9d/page.tsx` : chemin **volontairement obscur, non listé, login requis, `noindex`** — permet de vérifier chaque boss (extraction sprite + cohérence décor + orientation via toggle flip) ; ne jamais le lier depuis l'UI. ⚠️ L'orientation `flip` des boss a été posée par hypothèse (réels=false, low boss=true) — **à confirmer visuellement** via l'écran de test.

**Mode Entraînement — génération au chargement, pas seulement au Réveil (US-17)** — Les routines (`recurring_templates`, `weekdays int[]` lundi=0, désactivation sans DELETE) génèrent leurs instances (`tasks` normales, `is_recurring=true` + `recurring_template_id`) via `generateRecurringInstances` (`app/actions/recurring.ts`). **Piège d'intégration** : le Rituel du Réveil bloquant ne se monte **que s'il y a des restes** — brancher la génération uniquement en fin de Réveil raterait les jours « propres » (nouvelle routine, zéro reste de la veille). Donc la génération est appelée **au chargement de `app/page.tsx`** (avant le fetch des tâches du jour), lazy et **idempotente** : `planRecurringGeneration` (pur) saute toute routine ayant déjà une instance aujourd'hui — fraîche OU **reste reporté** de cette routine (anti-doublon D5) — et ne génère **jamais** pour un jour passé (D6, seul `today`). `weekdayOf(dayDate)` dérive le jour de semaine de la date locale sans ré-appliquer de fuseau (même logique que `weekKey`). Jour de repos (`recurring_rest_days`) et souscriptions push (`push_subscriptions`, US-11) sont les deux seules tables du projet avec une policy DELETE (préférences de planning réversibles / données techniques d'appareil, pas des données de combat protégées par RG-04). Édition d'un template = **futur seulement** (B4), ne touche jamais les instances déjà créées. Gestion : `/qg/entrainement`. **Dette assumée MVP** : la création se fait via l'écran de gestion, pas via un toggle « récurrente » dans le champ d'ajout de l'Arène (repoussé).

**Le Panthéon — écran lecture seule dérivé (US-10)** — `app/pantheon/page.tsx` ne mute **rien** (B1) : tous les agrégats viennent de `pantheonStats` (`lib/game-engine.ts`, pur, testé) sur les `day_results` (fetch borné à 90 jours, tri desc) + `profiles` + solde d'or dérivé (`goldBalance`). `winRate` garde la division par zéro ; `bestDay` départage les égalités par la date la plus récente et vaut `null` si tous les jours sont à 0 dégât. Le **Journal** pagine côté client (`CombatJournal`, « charger plus ») sur le lot déjà chargé, sans re-fetch. Sparkline + anneau = SVG purs statiques (reduced-motion par nature). Accès **via le QG** (nav = QG hub), pas d'onglet direct. Les 3 états UI (Loading via `loading.tsx`, Error, Empty) sont obligatoires (règle projet n°3).

**Rage Quit vs Annihiler (`abandon_reason`, US-15)** — Les deux posent `is_abandoned=true` (RG-04, jamais de DELETE) mais portent une **émotion opposée**, distinguée par `tasks.abandon_reason` : `rage_quit` (abandon **punitif** d'une tâche active du jour, en cours de combat → malus **−5 XP clampé sans de-level** via `applyRageQuitPenalty`, ≠ `applyXpDelta` qui peut redescendre de niveau ; punchline « le Boss ricane ») vs `annihilated` (reste nettoyé **sereinement** au Réveil, aucun malus). Le malus est appliqué **une fois par action** (rage-quit d'une racine à N enfants = −5 XP, pas −5×N) ; la cascade sur les sous-tâches actives est calculée par `collectAbandonCascade` (pur). L'**undo** (`undoRageQuit`, même jour) ne restaure que les lignes `abandon_reason='rage_quit'` et rembourse +5 XP — un « Annihiler » n'est pas annulable par ce chemin. Migration `20260721090000` (colonne nullable + check contraint aux deux valeurs). `abandonTask` générique **supprimé** au profit de `rageQuitTask`.

**Perfect / K.O. en direct (US-16)** — Le déclenchement de la célébration est une **fonction pure de transition** `koOutcome(prevBossHp, nextBossHp, bossMaxHp, heroHp)` (`lib/game-engine.ts`) : `null` sauf transition→0 valide, `perfect` si Héro à 100 HP (aucun reste non résolu), sinon `ko`. La garde `prevBossHp === 0` évite le re-déclenchement sans **renaissance** (ajouter une tâche après KO re-heal le Boss puis un nouveau KO re-joue). `Arena.tsx` mémorise le HP **avant** le coup (`previousHp`) pour alimenter la garde. Le palier de série (US-12 : 7/30/100) déclenche la super-variante flammes — calculé en forçant l'issue du jour à `victory`. L'overlay (`PerfectOverlay.tsx`) porte un CTA **Rituel du Crépuscule** (clôture manuelle, non-bloquante) + « continuer ». Le pop d'entrée `ko-burst` utilise un easing en overshoot **assumé** (juice d'arcade Street Fighter, cf. `PRODUCT.md`) — le hook impeccable le signale comme "bounce-easing", c'est un choix de design volontaire, pas un défaut. Variante douce sous `prefers-reduced-motion`.

**Partage de victoire — paramètres explicites, pas de lookup DB (US-20)** — La route `app/api/share-card/route.tsx` (`next/og` natif à Next.js 16, **aucune dépendance `@vercel/og` séparée** — vérifié dans `node_modules/next/dist/docs`) reçoit toutes les valeurs de la carte en **paramètres de requête explicites** (`lib/share-card.ts`, `buildShareCardParams`/`parseShareCardParams`), jamais par lookup `day_result` : `PerfectOverlay` se déclenche *avant* la clôture du jour, aucune ligne `day_results` n'existe encore à cet instant (le Boss peut même renaître si une tâche est rajoutée après le K.O., cf. note sur `koOutcome`). Contrepartie assumée : la route ne vérifie pas que les valeurs reçues correspondent à un combat réel (n'importe qui pourrait forger une carte en bidouillant les paramètres) — l'authentification Supabase reste un garde-fou anti-abus basique, pas un contrôle d'intégrité. **Cache `Cache-Control: public, immutable, max-age=31536000`** : conséquence assumée, un cache CDN partagé peut resservir l'image à un utilisateur différent une fois qu'une requête identique a été mise en cache, sans re-vérification d'auth — acceptable ici car aucune donnée privée n'est exposée dans l'image. Police `BoldPixels` réservée aux libellés courts/majuscules (nombres, « DODOJO », « VS » — cf. `ASSETS.md` § Fonts) ; tout texte français long ou accentué (pseudo, titre, nom de héros/boss, date) reste sur la police par défaut de Satori pour garantir le rendu des accents. Table `share_events` (analytics minimal `share_clicked`/`share_succeeded`/`share_downloaded`) suit la même convention RG-04 : aucune policy UPDATE/DELETE. **Piège Satori découvert en vérification manuelle** : un style JSX `transform: undefined` (flip conditionnel du sprite Boss selon `boss.flip`) plante le rendu (`failed to pipe response`) — Satori exige une valeur CSS concrète, `"none"` échoue aussi (« Unexpected token type: word »), seule une fonction `scaleX(1)`/`scaleX(-1)` passe. Toujours fournir une valeur `transform` de repli valide (jamais `undefined`/`"none"`) dans un template `ImageResponse`. Par ailleurs `vitest.config.ts` n'avait aucun alias `@/*` (jamais nécessaire tant que seuls des tests `lib/**` sans imports `@/` existaient) — ajouté (`resolve.alias`) pour permettre aux tests composants (`components/**/*.test.tsx`, Testing Library + `jsdom`) d'importer `@/lib/...`/`@/app/...`. Ces tests composants doivent aussi nettoyer le DOM explicitement (`afterEach(cleanup)` de `@testing-library/react`) : sans `globals: true` dans la config Vitest, le cleanup automatique de Testing Library (qui dépend d'un `afterEach` global) ne se déclenche pas.

**Deadlines horaires — détection par polling, pas de replay (US-05)** — L'icône ⏰ sur `TaskRow` (racine et sous-tâche) ouvre un popover `<input type="time">` (`components/combat/DeadlineControl.tsx`) qui fixe/modifie/efface `tasks.deadline_at` (colonne déjà existante en base, aucune migration). La conversion heure locale ↔ ISO passe par `deadlineIso`/`localTimeFromIso` (`lib/game-engine.ts`), DST-aware via itération à point fixe — voir l'entrée dédiée `deadlineIso` ci-dessus (technique différente de `dayKey`, qui formate directement via `Intl.DateTimeFormat` sans arithmétique d'offset). Le franchissement d'une deadline est détecté par un **polling client** (`Arena.tsx`, ~45s, uniquement pendant que l'Arène est montée) : `missedDeadlineTasks` recalcule à chaque tick, et seules les tâches **nouvellement** franchies (suivies via un `Set` de refs, pas de comparaison d'égalité de tableau) déclenchent l'animation « Attaque Surprise » (clignotement de la jauge Héros + `FloatingText` `anchor="hero"` + toast « Repousser +1h »). **Pas de replay au chargement** : les deadlines déjà ratées avant l'ouverture de l'app sont incluses dans le calcul HP dès le premier rendu mais ne redéclenchent jamais l'animation. **Le report du Réveil (US-08) efface la deadline** (`deferOverdueTask`/`deferAllOverdue` posent `deadline_at: null`) pour éviter de cumuler le malus -10 (deadline ratée) avec le malus -20 (retard reporté) déjà appliqué sur la même tâche.

---

**Cron push — GitHub Actions plutôt que Vercel Cron natif (US-11)** — Le palier **Hobby** de Vercel (cf. Stack technique) limite les Cron Jobs natifs (`vercel.json`) à **1 exécution/jour**, incompatible avec la fenêtre 17h30 heure locale multi-fuseaux qui a besoin d'un déclenchement toutes les ~15 minutes (`profiles.timezone`). La route `app/api/cron/push-reminders/route.ts` est donc appelée par un **workflow GitHub Actions** planifié (`.github/workflows/push-reminders-cron.yml`, `schedule: cron: "*/15 * * * *"`), en HTTP avec un secret partagé (`CRON_SECRET`, header `Authorization: Bearer`) — pas de `vercel.json` dans ce repo, volontairement (l'ajouter avec un cron plus fréquent qu'1/jour casserait le déploiement automatique sur `main`). À reconsidérer si le projet passe un jour au palier Pro.

**Garde de session (`proxy.ts`) — routes techniques exemptées côté anonyme uniquement (US-11)** — `proxy.ts` (Middleware Next.js, renommé depuis `middleware.ts` en Next 16) a un matcher qui couvre tout sauf les assets statiques, donc y compris `/api/*` : sans exemption, `lib/supabase/middleware.ts` redirigeait toute requête sans cookie Supabase vers `/welcome`, y compris les appels externes légitimes (cron GitHub Actions, futurs webhooks/OAuth). `isPublicRoute(path)` (`lib/supabase/middleware.ts`, testée dans `lib/supabase/middleware.test.ts`) exempte désormais tout `/api/*` en plus de `/login`/`/welcome`, mais **uniquement pour le garde anonyme** (`!user && !isPublicRoute`) — le garde inverse (utilisateur déjà connecté redirigé loin d'une page publique) reste volontairement restreint à `/login`/`/welcome` seuls, jamais `/api/*` : sinon un utilisateur authentifié appelant une route `/api/*` protégée par sa propre logique (ex. `/api/share-card`, US-20) serait bounced vers `/` avant même d'atteindre son handler. US-03 (webhook Siri) bénéficie de l'exemption anonyme sans rien refaire ; US-22 (Gemini/OAuth) étend `isPublicRoute` à `/oauth/` et `/.well-known/`.

**Token webhook Siri hashé, jamais en clair (US-03)** — `profiles.webhook_token_hash` (SHA-256, `lib/webhook-token.ts`) + `webhook_token_created_at`/`webhook_token_last_used_at`. Le texte en clair n'est retourné qu'une fois, à la génération/régénération (`regenerateWebhookToken`, `app/actions/webhook-token.ts`) — jamais relu depuis la base ensuite. Régénérer écrase simplement le hash (invalidation immédiate du raccourci existant), ce n'est pas une donnée soumise à RG-04 (pas d'historique de combat). La route `POST /api/webhook/add-task` utilise le client Supabase **service-role** (comme `app/api/cron/push-reminders`, US-11), sans cookie, avec un `user_id` explicite retrouvé par hash — la logique d'insertion + recalcul HP est extraite dans `lib/task-insertion.ts` (`insertTaskForUser`) pour être appelée aussi bien par `addTask` (session cookie) que par ce webhook (aucune session), fondation réutilisée telle quelle par le futur US-22 (Gemini MCP). **Piège Vitest** : `vitest.config.ts` n'a pas de résolution d'alias `@/` (pas de plugin `vite-tsconfig-paths`) — tout fichier chargé directement par un test (`lib/task-insertion.ts`, `lib/task-title.ts`, `lib/webhook-token.ts`, `app/api/webhook/add-task/route.ts`) doit importer ses dépendances en **relatif**, jamais via `@/` (même contrainte déjà posée sur `app/sw.ts` par US-11).

## URL de production

**Production (Vercel) : https://dodojo.vercel.app** — déploiement automatique sur push `main` (projet Vercel `dodojo`, Node 24.x). Preview automatique par PR. Autres domaines actifs : `dodojo-git-main-ouro84s-projects.vercel.app`, `dodojo-ouro84s-projects.vercel.app`.

---

@AGENTS.md