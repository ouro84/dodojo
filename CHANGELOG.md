# Changelog

Toutes les features notables (produit et technique) de "Boss de la Journée" sont documentées ici.

Format des versions : `XX.YY.ZZ` (Majeure.Mineure.Fix), aligné sur les releases GitHub.
Chaque feature livrée est ajoutée sous `[Unreleased]` dans le même commit/PR que son
implémentation ; à chaque release GitHub, le contenu d'`[Unreleased]` bascule dans une
nouvelle section versionnée et datée.

## [Unreleased]

### Produit
- US-01 : Saisie de tâche textuelle classique
- US-06 : Recalcul dynamique des HP du Boss (heal +20 HP à l'ajout d'une tâche)
- US-21 : Validation de tâche & feedback flash combat (secousse d'écran, texte flottant)
- US-09 : Progression XP & niveaux (écran LEVEL UP)
- US-14 : Authentification & compte e2e fixe
- Refonte de l'Arène façon versus street-fighter (héros vs boss)
- US-04 : Sous-tâches à 2 niveaux (dégâts partagés, 10 HP au lieu de 20)
- US-19 : Drag & Drop d'imbrication et de réordonnancement (glisser une tâche sous une autre pour l'imbriquer, réordonner des tâches au même niveau, ou repromouvoir une sous-tâche en tâche racine)
- US-02 : Bouton Micro In-App (dictée vocale, Web Speech API)
- Cascade de complétion parent/sous-tâches : cocher toutes les sous-tâches coche automatiquement la tâche parente, et inversement décocher l'une d'elles la décoche ; cocher/décocher la tâche parente coche/décoche toutes ses sous-tâches
- US-08 : Rituel du Réveil (overlay bloquant au démarrage pour traiter les restes de la veille : Terminé / Reporter / Annihiler + actions groupées, backfill de l'historique)
- US-07 : Rituel du Crépuscule (ex-"Obi-Wan", clôture cérémonielle non-bloquante avec récap type carte de score arcade et streak preview)
- US-18 : L'Échoppe façon Character Select (débloquer/équiper des héros) + économie d'or (or gagné à la clôture du jour, solde dérivé, possession `unlocked_heroes`, héros affiché dans l'Arène via `equipped_hero_id`)
- US-12 : Système de streaks (série de victoires, budget de 2 non-victoires tolérées/semaine, record `best_streak`, compteur + alerte « en danger » au QG, titres de jalon, flammes à la victoire)
- US-16 : Animation « Perfect » / K.O. (célébration en direct quand le Boss tombe à 0 : **PERFECT** si Héro intact, **K.O.** si Héro entamé ; CTA Rituel du Crépuscule ; super-variante flammes au franchissement d'un palier de série ; variante douce `prefers-reduced-motion`)
- US-15 : Rage Quit de tâche (abandon punitif en cours de journée : modale de confirmation, malus −5 XP clampé sans de-level, Boss rétréci, cascade sur les sous-tâches actives, punchline « le Boss ricane », **undo** même-jour qui restaure et rembourse ; distingué de l'« Annihiler » serein du Réveil via `abandon_reason`)
- US-10 : Le Panthéon (écran lecture seule accessible depuis le QG — blocs Héros / Trophées / Trésor / Titres / Journal de combat paginé ; sparkline des dégâts, anneau de win-rate, meilleur jour ; 3 états Loading/Error/Empty)
- US-17 : Mode Entraînement / tâches récurrentes (routines à jours de la semaine sélectionnables, générées automatiquement au réveil du jour courant ; icône 🔁 sur les instances ; anti-doublon 1/routine/jour ; pas de génération rétroactive ; jour de repos planifiable ; écran de gestion `/qg/entrainement` : créer, désactiver, repos du jour)
- Système de Combo (juice arcade, esprit Street Fighter) : terminer des tâches à la chaîne fait monter un compteur de combo avec des punchlines escaladées (DOUBLE COUP ! → COMBO ×N → M-M-MONSTER COMBO !!) et un compteur persistant ; se brise si l'on décoche ou abandonne. Purement visuel — n'affecte ni l'XP ni l'or. Respecte `prefers-reduced-motion`.
- Roster de Boss & décors dynamiques : 12 boss (Gardien de Glace, Démon de Feu Mineur, Cthulhu, Minotaure, Satyre, Zombie, Champignon, Gorgone, Mage de Feu, Mage de Foudre, Caïd, Chevalier) tirés aléatoirement chaque jour, chacun associé à un décor **cohérent avec son lore** (16 variantes sur 7 thèmes) ; le boss du jour est garanti **différent des 2 derniers jours** puis figé pour la journée.
- US-28 : Manuel du Dojo (guide utilisateur in-app — barème, rituels, streaks, combos, or/Échoppe, panthéon, roster) ; accessible depuis le QG et un « ? » dans l'Arène, avec deep-links contextuels (série → section Séries, Échoppe → section Or). Contenu éditable dans Notion puis figé au build.
- US-29 : Onboarding (tunnel accueil Sensei → création de compte email+mdp → pseudo → choix de l'avatar façon Character Select → 1er combat coaché « Prendre en main Dodojo »). Le combattant de départ est offert ; les autres se débloquent à l'Échoppe. Coach « Passer » disponible, punchline « Premier sang » à la 1re victoire.
- US-20 : Partage de victoires (carte PNG portrait façon écran de score d'arcade, générée depuis `PerfectOverlay` et le Rituel du Crépuscule, sur les 3 issues victory/retreat/defeat ; variante flammes au franchissement d'un palier de série ; partage natif OS avec repli presse-papier puis téléchargement)
- US-05 : Deadlines horaires (icône ⏰ sur chaque tâche — racine ou sous-tâche — pour fixer une heure limite via un sélecteur d'heure natif ; badge agrégé « N deadlines à venir aujourd'hui » près de la jauge Boss). Une deadline ratée et non résolue inflige -10 HP au pool Héros (distinct des -20 HP d'un retard reporté, US-08) et déclenche une « Attaque Surprise » (jauge Héros qui clignote, texte flottant -10 HP, bouton « Repousser +1h »). Auto-résolution en cochant/abandonnant la tâche ; deadline effacée automatiquement en cas de report via le Rituel du Réveil.
- Socle PWA installable (issue #58) : manifest (`app/manifest.ts`, icônes any/maskable dérivées du logo), installation à l'écran d'accueil (Android via CTA maison au QG + bandeau natif ; iOS via instructions manuelles dans le Manuel du Dojo), page de secours hors-ligne, toast « nouvelle version disponible » quand un déploiement met à jour l'app
- US-11 : Notifications push de rappel (17h30 heure locale, opt-in dans la nouvelle section « Intégrations » du QG, punchlines variées, action « Plus tard », clic sur la notification → l'Arène)

### Technique
- `calculateHeroHp` (`lib/game-engine.ts`) accepte désormais un poids par tâche (`HeroHpPenaltyTask`, `overdueHpPenalties` -20 / `deadlineHpPenalties` -10) au lieu d'un poids fixe pour toute la liste ; nouvelles fonctions pures `missedDeadlineTasks`, `upcomingDeadlineCount`, `deadlineIso`/`localTimeFromIso` (conversion heure locale ↔ ISO, DST-aware via itération à point fixe) ; détection du franchissement de deadline par polling client léger (~45s) pendant que l'Arène est montée, sans replay au chargement
- Colonne `tasks.abandon_reason` (`rage_quit` | `annihilated`) : distingue en base l'abandon punitif du reste nettoyé sereinement (fondation des futures stats d'abandon du Panthéon)
- Tables `recurring_templates` (routines, `weekdays int[]`, désactivation sans DELETE) et `recurring_rest_days` (jours de repos, seul objet avec policy DELETE — préférence de planning, pas donnée de combat) + colonne `tasks.recurring_template_id` ; génération idempotente au chargement de l'Arène (`generateRecurringInstances`)
- Roster de boss : catalogues `lib/bosses.ts` (mapping lore→**thèmes** de décor, flip d'orientation) & `lib/backgrounds.ts` (16 variantes sur 7 thèmes ; toute nouvelle variante d'un thème validé entre automatiquement dans le pool des boss ciblant ce thème) ; extraction sprites/décors vers `public/` via `scripts/copy-boss-sprites.mjs` (copie de frames individuelles + découpe de spritesheets low boss) ; table `daily_boss` (tirage stocké/figé, exclut les 2 derniers jours) ; `resolveDailyBoss` (lazy au chargement) ; `VersusScene` rendu dynamique (boss + décor en props) ; sélection pure testée ; écran de test interne masqué `/roster-preview-8f3a2c9d` (login requis, `noindex`, non listé)
- US-28 : contenu statique `content/guide.json` + mapper Notion pur testé (`lib/guide.ts`) + `scripts/sync-guide.mjs` (`npm run sync:guide`, `@notionhq/client` en devDependency, import dynamique tolérant, jamais chargé au runtime)
- US-29 : colonne `profiles.has_seen_tutorial` ; signup **client-side** (`/welcome`) ; entrée non-auth `/` → `/welcome` ; **`isHeroOwned` sans défaut implicite** (possession strictement en base, starter offert via `unlocked_heroes` à 0, `fire_knight` passe à un prix non nul) + migration de seed ; compte e2e onboarding dédié (`resetOnboardingUser`)
- Initialisation du projet (Next.js 16, Supabase, Tailwind v4, Vitest, Playwright)
- Schéma BDD initial (`profiles`, `tasks`) avec RLS appliquant RG-04 (pas de suppression destructive)
- Premier test e2e Playwright (ADR-04, boucle de combat quotidienne)
- Ajout de `@dnd-kit/core` / `@dnd-kit/utilities` pour le drag & drop (US-19)
- Intégration continue GitHub Actions (`.github/workflows/ci.yml`) : lint + Vitest + build, puis e2e Playwright, sur chaque PR et push `main`
- `CONTRIBUTING.md` : procédure de vérification locale obligatoire avant toute PR et liste des secrets CI requis
- Stabilisation des e2e Playwright : exécution en série (`workers: 1`, compte e2e fixe partagé) sur serveur de production (`build && start`), fiabilisant le run parallèle qui échouait ; ignore ESLint du dossier `assets/` (packs tiers)
- Dependabot (`.github/dependabot.yml`) : mises à jour mensuelles des dépendances npm et des actions GitHub (bumps mineurs/patch regroupés)
- Table `day_results` (issue du jour, dégâts, XP ; fondation Panthéon/streak/partage) + colonne `profiles.timezone` ; le "jour" devient le jour local de l'utilisateur (`dayKey`) au lieu de l'UTC (RG-03)
- US-20 : route `app/api/share-card/route.tsx` (génération PNG via `next/og`/`ImageResponse`, natif à Next.js 16 — pas de dépendance `@vercel/og` séparée), paramètres explicites (pas de lookup `day_result`), cache `public, immutable`, format 1080×1920 ; mapping pur testé (`lib/share-card.ts`) ; table `share_events` (analytics minimal `share_clicked`/`share_succeeded`/`share_downloaded`, aucune policy UPDATE/DELETE) ; outillage de test composant (`@testing-library/react` + `jsdom`, environnement par fichier, alias `@/*` ajouté à `vitest.config.ts`)
- Service worker via `@serwist/turbopack` (Turbopack-natif — `@serwist/next` est incompatible avec Turbopack, bundler par défaut de Next.js 16 en dev ET en build) : `app/sw.ts` précache uniquement l'app-shell (JS/CSS/police/manifest/page offline, invalidé à chaque déploiement via `resolveBuildRevision`) ; cache runtime `CacheFirst` pour les sprites/décors/vfx (`public/sprites`, `public/backgrounds`, `public/vfx`), jamais précachés en bloc
- Table `push_subscriptions` (policy DELETE autorisée — donnée technique d'appareil, pas RG-04) + colonne `profiles.last_reminder_sent_on` (idempotence d'envoi) ; sélection pure des profils éligibles (`lib/push-eligibility.ts`, 5 conditions) et gabarits de rappel (`lib/push-copy.ts`) ; envoi via `web-push` (VAPID) depuis `app/api/cron/push-reminders` ; déclenché par un workflow GitHub Actions planifié (`.github/workflows/push-reminders-cron.yml`, toutes les 15 min) — pas de Cron Vercel natif, incompatible avec le palier Hobby (1 exécution/jour max)
