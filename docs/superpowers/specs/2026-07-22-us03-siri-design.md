# US-03 — Intégration Siri (design)

> Date : 2026-07-22
> Statut : validé pour passage en plan d'implémentation

## Périmètre & re-scope

En tant que Héros mobile, je veux ajouter une tâche via l'assistant natif de mon
téléphone sans ouvrir l'app.

**Re-scope iOS uniquement** : le titre original mentionne "Siri / Google Assistant",
mais depuis le remplacement de Google Assistant par Gemini sur Android (2026), le
mécanisme Android est couvert par **US-22** (Gemini Connected App via serveur MCP,
OAuth) — cycle de design séparé. Ce document ne couvre que **Siri (iOS)**.

**Faisabilité sans app native** : le spec original parle de "configuration de
raccourcis OS" — ça correspond exactement au pattern standard **iOS Shortcuts +
webhook** : l'utilisateur crée lui-même, dans l'app Shortcuts, un raccourci "Dis
Siri, ajoute [X] dans Dodojo" qui exécute une action "Obtenir le contenu de l'URL"
(`Get Contents of URL`) vers un endpoint authentifié exposé par Dodojo. Pas besoin
d'App Intents, pas d'app native, pas de soumission App Store.

---

## Authentification — token webhook personnel

Un token secret par utilisateur (pas d'OAuth, pas de flow interactif possible côté
Shortcuts) :
- Généré depuis la section **« Intégrations »** du QG (créée par US-11 pour le
  toggle push, livrée avant celle-ci dans l'ordre du sprint — ce document y ajoute
  un second bloc, pas une nouvelle section).
- **Stocké hashé en base** (`profiles.webhook_token_hash`, + `webhook_token_created_at`)
  — comme une clé d'API standard. Le token en clair n'est affiché **qu'une seule
  fois**, à la génération/régénération ("copie-le maintenant, il ne sera plus
  affiché"). Une fuite de la base n'expose pas de token directement utilisable.
- Bouton "Régénérer" : invalide l'ancien token immédiatement (écrase le hash), sans
  DELETE — simple mise à jour de colonne, pas une donnée soumise à RG-04 (pas un
  historique de combat).

---

## Endpoint webhook

`POST /api/webhook/add-task` :
- Header `Authorization: Bearer <token>`.
- Body `{ "title": string }`.
- Vérifie le hash du token contre `profiles.webhook_token_hash`.
- Insère la tâche pour `day_date` = jour local courant de l'utilisateur (réutilise
  `dayKey`/`profiles.timezone`, cohérent avec RG-03 — pas de logique de heal du
  Boss dupliquée : réutilise directement la même fonction d'insertion que le
  formulaire d'ajout de tâche existant, `RG-01`/`RG-02` recalculés une seule fois,
  au même endroit).
- Réponse `401` si token invalide/absent, `201` si tâche créée.

**Pas de rate limiting pour cette itération** : le volume est naturellement faible
(webhook personnel déclenché à la voix par un seul utilisateur), le token est déjà
la surface de contrôle principale. Pas de sur-ingénierie pour un cas d'usage
mono-utilisateur à faible fréquence.

---

## Documentation utilisateur

Nouvelle mécanique visible par l'utilisateur → **section obligatoire du Manuel du
Dojo** (convention CLAUDE.md, US-28) : pas à pas concret pour créer le raccourci
dans l'app iOS Shortcuts (action "Obtenir le contenu de l'URL", méthode POST,
header Authorization, phrase Siri personnalisée), avec le token à coller depuis la
section Intégrations du QG. Section à ajouter dans le même commit que
l'implémentation, `section.id` stable pour deep-link (ex. `#siri`).

---

## Edge cases

- Titre de tâche vide/trop long dans le body : mêmes contraintes que le formulaire
  d'ajout existant (`maxLength` cohérent, ex. 140 caractères) — validation
  réutilisée, pas réinventée.
- Token régénéré alors qu'un raccourci existant utilise l'ancien : échoue en 401 —
  l'utilisateur doit mettre à jour son raccourci Shortcuts avec le nouveau token
  (comportement attendu, documenté dans le Manuel du Dojo).

---

## Tests

- Vitest : fonction de vérification du hash de token (cas valide/invalide/absent),
  fonction pure réutilisée d'insertion de tâche (déjà couverte par les tests
  existants de `game-engine.ts`, pas de duplication de test).
- Test d'intégration API route (pas e2e Playwright) : POST valide → tâche créée +
  HP Boss recalculés ; POST avec mauvais token → 401.
