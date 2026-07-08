# SPECS_FONCTIONNELLES.md — "Boss de la Journée" (Projet Arcade To-Do)

> Dernière mise à jour : 2026-07-08
> Statut : Document de Référence Produit Spécifié (21/21 US) — Validé

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

*   **SPRINT 0 : Le MVP Minimaliste (Objectif : Lancer vite)** : Focus exclusif sur l'Arène (To-Do classique textuelle), le QG (Profil e2e) et la boucle de combat brute (HP dynamiques, Flash combat, Rituels Obi-Wan).
*   **⚔️ SPRINT 1 : L'UX Héroïque & Ergonomie** : Intégration de la voix (micro in-app), des sous-tâches à 2 niveaux et du Drag & Drop pour imbrication.
*   **🏆 SPRINT 2 : Rétention & Dopamine (La Gamification)** : Ouverture de l'Échoppe (Shop), du Panthéon (Stats), gestion des Streaks, des tâches récurrentes et du Rage Quit de tâche.
*   **🔮 SPRINT 3 & + : La Vision Long Terme (Scalabilité)** : Intégrations natives lourdes (Siri/Google Assistant profond, notifications push, deadlines horaires, Widget mobile).

---

## 3. Registre Intégral des User Stories (21/21)

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

#### US-07 : Rituel Obi-Wan Manuel (Fin de journée)
*   **Standard :** En tant que Héros, je veux clore ma journée manuellement pour fêter ma victoire ou acter ma retraite.
*   **BDD :**
    ```gherkin
    Given Un utilisateur ayant fini ses tâches ou abandonnant le combat
    When Il clique sur le bouton "Rituel Obi-Wan : Quitter l'Arène"
    Then Un écran de transition affiche le récapitulatif des dégâts infligés et gèle l'état de la journée
    ```

#### US-08 : Rituel du Réveil Automatique (Traitement des restes)
*   **Standard :** En tant que Héros, je veux être confronté au démarrage aux tâches non résolues de la veille.
*   **BDD :**
    ```gherkin
    Given Un utilisateur ouvrant l'app un nouveau jour avec 2 tâches non finies de la veille
    When L'application s'initialise
    Then Un overlay bloquant "Rituel du Matin" apparaît
    And Force l'utilisateur à choisir entre "Annihiler" (Suppression) ou "Reporter" (Ajout au jour J)
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
*   **Standard :** En tant que Héros réaliste, je veux abandonner une tâche en cours de route quitte à subir un malus.
*   **BDD :**
    ```gherkin
    Given Une tâche active en cours de journée
    When L'utilisateur clique sur "Abandonner (Rage Quit)"
    Then La tâche est marquée comme échouée, le Boss ricane visuellement et le joueur perd 5 XP
    ```

#### US-16 : Animation du "Perfect" (Boss terrassé à 0 HP)
*   **Standard :** En tant que Héros d'élite, je veux une célébration majeure si je vide la jauge du Boss à 0 HP.
*   **BDD :**
    ```gherkin
    Given Un Boss à 20/100 HP
    When L'utilisateur valide la dernière tâche active
    Then Une animation d'explosion style K.O. de Street Fighter s'affiche avec la mention "PERFECT !"
    ```

#### US-17 : Mode Entraînement (Tâches récurrentes)
*   **Standard :** En tant que Héros routinier, je veux que mes quêtes quotidiennes se réinitialisent automatiquement chaque matin.
*   **BDD :**
    ```gherkin
    Given Une tâche récurrente configurée comme "Quête Quotidienne"
    When Le Rituel du Réveil se déclenche un nouveau jour
    Then La tâche est automatiquement recréée pour la nouvelle journée sans action manuelle
    ```

#### US-18 : L'Échoppe & Monnaie Virtuelle (Pièces d'Or)
*   **Standard :** En tant que Héros économe, je veux gagner de l'or pour acheter des skins de Boss dans une boutique.
*   **BDD :**
    ```gherkin
    Given Un profil avec 500 pièces d'or
    When L'utilisateur achète le skin "Mecha-Boss" à 400 pièces dans l'Échoppe
    Then Le solde passe à 100 et le skin est débloqué pour l'Arène
    ```

#### US-12 : Système de Streaks (Séries de Boss abattus)
*   **Standard :** En tant que Héros assidu, je veux voir mon compteur de jours consécutifs de victoires pour rester motivé.
*   **BDD :**
    ```gherkin
    Given Un utilisateur avec un streak de 4 jours
    When Il termine le Boss du 5ème jour consécutif
    Then Son compteur passe à 5 jours avec un effet visuel de flammes d'arcade
    ```

#### US-10 : Le Panthéon (Écran des Statistiques de combat)
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
*   **Standard :** En tant que Héros mobile, je veux utiliser l'assistant natif de mon téléphone pour ajouter un monstre à l'Arène sans ouvrir l'app.
*   **BDD :**
    ```gherkin
    Given L'application en arrière-plan avec configuration de raccourcis OS
    When L'utilisateur dit "Dis Siri, ajoute le monstre Rappeler le client dans Boss de la Journée"
    Then La tâche est interceptée en tâche de fond et injectée dans la BDD Supabase du jour
    ```

#### US-05 : Deadlines horaires (Attaques surprises du Boss)
*   **Standard :** En tant que Héros défié par le temps, je veux lier une heure limite à une tâche pour simuler une attaque imminente.
*   **BDD :**
    ```gherkin
    Given Une tâche avec une deadline réglée à 14h00
    When L'horloge système passe 14h00 et la tâche n'est pas cochée
    Then Le Boss effectue une "Attaque Surprise", la jauge clignote et un malus de HP temporaire frappe l'avatar
    ```

#### US-11 : Notifications push de rappel (Provocations du Boss)
*   **Standard :** En tant que Héros distrait, je veux recevoir des notifications sous forme de provocations pour me faire revenir au combat.
*   **BDD :**
    ```gherkin
    Given L'application fermée à 16h00 avec un Boss encore à 60 HP
    When Le serveur de tâches cron s'exécute
    Then Une notification push est envoyée : "Le Boss ricane, il te reste 3 monstres à abattre avant le Rituel Obi-Wan !"
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
*   **Standard :** En tant que Héros fier, je veux générer une image rétro de ma victoire pour crâner auprès de mes pairs.
*   **BDD :**
    ```gherkin
    Given Un écran de fin de journée (Boss K.O.)
    When L'utilisateur clique sur "Partager mon score"
    Then L'application génère une carte au format PNG style écran de score d'arcade prêt à être partagé
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