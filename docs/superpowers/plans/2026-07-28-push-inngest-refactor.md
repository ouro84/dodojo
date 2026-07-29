# Plan d'implémentation — Migration notifs push vers Inngest (issues #102 + #114)

> Date création : 2026-07-28
> Statut global : EN COURS
> Branche : docs/102-114-push-inngest-plan
> Auteur : ouro84 (validation Inngest vs QStash)
> Fichier de destination : docs/superpowers/plans/2026-07-28-push-inngest-refactor.md

---

## ⚙️ Règles de mise à jour de CE document (pour la prochaine session)

- **À chaque étape terminée**, coche la case correspondante (`[ ]` → `[x]`) et ajoute le SHA du commit de fermeture.
- **À chaque reprise de session**, lire intégralement la section « Statut global » puis la section du lot à travailler.
- **Toute décision imprévue** découverte pendant l'implémentation va dans la section « Décisions prises en cours de route » avec sa date.
- **Aucun commit direct sur `main`** — chaque PR suit le workflow [CONTRIBUTING.md](../../CONTRIBUTING.md).
- Ce document est le source de vérité du job ; tout autre échange (Slack/issue/PR description) est secondaire.

---

## 🎯 Statut global

- [ ] **PR1 — Foundation Inngest** (lots L0, L1, L2, L4)
  - [ ] L0 — Setup SDK + route + .env.example (commit SHA: ______)
  - [ ] L1 — Migration cron → Inngest (commit SHA: ______)
  - [ ] L2 — Scheduling per-user with TZ (commit SHA: ______)
  - [ ] L4 — Suppression cron GHA + doc (commit SHA: ______)
- [ ] **PR2 — Fix #102 + préparation #114** (lots L3, L5)
  - [ ] L3 — PushReminderToggle fix (commit SHA: ______)
  - [ ] L5 — reminder_offset_minutes + scheduleDeadlineReminder (commit SHA: ______)

---

## 📚 Contexte à relire avant chaque reprise

| Fichier | Rôle pour ce job |
|---|---|
| [CLAUDE.md](../../CLAUDE.md) | Conventions, stack, pièges. Notamment §« Cron push — GitHub Actions » (~L171), §« Token webhook Siri » / piège Vitest alias `@/`, §« Migrations Supabase hors-ordre », §« Garde de session ». |
| [CONTRIBUTING.md](../../CONTRIBUTING.md) | Workflow local obligatoire : `npm run lint` → `npm test` → `npm run build` → `npm run e2e`. |
| [vitest.config.ts](../../vitest.config.ts) | Env `node` par défaut, alias `@/` RÉSOLU (contrairement à l'ancienne note CLAUDE.md), includes `lib/**`/`components/**`/`app/**`/`hooks/**`. |
| Issue #102 | `gh issue view 102 --comments` — bouton notifications sans mémoire + erreur au 2e clic. |
| Issue #114 | `gh issue view 114 --comments` — notifs avant deadline tâche (4 lots ; L5 ne prépare que la fondation DB + helper). |
| Spec US-11 | [docs/superpowers/specs/2026-07-22-us11-push-design.md](../specs/2026-07-22-us11-push-design.md) — design push d'origine, reste valide hors cron. |
| Plan US-11 | [2026-07-22-us11-push.md](2026-07-22-us11-push.md) — implémentation livrée (toggle, SW, route cron, eligibility). |
| Route cron existante | [app/api/cron/push-reminders/route.ts](../../app/api/cron/push-reminders/route.ts) + [route.test.ts](../../app/api/cron/push-reminders/route.test.ts) — code à migrer en L1, supprimé en L1. |
| Eligibilité | [lib/push-eligibility.ts](../../lib/push-eligibility.ts) + [push-eligibility.test.ts](../../lib/push-eligibility.test.ts) — fonctions pures, réutilisées telles quelles. |
| Copy notifications | [lib/copy/notifications.ts](../../lib/copy/notifications.ts) — `buildReminderPayload(remaining, level, pickIndex)`. NE PAS confondre avec l'ancien `lib/push-copy.ts` du plan US-11 (jamais créé ; refactor en `lib/copy/notifications.ts` par le rebrand Volume Intérieur). |
| Toggle à corriger | [components/qg/PushReminderToggle.tsx](../../components/qg/PushReminderToggle.tsx) — bug #102. |
| Server actions push | [app/actions/push.ts](../../app/actions/push.ts) — `subscribeToPush` / `unsubscribeFromPush`, déjà upsert + delete par endpoint. |
| Cron GHA à supprimer | [.github/workflows/push-reminders-cron.yml](../../.github/workflows/push-reminders-cron.yml) — 21 lignes, supprimé en L4. |
| Pattern test route | `app/api/cron/push-reminders/route.test.ts` (FakeQueryBuilder thenable, FakeSupabaseClient, vi.hoisted web-push, stubEnv, fakeTimers). |
| Pattern test pure | `lib/push-eligibility.test.ts` (makers `makeTask`/`makeCandidate`, `NOW_1730_PARIS`). |
| Pattern test composant | [hooks/useFocusTrap.test.tsx](../../hooks/useFocusTrap.test.tsx) — `// @vitest-environment jsdom`, @testing-library/react, `afterEach(cleanup)`. |

Dernière migration Supabase sur `main` au 2026-07-28 : `20260728100000_add_tasks_deferred_at.sql`. **Toute nouvelle migration L5 doit porter un timestamp strictement postérieur** (ex. `20260728110000`).

---

## 🏗️ Architecture cible

```
 User (Vestiaire)                  Next.js (Vercel)              Inngest Cloud           Navigateur
 ──────────────────                ──────────────────            ───────────────         ───────────

 [Toggle push]  ──subscribe/unsub──► app/actions/push.ts
                                       │  upsert/delete
                                       ▼
                                    push_subscriptions (DB)
                                    profiles (last_reminder_sent_on, timezone,
                                               reminder_offset_minutes) ◄── (L5)
                                       ▲
                                       │  ensureSchedule(profile) au mount
                                       │  du Vestiaire (lazy, idempotent)
 app/vestiaire/page.tsx ──ensureSchedule──► lib/inngest/scheduling.ts
                                            │
                                            ▼
                                         inngest.schedules.create(cron "30 17 * * *",
                                                                    tz=profile.timezone)
                                            │
                                            ▼
                                         Inngest schedule ──fire event──► function "send-reminder"
                                            │                                │
                                            │                                ├─ selectReminderEligibleProfiles (lib/push-eligibility.ts, pur)
                                            │                                ├─ web-push sendNotification (VAPID)
                                            │                                ├─ 410/404 → DELETE push_subscriptions(.*)
                                            │                                └─ UPDATE profiles.last_reminder_sent_on = today
                                            │
                                         (cron global "schedule-reminders" supprimé en L2 —
                                          remplacé par schedules per-user TZ IANA)

 ❌ SUPPRIMÉ en L4 :
    .github/workflows/push-reminders-cron.yml  (GitHub Actions cron "*/15 * * * *")

 ❌ SUPPRIMÉ en L1 :
    app/api/cron/push-reminders/route.ts       (149 LOC)
    app/api/cron/push-reminders/route.test.ts  (172 LOC)

 ✅ NOUVEAU :
    lib/inngest/client.ts                      (instance Inngest + helpers serve)
    lib/inngest/scheduling.ts                  (buildCronExpr, ensureSchedule, scheduleDeadlineReminder stub L5)
    lib/inngest/scheduling.test.ts
    lib/inngest/functions/send-reminder.ts     (orchestration Inngest + side-effects DB/push)
    lib/inngest/functions/send-reminder.test.ts
    lib/inngest/functions/send-reminder.types.ts (types d'events "push/send-reminder")
    app/api/inngest/route.ts                   (handler serveur Inngest, POST serve + GET)
```

## 📋 Détail lot-par-lot

Chaque lot suit le cycle TDD : ** écriture du test d'abord → rouge → implémentation minimale → vert → refactor → commit**. Le critère « lot terminé » = toutes les commandes de test du lot au vert + case cochée + SHA de commit renseigné.

---

### Lot L0 — Setup Inngest SDK + route serveur + variables d'env

**Objectif :** poser la fondation technique. Après L0, `npx inngest-cli@latest dev` peut découvrir l'app et la route `POST /api/inngest` répondre aux pings de vérification. Aucune fonction Inngest n'est encore enregistrée (c'est L1 qui enregistre `send-reminder`).

**Fichiers touchés :**

| Fichier | Action | LOC net | Description |
|---|---|---:|---|
| `package.json` | Modifié | +2 | Ajout dépendance `inngest` (^3.x) en `dependencies`. Version cible à re-vérifier au moment du LOT (`npm view inngest version`) — ne pas fixer en plan. |
| `lib/inngest/client.ts` | Créé | +15 | Export `inngest` = `new Inngest({ id: "dodojo", eventKey: process.env.INNGEST_EVENT_KEY ?? "", signingKey: process.env.INNGEST_SIGNING_KEY })`. Singleton module. **Aucune fonction enregistrée ici** — les fonctions sont importées et passées à `serve()` dans la route. |
| `app/api/inngest/route.ts` | Créé | +25 | `POST` = `serve({ client: inngest, functions: [] })` (tableau vide en L0, rempli en L1). `runtime = "nodejs"`. `dynamic = "force-dynamic"`. Export nommé `POST` (handler serve). |
| `.env.example` | Modifié | +12 | Bloc « Inngest (US-11 refactor) » avec `INNGEST_SIGNING_KEY`, `INNGEST_EVENT_KEY`, `INNGEST_APP_ID=dodojo`, commentaire pointant vers le dashboard Inngest Hobby. |
| `.env.local` | Modifié (manuel, hors commit) | — | L'opérateur renseigne les 3 clés récupérées depuis le dashboard Inngest après création de l'app. |

**Commandes de test à lancer (L0) :**

| Commande | Fichier(s) couvert(s) | Attendu |
|---|---|---|
| `npx tsc --noEmit` | tous | Vert (le nouveau `lib/inngest/client.ts` type-check contre les types du SDK). |
| `npm run lint` | tous | Vert. |
| `npm test` | (rien de nouveau, 只是 sanity) | Vert — tous les tests existants passent encore. |
| `npm run build` | tous | Vert — la nouvelle route `app/api/inngest/route.ts` compile sans erreur Next.js 16. |
| `npx inngest-cli@latest dev` (manuel) | — | Inngest Dev Server démarre sur http://localhost:8288 et découvre l'app `dodojo` (0 fonctions enregistrées — affiché comme « App found, 0 functions »). |

**Cas de test unitaires (L0) :** aucun nouveau test. La logique de L0 est glue de configuration — pas testable unitairement sans mocker tout le SDK Inngest. L'assertion réelle se fait via le dev server Inngest (manuel) puis, en L1, via les tests de `send-reminder.ts` qui vont mocker ce même client.

**Vérifications humaines (L0) :**

- [ ] `npm view inngest version` → noter la version installée dans la section « Décisions prises en cours de route ».
- [ ] Signup sur https://app.inngest.com → créer l'app `dodojo` en palier Hobby (free tier, $0), récupérer `Signing Key` + `Event Key` + `App ID`.
- [ ] Renseigner les 3 vars dans `.env.local` (jamais dans `.env.example` de vraies valeurs).
- [ ] Lancer `npx inngest-cli@latest dev` dans un terminal séparé → l'app `dodojo` apparaît dans http://localhost:8288 avec 0 fonctions.
- [ ] `curl -X POST http://localhost:3000/api/inngest` répond 200 ou 401 (Inngest protocol handshake), **pas** 404 (404 = route mal déclarée).

**Pièges spécifiques (L0) :**

- **Alias `@/` interdit dans `lib/inngest/client.ts`** : ce fichier sera importé par `app/api/inngest/route.ts` (qui lui peut utiliser `@/`) mais aussi potentiellement chargé directement par des tests Vitest (cf. piège CLAUDE.md « Token webhook Siri ». Utiliser import relatif `./client` partout dans `lib/inngest/**`. PRÉVENTIF : ne pas suivre l'habitude Next.
- **Pas de `vercel.json` à créer** : Inngest n'a pas besoin de config Vercel, l'app est autodéportée via la route `/api/inngest`. Ne surtout pas introduire `vercel.json` maintenant — cf. CLAUDE.md « Cron push — GitHub Actions », pas de `vercel.json` dans le repo volontairement.
- **single export `POST`** : en Next 16 App Router, le handler Inngest se fait via `export const POST = serve({...})` — pas `export async function POST`. Vérifier dans `node_modules/next/dist/docs/` la signature exacte pour Next 16 avant de coder (AGENTS.md rappelle que cette version a des breaking changes).
- **`INNGEST_SIGNING_KEY` en Hobby** : en palier Hobby la signing key est nullable en dev local (le dev server l'accepte vide), mais elle est **obligatoire en prod**. Mettre un espace vide `""` comme défaut dans `.env.example` avec un commentaire « Required in production ».

**Critère « lot L0 terminé » :** `npx tsc --noEmit` vert + `npm run build` vert + dev server Inngest découvre l'app + commit renseigné.

- [ ] L0 terminé (commit SHA: ______)

---

### Lot L1 — Migration route cron → fonctions Inngest (send-reminder)

**Objectif :** remplacer `app/api/cron/push-reminders/route.ts` par une fonction Inngest `send-reminder` déclenchée par un event (et, en L1, par un cron global en attendant L2). Concentrer dans `lib/inngest/scheduling.ts` la logique pure (construire le cron expression, déterminer quels profils sont éligibles à un instant `now` pur), et dans `lib/inngest/functions/send-reminder.ts` l'orchestration mockable (émission web-push, update DB, gestion 410).

**Fichiers touchés :**

| Fichier | Action | LOC net | Description |
|---|---|---:|---|
| `lib/inngest/scheduling.ts` | Créé | +60 | Fonctions pures : `buildDailyReminderCron(timezone)` → `"30 17 * * *"` (utilitaire privé pour L2)，`buildCandidatesFromDb(subs, profiles, tasks, dayResults, nowUtc)` (extraction du bloc `candidateByProfile` de la route actuelle vers une fonction pure testable) ; `pickSubscriptionsToSend(profileId, subsByUser)` (pur). |
| `lib/inngest/scheduling.test.ts` | Créé | +60 | Test de `buildCandidatesFromDb` couvrant : 1 user 1 sub éligible / 1 user sans sub / 1 user avec `day_results` existant / 1 user Boss KO (0 HP). Réutilise makers `makeTask`/`makeCandidate` de `lib/push-eligibility.test.ts` et `NOW_1730_PARIS`. |
| `lib/inngest/functions/send-reminder.types.ts` | Créé | +10 | `interface SendReminderEvent { name: "send-reminder"; data: { profileId: string } }`. Type partagé, pas d'export runtime. |
| `lib/inngest/functions/send-reminder.ts` | Créé | +80 | `export const sendReminder = inngest.createFunction({ id: "send-reminder", idempotency: "key" }, { event: "send-reminder" }, async ({ event, step }) => { ... })`. Steps : (1) `step.run("fetch-context", () => fetchSubscription+Profile+TodayTasks)`, (2) `step.run("is-eligible", () => isReminderEligible(...))` (3) si éligible, `step.run("send-push", () => sendPushOrDelete404(...))` et `step.run("mark-sent", () => updateDbLastReminder(...))`. Imports : `isReminderEligible` depuis `@/lib/push-eligibility` (alias OK car pas chargé directement par test) ; `buildReminderPayload` depuis `@/lib/copy/notifications` ; mock `web-push` au niveau du test. |
| `lib/inngest/functions/send-reminder.test.ts` | Créé | +120 | Mock `@supabase/supabase-js` (FakeSupabaseClient extraction en helper mutualisé avec `route.test.ts` si possible, sinon réécrit local), mock `web-push` via `vi.hoisted` (même pattern que `route.test.ts:3-13`), mock `inngest` client via `vi.hoisted()` + `vi.mock("inngest", ...)`. Fake timers `vi.setSystemTime(NOW_1730_PARIS)`. Tests critiques listés plus bas. |
| `app/api/inngest/route.ts` | Modifié (L0 enrichi) | +3 | `functions: [sendReminder]` à la place du tableau vide de L0. Import `sendReminder` depuis `@/lib/inngest/functions/send-reminder` (alias OK côté route). |
| `lib/push-eligibility.test.ts` | (inchangé) | 0 | Réutilisé tel quel — `selectReminderEligibleProfiles` reste la source de vérité. |
| `app/api/cron/push-reminders/route.ts` | **Supprimé** | -149 | Disparaît — toute la logique est migrée vers `send-reminder.ts`. |
| `app/api/cron/push-reminders/route.test.ts` | **Supprimé** | -172 | Disparaît. La couverture de la route (notamment le test « 410 → delete sub, pas de mark sent ») est **ré-écrite dans `send-reminder.test.ts`** — cas critique T1.1 ci-après. |

**Net LOC :** +120 (création ~345 − suppression 321).

**Commandes de test à lancer (L1) :**

| Commande | Fichier(s) couvert(s) | Attendu |
|---|---|---|
| `npm test -- lib/inngest/scheduling.test.ts` | scheduling.ts | Vert (4 test cases minimum). |
| `npm test -- lib/inngest/functions/send-reminder.test.ts` | send-reminder.ts | Vert — T1.1 à T1.5 ci-dessous au vert. |
| `npm test -- lib/push-eligibility.test.ts` | push-eligibility.ts | Vert — non régressé. |
| `npm test` | tous | Vert — la suppression de `route.test.ts` ne fait pas chuter le total. |
| `npx tsc --noEmit` | tous | Vert. |
| `npm run lint` | tous | Vert. |
| `npm run build` | tous | Vert — la suppression du dossier `app/api/cron/push-reminders/` n'invalide aucune référence Next. |

**Cas de test critiques (L1)** — doivent **absolument** être présents :

- **T1.1 (reprise exacte de route.test.ts:158-171)** — `send-reminder supprime la souscription 410 et ne marque pas last_reminder_sent_on`
  - `describe("send-reminder")` > `test("supprime la souscription sur 410 Gone, sans marquer last_reminder_sent_on")`
  - Fixtures : `makeCandidate()` (éligible), 1 `push_subscriptions` row.
  - Mocks : `sendNotificationMock.mockRejectedValueOnce({ statusCode: 410 })` ; `FakeSupabaseClient`ION sur `push_subscriptions` + `profiles`.
  - Assertion : `expect(dbTables.push_subscriptions).toHaveLength(0)` ; `expect(dbTables.profiles[0].last_reminder_sent_on).toBeNull()` ; `sendNotificationMock` called once.

- **T1.2 (nouveau — documente l'idempotence Inngest native)** — `send-reminder est idempotent : un même event ID ne re-déclenche pas l'envoi`
  - `test("un second run avec un même event.id ne réémet pas de notification")`
  - Mocks : `inngestMock` capture les runs ; on appelle le handler `sendReminder.fn({ event: { id: "evt_1", data: { profileId: "u1" } }, step })` deux fois avec **même `event.id`**.
  - Assertion : `sendNotificationMock` called once (pas deux fois).
  - Note : on ne teste pas l'intégration réelle du dedup Inngest (service externe), on documente l'invariant que la fonction ne fait rien si already-sent côté DB (`profiles.last_reminder_sent_on === today`), bonus idempotence SaaS pour la redondance multi-source. Reporter l'idempotence DB dans un commentaire du test.

- **T1.3** — `send-reminder envoie une notification au profil éligible et marque last_reminder_sent_on` (reprise de route.test.ts:143-156, mais via l'event payload `{ profileId: "u1" }`).
- **T1.4** — `send-reminder ignore un profil non éligible (manque de souscription)` (T1.3 négatif, contrat `isReminderEligible`).
- **T1.5** — `send-reminder 404 → supprime la sub ET marque last_reminder_sent_on` (différent de 410 : sur 404 le endpoint est aussi mort mais on considère l'envoi réussi pour la journée — comportement à confirmer dans « Décisions prises en cours de route » si différent de la route actuelle).

**Vérifications humaines (L1) :**

- [ ] `npx inngest-cli@latest dev` en local → le dashboard http://localhost:8288 liste `send-reminder` comme fonction enregistrée.
- [ ] Déclencher manuellement l'event `send-reminder` avec data `{ "profileId": "<ton_uid_supabase_dev>" }` depuis le dashboard UI local (onglet « Events » → « Send »).
- [ ] Vérifier côté Supabase dev : la colonne `profiles.last_reminder_sent_on` passe à aujourd'hui pour ce profile_id.
- [ ] Vérifier sur un device de test (PWA installée) : une notification push arrive.

**Pièges spécifiques (L1) :**

- **Imports relatifs pour `lib/inngest/scheduling.ts`** : chargé directement par `scheduling.test.ts`, peut consommer `lib/game-engine` via alias `@/` (qui EST résolu par `vitest.config.ts` L6-9, contrairement à l'ancienne note CLAUDE.md). En revanche, `scheduling.ts` ne doit pas importer `inngest/client.ts` (qui dépend du SDK Inngest non mocké par `scheduling.test.ts`) — only DB-facing fonctions pures ici.
- **`send-reminder.ts` peut utiliser `@/`** : il n'est pas chargé directement par son test ; le test mock `lib/inngest/client` lui-même via `vi.mock("@/lib/inngest/client", ...)` (NE PAS confondre avec毛病 CLAUDE.md : alias `@/` marche, juste la cible du mock doit matcher le chemin importé).
- **`retrieveAllSubscriptions` boucle naïve** : à éviter, ne pas reprendre le `select *` sans filtre. On filtre par `user_id = profileId` directement dans la step — change antérieur au perf PTSD mais garde simple.
- **`step.run` ne peut pas être skipped** : si `isReminderEligible` retourne `false` en L2 step peux `step.run("skip", () => null)` puis return early — ne jamais sauter un `step.run` conditionnel, Inngest garde l'ordre.
- **Mock Inngest SDK** (pattern à introduire — pas encore existant dans le repo) :
  ```ts
  const inngestMock = vi.hoisted(() => ({
    send: vi.fn(),
    schedules: { create: vi.fn(), delete: vi.fn() },
  }));
  vi.mock("@/lib/inngest/client", () => ({
    inngest: {
      send: inngestMock.send,
      schedules: inngestMock.schedules,
    },
  }));
  ```
  Garder la même philosophie que `web-push` : mock au niveau module, reset dans beforeEach.

**Critère « lot L1 terminé » :** T1.1 à T1.5 verts + route cron + test route supprimés + déclenchement manuel via dev server Inngest OK + commit renseigné.

- [ ] L1 terminé (commit SHA: ______)

---

### Lot L2 — Scheduling per-user with timezone via inngest.schedules.create

**Objectif :** remplacer le cron global « toutes les 15 minutes pour approcher 17h30 locale de chacun » par un **schedule Inngest par utilisateur** portant le `cron expr` `30 17 * * *` calé sur `profiles.timezone` (IANA). Inngest calcule la conversion TZ nativement — fini le tir « canopéen » UTC. Migration « lazy » : aucun script one-shot, les schedules sont créés au montage du Vestiaire (la première visite après déploiement L2 déclenche `ensureSchedule(profileId, timezone)`).

**Fichiers touchés :**

| Fichier | Action | LOC net | Description |
|---|---|---:|---|
| `lib/inngest/scheduling.ts` | Modifié | +85 | Ajoute `ensureUserReminderSchedule(profileId, timezone): Promise<void>` (idempotent : GET existing schedules, create only if absent — protection frost manque d'API `list` filtrée in Hobby ; on tolère un `create` no-op si schedule déjà existant via `external_id = "reminder-daily-${profileId}"`). `deleteUserReminderSchedule(profileId)` symétrique pour unsubscribe. Exports `REMINDER_DAILY_CRON = "30 17 * * *"`. |
| `lib/inngest/scheduling.test.ts` | Modifié | +45 | Vitest fake timers `vi.setSystemTime(...)`. Tests : (a) `ensureUserReminderSchedule` appelle `inngest.schedules.create` avec `cron: "30 17 * * *"` et `external_id` stable ; (b) re-profiler appels ultérieurs ne créent pas de doublon ; (c) passage à un nouveau fuseau (re-onboarding voyage) supprime l'ancien schedule puis crée le nouveau.
| `app/vestiaire/page.tsx` | Modifié (action serveur-only) | 0 | Le `VestiairePage` server component appelle déjà un `ensureUserPushSchedule` server action (nouvelle). Le rendu React reste inchangé ; l'effet de bord tourne en **cached/dynamic = force-dynamic** pour ne pas décorréler la dernière valeur.
| `app/actions/push.ts` | Modifié | +30 | `subscribeToPush` appelle `ensureUserReminderSchedule(profileId, timezone)` après l'upsert réussi. `unsubscribeFromPush` appelle `deleteUserReminderSchedule(profileId)` après le delete. Pour garder la server action sync pur, le schedule Inngest est appelé en best-effort (try/catch, log erreur mais ne fait pas échouer la souscription DB — la DB reste source de vérité, le schedule est seulement le déclencheur temporel). |
| `lib/push-eligibility.test.ts` | (inchangé) | 0 | `isWithinReminderWindow` reste la garantie de dernier kilomètre (pré-410 garde — si jamais Inngest fire à la seconde pile et que plusieurs évènements du même user se chevauchent, la window locale protège encore). |

**Net LOC :** +85 (scheduling) + +45 (test) + +30 (push.ts) = +160. Impact réel net +85 (L2 seul), les autres lots L2-related sont inclus.

**Commandes de test à lancer (L2) :**

| Commande | Fichier(s) couvert(s) | Attendu |
|---|---|---|
| `npm test -- lib/inngest/scheduling.test.ts` | scheduling.ts | T2.1, T2.2, T2.3 verts. |
| `npm test -- app/actions/push.test.ts` (si créé) | push.ts | Vert — `ensureUserReminderSchedule` mocked, check appel en best-effort. |
| `npm test` | tous | Vert — non régression. |
| `npx tsc --noEmit` | tous | Vert. |
| `npm run lint` | tous | Vert. |
| `npm run build` | tous | Vert. |
| `npx supabase migration list --linked` | DB | Pas de migration DB en L2 — mais le check vérifie qu'aucune migration précédente n'est restée inappliquée (cf. CLAUDE.md §« Migrations Supabase hors-ordre »). Si écart → STOP, traiter avant PR. |

**Cas de test critiques (L2) :**

- **T2.1** — `ensureUserReminderSchedule crée un schedule cron "30 17 * * *" pour le TZ du profil`
  - Assertions : `inngestMock.schedules.create` called once avec `{ cron: "30 17 * * *", external_id: "reminder-daily-u1", data: { profileId: "u1" } }`. L'idempotence vient de `external_id` stable.
- **T2.2** — `ensureUserReminderSchedule est idempotent : un 2e appel ne crée pas de schedule dupliqué`
  - Mock : `list` retourne déjà le schedule `reminder-daily-u1` → `create` NOT called.
- **T2.3** — `deleteUserReminderSchedule supprime via external_id`
  - Assertions : `inngestMock.schedules.delete` called once avec `{ external_id: "reminder-daily-u1" }`.

**Vérifications humaines (L2) :**

- [ ] Sur le dashboard Inngest (dev ou prod staging), vérifier qu'un schedule `reminder-daily-<uid>` apparaît avec le TZ correct après la 1re visite du Vestiaire.
- [ ] Forcer le TZ d'un user de test à `Asia/Tokyo` dans Supabase → recharger le Vestiaire → vérifier dans Inngest que le cron du schedule est bien `30 17 * * *` interprété en JST (Inngest affiche la « next run time » localisée).
- [ ] Désactiver le toggle push depuis le Vestiaire → vérifier que le schedule est supprimé du dashboard Inngest.

**Pièges spécifiques (L2) :**

- **`external_id` obligatoire** : Inngest accepte un `external_id` stable par schedule qui garantit l'idempotence cross-app. Sans ça, un re-mount du Vestiaire créerait N schedules pour le même user. Always utiliser `reminder-daily-${profileId}`.
- **DST (Daylight Saving Time)** : Inngest interprète `cron "30 17 * * *"` avec le TZ IANA spécifié dans `schedule.timezone` (passé en paramètre de `create`). Aux transitions DST, Inngest suit l'offset local courant — **17h30 n'est pas une heure de transition typique** (la transition se fait à 01h00/02h00 UTC), pas d'impact pour #102/#114 créneaux daily à heure fixe. Pour #114 (deadline à n'importe quelle heure), il faudra à terme un garde-fou (noté dans « Pièges et règles projet à respecter »).
- **`schedule.timezone` field** : confirmer dans la doc Inngest au moment du lot que le champ `timezone` est bien supporté sur `schedules.create` en Hobby tier. Si non supporté (Hobby limit), fallback : générer un cron UTC spécifique par user via `backendCronFromLocal(timezone, "30 17")` qui produit `"30 17 * * *"` en UTC équivalent — mais cette solution **n'est pas DST-safe** (offset change 2x/an), à éviter absolument. Préférer le `schedule.timezone` field natif.
- **Le cron global `schedule-reminders` mentionné à l'origine n'est jamais créé** : on passe directement au per-user scheduling — l'inngest event `send-reminder` reste déclenchable manuellement pour debug mais le cron global est mort-né.
- **`dynamic = "force-dynamic"` sur la page Vestiaire** : seul prérequis — `ensureUserReminderSchedule` fait un effet de bord réseau externe (Inngest API), la page Vestiaire ne doit pas être cached à ce payload sinon un re-mount côté user ne ré-ensure jamais le schedule. Vérifier `app/vestiaire/page.tsx` n'a pas `export const revalidate` > 0.

**Critère « lot L2 terminé » :** T2.1 à T2.3 verts + `supabase migration list --linked` au vert + schedule per-user visible sur le dashboard Inngest + commit renseigné.

- [ ] L2 terminé (commit SHA: ______)

---

### Lot L4 — Suppression cron GHA + màj CLAUDE.md + CHANGELOG + doc spec

> **Positionné en PR1 (et non en PR2)** : la suppression du workflow GHA doit accompagner la mise en service d'Inngest, pour qu'il n'y ait **jamais** une fenêtre où plus aucun scheduler ne déclenche les reminders. L4 merge en même temps que L2 (dernier commit de PR1, après L0+L1+L2 verts).

**Objectif :** supprimer le couplage `CRON_SECRET` + workflow GHA qui précarise les notifs utilisateur (dépendant des crédits GHA de l'auteur), mettre à jour les docs de référence (`CLAUDE.md`, `CHANGELOG.md`) pour refléter la migration Inngest, et pointer vers ce présent plan pour la postérité.

**Fichiers touchés :**

| Fichier | Action | LOC net | Description |
|---|---|---:|---|
| `.github/workflows/push-reminders-cron.yml` | **Supprimé** | -21 | Workflow `schedule: cron: "*/15 * * * *"` qui curlait `/api/cron/push-reminders` avec `CRON_SECRET`. Suppression complète. |
| `.env.example` | Modifié | -4 | Retire le bloc `# Cron externe (US-11)` documentant `CRON_SECRET`. La var reste tolérée dans `.env.local` (best-effort — évite tout bruit si elle traîne, mais aucune code-path ne la lit plus après L1). |
| `CLAUDE.md` | Modifié | +25 / -8 | (a) §« Cron push — GitHub Actions » (~L171) remplacé par §« Cron push — Inngest (US-11 refactor #102 + #114) » : décrit Inngest Hobby (50K exec/mois, schedules illimités), la route `app/api/inngest/route.ts`, le scheduling per-user via `external_id = "reminder-daily-<uid>"`, la migration lazy. (b) §« Garde de session » : `isPublicRoute` ne couvre plus seulement `/api/*` par construction — `/api/inngest` est déjà sous `/api/*`, exempté de l'anonyme-vs-`/welcome` par la règle existante. (c) Ajout §« Vercel Deployment Protection : Hobby = désactivée par défaut » (note demande originale). (d) Mise à jour Last updated à `2026-07-28`. |
| `CHANGELOG.md` | Modifié | +3 | Sous `## [Unreleased]`, ajout de la ligne `feat: migration notifs push vers Inngest (per-user scheduling with TZ, suppression cron GHA) — issues #102 #114 (lots L0/L1/L2/L4)` (pas de ligne L3/L5 ici — ceux-là viendront en PR2 dans un autre commit). |
| `docs/superpowers/specs/2026-07-22-us11-push-design.md` | Modifié | +15 | En fin de fichier, nouvelle section `## Refactor Inngest (2026-07-28)` qui pointe vers ce plan (`2026-07-28-push-inngest-refactor.md`) et résume la décision : QStash écarté (1K msg/jour + 10 schedules max → casserait dès #114), Inngest Hobby retenu (50K exec/mois + schedules illimités). La spec reste valide pour les parties inchangées (opt-in, contenu, edge cases). |

**Net LOC :** -22 + doc. Budget doc renseigné dans le tableau « Fichier | Action » du sprint.

**Commandes de test à lancer (L4) :**

| Commande | Fichier(s) couvert(s) | Attendu |
|---|---|---|
| `npm test` | tous | Vert — aucun test ne référençait le workflow GHA ; le seul test supprimé en L1 était `route.test.ts` qui n'existait plus à ce stade. |
| `npx tsc --noEmit` | tous | Vert. |
| `npm run lint` | tous | Vert. |
| `npm run build` | tous | Vert. |
| `npm run e2e` (au moins un smoke `vestiaire.spec.ts`) | e2e | Vert — confirme que le Vestiaire charge, le toggle push s'affiche, pas de régression navigation. |

**Cas de test unitaires (L4) :** aucun nouveau test. La vérification « le workflow GHA est bien supprimé et n'est plus appelé » se fait manuellement.

**Vérifications humaines (L4) :**

- [ ] `git status` confirme le fichier `.github/workflows/push-reminders-cron.yml` supprimé (staged deletion).
- [ ] Onglet GitHub du repo → Actions → « Push reminders cron » n'est plus listé comme workflow actif. Les runs historiques restent visibles (historique GitHub, pas d'effacement possible), mais le workflow est marqué « disabled inactivity » dans les semaines qui suivent.
- [ ] Recherche grep dans le repo : `Grep "CRON_SECRET"` ne renvoie plus aucun fichier tracker (`.ts`/`.tsx`/`.yml`/`.md` hors `.env.local` et historique git). Vérifier via :
  ```bash
  rg "CRON_SECRET" --glob '!{.env.local,.env.*.local,CHANGELOG.md,docs/superpowers/**}'
  ```
  Attendu : 0 match (ou uniquement ce plan lui-même dans `docs/superpowers/plans/`).
- [ ] Relecture `CLAUDE.md § Cron push` : le paragraphe décrit bien Inngest, pas GHA. Pas de mentions résiduelles « GitHub Actions » dans ce paragraphe.
- [ ] Relecture `CHANGELOG.md` : une ligne sous `[Unreleased]`, format identique aux lignes voisines.
- [ ] Relecture spec US-11 : la section `## Refactor Inngest` est concise (max 15 lignes), pointe vers ce plan en lien relatif.

**Pièges spécifiques (L4) :**

- **Ne pas supprimer `CRON_SECRET` dans `.env.local`** : la var peut rester — elle n'est plus lue par personne mais la retirer maintenant créerait une concentration cognitive inutile (l'opérateur peut la nettoyer au prochain ménage). La retirer de `.env.example` suffit à indiquer « plus nécessaire ».
- **CLAUDE.md § Cron push — collision de section** : si entretemps un autre PR a déjà touché ce paragraphe, faire un `git diff main -- CLAUDE.md` avant de commit pour s'assurer qu'on ne rés奥特 pas un conflit silencieux (un commit collateral d'un autre sprint peut avoir enrichi le paragraphe). Si divergence : merger d'abord main, puis re-patcher.
- **`CHANGELOG.md` format** : cf. `CLAUDE.md § Changelog` — format `XX.YY.ZZ`, mais une ligne sous `[Unreleased]` avant release, pas de numéro de version. Vérifier l'alinéa courant dans `CHANGELOG.md` avant de pousser (un autre PR en sprint parallèle a pu y mettre une autre ligne — rebase géré PR par PR).
- **Ne pas toucher à `docs/superpowers/plans/2026-07-22-us11-push.md`**(le plan original US-11) : il est historique, il décrit ce qui a été livré à l'époque. Le linker depuis la nouvelle section de la spec suffit ; le modifier transformerait un plan livré en plan rétroactif, ce n'est pas une bonne pratique de traçabilité.

**Critère « lot L4 terminé » :** workflow GHA supprimé + grep `CRON_SECRET` vide + `CLAUDE.md` et `CHANGELOG.md` à jour + commit renseigné.

- [ ] L4 terminé (commit SHA: ______)

---

## PR1 — Critère de merge global (L0 + L1 + L2 + L4)

Avant d'ouvrir PR1, **toutes** les vérifications suivantes doivent être vertes :

- [ ] `npm run lint` ✓ vert
- [ ] `npm test` ✓ vert (T1.1 à T1.5 + T2.1 à T2.3 + tous les tests préexistants non régressés)
- [ ] `npx tsc --noEmit` ✓ vert
- [ ] `npm run build` ✓ vert
- [ ] `npm run e2e` ✓ vert (smoke Vestiaire minimum)
- [ ] `npx supabase migration list --linked` ✓ pas d'écart Local/Remote
- [ ] Dashboard Inngest (dev ou prod staging) : schedules per-user créés après visite Vestiaire, event `send-reminder` déclenchable
- [ ] Notification push arrive sur un device de test après déclenchement manuel
- [ ] Workflow GHA `.github/workflows/push-reminders-cron.yml` n'est plus listé comme actif sur GitHub
- [ ] Ouvrir PR1 `feat/push-inngest-refactor` → base `main` (cf. § Branches ci-dessous), décrire les 4 lots et les identifiants de test.

**Branche PR1 :** `feat/push-inngest-refactor` (convention `feat/us-XX-nom-feature` relaxationnée — pas d'US-XX là, c'est un refactor transverse à 2 issues ; suivre le pattern `feat/<sujet>-<sujet>` déjà vu dans le repo, ex. `fix/103-backlink-sous-pages-vestiaire`).

---

### Lot L3 — Fix #102 : PushReminderToggle lit l'état réel au mount/focus + 2e clic no-op

> **Positionné en PR2 (et non en PR1)** : le fix du toggle UI est indépendant du backend Inngest ; il peut être porté par une autre session en parallèle de L0/L1/L2/L4. Toutefois le séquencé par lots place L3 en PR2 pour qu'un revert éventuel de PR1 ne déporte pas le fix utilisateur.

**Objectif :** corriger l'issue #102 — le bouton notifications n'a pas de mémoire (revient toujours sur « Activer » après navigation) et génère une erreur au 2e clic rapide. La cause racine est double :
1. Le composant ne reçoit `hasSubscription` qu'au mount serveur, et ne le rafraîchit **jamais** côté client après navigation `BackLink`-style ou `window.focus`.
2. Au 2e clic, `activate()` ré-appelle `registration.pushManager.subscribe()` qui échoue (le navigateur refuse une re-subscription sur un endpoint déjà actif), et l'erreur remonte dans l'UI.

**Fichiers touchés :**

| Fichier | Action | LOC net | Description |
|---|---|---:|---|
| `components/qg/PushReminderToggle.tsx` | Modifié | +60 | (a) `useEffect` au mount + `window.addEventListener("focus", …)` qui rappellent `registration.pushManager.getSubscription()` et mettent à jour un state local `pushSubscription: PushSubscription \| null` (la DB reste source de vérité côté serveur ; le state local est pour la coherence UI immédiate). (b) `computeStatus` prend désormais `(hasSubscription, pushSubscription)` — retourne `"on"` si l'un OU l'autre est truthy (couvre le cas « DB pas encore au courant mais le navigateur a déjà souscrit »). (c) `activate()` commence par `const existing = await registration.pushManager.getSubscription();` — si `existing` est non nul, **no-op + setStatus("on")** sans ré-appeler `subscribe()`. (d) Lecture `Notification.permission` au mount. (e) `deactivate()` garde son comportement courant. (f) Remove du hack `prevHasSubscription` pattern (remplacé par `useEffect` qui read le state réel navigateur). |
| `components/qg/PushReminderToggle.test.tsx` | Créé | +30 | Test composant jsdom. Mock `Notification`, `navigator.serviceWorker.ready`, `pushManager.subscribe`/`getSubscription`. `afterEach(cleanup)`. Tests listés ci-dessous. |

**Net LOC :** +60 (composant) + +30 (test).

**Commandes de test à lancer (L3) :**

| Commande | Fichier(s) couvert(s) | Attendu |
|---|---|---|
| `npm test -- components/qg/PushReminderToggle.test.tsx` | PushReminderToggle.tsx | T3.1 à T3.4 verts. |
| `npm test` | tous | Vert non régressé. |
| `npx tsc --noEmit` | tous | Vert. |
| `npm run lint` | tous | Vert. |
| `npm run build` | tous | Vert. |

**Cas de test critiques (L3) — pattern jsdom conforme `hooks/useFocusTrap.test.tsx`** :

En-tête de fichier :
```ts
// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import PushReminderToggle from "./PushReminderToggle";
```

Mocks à instaurer (beforeEach) :
```ts
vi.stubGlobal("Notification", {
  permission: "default",
  requestPermission: vi.fn().mockResolvedValue("granted"),
});
vi.stubGlobal("navigator", {
  ...navigator,
  serviceWorker: {
    ready: Promise.resolve({
      pushManager: {
        subscribe: vi.fn().mockResolvedValue({ endpoint: "https://push.test/u1", toJSON: () => ({ endpoint: "https://push.test/u1", keys: { p256dh: "p", auth: "a" } }) }),
        getSubscription: vi.fn().mockResolvedValue(null),
      },
    }),
  },
});
vi.mock("@/app/actions/push", () => ({
  subscribeToPush: vi.fn().mockResolvedValue({ error: null }),
  unsubscribeFromPush: vi.fn().mockResolvedValue({ error: null }),
}));
```

Tests à écrire (TDD) :

- **T3.1 (cas critique obligatoire — couvre issue #102 point 2)** — `au 2e clic 'Activer' très rapide, si getSubscription() existe déjà, on ne réappelle pas pushManager.subscribe() — pas d'erreur affichée`
  - Setup : `getSubscription` mocké pour renvoyer un subscription non-null **dès le 1er appel**.
  - Sans fix : le 1er clic appellerait `subscribe()` qui échouerait en production (le navigateur renvoie une erreur car déjà subscribed).
  - Avec fix : `activate()` voit `existing` non-null, ne call pas `subscribe()`, passe `status` à `"on"`, n'affiche pas d'erreur.
  - Assertions : `screen.getByText(/Désactiver/)` visible ; `subscribe` mock **not called** ; `subscribeToPush` server action **not called** (pas de round-trip serveur non plus — la DB est déjà à jour, l'event est no-op).
- **T3.2** — `au mount, lit Notification.permission et la subscription push courante (getSubscription non null) → affiche 'Désactiver' même si prop hasSubscription=false`
  - Setup : `Notification.permission = "granted"` + `getSubscription` mocké non-null + prop `hasSubscription={false}` (simule la DB pas encore synchronisée).
  - Assertions : bouton libellé « Désactiver », pas « Activer ».
- **T3.3** — `Notification.permission === "denied" → bouton désactivé + helper text visible`
  - Setup : `Notification.permission = "denied"`.
  - Assertions : bouton portant « Bloqué par le navigateur » + `disabled` ; paragraphe d'aide « Autorise les notifications dans les réglages » visible.
- **T3.4** — `window.focus re-lit getSubscription et met à jour le statut`
  - Setup : mount avec `getSubscription = null` (statut « off »). Puis change le mock pour renvoyer un subscription. Déclenche `window.dispatchEvent(new Event("focus"))`.
  - Assertions : après `waitFor`, bouton libellé « Désactiver ».

**Vérifications humaines (L3) — plan de test de l'issue #102 reproduit tel quel :**

- [ ] Activer notifs → quitter la page (`BackLink` vers Le Vestiaire depuis une sous-page, ou `BottomNav` vers l'Arène) → revenir au Vestiaire : bouton affiche bien « Désactiver », pas « Activer ».
- [ ] Cliquer le bouton 2x très vite (jamais `disabled` entre les deux) → aucune erreur affichée, 2e appel est no-op (pas de toast / pas d'appel réseau visible dans DevTools → onglet Network).
- [ ] Désactiver les notifications dans les réglages du navigateur (`chrome://settings/content/notifications`) → revenir au Vestiaire → l'UI reflète le statut bloqué (« Bloqué par le navigateur » + helper text).
- [ ] Désactiver le toggle (clic sur « Désactiver ») → vérifier dans DevTools → Application → Service Workers → Push subscriptions : la subscription est nettoyée côté navigateur (`unsubscribe()` called) ET la ligne DB est supprimée (vérifier via `supabase` query ou via l'absence de notif push au prochain déclenchement Inngest).

**Pièges spécifiques (L3) :**

- **`react-hooks/set-state-in-effect`** : le composant original utilisait un `if hasSubscription !== prevHasSubscription` inline dans le render pour éviter le pattern. Notre refactor réintroduit `useEffect` — **c'est OK** car le state se rebaseline sur l'état navigateur (pas sur une prop serveur), et le lint règle du repo autorise `useEffect` quand les deps sont exhaustives. Si lint refuse, ajouter `// eslint-disable-next-line react-hooks/set-state-in-effect` avec un commentaire justificatif renvoyant à ce plan.
- **Nettoyage du listener `window.focus`** : pense à `return () => { window.removeEventListener("focus", handler); }` dans le `useEffect`, sinon le handler persiste après démontage du composant → fuite.
- **`act()` wrapping pour `dispatchEvent`** : dans le test T3.4, wrapper `window.dispatchEvent(new Event("focus"))` dans `act(async () => {...})` pour éviter le warning React sur les mises à jour en dehors de `act`. Si warning persiste, `await waitFor` est l'alternative.
- **Notify API absent en jsdom** : jsdom ne fournit pas `Notification` par défaut ; il faut `vi.stubGlobal("Notification", ...)` (cf. mocks ci-dessus) — sinon `readNotificationPermission` renvoie `"unsupported"` silencieusement et tous les tests échouent avec un statut `unsupported` au lieu du statut attendu.
- **`ServiceWorkerRegistration.pushManager` absent en jsdom** : jsdom ne stub pas `navigator.serviceWorker`. Le stub global dans `beforeEach` est obligatoire ; aucun moyen de contourner. Garder le mock fidèle au type `PushManager` standard (sinon TS strict échoue au type-check).
- **Ne pas mocker via `jest.mock`** : ce repo utilise Vitest, pas Jest. Toujours `vi.mock` / `vi.fn` / `vi.stubGlobal` / `vi.hoisted`. Aucun import depuis `@jest/*` ne doit apparaître.
- **Import relatif depuis le test** : `import PushReminderToggle from "./PushReminderToggle"` — OK car le test est à côté du composant. Tout autre import de mocks (actions push, lib pwa) peut utiliser `@/` car alias résolu par `vitest.config.ts` (vrai maintenant, contraire à l'ancienne note CLAUDE.md — cf. § « Contexte à relire »).

**Critère « lot L3 terminé » :** T3.1 à T3.4 verts + 4 vérifications humaines de l'issue #102 cochées + commit renseigné.

- [ ] L3 terminé (commit SHA: ______)

---

### Lot L5 — Préparation #114 : migration DB `reminder_offset_minutes` + helper `scheduleDeadlineReminder` + stub

> **Positionné en PR2 (avec L3)** : préparation structurante pour #114, pas d'implémentation complète des notifications de deadline (les lots 1-4 de #114 restent l'objet de #114 elle-même). L5 pose uniquement la fondation DB (colonne `reminder_offset_minutes`) et un helper stub `scheduleDeadlineReminder` qui lira cette colonne — l'instrumentation réelle (UI Vestiaire de réglage, cron per-task déclenché `deadline - offset`) est **hors scope L5**.

**Objectif :** faire atterrir la colonne `profiles.reminder_offset_minutes` (nullable, défaut `30`, check `>= 0 AND <= 240`) en DB Supabase + exposer un helper `scheduleDeadlineReminder(profileId, taskWithDeadline, offsetMinutes)` qui pour l'instant log-only / no-op côté Inngest mais type correct et testé unitairement. Quand #114 activera ses lots 1-4, ils consommeront ce helper directement.

**Fichiers touchés :**

| Fichier | Action | LOC net | Description |
|---|---|---:|---|
| `supabase/migrations/20260728110000_add_profiles_reminder_offset_minutes.sql` | Créé | +20 | `alter table public.profiles add column if not exists reminder_offset_minutes int check (reminder_offset_minutes is null or (reminder_offset_minutes between 0 and 240));` + `comment on column public.profiles.reminder_offset_minutes is 'US-114 : offset en minutes avant deadline pour déclencher une notif (par défaut 30, nullable = désactivé). Configurable au Vestiaire par l''utilisateur.';` + `update public.profiles set reminder_offset_minutes = 30 where reminder_offset_minutes is null;` (backfill des profils existants) + `alter table public.profiles alter column reminder_offset_minutes set default 30;` (défaut pour les nouveaux profils). Aucune policy UPDATE/DELETE ajoutée (RG-04 inchangé). |
| `types/index.ts` | Modifié | +1 | Ajoute `reminder_offset_minutes: number \| null;` au type `Profile` (après `last_reminder_sent_on`). Valeur lue depuis Supabase (déjà SQL→TS mappée par le client auto). |
| `lib/inngest/scheduling.ts` | Modifié | +25 | Ajoute `buildDeadlineReminderCron(deadlineIso: string, offsetMinutes: number, timezone: string): { cron: string; at: Date }` (fonction pure — calcule l'instant `deadline - offset` et renvoie un cron one-shot exprimé en UTC : `"M H D M *"` avec month/day extraits de l'instant local calculé). Le cron one-shot est consommé en L5 par `scheduleDeadlineReminder` qui appelle `inngest.schedules.create` (stub). En L5 ce helper peut rester **no-op / log** côté Inngest — l'important est le contrat type. |
| `lib/inngest/scheduling.test.ts` | Modifié | +40 | Tests : (a) `buildDeadlineReminderCron("2026-07-30T15:30:00.000Z", 30, "Europe/Paris")` → renvoie un cron pour `2026-07-30T15:00:00.000Z` (deadline à 17h30 Paris, offset 30min → 17h00 Paris = 15:00 UTC). (b) `buildDeadlineReminderCron` avec offset 0 → instant = deadline exact. (c) `buildDeadlineReminderCron` avec offset dépassant la deadline (240min pour deadline dans 1h) → renvoie un cron dans le passé (accepté — Inngest schedule dans le passé est immédiatement déclenché une fois, comportement OK). (d) `scheduleDeadlineReminder` appelle mock `inngest.schedules.create` avec `external_id = "reminder-deadline-<taskId>"` (idempotence par tâche, pas par user). |

**Net LOC :** +20 (migration) + +1 (types) + +25 (helper) + +40 (test) = +86.

**Commandes de test à lancer (L5) :**

| Commande | Fichier(s) couvert(s) | Attendu |
|---|---|---|
| `npm test -- lib/inngest/scheduling.test.ts` | scheduling.ts | T5.1 à T5.4 verts. |
| `npm test` | tous | Vert non régressé. |
| `npx tsc --noEmit` | tous | Vert — le nouveau type `reminder_offset_minutes` est cohérent avec les usages (lecture dans `lib/inngest/scheduling.ts` via profile type, mais aucune écriture UI en L5). |
| `npm run lint` | tous | Vert. |
| `npm run build` | tous | Vert. |
| `npx supabase migration list --linked` | DB | Migration `20260728110000` vue en Local, pas encore en Remote. On NE pousse PAS la migration directement en L5 — c'est le déploiement Vercel/Supabase qui l'appliquera. Mais le `migration list` doit afficher l'écart (Local: pending, Remote: absent) — normal à ce stade. |
| `npx supabase db push --linked` (manuel, opérateur) | DB | À exécuter avant merge PR2 par l'opérateur, contre le Supabase lié au projet dev. Vérifier que `reminder_offset_minutes` apparaît dans la table `profiles` avec `default 30` et `check` visible dans `\d+ profiles`. |

**Cas de test critiques (L5) :**

- **T5.1** — `buildDeadlineReminderCron calcule l'instant deadline - offset en UTC pour Europe/Paris`
  - `vi.setSystemTime(new Date("2026-07-30T15:30:00.000Z"))` ; appel `buildDeadlineReminderCron(new Date("2026-07-30T15:30:00.000Z"), 30, "Europe/Paris")`.
  - Assertion : l'`at` renvoyé = `new Date("2026-07-30T15:00:00.000Z")` (17h30 Paris − 30min = 17h00 Paris = 15h00 UTC, en été CEST = UTC+2).
- **T5.2** — `offset 0 renvoie l'instant de la deadline`
  - Assertion : `at.getTime() === deadline.getTime()`.
- **T5.3** — `offset supérieur à la lead time passe l'instant dans le passé (cron one-shot immédiat)`
  - Setup : `now = deadline` ; offset = 60.
  - Assertion : `at.getTime() < now.getTime()` (c'est OK — Inngest déclenche immédiatement un schedule dans le passé, pas d'erreur).
- **T5.4** — `scheduleDeadlineReminder appelle inngest.schedules.create avec external_id stable par task`
  - Mock : `inngestMock.schedules.create` vide.
  - Appel : `scheduleDeadlineReminder("u1", { id: "t1", deadline_at: "2026-07-30T15:30:00.000Z" }, 30, "Europe/Paris")`.
  - Assertion : `inngestMock.schedules.create` called once avec `{ external_id: "reminder-deadline-t1", cron: "0 15 30 7 *", data: { profileId: "u1", taskId: "t1" } }`. Le `cron` one-shot `(M H D M *)` est dérivé de l'`at` calculé.

**Vérifications humaines (L5) :**

- [ ] Lancer `npx supabase db push --linked` (sur Supabase dev lié, pas prod) → migration appliquée.
- [ ] Inspecter `\d+ profiles` dans le Studio Supabase : colonne `reminder_offset_minutes int8` (ou `int4`), `nullable YES`, `default 30`, `check (reminder_offset_minutes is null or (reminder_offset_minutes between 0 and 240))`.
- [ ] Lancer un query `select id, reminder_offset_minutes from profiles limit 5` → tous les profils existants ont `30` (backfill OK).
- [ ] Aucun changement visible dans l'UI (L5 ne modifie pas le Vestiaire). C'est attendu.

**Pièges spécifiques (L5) :**

- **Timestamp migration** : `20260728110000` — strictement postérieur à `20260728100000` (dernière migration existante sur `main` au 2026-07-28). Si une PR en parallèle a déjà créé `20260728100000` ou postérieur entre la rédaction de ce plan et l'exécution L5, **bump le timestamp à `20260728120000` ou plus** (regarder la dernière avant de poser le fichier — cf. piège CLAUDE.md « Migrations Supabase hors-ordre »). Ne pas toper le timestamp à la date de merge — topé à la date de **création du fichier**.
- **`update … where null` avant `set default`** : ordre important — d'abord backfill, **ensuite** pose le défaut. Sinon le DEFAULT se substitue à l'absence de valeur au moment du `UPDATE` (Postgres ignore le DEFAULT sur UPDATE explicite, mais l'ordre garantit la cohérence humaine).
- **`reminder_offset_minutes` nullable** : `null` = utilisateur n'a pas encore configuré le feature (UI #114 à venir) ; `30` est la valeur par défaut (cf. demande lot 1 issue #114 : « notif 30min avant la deadline »).
- **`buildDeadlineReminderCron` DST-aware** : doit utiliser `deadlineIso` existant du repo (lib/game-engine) pour la conversion — déjà DST-aware via itération à point fixe. Ne pas ré-inventer l'offset DST à la main. Réutiliser le helper.
- **Cron one-shot `"M H D M *"`** : jour de la semaine `*` ; jour du mois et mois extraits de l'instant `at` UTC. Inngest honore un schedule one-shot via une cron expr avec un joker jour-semaine — le schedule ne se déclenchera qu'une fois à `at` puis sera marqué terminé (ne repasse pas le mois suivant car le mois ne matchera plus ensuite — vérifier dans la doc Inngest au moment du lot ; si Inngest ne supporte pas les cron one-shot nativement, fallback = créer le schedule avec `cron = "<at UTC>"` et `ends_at = <at>` — workaround acceptable).
- **Helper stub `scheduleDeadlineReminder`** : en L5, le helper peut se contenter d'un **console.log de debug + appel à `inngest.schedules.create` mocké**. Pas d'UIWire-up. C'est laissons #114 orchestrer la consommation. Le test L5 vérifie le contrat type et la signature — pas le comportement réel (qui doit attendre les futurs lots #114 avec UI Vestiaire de réglage de l'offset).

**Critère « lot L5 terminé » :** T5.1 à T5.4 verts + migration DB appliquée sur Supabase dev + `npm run build` vert + commit renseigné.

- [ ] L5 terminé (commit SHA: ______)

---

## PR2 — Critère de merge global (L3 + L5)

Avant d'ouvrir PR2, **toutes** les vérifications suivantes doivent être vertes :

- [ ] `npm run lint` ✓ vert
- [ ] `npm test` ✓ vert (T3.1 à T3.4 + T5.1 à T5.4 + non régression)
- [ ] `npx tsc --noEmit` ✓ vert
- [ ] `npm run build` ✓ vert
- [ ] `npm run e2e` ✓ vert (smoke Vestiaire + toggle push)
- [ ] `npx supabase db push --linked` ✓ migration `reminder_offset_minutes` appliquée
- [ ] Plan de test de l'issue #102 reproduit (4 vérifications humaines cochées)
- [ ] Migration L5 visible dans `npx supabase migration list --linked` (Remote: applied)
- [ ] Ouvrir PR2 `feat/102-push-toggle-fix` → base `main`, décrire le fix #102 et la préparation #114.

**Branche PR2 :** `feat/102-push-toggle-fix` (convention `feat/us-XX-nom-feature` ; ici `102` est l'issue number, pas une US). Alternative : `feat/102-114-push-deadline-prep` si on préfère refléter les deux issues.

---

## 🧪 Stratégie de tests

### A. Philosophie de test

- **TDD strict** : tout nouveau module `lib/**` ou `lib/inngest/**` (fonctions pures) est testé d'abord par Vitest. Cycle : écriture du test → rouge (`Cannot find module` ou assertion échoue) → implémentation minimale → vert → refactor (renommage / extraction / stable) → commit.
- **Pas de tests e2e nouveaux pour la notif push proprement dite** : l'API navigateur Web Push n'est pas fiable en headless (Playwright ne supporte pas `pushManager.subscribe` dans Chromium piloté) et l'envoi réel dépend d'un vrai service push (VAPID + endpoint FCM/APM). Cette exclusion est **déjà documentée** dans la spec US-11 d'origine (`docs/superpowers/specs/2026-07-22-us11-push-design.md` § Tests). On ne révoque pas cette décision.
- **Tests de composant jsdom pour `PushReminderToggle` (L3)** — pattern existant `hooks/useFocusTrap.test.tsx` comme référence : en-tête `// @vitest-environment jsdom`, imports `@testing-library/react`, `afterEach(cleanup)`, mocks via `vi.stubGlobal` pour `Notification` et `navigator.serviceWorker`.
- **Pas de test d'intégration avec Inngest cloud réel** : Inngest est un service externe de scheduling. La保管 d'intégration se fait manuellement via le dev server (vérifs humaines L1/L2), pas via un test automatisé qui déclencherait un event sur le cloud Inngest — trop flaky, dépendante de quota, latence réseau inacceptable pour `npm test`. Les fonctions Inngest sont rendues testables par extraction de la logique pure dans `lib/inngest/scheduling.ts` (fonctions pures sur Date / string / maps) et `lib/inngest/functions/send-reminder.ts` (orchestration mockable — client Supabase `createClient` mocké via `FakeSupabaseClient`, `web-push` mocké via `vi.hoisted`, `inngest` client mocké via `vi.hoisted` + `vi.mock("@/lib/inngest/client", ...)`).

### B. Conventions Vitest existantes à respecter

Référence permanence : [vitest.config.ts](../../vitest.config.ts).

| Convention | Fichier de référence | Notes / particularités |
|---|---|---|
| **Environment** : `node` par défaut, `// @vitest-environment jsdom` en en-tête pour composants React | `hooks/useFocusTrap.test.tsx:1`, `vitest.config.ts:11` | Le `environment: "node"` est global dans `vitest.config.ts`. Un override local par en-tête de fichier est obligatoire pour tout test composant React qui monté des refs DOM. |
| **Alias `@/`** : résolu par `vitest.config.ts` L6-9 via `resolve.alias` | `vitest.config.ts:6-9` | CONTRAIRE à l'ancienne note CLAUDE.md § « Piège Vitest » qui disait « pas de résolution d'alias `@/` ». C'EST résolu. La seule restriction résiduelle : les fichiers chargés directement par tests (config, import de modules path-relatif) restent en import relatif entre eux quand ils s'importent mutuellement — ce n'est pas le `@/` qui est en cause mais la cohérence intra-`lib/` pour le chaînage. |
| **Mock Supabase** : `FakeQueryBuilder` (thenable via `PromiseLike<{ data, error }>`) + `FakeSupabaseClient` + `vi.mock("@supabase/supabase-js", ...)` | `app/api/cron/push-reminders/route.test.ts:20-92` | À reprendre pour `lib/inngest/functions/send-reminder.test.ts` (L1). Si possible, **extraire le helper** dans `lib/inngest/__fixtures__/FakeSupabase.ts` (nouveau dossier) et l'importer depuis les deux tests — éviter la duplication. Sinon, recopier tel quel (le pattern est ~70 lignes, acceptables comme dette temporaire si l'extraction casse les aliases). |
| **Mock web-push** : `vi.hoisted(() => ({ sendNotificationMock: vi.fn(), setVapidDetailsMock: vi.fn() }))` + `vi.mock("web-push", () => ({ default: { setVapidDetails: ..., sendNotification: ... } }))` | `app/api/cron/push-reminders/route.test.ts:3-13` | Pattern exact à reprendre dans `send-reminder.test.ts`. `sendNotification` est mocké rejetions pour les cas 410/404 (`mockRejectedValueOnce({ statusCode: 410 })`). |
| **Mock Inngest SDK** (nouveau, introduit en L1) | (à créer) | Pattern à suivre : `vi.hoisted(() => ({ sendMock: vi.fn(), schedulesCreateMock: vi.fn(), schedulesDeleteMock: vi.fn(), schedulesListMock: vi.fn() }))` puis `vi.mock("@/lib/inngest/client", () => ({ inngest: { send: sendMock, schedules: { create: schedulesCreateMock, delete: schedulesDeleteMock, list: schedulesListMock } } }))`. Garder la même philosophie que web-push : mock au niveau module, reset dans `beforeEach`. **Attention** : on mock `lib/inngest/client` (notre wrapper), pas le package npm `inngest` directement — séparation des responsabilités. |
| **Stub env** : `vi.stubEnv("INNGEST_SIGNING_KEY", "test-key")` etc. | `app/api/cron/push-reminders/route.test.ts:111-118` (`stubEnv`) | Pattern `@supabase/supabase-js` agrège 5 stubs : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PRIVATE_KEY_SUPABASE`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. Pour Inngest, ajouter : `INNGEST_SIGNING_KEY`, `INNGEST_EVENT_KEY`, `INNGEST_APP_ID`. `vi.unstubAllEnvs()` dans `afterEach`. |
| **Fake timers** : `vi.useFakeTimers()` + `vi.setSystemTime(new Date(...))` | `app/api/cron/push-reminders/route.test.ts:120-122` (NOW_1730_PARIS) ; `lib/push-eligibility.test.ts:27` | Réutiliser la constante `NOW_1730_PARIS = new Date("2026-07-22T15:30:00.000Z")` (17h30 Paris en été, CEST UTC+2). Pour L5, fixer un autre instant (cas deadline) — `new Date("2026-07-30T15:30:00.000Z")` dans `scheduling.test.ts`. |
| **Cleanup** : `afterEach(() => { cleanup })` pour tests composants | `hooks/useFocusTrap.test.tsx:8` | Strict pour tous les tests sous `// @vitest-environment jsdom`. Sans cleanup, le DOM persiste entre tests et provoque `found multiple elements` intermittents. |
| **Pas d'exception ESLint pour les tests** | `CLAUDE.md` § Règles de code + § TypeScript Strict | `any` interdit y compris dans les tests. Mocker typé via `vi.hoisted<>` (générique) ou interfaces explicites. |

### C. Matrice de tests par lot

Format : `T<lot>.<n°>` pour référence stable dans les commits.

| Lot | Fichier test | `describe` / `test` principal | Fixtures / factories | Mocks requis | Commande de lancement | Cas couverts |
|---|---|---|---|---|---|---|
| **L1** | `lib/inngest/scheduling.test.ts` | `describe("buildCandidatesFromDb")` / 4 tests | `makeTask`, `makeCandidate` (de `lib/push-eligibility.test.ts`) ; `NOW_1730_PARIS` | `FakeSupabaseClient` (自家) ; aucun mock push/Inngest | `npm test -- lib/inngest/scheduling.test.ts` | (a) 1 user 1 sub éligible ; (b) user sans sub ; (c) user Boss KO ; (d) user day_results existant |
| **L1** | `lib/inngest/functions/send-reminder.test.ts` | `describe("send-reminder")` / T1.1 à T1.5 | `makeTask`, `makeCandidate` ; `dbTables` local (sub, profile, tasks, day_results) | `FakeSupabaseClient` ; `web-push` via `vi.hoisted` ; `lib/inngest/client` via `vi.hoisted` + `vi.mock` ; `vi.stubEnv` Inngest+Supabase+VAPID | `npm test -- lib/inngest/functions/send-reminder.test.ts` | **T1.1** (410 → delete sub, no mark sent — reprise route.test.ts:158-171) ; **T1.2** (idempotence — même event.id, un seul envoi) ; T1.3 (envoi normal + mark sent) ; T1.4 (non éligible, no-op) ; T1.5 (404 → delete + mark sent) |
| **L2** | `lib/inngest/scheduling.test.ts` | `describe("ensureUserReminderSchedule")` / T2.1 à T2.3 | `profileId = "u1"`, `timezone = "Europe/Paris"` | `lib/inngest/client` via `vi.hoisted` (schedules.create/delete/list) | `npm test -- lib/inngest/scheduling.test.ts` | **T2.1** (create avec cron `30 17 * * *` + external_id `reminder-daily-u1`) ; **T2.2** (idempotent si schedule déjà existant) ; **T2.3** (delete par external_id) |
| **L3** | `components/qg/PushReminderToggle.test.tsx` | `describe("PushReminderToggle")` / T3.1 à T3.4 | Aucun maker — composant monté directement avec props | `Notification` via `vi.stubGlobal` ; `navigator.serviceWorker.ready.pushManager` via `vi.stubGlobal` ; `@/app/actions/push` via `vi.mock` | `npm test -- components/qg/PushReminderToggle.test.tsx` | **T3.1** (2e clic no-op — `pushManager.subscribe` not called si `getSubscription` non null) ; T3.2 (mount lit permission + getSubscription, statut `on` malgré prop `hasSubscription={false}`) ; T3.3 (denied → bouton disabled + helper text) ; T3.4 (`window.focus` re-lit getSubscription) |
| **L5** | `lib/inngest/scheduling.test.ts` | `describe("buildDeadlineReminderCron")` + `describe("scheduleDeadlineReminder")` / T5.1 à T5.4 | `deadlineIso = "2026-07-30T15:30:00.000Z"` (fuseau Paris CEST) | `lib/inngest/client` via `vi.hoisted` (schedules.create) | `npm test -- lib/inngest/scheduling.test.ts` | **T5.1** (deadline - 30min Paris → 15:00 UTC) ; T5.2 (offset 0 = deadline) ; T5.3 (offset > lead time → instant passé accepté) ; **T5.4** (`scheduleDeadlineReminder` → schedules.create avec `external_id = "reminder-deadline-<taskId>"`) |

Lots **L0 et L4 n'apportent aucun nouveau test** (cf. respectivement « glue de config » et « suppression pure »).

### D. Vérification finale globale (obligatoire avant chaque PR)

Séquence obligatoire à lancer depuis la branche de feature, dans l'ordre — toute commande rouge bloque la PR (cf. [CONTRIBUTING.md](../../CONTRIBUTING.md)) :

```bash
npm run lint        # 1. ESLint (eslint-config-next) — doit être vert
npm test            # 2. Tous les tests Vitest (nouveaux + existants non régressés) — doit être vert
npx tsc --noEmit    # 3. TypeScript strict — doit être vert
npm run build       # 4. Build Next.js 16 — doit être vert
```

Vérifications supplémentaires par lot :

- **L1 + L2** — `npx supabase migration list --linked` : pas de migration DB en L1/L2, mais à valider qu'aucune migration **précédente** n'est restée inappliquée (cf. piège CLAUDE.md § « Migrations Supabase hors-ordre »). Si écart détecté : STOP, traiter l'écart avant de pousser la PR.
- **L5** — `npx supabase db push --linked` OU `npx supabase migration up` local : vérifier que la migration `20260728110000_add_profiles_reminder_offset_minutes.sql` s'applique proprement. Le `db push` peut refuser si le timestamp est antérieur à la dernière remote (cf. piège) — dans ce cas, `--include-all` est acceptable comme exception documentée dans la section « Décisions », **mais** on préférera toujours bump le timestamp plutôt que forcer.

Vérifications **manuelles** obligatoires (ne peuvent pas être couvertes par Vitest) :

- **L1 + L2** — Lancer `npx inngest-cli@latest dev` en local. Ouvrir http://localhost:8288. Dans le dashboard UI local :
  1. Vérifier que la fonction `send-reminder` est listée comme enregistrée (onglet « Apps » → `dodojo`).
  2. Onglet « Events » → « Send event » : nom `send-reminder`, data `{ "profileId": "<ton_uid_supabase_dev_local>" }`.
  3. Vérifier côté Supabase local : la colonne `profiles.last_reminder_sent_on` passe à aujourd'hui pour ce profile_id (et la souscription `push_subscriptions` est nettoyée si mocké 410).
  4. Pour confirmer l'envoi réel : ouvrir une PWA installée (Chrome desktop, registration `serwist`) sur le device de test, avoir activé le toggle push, envoyer l'event manuellement, vérifier qu'une notif arrive. Si l'envoi échoue en local (VAPID config manquante), vérifier a minima que le step `send-push` est appelé dans le run Inngest (logs Inngest dev server).
- **L2** — Sur le dashboard Inngest, confirme qu'un schedule `reminder-daily-<uid>` apparaît avec une « next run time » alignée sur le fuseau IANA du user (modifier `profiles.timezone` à `Asia/Tokyo` dans Supabase, recharger Le Vestiaire → vérifier dans Inngest que la next run time a décalé).
- **L3** — Reproduire **exactement** le « Plan de test » de l'issue #102 (4 cases à cocher tels qu'écrits dans `gh issue view 102`) :
  - [ ] Activer notifs → quitter la page → revenir : bouton affiche « Désactiver »
  - [ ] Cliquer le bouton 2x très vite → pas d'erreur, 2e appel no-op
  - [ ] Désactiver les notifications dans les réglages navigateur → l'UI reflète le statut bloqué
  - [ ] Vérifier qu'une désinscription propre se fait quand on clique « Désactiver »
- **L4** — Vérifier que le workflow `.github/workflows/push-reminders-cron.yml` est supprimé et n'est plus listé dans GitHub Actions. Grep `CRON_SECRET` ne doit renvoyer aucun fichier tracked hors `.env.local`.

---

## 🚦 Instruction de reprise pour nouvelle session

> Si tu reprends ce plan en nouvelle session :
>
> 1. **Recalate cwd à** `C:\Users\Arnaud\Documents\Claude\Projects\TODOGaming` (ne pas supposer).
> 2. **Lit ce fichier en entier**, puis [CLAUDE.md](../../CLAUDE.md) et [CONTRIBUTING.md](../../CONTRIBUTING.md). Vérifie le §« Cron push » de CLAUDE.md dans l'état courant (peut avoir été mis à jour par un autre PR entre temps).
> 3. **`git status` + `git log --oneline -10`** pour voir où on en est vraiment. Vérifier que la branche courante correspond au lot à travailler :
>    - PR1 (L0/L1/L2/L4) → branche `feat/push-inngest-refactor`
>    - PR2 (L3/L5) → branche `feat/102-push-toggle-fix`
>    - Branche `docs/102-114-push-inngest-plan` = **ce plan** (ne code pas dessus — uniquement màj de ce doc).
> 4. **Reprends au premier lot non coché** (`[ ]` dans §« Statut global »). Lis la section « Détail lot-par-lot » correspondante en entier. Vérifie que les lots précédents sont bien committed en cherchant le SHA renseigné.
> 5. **Code en TDD** :
>    - Écris le test d'abord — observe le **rouge** (RuntimeError, `Cannot find module`, ou assertion échoue).
>    - Code le minimum pour passer au **vert**. Pas un iota de plus.
>    - **Refactorise** (renommage, extraction, optimisation) uniquement quand le vert est stable.
>    - Un test = un cas conceptuel. Pas de mega-test qui couvre 5 scenarios.
> 6. **Avant chaque commit**, relis la section « Pièges spécifiques au lot ». Les pièges listés sont **découverts** dans ce projet — pas fallback générique LLM.
> 7. **Commit message** : Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`) — cf. CLAUDE.md § Commits. Pas de ligne de corps superflu ; un résumé concis. Ex. `feat: send-reminder Inngest function avec idempotence 410 (lot L1)`.
> 8. **Après le commit du lot**, coche la case `[x]` dans §« Statut global » + renseigne le SHA + màj §« Décisions prises en cours de route » si imprévu.
> 9. **Avant d'ouvrir la PR**, exécute intégralement § D « Vérification finale globale ». Une seule commande rouge = pas de PR.
> 10. **Ne commit jamais sur `main`**. Ne force-push jamais. Pas d'amend — un commit raté se corrige par un nouveau commit.

---

## 🛣️ Décisions prises en cours de route

Tableau vide initialement — à remplir au fil de l'implémentation. **Toute** décision imprévue (changement d'API Inngest découvert en lisant la doc, valeur de version `inngest` installée, comportement ID de schedule, réponse du lint qu'on n'attendait pas, refactoring supplémentaire requis pour libérer un test) va ici.

| Date | Décision | Lot impacté | Commit SHA | Rationale |
|---|---|---|---|---|
| 2026-07-28 | Rédaction initiale du plan | — | — | Validation utilisateur Inngest vs QStash (50K exec/mois + 10 schedules illimités vs 1K msg/jour + 10 schedules max qui casserait #114). |
| 2026-07-28 | `buildReminderPayload` importé depuis `@/lib/copy/notifications` (et non `@/lib/push-copy.ts` comme le plan US-11 original le proposait) | L1 | — | Le plan US-11 n'a jamais livré `lib/push-copy.ts` — le refactor Volume Intérieur (US-49/54) a migré le contenu vers `lib/copy/notifications.ts` avec le paramètre `level`. Vérifié via `rg "buildReminderPayload"`. |
| 2026-07-28 | Dernière migration Supabase connue sur `main` : `20260728110000_add_tasks_deferred_at.sql` | L5 | — | L5 devra bump son timestamp à `20260728120000` ou plus si une autre PR mergeentre-temps. Vérifier via `Get-ChildItem supabase/migrations` avant de poser le fichier. |
| 2026-07-29 | `inngest@^4.13.0` installé (dernière version stable au moment du lot) | L0 | (L0 commit) | Plan §L0 L122 indiquait « version cible à re-vérifier au moment du LOT (`npm view inngest version`) — ne pas fixer en plan ». Résultat : 4.13.0. Pin via `^4.13.0` dans `package.json`. |
| 2026-07-29 | Route `/api/inngest` exporte `{ GET, POST, PUT }` (et non `POST` seul comme écrit plan §L0 L124) | L0 | (L0 commit) | Le SDK `inngest@4.13.0` exige ce triplet pour que le dev server Inngest puisse pinger l'endpoint en GET (handshake de sync) — signature `RequestHandler & { GET, POST, PUT }` dans `node_modules/inngest/next.d.ts`. Exposer seulement `POST` casserait le probe Inngest et le dev server ne découvrirait pas l'app. |
| 2026-07-29 | `INNGEST_APP_ID=dodojo` ajouté au `.env.example` (en plus de `SIGNING_KEY`/`EVENT_KEY` listés plan §L0 L125) | L0 | (L0 commit) | Le client `lib/inngest/client.ts` lit `process.env.INNGEST_APP_ID` avec fallback `?? "dodojo"` (prévu plan §L0 L123). Documenter cette var dans `.env.example` évite qu'un opérateur la cherche ailleurs ; `dodojo` est le défaut codé, overridable via env (utilitéandbox de connexion à un env staging Inngest avec un autre app id si besoin). |
| 2026-07-29 | `signingKey: process.env.INNGEST_SIGNING_KEY` passé explicitement au constructeur `Inngest(...)` (plan §L0 L123) — malgré l'auto-détection env du SDK | L0 | (L0 commit) | Le SDK `inngest@4.x` détecte automatiquement `process.env.INNGEST_SIGNING_KEY` (cf. `types.d.ts` : `If not provided, will search for the INNGEST_SIGNING_KEY environment variable`). C'est donc redondant — mais conforme au plan explicite et plus lisible pour un repreneur qui cherche « où la clé est lue ». Accepté. |
| | | | | |
| | | | | |

---

## 📖 Issues fermées par ce plan

- **Issue #102** — `fix(vestiaire): bouton notifications sans memoir + erreur au 2e clic` → **fermée par le lot L3** (PR2). Quatre vérifications humaines de l'issue cochées avant merge.
- **Issue #114** — `feat: ajout de notifs avant deadline tâche` → **PRÉPARATOIRE au lot 4 de l'issue**. Le lot L5 pose la fondation DB (colonne `profiles.reminder_offset_minutes`) + helper `scheduleDeadlineReminder` (stub no-op côté Inngest) + types. L'implémentation complète des lots 1-4 de #114 (UI de réglage de l'offset au Vestiaire,',

ggrégation par task, instrumentation du déclencheur `deadline - offset`) reste l'objet de #114 elle-même — non couvert par ce plan. L'issue #114 n'est **pas** fermée par ce plan ; elle est référencée en PR2 comme « préparation ».

---

## 🔗 Pièges et règles projet à respecter pendant le job

Règles **non négociables** — à relire avant chaque commit.

- **Imports** : alias `@/` OK dans les fichiers non chargés directement par Vitest (route handlers, composants React importés par leur test direct, `lib/**/*` importé via `@/` par d'autres fichiers). Pour les fichiers chargés **directement** par un test (ex. un test importe `./push-eligibility` en relatif), le test lui-même peut utiliser `@/`. **Référence piège CLAUDE.md § « Token webhook Siri »** — le piège décrit l'absence de plugin `vite-tsconfig-paths`, mais `vitest.config.ts` L6-9 ajoute effectivement l'alias `@`. Vérification à refaire en L1 : si un test casse sur `@/lib/inngest/...`, basculer en relatif et documenter dans § Décisions.
- **Commits** : Conventional Commits stricts (`feat:`, `fix:`, `chore:`, `docs:`) — cf. CLAUDE.md § Commits. Pas de scope obligatoire entre parenthèses. Une PR peut porter plusieurs commits (un par lot IDEalement).
- **Branches** :
  - `feat/push-inngest-refactor` (PR1 : L0+L1+L2+L4).
  - `feat/102-push-toggle-fix` (PR2 : L3+L5).
  - Override selon convention `feat/us-XX-nom-feature` si une US-XX est attachée — ce n'est pas le cas ici (#102 et #114 sont des issues, pas des US du `SPECS_FONCTIONNELLES.md`).
- **maxDuration Vercel Hobby** : ~10-60s pour les routes serverless (cf. doc Vercel). La fonction `send-reminder` fait 1-2 steps rapides (select DB + sendNotification + update DB), largement sous la limite. Le fan-out N users est fait par N events indépendants (Inngest gère la parallélisation), pas par une route qui boucle sur tous les users — pas de souci de timeout. Documenter dans § Décisions si une latence inattendue est observée.
- **Vercel Deployment Protection** : Hobby tier l'a **désactivé par défaut** — Inngest peut appeler `https://dodojo.vercel.app/api/inngest` sans challenge d'auth Vercel. Si l'opérateur active Deployment Protection plus tard, Inngest devra être configuré pour bypass (header `x-deployment-protection` ou pareil). **Documenter dans CLAUDE.md en L4** (note explicite §« Vercel Deployment Protection »).
- **DST (Daylight Saving Time)** : Inngest cron TZ peut se comporter capricieusement autour des transitions DST. **17h30 n'est pas une heure de transition typique** (la transition se fait à 01h00/02h00 UTC en Europe), pas d'impact pour #102. Pour #114 (deadline à n'importe quelle heure, donc potentiellement à 02h00 jour de transition), il faudra à terme un garde-fou : soit détecter les deadlines tombant dans l'heure sautée/repeatée (transitions 01h→02h pour l'été ; 02h→01h pour l'hiver), soit accepter un delta de ±1h ponctuel et le documenter. Noté dans § Décisions si livré.
- **Idempotence multi-source** : la DB reste la source de vérité via `profiles.last_reminder_sent_on` (L1, repris de la route cron actuelle). Inngest event dedup n'est qu'un **bonus** — la protection réelle est l'update DB post-sentOnce. Ne jamais retirer le check `candidate.lastReminderSentOn === today` dans `isReminderEligible` (L1, condition 3).
- **Migration DB L5** : ajouter le check `reminder_offset_minutes between 0 and 240` + contrainte `nullable` + default `30`. **JAMAIS** nommer le timestamp migration antérieur à la dernière existante sur `main` au moment de la **création du fichier** (cf. piège CLAUDE.md § « Migrations Supabase hors-ordre » ; bug prod #70 reproduit pour cause). Vérifier via `Get-ChildItem supabase/migrations` avant de poser le fichier.
- **RG-04 (pas de DELETE sur `tasks`/`profiles`/`day_results`)** : pas concerné ici — `push_subscriptions` reste l'exception avec policy DELETE (déjà en place, documenté dans spec US-11). Aucune nouvelle policy DELETE à ajouter.
- **Pas de `vercel.json`** : ne pas introduire un `vercel.json` pour configurer quoi que ce soit pour Inngest — la route `/api/inngest` est self-contained. Le repo a volontairement évité `vercel.json` jusqu'ici (CLAUDE.md § Cron push).
- **`server` vs `client` Supabase** : la fonction `send-reminder` utilise le client service-role (`createClient(url, serviceKey, { auth: { persistSession: false } })`) — pas de cookie utilisateur, l'event Inngest ne porte pas de session. Reprendre à l'identique de la route cron actuelle.
- **`change` vs `amend`** : si un commit échoue le hook pré-commit ou la CI, on crée un **nouveau commit** correctif — jamais `git commit --amend` (cf. CLAUDE.md § Workflow Git implicite ;سه Convention d'accumulation d'historique lisible).
- **Pas de emoji décoratifs dans le code** : ce document utilise des emoji dans ses en-têtes de section (⚙️ 🎯 📚 🏗️ 📋 🧪 🚦 🛣️ 📖 🔗) pour cohérence avec `docs/superpowers/plans/2026-07-22-us11-push.md` qui en utilise. Les codes, noms de variables, et messages utilisateur restent sans emoji (sauf `🔔` dans le texte UI existant, préservé).
- **Tout retour utilisateur en français** : les messages d'erreur affichés (visibles dans `PushReminderToggle.tsx` et server actions `push.ts`) restent en français, conformément à CLAUDE.md § Langue d'échange.

---

## 📐 Localisation des tests dans le repo (référence fixe)

| Fichier test | Localisation | Lot | Couverture |
|---|---|---|---|
| `lib/push-eligibility.test.ts` | existe | (L1 réutilise) | 5 conditions d'éligibilité + window TZ |
| `lib/copy/notifications.test.ts` | existe | (L1 réutilise) | buildReminderPayload + niveaux doux/direct/brut |
| `lib/inngest/scheduling.test.ts` | **nouveau** | L1 + L2 + L5 | buildCandidatesFromDb (L1) + ensureUserReminderSchedule/deleteUserProfile (L2) + buildDeadlineReminderCron/scheduleDeadlineReminder (L5) |
| `lib/inngest/functions/send-reminder.test.ts` | **nouveau** | L1 | Orchestration Inngest + web-push + DB + idempotence |
| `components/qg/PushReminderToggle.test.tsx` | **nouveau** | L3 | Mount/focus behavior + 2e clic no-op + denied/unsupported cases |

Aucun nouveau test fichier en L0 ou L4.

---

## 📦 Dépendances npm ajoutées par ce plan

| Package | Version cible (à re-vérifier) | Lot | Dev meaning |
|---|---|---|---|
| `inngest` | `^3.x` (vérifier `npm view inngest version` en L0) | L0 | Client Inngest — création d'app, fonctions, scheduling, events. Pas de peer-dep Next.js officielle — le SDK Inngest est framework-agnostic côté setup ; le package `@inngest/kit` (composants UI du dashboard) n'est pas requis pour ce job. |

Aucune suppression de dépendance. `web-push` (déjà installé, cf. plan US-11 Task 8) reste — il est consommé dans `send-reminder.ts` en L1.

---

## 🔚 Fin du plan — récap exécutif (lecture rapide reprise)

- 2 PR, 6 lots, ~+340 LOC net (hors docs), ~-316 LOC supprimés (route cron GHA + route + test).
- PR1 = L0 + L1 + L2 + L4 — pose la fondation Inngest, supprime le cron GHA, schedule per-user TZ.
- PR2 = L3 + L5 — fixe #102 au comportement attendu + prépare #114 (col DB + helper stub).
- Tests : 4 nouveaux fichiers de test (3 Vitest node + 1 Vitest jsdom), 0 nouveau e2e.
- Vérif finale obligatoire : `lint` + `test` + `tsc` + `build` + `e2e` + manuel Inngest dev server + humain plan #102.
- Source de vérité : ce document. Aucune autre note Slack / issue / PR description ne fait foi en cas de divergence.