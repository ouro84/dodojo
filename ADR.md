# ADR.md — Architecture Decision Records ("Boss de la Journée")

> Dernière mise à jour : 2026-07-08
> Stack validée : Next.js 16 + Supabase + Tailwind CSS v4 + Vercel (Hobby)

---

## ADR-01 — Framework Applicatif
### Contexte
Nous avons besoin d'un framework capable de propulser une application mobile-first hautement interactive, avec un rendu rapide, une gestion fluide des sessions utilisateurs, et une structure qui permet d'évoluer vers des fonctionnalités avancées (voix, APIs).

### Décision
Choix de **Next.js 16 (App Router)** avec TypeScript strict.

### Justification
*   **Vibe Coding & LLM Ready :** C'est la stack la mieux documentée et maîtrisée par les IA, ce qui accélère drastiquement la vitesse de développement.
*   **Hybride :** Permet d'utiliser des *Server Components* pour la sécurité (gestion de l'auth et requêtes lourdes) et des *Client Components* pour l'arène hautement interactive (animations, jauges, audio).
*   **Free Tier :** Déploiement natif et gratuit sur Vercel[cite: 1].

### Alternatives écartées
*   **React Native (Expo) :** Écarté pour le Sprint 0. Bien que le mobile natif soit la cible du Sprint 3 (Widgets, Siri), lancer une PWA (Progressive Web App) en Next.js permet de tester le marché en 3 semaines sans la friction des barrières des stores Apple/Google.

---

## ADR-02 — Base de données, Temps Réel & Authentification
### Contexte
L'application nécessite une persistance des données (profils, quêtes, or), une authentification sécurisée e2e pour les tests, et potentiellement du temps réel ou des crons légers à terme[cite: 1, 2].

### Décision
Choix de **Supabase (PostgreSQL, Auth, Edge Functions)**[cite: 1].

### Justification
*   **Tout-en-un Gratuit :** Le Free Tier de Supabase offre 500 MB de stockage de données, ce qui est largement suffisant pour des milliers de profils Thomas (données textuelles légères)[cite: 1, 2].
*   **Auth intégrée :** Gère l'authentification nativement, incluant la possibilité de configurer le compte fixe indispensable pour nos tests de bout en bout (E2E)[cite: 2].
*   **Évolutivité Voix :** PostgreSQL nous permettra de stocker efficacement les chaînes de texte issues des transcriptions vocales du Sprint 1[cite: 2].

### Alternatives écartées
*   **Firebase :** Écarté en raison de sa structure NoSQL. Le modèle de données de notre RPG (Lien profil, tâches, sous-tâches imbriquées) est purement relationnel[cite: 2]. PostgreSQL est beaucoup plus sain pour éviter la duplication de données.
*   **LocalStorage pur :** Écarté car le multi-appareil et la persistance lors des changements de téléphones sont critiques pour la rétention d'un SaaS, même au stade de MVP.

---

## ADR-03 — Design System & Style (Arcade Vibe)
### Contexte
L'interface doit émuler une borne d'arcade 16-32 bits (animations rétro, flashs de combat, typographie pixel, thèmes sombres/néons).

### Décision
Choix de **Tailwind CSS v4**[cite: 1].

### Justification
*   **Performance :** Pas de surcharge de runtime JS, compilation ultra-rapide.
*   **Customisation thématique :** Permet de configurer les variables d'animations de secousse d'écran (Screen Shake) et les palettes de couleurs rétro directement dans les classes utilitaires ou le fichier de configuration CSS.
*   **Précision chirurgicale :** Idéal pour construire des composants d'interface complexes (comme la jauge de HP interactive) sans se battre avec un framework UI rigide (MUI, Shadcn) qui casse le style "jeu vidéo".

### Alternatives écartées
*   **CSS Modules :** Trop verbeux pour du prototypage rapide en mode vibe coding.

---

## ADR-04 — Stratégie de Tests & Automatisation
### Contexte
Pour maintenir une vitesse de déploiement élevée sans casser l'expérience utilisateur, nous devons automatiser la validation des parcours critiques (Connexion, validation de tâche, recalcul des HP)[cite: 1, 2].

### Décision
Mise en place de **Vitest** (Tests unitaires) et **Playwright** (Tests E2E) intégrés dans une CI GitHub Actions[cite: 1].

### Justification
*   **Vitest :** Permet de tester la logique métier pure (le moteur de calcul des HP du Boss selon les règles métier RG-01 et RG-02) dans le dossier `lib/` de manière ultra-rapide et isolée du navigateur[cite: 1, 2].
*   **Playwright + Compte Fixe :** Jouera le scénario complet du combat quotidien (Connexion via le compte e2e fixe -> Ajout tâche -> Coche tâche -> Vérification de la baisse des HP) sur de vrais navigateurs à chaque Pull Request[cite: 2].

### Évolution — d'un compte fixe unique à un compte fixe par worker (2026-08-08)

Le choix initial d'un **compte fixe unique** partagé par toute la suite n'avait jamais été justifié explicitement ici (seule la conséquence — `workers:1`/`fullyParallel:false` dans `playwright.config.ts` — était documentée). Un compte unique force l'exécution en série : tous les tests mutent le même état (tâches, boss du jour), donc les paralléliser les fait se marcher dessus (bug reproduit à l'époque : 9/9 vert en série, ~6-8/9 KO dès 4 workers).

Ce compromis avait un coût direct sur le forfait GitHub Actions (2000 min/mois, palier Hobby) : la facturation Actions dépend de la durée du job, pas du nombre de workers Playwright à l'intérieur d'un même job/runner — l'exécution série (16-19 min/run mesurés) coûtait donc plus cher que nécessaire, pas moins.

**Décision révisée** : un compte Supabase fixe **par worker** (`E2E_TEST_EMAIL`/`_2`/`_3`/`_4`, secrets CI, `e2e/fixtures.ts`), routé via `TEST_PARALLEL_INDEX` (exposé par Playwright dans chaque process worker). `workers:4`/`fullyParallel:true` uniquement en CI (runner `ubuntu-latest`, 4 vCPU) ; `workers:1` inchangé en local (un seul compte configuré, pas d'obligation d'en provisionner 4 sur chaque poste dev). Provisionnement via `scripts/e2e-provision-worker-account.mts` (idempotent, reproduit le flow d'onboarding applicatif via service-role). Chaque fichier de spec s'exécute entièrement dans un seul worker (donc un seul compte) — aucune contention inter-fichier à gérer.

---

## ADR-05 — Carrousel de tenues (Le Marché Noir, issue #75)

### Contexte
La refonte de la sélection de tenue de héros (US-53) remplace la bande de pastilles de couleur par un carrousel 3D façon coverflow (swipe/flèches/clavier, tenues adjacentes visibles en profondeur). Aucun patron de carrousel/swipe n'existait dans le repo, et toute l'animation de l'app était jusqu'ici en CSS pur/Tailwind — aucune lib de motion JS installée.

### Décision
Ajout de **`embla-carousel`** (+ `embla-carousel-react`) comme dépendance dédiée à cette interaction, plutôt qu'un swipe fait main (pointer events + transforms CSS).

### Justification
*   **Interaction non triviale :** snap, vélocité, drag tactile et accessibilité clavier sont des détails difficiles à bien faire à la main — le précédent `dnd-kit` (déjà dans le projet pour le drag & drop des tâches) montre que le projet accepte une lib headless dédiée quand l'interaction le justifie, plutôt que de tout réinventer en CSS.
*   **Léger et headless :** Embla ne dicte aucun style — la couche 3D (perspective/rotateY/translateZ) reste un calcul custom appliqué par-dessus sa progression de scroll (`scrollProgress()`), cohérent avec l'esthétique 100% Tailwind du reste de l'app.
*   Aucun preset "coverflow 3D" natif dans Embla — le pattern (transform calculé depuis la progression de scroll) est un usage documenté par la communauté, pas une fonctionnalité prête à l'emploi.

### Alternatives écartées
*   **Swipe fait main (pointer events + CSS)** : écarté, le coût de réimplémenter proprement snap/vélocité/clavier dépasserait celui d'une dépendance de 6 Ko.
*   **Swiper.js / react-slick** : écartées, plus lourdes et moins headless qu'Embla pour un besoin de transform 3D entièrement custom.

---

## Conventions d'Équipe & Workflow Git

### Workflow Git (Strict)
*   La branche `main` est sacrée, protégée et représente la production toujours déployable[cite: 1].
*   Toute nouvelle US ou feature se développe sur une branche dédiée : `feat/nom-us` ou `fix/nom-bug`[cite: 1].
*   **Règle d'or de fusion :** Interdiction stricte de fusionner une branche sur `main` si la CI (GitHub Actions) est rouge[cite: 1].

### Format des Commits (Conventional Commits)
Le format des messages doit obligatoirement être : `type: description courte`[cite: 1].
*   `feat:` pour une nouvelle fonctionnalité produit (ex: `feat: add flash feedback on task completion`)[cite: 1, 2].
*   `fix:` pour la correction d'un bug (ex: `fix: boss hp negative values`)[cite: 1].
*   `chore:` pour les modifications de configuration ou dépendances (ex: `chore: init supabase client`)[cite: 1].
*   `docs:` pour les fichiers markdown uniquement[cite: 1].

### Gestion des Secrets
*   Le fichier `.env.local` contient les clés API privées (Supabase URL, Anon Key) et est **strictement inscrit dans le `.gitignore`** pour ne jamais fuiter sur GitHub[cite: 1].
*   Un fichier `.env.example` est commité à la racine avec les clés vides pour documenter les besoins de l'environnement[cite: 1].