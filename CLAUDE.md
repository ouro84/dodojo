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

**Pas de policy DELETE en RLS** — Les tables `profiles` et `tasks` n'ont volontairement aucune policy Supabase RLS pour `DELETE`. Ceci applique RG-04 au niveau base de données, en plus de la convention côté application (colonnes `is_abandoned` / `is_completed`).

**Pas de trigger d'auto-création de profil** — Aucun trigger sur `auth.users` ne crée automatiquement une ligne `profiles` à l'inscription. Le pseudo doit être défini explicitement par l'utilisateur (voir tone of voice : pas de fallback générique type "Héros"), donc la création de la ligne `profiles` fait partie du flow d'onboarding applicatif (US-14), pas de la migration SQL.

**Jauge de HP du Héros — dette soldée par le Rituel du Réveil (US-08)** — La jauge de HP du Héros (`calculateHeroHp` dans `lib/game-engine.ts`, -20 HP par tâche en retard non résolue, plancher à 0) n'est plus purement décorative. Le Rituel du Réveil (`components/combat/WakeUpRitual.tsx`, US-08) traite les restes au démarrage via un overlay **bloquant** : Terminé / Reporter / Annihiler (+ actions groupées). Résoudre les restes fait remonter la jauge. La jauge ne peut donc plus rester à 0 indéfiniment sans action proposée. Voir le spec unifié `docs/superpowers/specs/2026-07-20-cycle-journee-design.md`.

**Cycle de la Journée & table `day_results`** — Les deux bornes du jour sont le Rituel du Réveil (US-08, ouverture, traitement des restes) et le Rituel du Crépuscule (US-07, ex-"Obi-Wan", clôture cérémonielle non-bloquante). La table `day_results` (une ligne par `(user_id, day_date)`, contrainte unique) enregistre l'issue du jour (`victory` / `retreat` / `defeat`), les dégâts, l'XP, etc. — fondation du Panthéon (US-10), des Streaks (US-12) et du partage (US-20). Écriture **idempotente** (upsert, chiffres recalculés depuis les tâches, jamais accumulés) via `app/actions/day.ts` (`closeDay` au Crépuscule, `backfillMissedDays` en fin de Réveil pour l'historique sans trous). **Aucune policy DELETE** sur `day_results` (RG-04). "Annihiler" un reste = `is_abandoned = true`, jamais un DELETE.

**Profondeur des sous-tâches (RG-01) appliquée uniquement côté applicatif** — La colonne `parent_id` de `tasks` n'a aucune contrainte SQL (check/trigger) limitant la profondeur à 2 niveaux. La garde repose entièrement sur `isNestableParent`/`planReorder` (`lib/game-engine.ts`), revérifiés à la fois côté UI (bouton "+" absent sur une sous-tâche, `planReorder` refuse d'imbriquer une tâche qui a déjà des enfants) et côté server action (`reorderSiblings` dans `app/actions/tasks.ts`). Dette assumée pour le Sprint 1 : une action serveur appelée directement (hors UI) reste la seule ligne de défense, pas de filet base de données.

**Web Speech API : geste utilisateur direct obligatoire** — `SpeechRecognition.start()` (`hooks/useSpeechToText.ts`) doit être appelée de façon synchrone dans le handler `onClick` du bouton micro, sans détour asynchrone avant l'appel. Safari/iOS rejette silencieusement l'activation du micro si `.start()` n'est pas directement dans la pile d'un geste utilisateur. La détection de support navigateur (`SpeechRecognition` absent de `lib.dom.d.ts`, typé dans `types/speech-recognition.d.ts`) passe par `useSyncExternalStore` avec un snapshot serveur toujours `false`, pour éviter un mismatch d'hydratation Next.js entre le rendu serveur (pas de `window`) et le rendu client.

**E2E Playwright : exécution en série + serveur de production obligatoires** — `playwright.config.ts` force `fullyParallel: false` / `workers: 1` et démarre un serveur **prod** (`npm run build && npm run start`), pas `next dev`. Deux raisons cumulées, diagnostiquées en reproduisant le bug (9/9 vert en série, 6-8/9 KO dès 4 workers) : (1) tous les tests partagent l'unique compte e2e fixe (ADR-04), donc en parallèle ils mutent le même état (tâches, boss du jour) et se marchent dessus (contrôles restés `disabled`, redirections manquées) ; (2) `next dev` compile les routes à la demande, et sous parallélisme tous les workers déclenchent cette compilation en même temps, saturent le CPU et font dépasser le timeout de navigation. Ne pas revenir à `fullyParallel` sans d'abord isoler un compte Supabase par worker. Port surchargeable via `E2E_PORT` pour cohabiter avec un `next dev` local sur `:3000`.

**dnd-kit : `autoScroll` par défaut fausse la détection de collision sur les gestes fins** — `DndContext` a `autoScroll={false}` explicitement. Avec l'auto-scroll par défaut de dnd-kit activé, un drag qui approche le bord de la zone scrollable déclenche un scroll automatique **pendant** le geste ; les coordonnées absolues utilisées pour décider moitié haute/moitié basse d'une ligne (`isTopHalfDrop` dans `Arena.tsx`) se retrouvent décalées d'autant, et le geste "réordonner avant" peut basculer silencieusement en "imbriquer". Bug reproduit et diagnostiqué en e2e (Playwright) : la logique pure (`planReorder`, testée en Vitest) était correcte, seule la position live du pointeur dérivait pendant le drag. Si l'auto-scroll doit revenir un jour (listes très longues), il faudra recalculer la géométrie à partir d'un événement `onDragMove` en direct plutôt que d'une capture figée avant le drag.

**Économie d'or dérivée & Échoppe de héros (US-18)** — L'or n'est jamais accumulé : `gold` = `SUM(day_results.gold_earned) − SUM(unlocked_heroes.price_paid)` (`goldBalance`, `lib/game-engine.ts`). `gold_earned` est écrit à la clôture (`closeDay`) et au backfill (traité **chronologiquement** pour un bonus streak correct) via `computeGoldEarned` (base par issue + part dégâts + bonus streak cappé). `profiles.gold` n'est qu'un **cache**. L'Échoppe vend des **héros** (et non des skins de Boss — BDD d'origine révisée) : catalogue **statique** `lib/heroes.ts` (pas de table admin), rendu idle via `components/combat/IdleSprite` (frames PNG `/sprites/mc/<slug>/idle/frameNNNN.png`, index base 0 sur 4 chiffres). Possession dans `unlocked_heroes` (unique `(user_id, hero_id)`, **aucune policy DELETE**, RG-04, achat idempotent). `fire_knight` possédé d'office sans ligne (`isHeroOwned`). `profiles.equipped_hero_id` = héros affiché dans l'Arène (`VersusScene`, câblé via `Arena`). Skins/tenues (recolors) = US future ; nav = **QG hub** (Panthéon/Échoppe via le QG).

**Streaks à budget de jokers hebdo (US-12)** — La série (`currentStreak`, `lib/game-engine.ts`) compte les victoires consécutives mais **tolère jusqu'à 2 non-victoires (retreat/defeat/trou) par semaine ISO** (lundi→dimanche, dérivée du `day_date` local via `weekKey`) ; la 3e casse. Retourne `{ length, jokersUsedThisWeek, atRisk }`. **Changement de sémantique** : un trou isolé n'est plus une rupture (joker toléré). Dérivée de `day_results` (source unique) ; `profiles.streak_days`/`best_streak`/`current_title` sont des **caches** rafraîchis à la clôture (`closeDay`) et au backfill. Titres de jalon (`titleForStreak` : 7/30/100 → Ceinture Jaune/Noire/Sensei) — écrasent `current_title` (provisoire, à fusionner avec d'éventuels titres de niveau). Compteur + alerte « en danger » au QG (`StreakBadge`), flammes à la victoire au Crépuscule (reduced-motion).

---

## URL de production

**Production (Vercel) : https://dodojo.vercel.app** — déploiement automatique sur push `main` (projet Vercel `dodojo`, Node 24.x). Preview automatique par PR. Autres domaines actifs : `dodojo-git-main-ouro84s-projects.vercel.app`, `dodojo-ouro84s-projects.vercel.app`.

---

@AGENTS.md