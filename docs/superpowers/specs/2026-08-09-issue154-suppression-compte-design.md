# Spec — Suppression de compte & export de données (RGPD, issue #154)

> Statut : validé en brainstorming, prêt pour plan d'implémentation.
> Remplace la dette assumée par `2026-08-08-issue134-pages-legales-design.md` (« pas de flow de suppression en self-service, traitement manuel par email ») — cette spec livre le self-service. La page `/confidentialite` doit être mise à jour dans la même PR (cf. section "Impacts pages légales").

## Contexte

Issue #154, sortie du scope de #69 (page Profil). Deux droits RGPD distincts à couvrir dans la même section UI :
- **Art. 17 — droit à l'effacement** : suppression réelle et définitive du compte.
- **Art. 20 — droit à la portabilité** : export des données personnelles dans un format structuré.

**Décision de fond** : vraie suppression (`auth.admin.deleteUser`), pas d'anonymisation. RG-04 (« pas de suppression destructive », `is_abandoned`/`is_completed`, aucune policy `DELETE` sur `tasks`/`day_results`/etc.) protège l'historique de combat **contre l'usage courant de l'app** (rage quit, décochage accidentel) — il ne s'applique pas à une demande d'effacement définitive du compte lui-même, qui est un droit distinct de l'utilisateur sur ses propres données personnelles.

## Fondation technique — cascade FK déjà en place

Vérifié dans les migrations : toutes les tables portant des données utilisateur référencent `profiles.id` (qui référence `auth.users.id`) avec `on delete cascade` — `tasks`, `day_results`, `unlocked_heroes`, `unlocked_skins`, `unlocked_achievements`, `daily_boss`, `recurring_templates`, `recurring_instances`, `push_subscriptions`, `share_events`, `oauth_tokens`, `oauth_authorization_codes`. `webhook_token_hash` est une colonne de `profiles`, pas une table séparée — supprimée avec la ligne.

**Conséquence** : `supabase.auth.admin.deleteUser(userId)` seul purge tout, en une opération. Aucune purge manuelle table par table à écrire. La cascade s'exécute correctement malgré l'absence de policy RLS `DELETE` sur ces tables : l'appel `admin.deleteUser` s'exécute côté service-role (bypass RLS), et Postgres applique les `on delete cascade` indépendamment des policies RLS de l'utilisateur final.

`oauth_clients` n'est **pas** cascadé (référencé par `client_id`, pas par utilisateur) — c'est une entité partagée (client MCP enregistré), pas une donnée personnelle de ce compte. Ne pas y toucher.

## Emplacement UI

Nouvelle section « Données & vie privée » dans `app/vestiaire/profil/page.tsx`, après `LogoutSection`. Deux composants indépendants côte à côte, aucun n'est un prérequis de l'autre (art. 17 et art. 20 sont des droits séparés) :
- `components/qg/ExportDataSection.tsx`
- `components/qg/DeleteAccountSection.tsx`

## Export de données (art. 20)

**Server action** `exportUserData()` (nouveau fichier `app/actions/account.ts`) : client Supabase standard (pas service-role — les policies RLS `SELECT` existantes sur les tables propres à l'utilisateur suffisent, mêmes lectures que le reste de l'app). Agrège en un objet unique :
- `profile` (colonnes `profiles`, hors `webhook_token_hash`)
- `tasks`, `day_results`
- `unlocked_heroes`, `unlocked_skins`, `unlocked_achievements`
- `daily_boss` (historique des boss tirés)
- `recurring_templates`
- `push_subscriptions` (endpoint uniquement — pas les clés de chiffrement `p256dh`/`auth`, cf. exclusions ci-dessous)

**Exclusions volontaires (sécurité)** :
- `webhook_token_hash` : c'est un hash SHA-256, aucune valeur pour l'utilisateur (le clair n'est jamais stocké, cf. US-03) — exclu.
- `oauth_tokens`/`oauth_authorization_codes` : exclus intégralement, ou au mieux réduits à `client_name`/`created_at` sans la valeur du token. Exporter un refresh token OAuth actif dans un fichier téléchargeable (qui peut finir dans un mail, un cloud perso, etc.) est un risque de compromission réel du compte Gemini connecté — ce n'est pas une donnée utile à la portabilité, contrairement à l'historique de jeu.
- `push_subscriptions.keys` (p256dh/auth) : ce sont des clés de chiffrement du navigateur, pas une donnée que l'utilisateur a fournie ou qui lui est utile en export — exclues, seul `endpoint` est gardé à titre informatif.

**Flow client** : bouton « Télécharger mes données » → appelle `exportUserData()` → `Blob` JSON côté client (`JSON.stringify(result, null, 2)`) → déclenche le téléchargement via `URL.createObjectURL` + `<a download>` temporaire. Nom de fichier : `dodojo-export-<username>-<day_date du jour>.json`.

## Suppression de compte (art. 17)

**Server action** `deleteAccount(confirmText: string)` (`app/actions/account.ts`) :
1. Revalide `confirmText === "SUPPRIMER"` côté serveur (défense en profondeur — le client bloque déjà le submit, mais un appel direct à la server action doit être gardé aussi, même principe que `updateAggressivityLevel`/`VALID_AGGRESSIVITY_LEVELS`).
2. Récupère l'utilisateur courant via le client de session (cookie) — jamais un `userId` passé en paramètre par le client.
3. Instancie un client service-role (même patron que `lib/webhook-token.ts`) et appelle `admin.deleteUser(user.id)`.
4. Retourne `{ error: string | null }`.

**Flow client** (`DeleteAccountSection.tsx`, `"use client"`) :
1. Bouton « Supprimer mon compte » ouvre une modale (`useFocusTrap`, `onEscape` fourni — dismissable, contrairement au Réveil qui est volontairement bloquant).
2. Deux champs dans la modale :
   - Mot de passe actuel (re-authentification via `supabase.auth.signInWithPassword`, exactement le pattern déjà en place dans `PasswordSection.tsx`).
   - Texte libre, doit correspondre exactement à `SUPPRIMER` (`===`, sensible à la casse) pour débloquer le bouton de confirmation.
3. Submit désactivé tant que les deux conditions ne sont pas remplies.
4. Séquence à la soumission :
   - Re-auth mot de passe côté client (`signInWithPassword`) → erreur "Mot de passe actuel incorrect." si échec (même message que `PasswordSection`).
   - Appel `deleteAccount(confirmText)`.
   - Succès : `supabase.auth.signOut()` côté client (le compte n'existe plus en base, mais le JWT en cours peut rester valide jusqu'à expiration — signOut nettoie immédiatement le state local) puis `router.push("/welcome")`.
   - Échec serveur : message générique de retry (« Dodojo n'a pas pu supprimer ton compte. Réessaie. »), modale reste ouverte.

Pas de confirmation supplémentaire au-delà de mot de passe + texte — pas de double-clic à retardement, pas d'email de confirmation différée (hors scope, ajouterait une dépendance email transactionnel absente du projet à ce jour).

## États UI

Les deux composants sont des formulaires purs, sans état de chargement de données au montage (pas de fetch initial) — seuls les 3 états de la règle projet n°3 concernés sont : idle / pending (bouton disabled pendant l'appel) / erreur inline. Pas d'état "Empty" applicable ici.

## Tests

**Vitest** (`app/actions/account.test.ts`) :
- `deleteAccount` : rejette `confirmText !== "SUPPRIMER"` sans appeler `admin.deleteUser` ; appelle `admin.deleteUser` avec l'id de l'utilisateur de session en cas de texte valide ; propage une erreur générique si l'appel admin échoue.
- `exportUserData` : le résultat ne contient jamais `webhook_token_hash`, ni de champ `access_token`/`refresh_token`, ni `push_subscriptions[].keys`.

**E2E** (`e2e/account-deletion.spec.ts`) : compte **jetable**, créé à la volée pour ce test (signup réel via `/welcome`, jamais un des comptes fixes partagés `E2E_TEST_EMAIL*`/`E2E_ONBOARDING_EMAIL`, cf. ADR-04/US-29 — la suppression réelle de ces comptes casserait toute la suite). Scénario : login → Profil → Supprimer mon compte → remplir mot de passe + `SUPPRIMER` → confirmer → assert redirection `/welcome` → tentative de login avec le même email échoue (« Invalid login credentials » ou équivalent).

## Impacts pages légales

`app/confidentialite/page.tsx` (issue #134) affirme aujourd'hui « effacement traité manuellement par email ». À corriger dans la même PR : mentionner le self-service (Profil → Données & vie privée → Supprimer mon compte) comme voie principale, garder l'email de contact en filet pour les cas hors self-service (ex. compte déjà inaccessible).

## Docs à mettre à jour dans la même PR

- `CLAUDE.md` : nouvelle entrée piège — cascade FK `on delete cascade` déjà en place, service-role bypass RLS pour la cascade, exclusions volontaires de l'export (secrets).
- `CHANGELOG.md` : ligne sous `[Unreleased]`.
- Article Le Guide Dodojo (catégorie Compte/Profil, cohérent avec l'entrée `/profil` existante si elle y est documentée) : « Supprimer mon compte » + mention de l'export.

## Hors scope confirmé

- Anonymisation / pseudo-suppression : écarté, vraie suppression retenue.
- Gating export → suppression (forcer le téléchargement avant de débloquer SUPPRIMER) : écarté, les deux actions restent indépendantes.
- Email de confirmation différée avant suppression effective : hors scope, pas de dépendance email transactionnel dans le projet à ce jour.
- Export dans un format autre que JSON (CSV, etc.) : hors scope, JSON structuré suffit à l'obligation de portabilité.
