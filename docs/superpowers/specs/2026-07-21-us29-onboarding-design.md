# Spec — US-29 : Onboarding (tunnel d'entrée + 1er combat guidé)

> Date : 2026-07-21 · Statut : validé (brainstorming) · Hors sprint (dette d'adoption, cf. AUDIT-2026-07-21)
> Objectif : rendre le produit **lisible et engageant dès le premier lancement** (aujourd'hui : seulement pseudo + timezone, aucune découverte des mécaniques).

## 1. Contexte & problème

Il n'existe **pas de création de compte** (login seul, compte e2e fixe) ni de tunnel. Le nouvel arrivant pose un pseudo puis tombe dans une Arène dont il ignore les règles (HP, rituels, streaks, combos, échoppe). L'audit identifie l'onboarding comme le prochain levier de valeur.

## 2. Décisions de cadrage (tranchées)

| # | Décision |
|---|----------|
| D1 | **Tunnel standard** : accueil (Sensei) → compte (email+mdp) → pseudo → avatar → 1er combat guidé → Arène. |
| D2 | **Compte à accès direct** : `supabase.auth.signUp` connecte immédiatement, aucune confirmation email. ⚠️ Config Supabase : « Confirm email » **OFF** (étape de setup, hors code). |
| D3 | **Avatar = Character Select gratuit** : on choisit 1 des 7 combattants gratuitement. Stage (idle du sélectionné) en haut, matrice des 7 en bas, bouton « Choisir ce combattant ». |
| D4 | **Le starter choisi est le SEUL héros gratuit** : possession = lignes `unlocked_heroes` uniquement. On **retire la possession implicite de `fire_knight`**. Les 6 autres s'achètent à l'Échoppe. |
| D5 | **1er combat coaché dans la vraie Arène** (pas de sandbox) : coach-marks en 2 temps sur des données réelles. |
| D6 | **Étape 1 du coach = ajouter une tâche**, avec une **suggestion pré-remplie « Prendre en main Dodojo »** (un tap l'ajoute) pour éviter la page blanche. Formulation **sans** « invoquer un monstre ». Étape 2 = cocher la tâche (dégâts + XP). |
| D7 | Fin du coach → flag `profiles.has_seen_tutorial=true` (server action) ; le coach ne réapparaît plus. |

### Améliorations retenues (validées)
| # | Amélioration |
|---|--------------|
| A1 | **Entrée non-connecté → `/welcome`** : un visiteur non authentifié sur `/` est redirigé vers `/welcome` (signup) et non `/login`. Le login reste accessible par lien. Les autres routes protégées (`/qg`, `/echoppe`, `/pantheon`, `/onboarding`) continuent de rediriger vers `/login`. |
| A2 | **Bouton « Passer » sur le coach** : pose `has_seen_tutorial=true` et masque le coach. Échappatoire. |
| A3 | **Flourish 1re victoire** : si le KO survient alors que le coach est encore actif (`!has_seen_tutorial`), l'overlay PERFECT/K.O. affiche une punchline dédiée « Premier sang, {pseudo} ! ». |

### Hors scope (pistes notées)
- **Le Boss n'apparaît qu'à la première tâche** (métaphore renforcée) : pertinent mais hors cadre de cette US.
- Opt-ins (notifications, objectif quotidien) : dépendent de briques Sprint 3.
- Récupération de mot de passe / OAuth social.

## 3. Parcours & routing

| Écran | Auth | Rôle |
|-------|------|------|
| `/welcome` | non connecté | Accroche Sensei (tone-of-voice) + `Créer un compte` / `Se connecter`. Signup email+mdp → session directe → `/onboarding`. |
| `/login` (existant) | non connecté | Connexion. Lien vers `/welcome` pour créer un compte. |
| `/onboarding` (étendu) | connecté, **sans** profil | Flux multi-étapes client : (1) pseudo, (2) avatar. Soumission finale = `createProfile`. |
| `/` (Arène) | connecté, profil | Si `has_seen_tutorial=false` → overlay `ArenaCoach`. |

Gardes : `app/page.tsx` → **`/welcome`** si pas d'auth (A1), `/onboarding` si pas de profil. `/onboarding` → `/login` si pas d'auth, `/` si profil déjà présent.

**Mécanisme d'auth** : le login existant est **client-side** (`lib/supabase/client`, `signInWithPassword`, `router.replace`). Le signup suit le **même patron client-side** (`supabase.auth.signUp` puis `router.replace('/onboarding')`) — pas de server action, pour garantir la propagation du cookie de session (cohérent avec le login qui fonctionne).

## 4. Économie héros (changement)

- `isHeroOwned(id, ownedIds)` : **ne renvoie plus `true` d'office pour `fire_knight`**. Possession = `ownedIds` (lignes `unlocked_heroes`) uniquement.
- `createProfile` (étendu) insère, en plus du profil : `unlocked_heroes(user_id, hero_id=starter, price_paid=0)` et `profiles.equipped_hero_id=starter`.
- **Compat e2e** : `resetShopState` (fixture) insère une ligne `unlocked_heroes(fire_knight, 0)` (le compte e2e « possède » fire_knight) pour que l'Échoppe et l'Arène restent cohérents. Idempotent (upsert on conflict user_id,hero_id).
- **Migration de données** : les profils existants (le cas échéant) sans ligne `unlocked_heroes` pour leur `equipped_hero_id` → seed d'une ligne à 0 (script ponctuel / partie de la migration applicative). En pratique le seul compte réel est le compte e2e, couvert par la fixture.

## 5. Modèle de données

### Modif `profiles`
- `has_seen_tutorial boolean not null default false` — coach vu (US-29). Migration Supabase dédiée. Pas de nouvelle policy.

Rien d'autre : `equipped_hero_id`, `username`, `timezone` existent ; `unlocked_heroes` existe (US-18).

## 6. Découpage technique

### `app/welcome/page.tsx` (serveur) + `WelcomeSignup.tsx` (client)
- `page.tsx` : si déjà connecté → `redirect('/')`, sinon rend `<WelcomeSignup>`.
- `WelcomeSignup` (client, patron du login) : accroche Sensei + formulaire (email, mot de passe ≥8) → `createClient()` (browser) `supabase.auth.signUp` → si ok `router.replace('/onboarding'); router.refresh()`. Erreurs (email pris, mdp faible) rendues. Lien « Déjà un compte ? Se connecter » → `/login`.

### `app/onboarding/` (étendu)
- `OnboardingFlow.tsx` (client) : machine à 2 étapes (pseudo → avatar). Capture timezone (`Intl`, comme aujourd'hui).
- `OnboardingAvatarPicker.tsx` (client) : réutilise `HeroIdle` + le motif matrice de `CharacterSelect` **sans** or/achat ; renvoie le `heroId` choisi. `CharacterSelect` (Échoppe) reste inchangé.
- `actions.ts` : `createProfile(username, timezone, starterId)` étendu (profil + `unlocked_heroes` + `equipped_hero_id`).

### `components/combat/ArenaCoach.tsx` (client)
- Piloté par `has_seen_tutorial` (prop depuis `app/page.tsx`) + l'état des tâches de l'Arène.
- Étape 1 : invite « Ajoute ta première tâche » + chip suggestion « Prendre en main Dodojo » (tap → `handleAdd`). Passe à l'étape 2 dès qu'une tâche active existe.
- Étape 2 : invite « Frappe-la ». Dès complétion → `markTutorialSeen()` + disparaît.
- **Bouton « Passer » (A2)** : à toute étape, pose `has_seen_tutorial=true` (via `markTutorialSeen`) et masque le coach.
- Overlay **non bloquant** (l'utilisateur agit pendant le coach). Respecte `prefers-reduced-motion`.

### Flourish 1re victoire (A3)
- `Arena` : si `koOutcome` déclenche alors que le coach est actif (`!has_seen_tutorial` au moment du KO), passer un flag `firstVictory` à `PerfectOverlay`, qui affiche « Premier sang, {pseudo} ! » à la place du sous-texte standard.

### Server actions
- `app/actions/profile.ts` : `markTutorialSeen()`.
- (Le signup n'est PAS une server action — client-side, cf. ci-dessus.)

### Tone of voice
- Accroche Sensei + libellés coach tirés/alignés sur `docs/superpowers/specs/2026-07-08-tone-of-voice-design.md` (tutoiement, dojo + rue, pas de « Héros » générique).

## 7. États UI (règle projet n°3)
- Welcome / onboarding : pending (submit) + error (signup, création profil). 
- Avatar picker : pas d'état vide (catalogue statique). 
- Coach : purement client ; l'écriture `markTutorialSeen` échoue silencieusement sans bloquer le jeu (au pire le coach réapparaît une fois).

## 8. Tests

### Vitest (pur)
- `isHeroOwned` : `fire_knight` **n'est plus** possédé sans ligne ; possession strictement par `ownedIds`.
- (avatar picker / coach = logique UI, couverts en e2e).

### Playwright e2e (série, prod)
- `onboarding.spec.ts` : signup (email unique de test) → pseudo → choix avatar → arrivée Arène → coach étape 1 (suggestion ajoute la tâche) → étape 2 (cocher) → coach disparaît + `has_seen_tutorial` persiste. ⚠️ compte de test dédié à créer/nettoyer (ne pas polluer le compte e2e fixe existant) **ou** réinitialiser `has_seen_tutorial`/tasks via fixture admin.
- Régression : le compte e2e fixe possède toujours `fire_knight` (fixture) → Échoppe/Arène OK.

## 9. Vérification
1. Vitest vert (possession).
2. `build` + `lint` propres.
3. e2e série vert en local.
4. Manuel : nouveau compte → tunnel complet → coach → Arène jouable ; l'avatar choisi est équipé et gratuit, les autres verrouillés à l'Échoppe ; recharger ne rejoue pas le coach.
5. Config Supabase « Confirm email » OFF vérifiée.
