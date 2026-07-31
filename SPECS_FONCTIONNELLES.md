# SPECS_FONCTIONNELLES.md — "Boss de la Journée" (Projet Arcade To-Do)

> Dernière mise à jour : 2026-07-23
> Statut : Document de Référence Produit Spécifié (23/23 US) — Validé
> **Sprint 2 LIVRÉ** (2026-07-21) : US-10, US-12, US-15, US-16, US-17, US-18 implémentées. Specs détaillées dans `docs/superpowers/specs/2026-07-20-us*.md`. Navigation Sprint 2 = **QG hub** (Arène = accueil ; Panthéon, Échoppe & Mode Entraînement accessibles depuis le QG).

---

## 1. Vision du Produit & Positionnement (Product Marketing & Branding)

### Le Problème
Les applications de productivité classiques (Todoist, Notion, Trello) sont anxiogènes ou ennuyeuses. Elles rappellent le travail sous sa forme la plus bureaucratique, ce qui favorise la procrastination chez les profils sujets à la charge mentale ou au TDAH.

### La Solution
Transformer la liste de tâches quotidienne en un combat de boss d'arcade (style *Street Fighter* / *Final Fight* en pixel art 16-32 bits). Chaque tâche complétée inflige des dégâts au Boss ; chaque tâche ajoutée ou reportée augmente sa jauge de vie.

### Personas & Job-To-Be-Done
*   **Persona Principal :** Thomas, le Héros Surchargé (Développeur/Créateur indépendant). Il croule sous les micro-tâches, déteste l'administratif, et a besoin d'un shoot de dopamine immédiat pour avancer.
*   **Job-To-Be-Done :** En tant que travailleur indépendant sujet à la charge mentale, je veux transformer mes corvées en monstres à abattre, afin de ressentir une gratification immédiate en terminant ma journée de travail et fermer mon ordinateur l'esprit léger.

### Tone of Voice & Identité Visuelle
*   **Esthétique :** Écrans inspirés des jeux de combat d'arcade des années 90. Typographie pixel, jauges de vie clignotantes, retours visuels percutants (flashs, secousses d'écran).
*   **Ton :** Élève de dojo d'arts martiaux qui se bat dans la rue (vibe Ryu/Ken de Street Fighter) — discipline et humilité du dojo, grinta et franc-parler du combat de rue. L'application tutoie l'utilisateur et l'appelle par son pseudo (jamais "Héros" générique), utilise des punchlines de combat rétro pour commenter les actions. Détail complet : `docs/superpowers/specs/2026-07-08-tone-of-voice-design.md`.

---

## 2. Lotissement Stratégique & Roadmap (Sprints)

*   **SPRINT 0 : Le MVP Minimaliste (Objectif : Lancer vite)** : Focus exclusif sur l'Arène (To-Do classique textuelle), le QG (Profil e2e) et la boucle de combat brute (HP dynamiques, Flash combat, Rituels du Crépuscule / du Réveil).
*   **⚔️ SPRINT 1 : L'UX Héroïque & Ergonomie** : Intégration de la voix (micro in-app), des sous-tâches à 2 niveaux et du Drag & Drop pour imbrication.
*   **🏆 SPRINT 2 : Rétention & Dopamine (La Gamification)** : Ouverture de l'Échoppe (Shop), du Panthéon (Stats), gestion des Streaks, des tâches récurrentes et du Rage Quit de tâche.
*   **🔮 SPRINT 3 & + : La Vision Long Terme (Scalabilité)** : Intégrations natives lourdes (Siri/Google Assistant profond, notifications push, deadlines horaires, Widget mobile).

---

## 3. Registre Intégral des User Stories (23/23)

### 🚀 SPRINT 0 : LE MVP MINIMALISTE

#### US-01 : Saisie de tâche textuelle classique
*   **Standard :** En tant que Héros, je veux taper une tâche au clavier pour l'ajouter à ma journée.
*   **BDD :**
    ```gherkin
    Given Un utilisateur sur l'écran "L'Arène"
    When Il saisit "Finir le rapport" dans le champ texte et appuie sur Entrée
    Then La tâche est ajoutée à la liste du jour
    ```

#### US-06 : Recalcul dynamique des PV du Boss (Heal du Boss)
*   **Standard :** En tant que Héros, je veux que la vie du Boss augmente quand j'ajoute une tâche pour simuler son gain de puissance.
*   **BDD :**
    ```gherkin
    Given Un Boss ayant 60/60 HP avec 3 tâches actives
    When L'utilisateur ajoute une 4ème tâche
    Then Les HP max et actuels du Boss passent instantanément à 80 HP
    And Un texte flottant affiche "Le Boss se soigne ! +20 HP"
    ```

#### US-21 : Validation de tâche & Feedback Flash Combat
*   **Standard :** En tant que Héros, je veux un retour visuel violent quand je coche une tâche pour ressentir l'impact du coup.
*   **BDD :**
    ```gherkin
    Given Un Boss à 80 HP
    When L'utilisateur coche une tâche comme terminée
    Then L'écran flashe en rouge et tremble (secousse CSS)
    And Un texte flottant pixel-art "-20 HP" apparaît au-dessus du Boss
    And Les HP du Boss descendent à 60
    ```

#### US-07 : Rituel du Crépuscule (Fin de journée)
> Renommé depuis "Rituel Obi-Wan". Design détaillé : `docs/superpowers/specs/2026-07-20-cycle-journee-design.md`.
*   **Standard :** En tant que Héros, je veux clore ma journée manuellement pour fêter ma victoire ou acter ma retraite.
*   **BDD :**
    ```gherkin
    Given Un utilisateur ayant fini ses tâches ou abandonnant le combat
    When Il clique sur le bouton "Rituel du Crépuscule"
    Then Un récap figé (carte de score) affiche dégâts, tâches, XP et l'issue (victory/retreat)
    And Un day_result est persisté (clôture cérémonielle, non-bloquante)
    ```

#### US-08 : Rituel du Réveil Automatique (Traitement des restes)
> Design détaillé : `docs/superpowers/specs/2026-07-20-cycle-journee-design.md`.
*   **Standard :** En tant que Héros, je veux être confronté au démarrage aux tâches non résolues de la veille.
*   **BDD :**
    ```gherkin
    Given Un utilisateur ouvrant l'app un nouveau jour local avec 2 tâches non finies de la veille
    When L'application s'initialise
    Then Un overlay bloquant "Rituel du Réveil" apparaît
    And Force l'utilisateur à choisir, par reste, entre "Terminé", "Reporter" (au jour J) ou "Annihiler"
    And "Annihiler" = is_abandoned (jamais de suppression SQL, RG-04)
    ```

#### US-09 : Progression de base (XP & Niveaux)
*   **Standard :** En tant que Héros, je veux gagner de l'XP fixe par tâche validée pour monter de niveau.
*   **BDD :**
    ```gherkin
    Given Un utilisateur niveau 1 avec 80/100 XP
    When Il valide une tâche (gain de 30 XP)
    Then Son XP passe à 10 et un écran "LEVEL UP ! Niveau 2" s'affiche avec une fanfare visuelle
    ```

#### US-14 : Authentification & Compte e2e Fixe
*   **Standard :** En tant que développeur, je veux un compte de test fixe pour automatiser mes tests de bout en bout avec Supabase.
*   **BDD :**
    ```gherkin
    Given Un utilisateur non connecté
    When Il utilise les identifiants de test e2e fixes
    Then Supabase Auth l'authentifie et le redirige directement dans l'Arène
    ```

---

### ⚔️ SPRINT 1 : L'UX HÉROÏQUE & ERGONOMIE

#### US-02 : Bouton Micro In-App (Dictée Vocale)
*   **Standard :** En tant que Héros pressé, je veux dicter une tâche grâce à un micro dans l'application.
*   **BDD :**
    ```gherkin
    Given Un utilisateur sur le champ de saisie
    When Il clique sur l'icône "Micro" et dit "Acheter du pain"
    Then L'API Web Speech retranscrit le texte et crée la tâche automatiquement
    ```

#### US-04 : Sous-tâches à 2 niveaux (Dégâts partagés)
*   **Standard :** En tant que Héros organisé, je veux diviser une tâche en sous-tâches qui frappent aussi le Boss.
*   **BDD :**
    ```gherkin
    Given Une tâche principale liée à un Boss
    When L'utilisateur crée une sous-tâche
    Then Les HP du Boss sont ajustés (Chaque sous-tâche vaut 10 HP au lieu de 20)
    ```

#### US-19 : Drag & Drop d'imbrication (Style Google Keep)
*   **Standard :** En tant que Héros, je veux glisser une tâche sous une autre pour l'imbriquer intuitivement.
*   **BDD :**
    ```gherkin
    Given Deux tâches verticales A et B
    When L'utilisateur glisse la tâche B vers la droite sous la tâche A
    Then La tâche B devient graphiquement et logiquement une sous-tâche de A
    ```

---

### 🏆 SPRINT 2 : RÉTENTION & DOPAMINE

#### US-15 : Le "Rage Quit" de tâche (Micro-punition)
> Design détaillé : `docs/superpowers/specs/2026-07-20-us15-rage-quit-design.md`. Le Boss rétrécit (`is_abandoned`), malus −5 XP **sans de-level**, undo même-jour, `abandon_reason` distingue du "Annihiler" serein du Réveil.
*   **Standard :** En tant que Héros réaliste, je veux abandonner une tâche en cours de route quitte à subir un malus.
*   **BDD :**
    ```gherkin
    Given Une tâche active en cours de journée
    When L'utilisateur clique sur "Abandonner (Rage Quit)"
    Then La tâche est marquée comme échouée, le Boss ricane visuellement et le joueur perd 5 XP
    ```

#### US-16 : Animation du "Perfect" (Boss terrassé à 0 HP)
> Design détaillé : `docs/superpowers/specs/2026-07-20-us16-perfect-ko-design.md`. Déclenché sur la transition HP→0 ; **PERFECT** si Héros à 100 HP, sinon **K.O./VICTOIRE** ; CTA Crépuscule (clôture manuelle) ; variante `prefers-reduced-motion`.
*   **Standard :** En tant que Héros d'élite, je veux une célébration majeure si je vide la jauge du Boss à 0 HP.
*   **BDD :**
    ```gherkin
    Given Un Boss à 20/100 HP
    When L'utilisateur valide la dernière tâche active
    Then Une animation d'explosion style K.O. de Street Fighter s'affiche avec la mention "PERFECT !"
    ```

#### US-17 : Mode Entraînement (Tâches récurrentes)
> Design détaillé : `docs/superpowers/specs/2026-07-20-us17-taches-recurrentes-design.md`. **Jours de la semaine sélectionnables** (pas seulement quotidien), génération au Réveil du jour courant, instance non faite = reste à résoudre, anti-doublon (1/routine/jour) + pas de génération rétroactive.
*   **Standard :** En tant que Héros routinier, je veux que mes quêtes quotidiennes se réinitialisent automatiquement chaque matin.
*   **BDD :**
    ```gherkin
    Given Une tâche récurrente configurée comme "Quête Quotidienne"
    When Le Rituel du Réveil se déclenche un nouveau jour
    Then La tâche est automatiquement recréée pour la nouvelle journée sans action manuelle
    ```

#### US-18 : L'Échoppe & Monnaie Virtuelle (Pièces d'Or)
> Design détaillé : `docs/superpowers/specs/2026-07-20-us18-echoppe-heros-design.md`. **Révisé au Sprint 2** : la boutique vend des **héros (combattants)** façon *Character Select* de jeu de combat, plus des skins de Boss. L'or est gagné à la clôture du jour (`day_results.gold_earned`) ; le solde est dérivé (`SUM(gold_earned) − SUM(price_paid)`). Les skins/tenues (recolors) sont repoussés à une US dédiée.
*   **Standard :** En tant que Héros économe, je veux gagner de l'or pour débloquer de nouveaux combattants dans une boutique façon écran de sélection de personnage.
*   **BDD :**
    ```gherkin
    Given Un profil avec 300 pièces d'or et Fire Knight équipé
    When L'utilisateur débloque le combattant "Water Priestess" à 200 pièces dans l'Échoppe
    Then Le solde passe à 100, le combattant passe en couleur dans la matrice
    And Il peut l'équiper librement pour l'afficher dans l'Arène
    ```

#### US-12 : Système de Streaks (Séries de Boss abattus)
> Design détaillé : `docs/superpowers/specs/2026-07-20-us12-streaks-design.md`. Série = victoires consécutives avec **budget de 2 non-victoires tolérées par semaine calendaire locale** (la 3e casse) ; `best_streak` persisté ; badge "série en danger" ; jalons → titres.
*   **Standard :** En tant que Héros assidu, je veux voir mon compteur de jours consécutifs de victoires pour rester motivé.
*   **BDD :**
    ```gherkin
    Given Un utilisateur avec un streak de 4 jours
    When Il termine le Boss du 5ème jour consécutif
    Then Son compteur passe à 5 jours avec un effet visuel de flammes d'arcade
    ```

#### US-10 : Le Panthéon (Écran des Statistiques de combat)
> Design détaillé : `docs/superpowers/specs/2026-07-20-us10-pantheon-design.md`. Écran lecture seule (dérivé de `day_results` + `profiles`), accessible depuis le QG : blocs Héros / Trophées / Trésor / Titres / Journal + sparkline dégâts & win-rate ring.
*   **Standard :** En tant que Héros nostalgique, je veux un écran pour contempler mes faits d'armes passés.
*   **BDD :**
    ```gherkin
    Given Un utilisateur naviguant hors de l'Arène
    When Il clique sur "Le Panthéon"
    Then Il accède à un tableau de bord affichant son ratio de Boss vaincus et son historique de niveau
    ```

---

### 🔮 SPRINT 3 : SCALABILITÉ & INTÉGRATIONS

#### US-03 : Intégration profonde Siri / Google Assistant
> Design détaillé : `docs/superpowers/specs/2026-07-22-us03-siri-design.md`. **Re-scopé iOS uniquement** (Android couvert par US-22, Gemini). Pattern iOS Shortcuts + webhook (`POST /api/webhook/add-task`, token personnel hashé en base, affiché une seule fois, section « Intégrations » au QG). Doc utilisateur obligatoire (Manuel du Dojo).
*   **Standard :** En tant que Héros mobile, je veux utiliser l'assistant natif de mon téléphone pour ajouter un monstre à l'Arène sans ouvrir l'app.
*   **BDD :**
    ```gherkin
    Given L'application en arrière-plan avec configuration de raccourcis OS
    When L'utilisateur dit "Dis Siri, ajoute le monstre Rappeler le client dans Boss de la Journée"
    Then La tâche est interceptée en tâche de fond et injectée dans la BDD Supabase du jour
    ```

#### US-22 : Ajout de tâche vocale via Gemini (Serveur MCP connecté)
> Design détaillé : `docs/superpowers/specs/2026-07-22-us22-gemini-mcp-design.md`. Serveur OAuth 2.1 complet côté Dodojo (PKCE + enregistrement dynamique RFC 7591, tables `oauth_clients`/`oauth_authorization_codes`/`oauth_tokens`), route MCP `/api/mcp` (tool `add_task`). **Risque assumé** : specs exactes des Connected Apps Gemini à revalider à l'implémentation (écosystème en évolution rapide).
*   **Standard :** En tant que Héros mobile, je veux dire "OK Google, ajoute la tâche [X] à Dodojo" pour créer un monstre dans l'Arène sans ouvrir l'application, via Gemini connecté à un serveur MCP exposé par l'application.
*   **Note technique :** Depuis le remplacement de Google Assistant par Gemini sur Android (2026), le mécanisme n'est plus App Actions mais une "Connected App" MCP : l'application expose un endpoint MCP (route Next.js sur Vercel) avec un tool `add_task(title)`, que l'utilisateur relie une fois dans Gemini via OAuth (liaison compte Gemini ↔ session Supabase). Le tool réutilise strictement `lib/game-engine.ts` pour l'insertion et le recalcul des HP (RG-01/RG-02) — aucune duplication de la logique de heal du Boss. Complète/précise US-03 côté Google (Siri conserve son mécanisme natif propre).
*   **BDD :**
    ```gherkin
    Given Un utilisateur ayant relié son compte Gemini à Dodojo via le serveur MCP (OAuth actif)
    When Il dit "OK Google, ajoute la tâche Boire de l'eau à Dodojo"
    Then Gemini appelle le tool MCP "add_task" avec le titre "Boire de l'eau"
    And Une tâche est insérée dans `tasks` avec `day_date` = date du jour courant
    And Les HP max et actuels du Boss du jour augmentent de +20 HP (RG-02), visible à la prochaine ouverture de l'Arène
    ```

#### US-05 : Deadlines horaires (Attaques surprises du Boss)
> Design détaillé : `docs/superpowers/specs/2026-07-22-us05-deadlines-design.md`. Deadline = heure du jour courant (`tasks.deadline_at`, déjà en base), icône ⏰ sur `TaskRow` (racine + sous-tâche). Malus -10 HP réutilisant le pool Héros existant (`calculateHeroHp`), auto-résolu en cochant/abandonnant la tâche, effacé au report via le Rituel du Réveil. Détection par polling client (~30-60s), pas de replay au chargement.
*   **Standard :** En tant que Héros défié par le temps, je veux lier une heure limite à une tâche pour simuler une attaque imminente.
*   **BDD :**
    ```gherkin
    Given Une tâche avec une deadline réglée à 14h00
    When L'horloge système passe 14h00 et la tâche n'est pas cochée
    Then Le Boss effectue une "Attaque Surprise", la jauge clignote et un malus de HP temporaire frappe l'avatar
    ```

#### US-11 : Notifications push de rappel (Provocations du Boss)
> Design détaillé : `docs/superpowers/specs/2026-07-22-us11-push-design.md`. Dépend de la PWA (#58). Heure fixe 17h30 locale, opt-in via toggle QG, table `push_subscriptions` (policy DELETE autorisée), idempotence via `profiles.last_reminder_sent_on`, cron Vercel (~15-30 min) ciblant les profils éligibles, pool de punchlines variées (`lib/push-copy.ts`).
*   **Standard :** En tant que Héros distrait, je veux recevoir des notifications sous forme de provocations pour me faire revenir au combat.
*   **BDD :**
    ```gherkin
    Given L'application fermée à 16h00 avec un Boss encore à 60 HP
    When Le serveur de tâches cron s'exécute
    Then Une notification push est envoyée : "Le Boss ricane, il te reste 3 monstres à abattre avant le Rituel du Crépuscule !"
    ```

#### US-13 : Widget Mobile d'Écran d'Accueil
*   **Standard :** En tant que Héros visuel, je veux voir les HP du Boss directement sur le widget de mon smartphone.
*   **BDD :**
    ```gherkin
    Given Le Widget installé sur l'écran d'accueil iOS/Android
    When La base Supabase locale ou distante est mise à jour (tâche validée)
    Then Le widget se rafraîchit en arrière-plan pour afficher la jauge de vie mise à jour en pixel art
    ```

#### US-20 : Partage de victoires (Réseaux / Guildes)
> Design détaillé : `docs/superpowers/specs/2026-07-22-us20-partage-victoire-design.md`. Carte PNG portrait 9:16 (branding + lien retour), générée serveur (`@vercel/og`), partageable depuis `PerfectOverlay` et le récap Crépuscule, sur les 3 issues (victory/retreat/defeat).
*   **Standard :** En tant que Héros fier, je veux générer une image rétro de ma victoire pour crâner auprès de mes pairs.
*   **BDD :**
    ```gherkin
    Given Un écran de fin de journée (Boss K.O.)
    When L'utilisateur clique sur "Partager mon score"
    Then L'application génère une carte au format PNG style écran de score d'arcade prêt à être partagé
    ```

#### US-53 : Tenues des héros (Skins)
> Design détaillé : `docs/superpowers/specs/2026-07-23-us53-tenues-skins-design.md`. Jusqu'à 4 recolors par héros selon la séparabilité réelle de sa palette (analyse d'histogramme HSL) : Tier A (3-4 tenues, recolor masqué), Tier B (2 tenues, recolor global), Tier C (3 tenues, overlay tint). Générées offline (`scripts/generate-hero-skins.mjs`), déblocage à l'or (table `unlocked_skins`, même patron que `unlocked_heroes` de l'US-18), bande de puces sous le stage de l'Échoppe.
*   **Standard :** En tant que Héros stylé, je veux personnaliser la couleur de mon combattant pour me distinguer, sans que ça change ses stats.
*   **BDD :**
    ```gherkin
    Given Un héros possédé et un solde d'or suffisant
    When L'utilisateur débloque puis équipe une tenue depuis l'Échoppe
    Then Le combattant affiché dans l'Arène porte la nouvelle palette de couleurs, sans impact sur les HP/XP/or
    ```

#### Issue #72 : Système de Succès & Titres
> Design détaillé : `docs/superpowers/specs/2026-07-31-issue72-succes-titres-design.md`. Catalogue statique de 26 succès (héros, collection, streak, exploration boss/décors, paliers de niveau, méta Platine), 4 raretés. Succès "mystère" masqués jusqu'au déblocage, succès à compteur affichés en barre de progression live. Titre équipé manuellement (`/tableau-de-chasse/succes`), auto-affiché tant que non personnalisé. Remplace l'ancien `titleForStreak` (US-12).
*   **Standard :** En tant que joueur, je veux débloquer des succès et choisir le titre affiché sous mon nom, pour incarner ma progression.
*   **BDD :**
    ```gherkin
    Given J'ai rempli la condition d'un succès verrouillé
    When L'action correspondante est validée côté serveur
    Then Le succès est débloqué, une notification apparaît, et je peux l'équiper comme titre depuis le catalogue
    ```

---

### 🛠️ HORS SPRINT — RECALIBRAGE ÉCONOMIQUE (ISSUE #122)

> Hors lotissement sprint (fix économique isolé), voir `CHANGELOG.md [Unreleased]` pour la ligne produit. Spec commentée sur l'issue GitHub : <https://github.com/ouro84/dodojo/issues/122>.

#### Issue #122 : Tarif plat du Marché Noir
*   **Standard :** En tant que Héros, je veux que tous les combattants coûtent 500 or et toutes les tenues alternatives 300 or (au lieu d'un barème gradué 150-350 pour les héros et `30% du prix du héros` pour les tenues) pour que chaque acquisition représente un effort significatif et préserve la valeur de l'or comme récompense.
*   **BDD :**
    ```gherkin
    Given Un profil avec 490 pièces d'or et aucun héros additionnel débloqué
    When L'utilisateur tente de débloquer un héros à 500 or dans Le Marché Noir
    Then L'achat est refusé et le solde reste à 490
    And Un texte explicite rappelle qu'il manque 10 or
    ```

    ```gherkin
    Given Un profil avec 1500 pièces d'or et le starter de l'onboarding équipé
    When L'utilisateur débloque successivement un héros (500) puis une tenue alternative (300) de ce nouveau héros
    Then Son solde descend à 700
    And Le héros passe en couleur dans la matrice, la tenue est possédée
    ```

---

## 4. Modèle de Données (Relationnel - Supabase / PostgreSQL)

### Table : `profiles`
*   `id` : `uuid` (PK, lié à `auth.users`)
*   `username` : `text`
*   `level` : `integer` (Default: 1)
*   `xp` : `integer` (Default: 0)
*   `gold` : `integer` (Default: 0)
*   `current_title` : `text` (Default: 'Novice')
*   `streak_days` : `integer` (Default: 0)
*   `created_at` : `timestamp`

### Table : `tasks`
*   `id` : `uuid` (PK)
*   `user_id` : `uuid` (FK vers `profiles.id`)
*   `parent_id` : `uuid` (Nullable, FK vers `tasks.id` pour la structure de sous-tâches du Sprint 1)
*   `title` : `text`
*   `is_completed` : `boolean` (Default: false)
*   `is_abandoned` : `boolean` (Default: false)
*   `is_recurring` : `boolean` (Default: false)
*   `deadline_at` : `timestamp` (Nullable)
*   `day_date` : `date` (Clé de filtrage par journée de combat)
*   `position` : `integer` (Pour l'ordre du Drag & Drop)
*   `created_at` : `timestamp`

---

## 5. Règles Métier (Règles d'Or)

*   **RG-01 (Barème des HP) :** Une tâche principale vaut strictement **20 HP**. Une sous-tâche (Sprint 1) vaut strictement **10 HP**. Les HP Max du Boss de la journée sont la somme exacte des points de toutes les tâches non abandonnées du jour.
*   **RG-02 (Heal du Boss) :** L'ajout d'une tâche à n'importe quel moment de la journée augmente instantanément les HP actuels et max du Boss de sa valeur nominale. Le Boss "se soigne" si l'utilisateur charge sa journée.
*   **RG-03 (Étanchéité des Journées) :** Le Boss du jour est calculé uniquement sur les tâches où `day_date == CURRENT_DATE`. Un combat non terminé à minuit reste en suspens jusqu'au prochain lancement (déclencheur du Rituel du Réveil).
*   **RG-04 (Pas de suppression destructive) :** Une tâche n'est jamais définitivement supprimée de la BDD pendant la journée en cours. Elle est soit validée (`is_completed = true`), soit passée en mode abandon/Rage Quit (`is_abandoned = true`), ce qui permet de conserver la cohérence de la jauge de vie.