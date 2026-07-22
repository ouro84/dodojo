# US-22 — Ajout de tâche vocale via Gemini (serveur MCP) (design)

> Date : 2026-07-22
> Statut : validé pour passage en plan d'implémentation — voir section « Risques &
> inconnues » : c'est la spec la plus lourde et la plus incertaine des 6 US du
> Sprint 3 (audit du 2026-07-21 recommandait initialement de la repousser).

## Périmètre

En tant que Héros mobile, je veux dire "OK Google, ajoute la tâche [X] à Dodojo"
pour créer une tâche sans ouvrir l'app, via Gemini connecté à un serveur MCP exposé
par Dodojo.

Contrairement à US-03 (Siri, simple webhook + token personnel), le protocole MCP
attend un vrai **serveur d'autorisation OAuth 2.1** côté ressource (PKCE,
enregistrement dynamique de client). Dodojo doit implémenter ce rôle en pontant vers
les sessions Supabase existantes — Supabase Auth n'est pas nativement un serveur
OAuth conforme au spec MCP pour des clients tiers.

**Enregistrement dynamique complet (RFC 7591)**, décidé en session malgré le poids :
Dodojo accepte l'auto-enregistrement de n'importe quel client MCP (pas seulement
Gemini codé en dur), réutilisable pour d'autres assistants futurs.

---

## Modèle de données

Trois nouvelles tables, toutes avec **policy DELETE autorisée** (données techniques
opérationnelles — jetons/codes d'autorisation, pas un historique de combat protégé
par RG-04) :

- `oauth_clients` : `client_id` (PK), `client_secret_hash` (nullable — clients
  publics MCP typiquement sans secret, PKCE seul), `client_name`, `redirect_uris`
  (`text[]`), `created_at`.
- `oauth_authorization_codes` : `code_hash`, `client_id` (FK), `user_id` (FK
  profiles), `redirect_uri`, `code_challenge`, `code_challenge_method`, `scope`,
  `expires_at` (courte durée, ~60s, usage unique — supprimé après échange ou
  expiration).
- `oauth_tokens` : `access_token_hash`, `refresh_token_hash`, `client_id` (FK),
  `user_id` (FK), `scope`, `expires_at`, `created_at`.

Tous les secrets stockés **hashés**, jamais en clair (même principe que le token
webhook de US-03).

---

## Endpoints OAuth

- `POST /oauth/register` (RFC 7591) : un client MCP (Gemini) s'auto-enregistre,
  fournit `redirect_uris`/`client_name`, reçoit un `client_id` (client public,
  pas de secret nécessaire s'il utilise PKCE).
- `GET /oauth/authorize` : nécessite une session Dodojo active (Supabase) — sinon
  redirection vers `/login` d'abord. Affiche un écran de consentement ("Gemini veut
  ajouter des tâches à ta place — Autoriser ?"). À l'approbation, génère un code
  d'autorisation lié à `user_id` + `client_id` + `code_challenge` (PKCE) +
  `redirect_uri`, puis redirige vers le client avec le code.
- `POST /oauth/token` : échange code + `code_verifier` (PKCE) contre un
  `access_token` + `refresh_token` (grant `authorization_code`), ou renouvellement
  via grant `refresh_token`.
- Métadonnées de découverte (attendues par les clients MCP conformes au spec
  d'autorisation MCP) :
  - `/.well-known/oauth-authorization-server` (RFC 8414)
  - `/.well-known/oauth-protected-resource` (RFC 9728, pointe vers la route MCP)

**Initiation côté utilisateur** : le flow démarre typiquement **depuis les
réglages "Connected Apps" de Gemini**, pas depuis Dodojo (l'utilisateur cherche
"Dodojo" dans Gemini, qui redirige vers `/oauth/authorize`). Côté QG, la section
**Intégrations** (partagée avec US-03/US-11) affiche juste l'état de connexion
("Gemini connecté" / non connecté) + bouton **Déconnecter** qui révoque les lignes
`oauth_tokens` correspondantes.

---

## Serveur MCP (Resource Server)

Route Next.js (`/api/mcp`, transport Streamable HTTP — transport MCP actuel)
exposant un seul tool : `add_task(title: string)`.

Chaque appel :
1. Vérifie le `Bearer <access_token>` contre `oauth_tokens` (hash, `expires_at`).
2. Résout `user_id`.
3. Réutilise **strictement** la même logique d'insertion que US-03/le formulaire
   d'ajout existant — `day_date` = jour local (`dayKey`/`profiles.timezone`, RG-03),
   recalcul HP via `lib/game-engine.ts` (RG-01/RG-02), **aucune duplication** de la
   logique de heal du Boss (cohérent avec la note technique originale de l'issue).
4. Token expiré/absent → 401 ; le client MCP doit utiliser son `refresh_token` ou
   relancer `/oauth/authorize`.

---

## Edge cases

- Token expiré pendant l'usage : Gemini doit transparently utiliser le
  `refresh_token` (grant standard OAuth) — pas de nouvelle consent screen tant que
  le refresh token est valide.
- Déconnexion depuis le QG : toutes les lignes `oauth_tokens` du couple
  `(user_id, client_id)` supprimées → prochain appel MCP en 401 → Gemini doit
  proposer une reconnexion.
- Client enregistré (`oauth_clients`) mais jamais autorisé par un utilisateur :
  ligne orpheline inoffensive, pas de nettoyage automatique nécessaire pour cette
  itération (volume négligeable).

---

## Risques & inconnues (à valider à l'implémentation)

L'écosystème "Connected Apps" MCP de Gemini évolue vite et les specs exactes
attendues par Google (format précis des métadonnées de découverte, transport
imposé, exigences de sécurité additionnelles côté Google) doivent être **revérifiées
au moment du plan/implémentation**, pas supposées figées depuis cette session de
brainstorming. Ce document s'appuie sur le spec d'autorisation MCP générique
(OAuth 2.1 + PKCE + RFC 8414/9728/7591) comme référence la plus fiable disponible,
mais l'implémentation réelle côté Google peut différer sur des détails et devra être
ajustée en conséquence. C'est la raison pour laquelle l'audit du 2026-07-21
recommandait initialement de repousser cette US — le risque de rework est réel.

---

## Tests

- Vitest : validation PKCE (`code_verifier` → `code_challenge`), vérification de
  hash de token, expiration de code/token — toutes des fonctions pures isolables.
- Tests d'intégration des routes `/oauth/register`, `/oauth/authorize`,
  `/oauth/token`, `/api/mcp` (flow complet simulé sans dépendre de Gemini réel).
- Pas de test e2e sur le handshake Gemini réel (dépendance externe non
  reproductible en CI) — vérification manuelle post-déploiement avec un vrai
  compte Gemini avant de considérer la US terminée.
