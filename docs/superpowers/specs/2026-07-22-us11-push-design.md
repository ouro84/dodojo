# US-11 — Notifications push de rappel (design)

> Date : 2026-07-22
> Statut : validé pour passage en plan d'implémentation
> Dépend de : PWA installable (`docs/superpowers/specs/2026-07-22-pwa-design.md`, issue #58) — iOS n'autorise le Web Push que sur un site ajouté à l'écran d'accueil.

## Périmètre

En tant que Héros distrait, je veux recevoir une notification de rappel si mon Boss
du jour est encore vivant en fin d'après-midi, pour revenir au combat.

**Horaire** : heure fixe unique pour tous, **17h30 heure locale** de l'utilisateur
(pas de configuration par utilisateur pour cette itération).

---

## Opt-in

Toggle explicite dans une nouvelle section **« Intégrations »** au QG (créée par
cette US — US-03/Siri et US-22/Gemini l'étendront chacune à leur tour avec leurs
propres blocs, dans cet ordre d'implémentation) — pas de prompt de permission
navigateur non sollicité, pas d'ajout au tunnel d'onboarding (US-29) déjà validé.
Activer le toggle déclenche `Notification.requestPermission()` puis
`pushManager.subscribe()` (VAPID), et enregistre la souscription côté serveur.

---

## Modèle de données

Nouvelle table `push_subscriptions` : `user_id` (FK profiles), `endpoint` (unique),
`p256dh`, `auth`, `created_at`. **Policy DELETE autorisée** (contrairement à
`tasks`/`day_results`/RG-04) — c'est une donnée technique d'appareil, pas un
historique de combat protégé ; supprimée à la désinscription ou quand l'envoi
échoue avec un `410 Gone` (endpoint expiré côté navigateur/OS).

Nouvelle colonne `profiles.last_reminder_sent_on` (`date`, nullable) — **idempotence** :
empêche un double envoi le même jour si le cron repasse plusieurs fois dans la
fenêtre horaire. Mis à jour immédiatement après un envoi réussi.

---

## Cron & ciblage

**Vercel Cron** (configuré via `vercel.ts`, `crons`) déclenche une route toutes les
~15-30 minutes (le cron Vercel ne connaît que l'UTC ; comme les utilisateurs sont
répartis sur des fuseaux différents — `profiles.timezone`, IANA, déjà capté à
l'onboarding — il faut une fréquence fine pour approcher 17h30 heure locale de
chacun, pas un déclenchement unique).

À chaque exécution, la route sélectionne les profils où :
1. Une souscription push existe (`push_subscriptions`).
2. L'heure locale courante (dérivée de `profiles.timezone`, réutilise la logique de
   `dayKey`) tombe dans la fenêtre 17h30 (± tolérance liée à la fréquence du cron).
3. `last_reminder_sent_on` ≠ jour local courant (pas déjà envoyé aujourd'hui).
4. Le Boss du jour est encore vivant : `calculateBossCurrentHp(tasks) > 0` (il reste
   des tâches actives non résolues).
5. Le jour n'est pas déjà clôturé (`day_results` : pas de ligne pour ce
   `(user_id, day_date)` local courant).

Envoi via `web-push` (VAPID) ; réponse `410 Gone` → suppression de la ligne
`push_subscriptions` correspondante.

---

## Contenu du message

Pool de punchlines variées (tirées au sort), cohérent avec le ton "combat de rue"
déjà établi ailleurs dans l'app (combo, rage quit, Perfect/K.O.) plutôt qu'une
formule fixe répétée chaque jour. Nouveau module pur `lib/push-copy.ts` (liste de
gabarits avec le nombre de tâches restantes injecté), testable indépendamment —
suit la même logique que les autres bibliothèques de contenu du projet
(`lib/bosses.ts`, `lib/heroes.ts`), pas mêlé à `lib/game-engine.ts` qui reste
réservé aux calculs (RG-01/02).

Exemple : *"Le Boss ricane, il te reste {n} monstres à abattre avant le Rituel du
Crépuscule !"* (nom mis à jour depuis le renommage "Obi-Wan" → "Crépuscule").

**Deep-link (gap comblé)** : le payload push porte `data.url: "/"` (l'Arène) —
sans ça, le clic sur la notification n'a pas de comportement garanti. Le listener
`notificationclick` du service worker (Serwist, même fichier que le SW de la PWA)
ouvre/focus cette URL.

**Actions rapides (amélioration retenue)** : la notification porte une action
"Plus tard" (Notifications API `actions`) qui la referme sans ouvrir l'app — évite
d'obliger l'utilisateur à ouvrir Dodojo juste pour dismiss.

---

## Edge cases

- Utilisateur multi-appareils : plusieurs lignes `push_subscriptions` par
  `user_id` — chacune reçoit la notification, `last_reminder_sent_on` reste au
  niveau `profiles` (un seul "aujourd'hui a été rappelé", pas par appareil).
- Permission révoquée après souscription : l'envoi échoue (410 ou équivalent),
  ligne supprimée, le toggle du QG doit refléter l'état réel au prochain chargement
  (vérifier `Notification.permission` côté client, pas seulement l'existence d'une
  ligne en base).
- Boss vaincu (Perfect/K.O.) avant 17h30 : condition 4 échoue naturellement
  (`currentHp === 0`), pas de notification inutile.

---

## Tests

- Vitest : fonction pure de sélection des profils éligibles à partir d'une liste
  de profils/tasks/day_results/subscriptions et d'un horodatage donné (les 5
  conditions ci-dessus), testable sans dépendance réseau ni horloge système réelle.
- Vitest : `lib/push-copy.ts` (gabarits, injection du nombre de tâches restantes).
- Pas de test e2e sur l'envoi push réel (API navigateur non fiable en headless,
  dépendance à un vrai service de push).
