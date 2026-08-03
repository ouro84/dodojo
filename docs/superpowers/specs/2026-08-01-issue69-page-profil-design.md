# Spec — Page Profil (issue #69)

> Statut : validé en brainstorming, prêt pour plan d'implémentation.
> Découpage pensé pour délégation à un junior ou un LLM faible : chaque section ci-dessous est une unité indépendante (1 composant + 1 server action, ou pur déplacement de fichier).

## Contexte

Aujourd'hui, aucune page ne centralise les réglages de compte. Le Vestiaire (`app/vestiaire/page.tsx`) mélange hub de navigation (Tableau de Chasse/Routines/Marché Noir/Guide) et réglages inline (`AggressivityLevelSection`, `PlanTomorrowSection`, `IntegrationsSection`). Pseudo et timezone, fixés une seule fois à l'onboarding (`app/onboarding/actions.ts`), ne sont éditables nulle part. Aucun mot de passe/email éditable. Aucun bouton de déconnexion n'existe dans toute l'app (vérifié : zéro occurrence de `signOut` dans le code).

Cette spec crée `/vestiaire/profil`, qui devient LE hub des réglages de compte. Le Vestiaire redevient un pur hub de navigation.

**Hors scope** (issue séparée, cf. #154) : suppression de compte, export de données (RGPD).

## Architecture

Nouvelle route `app/vestiaire/profil/page.tsx` (Server Component), même patron que `app/vestiaire/entrainement/page.tsx` :
- Garde : `!user` → `redirect("/login")` ; `!profile` → `redirect("/onboarding")` ; erreur de requête → composant d'erreur. Pas d'état vide (le profil existe toujours pour un utilisateur post-onboarding).
- `BottomNav active="vestiaire"` (même onglet que le reste du Vestiaire).
- `BackLink` vers `/vestiaire` en haut de page (pattern déjà en place pour `Le Guide article → sommaire`).

### Requête profil (une seule, colonnes exactes)

```
.select("username, timezone, aggressivity_level, plan_tomorrow_after_hour, equipped_title_code, webhook_token_hash, webhook_token_last_used_at")
```

### `app/vestiaire/page.tsx` — modifications

- Retirer les imports/usages de `AggressivityLevelSection`, `PlanTomorrowSection`, `IntegrationsSection` (+ `PushReminderToggle`/`WebhookTokenSection`/`GeminiConnectionSection`/`isGeminiConnected`).
- Retirer de la requête `profiles` : `webhook_token_hash, webhook_token_last_used_at, aggressivity_level, plan_tomorrow_after_hour`. Ne garde que `best_streak, timezone`.
- Retirer la requête `subscriptionCount` (`push_subscriptions`) et l'appel `isGeminiConnected` (plus utilisés ici).
- Ajouter une entrée dans `SECTIONS` : `{ href: "/vestiaire/profil", icon: "👤", label: "Profil" }`, en première position (avant Tableau de Chasse).

## Sections de la page Profil

Chaque section = un fichier dans `components/qg/`, `"use client"`, pattern **optimistic + rollback** identique à `AggressivityLevelSection.tsx`/`PlanTomorrowSection.tsx` : `useState` local initialisé depuis les props serveur, `useTransition`, sur erreur on restaure la valeur précédente et affiche `<p role="alert" className="text-xs text-alert">`. Styling section : `className="flex w-full max-w-sm flex-col gap-3 rounded-lg border border-border bg-surface p-4"`, titre `className="font-display text-xs uppercase tracking-wide text-muted"`.

### 1. Bloc Identité

Un seul `<section>` regroupant 3 sous-blocs (pas 3 sections séparées, pour rester visuellement groupé) :

**a) Pseudo — `components/qg/UsernameSection.tsx`**
- Props : `{ initialUsername: string }`.
- Input texte contrôlé, `maxLength={24}`, bouton "Enregistrer" (pas de save-on-blur, pour laisser le temps de corriger une faute de frappe).
- Validation client avant appel serveur : `trim()` non vide, sinon erreur locale immédiate (pas d'appel serveur) `"Un pseudo, ça se choisit. Tape quelque chose."` (même ton que le message onboarding).
- Server action `updateUsername(username: string): Promise<{ error: string | null }>` dans `app/actions/profile.ts` :
  - Re-vérifie `trim()` non vide et longueur ≤ 24 côté serveur (même raison que `updateAggressivityLevel` : le typage ne protège pas un appel direct hors composant).
  - `update({ username: trimmed }).eq("id", user.id)`.
  - Erreur générique si échec : `"Dodojo n'a pas pu enregistrer ton pseudo. Réessaie."`.
- Pas de contrainte d'unicité (aucune en base sur `username`, ne pas en inventer une).

**b) Titre équipé — `components/qg/EquippedTitlePreview.tsx`**
- Props : `{ titleCode: string | null }`.
- Composant **pur, lecture seule, pas de state, pas de server action**.
- Résout le libellé via `ALL_ACHIEVEMENT_DEFS` (`lib/achievements.ts`) : `ALL_ACHIEVEMENT_DEFS.find(d => d.code === titleCode)?.title`. Si `titleCode` est `null` ou introuvable dans le catalogue → affiche `"Aucun titre équipé"`.
- Affiche : `Titre : <libellé>` + `<Link href="/tableau-de-chasse/succes">Changer</Link>`. Le vrai picker (radiogroup, issue #153) reste exclusivement sur `/tableau-de-chasse/succes` — ne pas dupliquer le fetch achievements ici.

**c) Timezone — `components/qg/TimezoneSection.tsx`**
- Props : `{ initialTimezone: string }`.
- `<select>` rempli par `Intl.supportedValuesOf("timeZone")` (calculé côté client, dans le composant — pas de liste statique à maintenir).
- Bouton "Redétecter" à côté du select : appelle `useBrowserTimezone()` (hook existant, `hooks/useBrowserTimezone.ts`) et applique sa valeur au select (déclenche la même sauvegarde que si l'utilisateur l'avait choisie dans la liste).
- Texte d'avertissement sous le select, `text-xs text-faint` : `"Change le calcul du jour en cours si tu voyages ou changes de fuseau."` — pas de confirmation bloquante, juste informatif.
- Server action `updateTimezone(timezone: string): Promise<{ error: string | null }>` dans `app/actions/profile.ts` :
  - Valide que `timezone` est une IANA zone connue : `Intl.supportedValuesOf("timeZone").includes(timezone)` — **attention**, `Intl.supportedValuesOf` est une API client (`Intl` existe aussi côté Node/serveur depuis Node 18+, donc utilisable telle quelle dans la server action, pas besoin de la passer en paramètre).
  - Si invalide : `{ error: "Fuseau horaire invalide." }`.
  - `update({ timezone }).eq("id", user.id)`.
  - Erreur générique : `"Dodojo n'a pas pu enregistrer ton fuseau. Réessaie."`.

### 2. Bloc Sécurité

Deux sections **client-side pures, aucune server action** (même contrainte que `/login`/`/welcome` : une server action ne propage pas le cookie de session Supabase). Toutes deux suivent ce flow à 2 étapes :
1. `supabase.auth.signInWithPassword({ email: <email actuel de session>, password: <mdp actuel saisi> })` pour reconfirmer.
2. Si succès → `supabase.auth.updateUser({ password: ... })` ou `{ email: ... }`.
3. Si `signInWithPassword` échoue → erreur `"Mot de passe actuel incorrect."`, ne pas appeler `updateUser`.

**a) Mot de passe — `components/qg/PasswordSection.tsx`**
- Champs : "Mot de passe actuel" (`type="password"`, `autoComplete="current-password"`), "Nouveau mot de passe" (`type="password"`, `autoComplete="new-password"`, `minLength={8}`, même règle que `/welcome`).
- Récupérer l'email de session via `supabase.auth.getUser()` côté client (composant client peut créer son propre `createClient()` de `@/lib/supabase/client`, pattern déjà utilisé par `LoginPage`/`WelcomeSignup`).
- Après succès : vider les deux champs, message de confirmation temporaire (`"Mot de passe mis à jour."`, `text-xs text-hp`, disparaît après re-saisie ou navigation — pas de toast global à inventer, un simple `useState` local suffit).
- Erreur `updateUser` : `"Dodojo n'a pas pu changer ton mot de passe. Réessaie."`.

**b) Email — `components/qg/EmailSection.tsx`**
- Champs : "Mot de passe actuel", "Nouvel email" (`type="email"`).
- Même flow de reconfirmation.
- Après succès `updateUser({ email })` : **ne pas afficher "Email changé"** (ce serait faux — `double_confirm_changes = true` dans `supabase/config.toml`, Supabase exige la confirmation depuis l'ancienne ET la nouvelle adresse avant que le changement soit effectif). Message correct : `"Vérifie ta boîte mail actuelle et ta nouvelle adresse : clique sur les deux liens de confirmation pour valider le changement."`.
- ⚠️ **À vérifier manuellement en prod avant de merger** : le `config.toml` local ne garantit pas la config du projet Supabase hébergé (même piège que "Confirm email" documenté dans CLAUDE.md pour l'onboarding). Si `double_confirm_changes` est OFF en prod, adapter le message à un changement immédiat.

### 3. Bloc Préférences de jeu

**Déplacement pur, aucune modification de code** :
- `AggressivityLevelSection` : déplacer l'import de `app/vestiaire/page.tsx` vers `app/vestiaire/profil/page.tsx`. Prop `initialLevel={resolveAggressivityLevel(profile.aggressivity_level)}` inchangée.
- `PlanTomorrowSection` : même déplacement. Prop `initialHour={profile.plan_tomorrow_after_hour ?? 18}` inchangée.

### 4. Bloc Intégrations

**Déplacement pur** de `IntegrationsSection` (+ ses 3 enfants `PushReminderToggle`/`WebhookTokenSection`/`GeminiConnectionSection`) et de l'appel `isGeminiConnected(supabase, user.id)` vers `app/vestiaire/profil/page.tsx`. Props inchangées :
```tsx
<IntegrationsSection>
  <PushReminderToggle hasSubscription={...} />
  <WebhookTokenSection hasToken={...} lastUsedAt={...} />
  <GeminiConnectionSection isConnected={...} />
</IntegrationsSection>
```
Nécessite d'ajouter `webhook_token_hash, webhook_token_last_used_at` à la requête `profiles` de Profil (déjà listé ci-dessus) et une requête `push_subscriptions` (count) + `isGeminiConnected` dans le `Promise.all` de la page Profil (copier tel quel depuis l'actuel `app/vestiaire/page.tsx`).

### 5. Bloc Compte

**`components/qg/LogoutSection.tsx`** — nouveau, simple :
- Un bouton "Se déconnecter".
- `onClick` : `await supabase.auth.signOut()` (client `@/lib/supabase/client`) puis `router.replace("/login")` + `router.refresh()` (même pattern que `LoginPage`/`WelcomeSignup` après une action d'auth).
- Pas de confirmation modale (action réversible, aucune perte de données).

## États UI (règle projet n°3)

- **Loading** : `app/vestiaire/profil/loading.tsx` (squelette simple, cohérent avec `app/vestiaire/entrainement` si un `loading.tsx` y existe déjà — sinon reprendre le patron `app/tableau-de-chasse/loading.tsx`).
- **Error** : composant d'erreur simple si la requête profil échoue (pattern `ArenaError`/erreur générique déjà utilisé ailleurs).
- **Empty** : non applicable (profil garanti existant, redirect `/onboarding` sinon).

## Découpage pour délégation (tickets indépendants)

1. Server actions `updateUsername`/`updateTimezone` dans `app/actions/profile.ts` (+ tests unitaires de validation).
2. `UsernameSection` + `TimezoneSection` (composants, consomment les actions du ticket 1).
3. `EquippedTitlePreview` (composant pur, aucune dépendance serveur nouvelle).
4. `PasswordSection` + `EmailSection` (client-side purs, aucune dépendance sur les autres tickets).
5. `LogoutSection`.
6. Assemblage `app/vestiaire/profil/page.tsx` + `loading.tsx` + garde d'erreur (dépend des tickets 1-5 pour l'intégration finale, mais peut être scaffoldé en parallèle avec des imports stub).
7. Nettoyage `app/vestiaire/page.tsx` (retrait des sections déplacées, ajout du lien Profil dans `SECTIONS`) — à faire en dernier, une fois 6 mergé, pour ne jamais avoir de fenêtre où un réglage disparaît des deux pages à la fois.

Chaque ticket 1-5 est indépendant des autres et peut être implémenté par un junior/LLM faible sans lire au-delà de cette section + le fichier de référence cité (`AggressivityLevelSection.tsx` ou `PlanTomorrowSection.tsx` comme patron exact à suivre pour le style/state).

## Documentation

- `CLAUDE.md` : ajouter une entrée "Piège" si un comportement non-évident est découvert en implémentant (ex. si `double_confirm_changes` s'avère différent en prod).
- Le Guide (Notion) : nouvelle page utilisateur si le concept de "Profil" mérite d'être documenté (probablement pertinent — les utilisateurs cherchant à changer leur mot de passe/email doivent pouvoir trouver la page via Le Guide).
- `CHANGELOG.md` : ligne sous `[Unreleased]` dans le commit de livraison.
