# Plan unique — Mise en service des notifs push via Inngest (issues #102 + #114)

> Version : 2026-07-30 · **Ce fichier est le seul plan de ce job.**
> Destination dans le repo : `docs/superpowers/plans/2026-07-30-push-inngest-migration.md`
> Il **remplace intégralement** `docs/superpowers/plans/2026-07-28-push-inngest-refactor.md`. Cet ancien fichier contredit celui-ci sur l'API Inngest (il décrit une API qui n'existe pas) : **ne pas l'ouvrir, ne pas s'y référer.** Tout ce qui restait valable dedans — travail déjà livré, patterns de test, décisions prises — a été recopié ici. Son seul rôle résiduel est l'historique des SHA.

**Ordre d'exécution, en une ligne :** § 2 (règles) → § 3 (état livré) → L-0 → L1b → L2b → L3b → L4b → gate PR1 → **§ 8 recette** → L5b → L6b → gate PR2.
**Sections de référence à relire au besoin, jamais à sauter :** § 2 interdits, § 3 patterns de test, § 12 décisions déjà prises.

---

## 1. Contexte — pourquoi ce plan

### Ce qui est déjà livré et qui reste bon

Deux lots ont été livrés sur la branche `docs/102-114-push-inngest-plan`, tests verts, `tsc` vert :

- **L0** (`3b2970e`) — SDK `inngest@4.13.0` installé, `lib/inngest/client.ts`, route `app/api/inngest/route.ts`, bloc Inngest dans `.env.example`.
- **L1** (`910e9ca`) — fonction Inngest `send-reminder` + ses tests ; suppression de `app/api/cron/push-reminders/route.ts` et de son test (logique migrée, pas perdue).

Ce travail est **conservé tel quel** par ce plan. L'architecture ci-dessous le réutilise.

### Ce qui est faux dans l'ancien plan

1. **`inngest.schedules.create()` n'existe pas.** Vérifié : zéro occurrence de `schedules` dans tout `node_modules/inngest@4.13.0` (typings *et* JS). Les crons Inngest sont **statiques**, déclarés au code et synchronisés au déploiement. Les lots L2 (un schedule par utilisateur) et L5 (cron « one-shot ») de l'ancien plan sont bâtis sur cette API imaginaire. Ils sont remplacés ici par **L2b** et **L6b**.
2. **Le cron one-shot de l'ancien L5 se redéclencherait chaque année.** Une expression cron n'a pas de champ année : `"0 15 30 7 *"` repart tous les 30 juillet. L'ancien plan affirmait le contraire.
3. **Le diagnostic de #102 était supposé, pas établi.** Il affirmait que `pushManager.subscribe()` échoue sur une souscription existante — faux au regard du spec Push API : avec le même `applicationServerKey`, l'appel renvoie la souscription existante sans lever. Le correctif proposé (afficher « activé » si le navigateur **ou** la DB dit oui) masquerait l'état « souscription navigateur présente, ligne DB absente », précisément celui où l'utilisateur croit être abonné et ne reçoit rien.
4. **Rien sur la mise en service prod** : ni variables d'env Vercel, ni synchronisation de l'app Inngest, ni observabilité. Une PR verte partout et une prod muette.

### Le cadre réel, confirmé avec l'auteur du projet le 2026-07-30

**La feature push n'a jamais fonctionné en production. Pas une fois.** Ce job n'est donc pas la migration d'un mécanisme qui marche : c'est sa **première mise en service**, dont le scheduler n'est qu'un maillon.

- `gh run list --workflow=push-reminders-cron.yml` : **100 % d'échec** sur tous les runs conservés, dernier déclenchement le **2026-07-27**, logs expirés (cause exacte perdue). Les runs étaient espacés d'environ **une heure**, pas de 15 minutes : GitHub étrangle massivement les `schedule` sur un repo privé — le `*/15` du workflow n'a jamais été honoré.
- Ces échecs sont **antérieurs** à la suppression de la route par L1 : la route répondait donc déjà en erreur (401 `CRON_SECRET` ou 500 sur une variable d'env manquante, très probablement). Le manque de crédits GitHub a surtout **masqué** un problème de code ou d'environnement.
- Toute la chaîne d'US-11 est donc **non vérifiée** : clés VAPID en prod, handler `push` du service worker (`app/sw.ts:80` — code correct à la lecture, jamais exécuté en vrai), forme du payload, routage au clic, création de la ligne `push_subscriptions` par le toggle. D'où la § 8 « Recette de validation de bout en bout », qui est la vraie livraison de ce plan.
- **Supprimer le cron GHA ne présente aucun risque**, et le « rollback par revert » n'a aucune valeur : il restaurerait un mécanisme qui échouait à 100 % et dont le `schedule` ne part plus.

### Le CI ne tourne pas — la vérification locale est le seul gate

Les crédits GitHub Actions du repo sont épuisés : `ci.yml` échoue systématiquement (12 runs sur 12 depuis au moins le 2026-07-27, y compris sur `main`), et le job `E2E` est toujours `skipped` en conséquence. **C'est attendu, ce n'est pas à corriger dans ce job.**

Conséquence opérationnelle, à appliquer strictement : la règle projet « zéro merge si la CI est rouge » est remplacée, le temps que les crédits reviennent, par **« zéro merge si un des 4 contrôles locaux est rouge »** — `npm run lint`, `npm test`, `npx tsc --noEmit`, `npm run build`, plus `npm run e2e` avant chaque PR. Un CI rouge n'est **pas** un motif de STOP dans ce job ; un contrôle local rouge, si.

### Résultat attendu

Notifications push effectivement reçues sur un device réel, déclenchées par Inngest, prouvées par la recette manuelle ; cron GitHub Actions supprimé ; bug #102 fermé sur cause racine prouvée ; fondation DB de #114 posée.

---

## 2. Règles de conduite — à lire avant toute action

**Interdits absolus :**

| Interdit | Pourquoi |
|---|---|
| `inngest.schedules.create/delete/list` | N'existe pas dans le SDK. `tsc` cassera — et le contourner avec un `as any` casserait la prod. `any` est de toute façon interdit (CLAUDE.md § Règles de code). |
| Ouvrir `docs/superpowers/plans/2026-07-28-push-inngest-refactor.md` pour y chercher une consigne | Obsolète, contredit ce plan. Tout ce qui compte est ici. |
| Créer ou modifier `vercel.json` | Volontairement absent du repo (CLAUDE.md § Cron push). |
| `git commit --amend`, `git push --force`, commit direct sur `main` | CLAUDE.md § Workflow Git. Un commit raté se corrige par un nouveau commit. |
| `gh pr merge` | **Jamais sans validation explicite de l'utilisateur, à chaque fois.** Pousser la PR et la décrire : oui. La merger : demander. |
| Committer `content/guide/*` régénéré par un build **avant** d'avoir fait L-0 étape 1 | Notion est la source de vérité mais `hp.md` y est en retard : committer le pull en l'état supprimerait 2 sections publiées. Après L-0.1, committer le pull devient au contraire la bonne action. |
| Inventer une API Inngest de mémoire | Toute API non vue dans `node_modules/inngest/**/*.d.ts` ou dans la doc officielle est à considérer inexistante. |

**Gates STOP — arrête-toi et demande :**
- un des 4 contrôles locaux est rouge et la cause n'est pas évidente en 2 tentatives ;
- la doc Inngest contredit ce plan sur un point d'API ;
- `npx supabase migration list --linked` montre un écart Local/Remote **avant** tes propres changements (bug prod #70) ;
- le diagnostic de #102 (L5b) ne correspond à aucune hypothèse de la table.

**Séquence de vérification locale** (CONTRIBUTING.md), avant chaque commit de lot :
```bash
npm run lint
npm test
npx tsc --noEmit
npm run build
```
Avant chaque PR, ajouter `npm run e2e` (Playwright démarre son propre serveur de **production** ; `E2E_PORT=3001 npm run e2e` si un `next dev` occupe `:3000` ; première fois : `npx playwright install chromium`).

**Après chaque lot** : commit Conventional Commits (`feat:` / `fix:` / `chore:` / `docs:`), cocher la case + inscrire le SHA en § 4, consigner tout imprévu en § 12.

---

## 3. État livré — inventaire (pour ne rien avoir à chercher ailleurs)

### Fichiers du domaine push

| Fichier | État | Rôle |
|---|---|---|
| `lib/inngest/client.ts` | livré L0 | singleton `new Inngest({ id, eventKey, signingKey })`. `id` = `process.env.INNGEST_APP_ID ?? "dodojo"`. |
| `app/api/inngest/route.ts` | livré L0, modifié L1 | `export const { GET, POST, PUT } = serve({ client, functions })`. `runtime = "nodejs"`, `dynamic = "force-dynamic"`. |
| `lib/inngest/functions/send-reminder.ts` | livré L1 | fonction Inngest : fetch contexte → éligibilité → web-push → marquage DB. À corriger en L1b. |
| `lib/inngest/functions/send-reminder.types.ts` | livré L1 | type de l'event. À corriger en L1b. |
| `lib/inngest/scheduling.ts` | livré L1 | `buildCandidatesFromDb` (pure, testée) + `pickSubscriptionsToSend` (pure). Contient aussi `REMINDER_DAILY_CRON` / `buildDailyReminderCron`, **à supprimer** en L1b (résidus de l'API imaginaire). |
| `lib/push-eligibility.ts` | US-11, inchangé | `isWithinReminderWindow` (17h30 ±10 min, fuseau IANA), `isReminderEligible` (5 conditions), `selectReminderEligibleProfiles`. **Source de vérité de l'éligibilité — à réutiliser, jamais à réécrire.** |
| `lib/copy/notifications.ts` | US-49/54, inchangé | `buildReminderPayload(remaining, level, pickIndex?)` — 3e paramètre `(templateCount) => number`, défaut `Math.random()`. |
| `components/qg/PushReminderToggle.tsx` | US-11 | toggle du Vestiaire, objet de #102 (L5b). |
| `app/actions/push.ts` | US-11 | `subscribeToPush` (upsert `onConflict: "endpoint"`) / `unsubscribeFromPush` (delete par endpoint). **Aucun `revalidatePath`** — piste de #102. |
| `app/vestiaire/page.tsx:53-56,80` | US-11 | compte les `push_subscriptions` et passe `hasSubscription` au toggle. |
| `app/sw.ts:80` | US-11 | handler `push` → `showNotification` (titre, body, action « Plus tard ») ; `:96` handler `notificationclick`. Jamais exécuté en prod à ce jour. |
| `.github/workflows/push-reminders-cron.yml` | à supprimer (L4b) | cron GHA `*/15`, 100 % d'échec, `schedule` arrêté. |
| `app/api/cron/push-reminders/route.ts` | supprimé en L1 | **implémentation de référence de la sélection multi-utilisateurs** — récupérable par `git show 910e9ca^:app/api/cron/push-reminders/route.ts`. À relire avant d'écrire L2b. |

### Patterns de test à réutiliser (tous déjà en place)

- **`lib/inngest/functions/send-reminder.test.ts`** est le harness de référence, à étendre plutôt qu'à refaire : `FakeQueryBuilder` (thenable `PromiseLike`, supporte `select/update/delete/eq/in/limit`), `FakeSupabaseClient` via `vi.mock("@supabase/supabase-js")`, mock `web-push` via `vi.hoisted`, capture des fonctions Inngest dans `capturedFns` (le mock de `createFunction` récupère le handler en **2e** argument), `makeFakeStep()`, `invokeSendReminder(profileId, eventId)`, `stubEnv()` (8 variables : Supabase URL + `NEXT_PRIVATE_KEY_SUPABASE`, les 3 VAPID, les 3 Inngest), `vi.useFakeTimers()` + `NOW_1730_PARIS = "2026-07-22T15:30:00.000Z"`.
- **`lib/push-eligibility.test.ts`** : makers `makeTask` / `makeCandidate`.
- **Tests de composant** : patron `hooks/useFocusTrap.test.tsx` — `// @vitest-environment jsdom` en 1re ligne (l'environnement global est `node`), `@testing-library/react`, **`afterEach(cleanup)` obligatoire** (`globals: true` n'est pas activé, le cleanup automatique ne se déclenche pas).
- **Alias `@/`** : **résolu** par `vitest.config.ts` (`resolve.alias`). L'ancienne note de CLAUDE.md qui dit le contraire est périmée. Si malgré tout un import `@/` casse un test, basculer en relatif et le consigner en § 12.
- **`any` interdit y compris dans les tests** — typer les mocks explicitement.

---

## 4. Statut

- [x] **L-0** — Hygiène : Guide/Notion, rebase, dettes annexes, plan unique (SHA: `7b96e69`, `8175305`)
- [ ] **PR1 — Backend Inngest** (branche `feat/push-inngest-refactor`)
  - [x] L0 — Setup SDK + route + `.env.example` (SHA: `3b2970e`)
  - [x] L1 — Fonction `send-reminder`, route cron supprimée (SHA: `910e9ca`)
  - [ ] **L1b** — Correctifs du code L1 (SHA: ____)
  - [ ] **L2b** — Fonction cron de fan-out (SHA: ____)
  - [ ] **L3b** — Mise en service prod + observabilité (SHA: ____)
  - [ ] **L4b** — Suppression cron GHA + docs (SHA: ____)
  - [ ] **Recette de bout en bout** — 8 maillons en prod, puis notification reçue à 17h30 réel (date : ____)
- [ ] **PR2 — #102 + fondation #114** (branche `feat/102-push-toggle-fix`)
  - [ ] **L5b** — Diagnostic puis fix #102 (SHA: ____)
  - [ ] **L6b** — Migration `reminder_offset_minutes` + design note #114 (SHA: ____)

---

## 5. Architecture cible (validée contre le SDK 4.13.0)

Ce qui existe réellement et qu'on utilise :
- trigger cron **statique** : `types.d.ts:1340` (`{ cron: string }`)
- `step.sendEvent(id, payload)` : `InngestStepTools.d.ts:185` (fan-out)
- `step.run(id, fn)` : memoïsé — **seul endroit où le non-déterminisme est autorisé**
- `step.sleepUntil(id, Date)` : `InngestStepTools.d.ts:310` (pour #114, plus tard)
- `idempotency: string` (expression sur l'event) : `InngestFunction.d.ts:167`
- `onFailure`, `cancelOn` : `InngestFunction.d.ts:330,345`

```
Inngest Cloud                          Vercel (Next.js)
─────────────                          ────────────────
cron "*/15 * * * *"  ──────► reminder-fanout                     [L2b, nouveau]
                               ├─ step.run("select-eligible")
                               │    push_subscriptions + profiles + tasks + day_results
                               │    → buildCandidatesFromDb()            [livré L1]
                               │    → selectReminderEligibleProfiles()   [US-11]
                               └─ step.sendEvent("fan-out", [...])
                                    events "push/send-reminder"
                                    data: { profileId, dayKey, nowIso, variantIndex }
                                             │
                                             ▼
                                    send-reminder                        [livré L1, corrigé L1b]
                                      ├─ step.run("fetch-context")
                                      ├─ isReminderEligible(candidate, new Date(nowIso))
                                      ├─ step.run("send-push")   web-push, delete sur 404/410
                                      └─ step.run("mark-sent")   profiles.last_reminder_sent_on
```

Pourquoi ce design plutôt qu'un schedule par utilisateur :
- `*/15` couvre tous les fuseaux, y compris les offsets à :30 et :45 (Inde UTC+5:30, Népal UTC+5:45) ;
- le fuseau est relu à chaque run → un changement de `profiles.timezone` (voyage) est pris en compte gratuitement, aucun état de schedule à réconcilier ;
- **`isWithinReminderWindow` reste exactement le sélecteur prévu par US-11** — zéro changement à la logique d'éligibilité déjà testée ;
- aucun effet de bord réseau au montage du Vestiaire : pas de « migration lazy », donc pas de trou pour les abonnés qui ne reviennent jamais au Vestiaire ;
- l'implémentation de référence existe déjà : le corps de la route supprimée.

Coût : 96 runs de fan-out/jour (~2 900/mois) + 1 run `send-reminder` par utilisateur éligible et par jour. Inngest facture au **step**, pas au run — marge à recompter en L3b.

---

## 6. Lots

### L-0 — Hygiène préalable (aucune ligne de feature)

**1. Résoudre la dérive `content/guide` — Notion est la source de vérité, mais la dérive va dans les deux sens.** Le diff non committé produit par le hook `prebuild → pull:guide` n'est pas uniformément « Notion en avance » :
- `combo.md` : **Notion en avance et a raison** (fenêtre de 15 min + bonus d'XP par palier, conforme à l'issue #115 mergée sur `main`). Fichier committé périmé.
- `chasse.md`, `cloture-journee.md` : `majLe` avance dans `index.json` → Notion en avance, à prendre.
- `hp.md` : **le repo est en avance sur Notion.** Le `majLe` de `index.json` *recule* (`2026-07-27T19:30` → `2026-07-24T07:26`) et le pull fait perdre les sections « HP du Héros » et « Deux jauges, deux rôles ». Quelqu'un a édité le `.md` en direct (fallback prévu par CLAUDE.md quand `NOTION_TOKEN` manque) sans reporter dans Notion.
- `partage.md` : Notion perd un accent (« cloturant » au lieu de « clôturant ») — inacceptable en prod (CLAUDE.md § Langue).

Séquence — les 2 premiers points sont des actions opérateur dans Notion, base « Guide Dodojo », `Statut = Publié`, **sans jamais renommer un `Slug`** :
1. reporter dans la page Notion `hp` le contenu riche committé aujourd'hui (`git show HEAD:content/guide/hp.md`) ;
2. corriger « cloturant » → « clôturant » dans la page `partage` ;
3. `npm run pull:guide`, puis `git diff content/guide` : il ne doit plus rester que des mises à jour où Notion est légitimement en avance ;
4. committer dans un commit `docs:` dédié, séparé du reste du job.

Tant que le point 1 n'est pas fait : après chaque `npm run build` / `npm run e2e` (le `prebuild` re-pull à chaque fois), vérifier `git status` et faire `git restore content/guide` avant tout commit.

**2. Rebase sur `origin/main`** — 26 commits d'écart, dont `lib/game-engine.ts` (+141 LOC, combo server-authoritative) et `types/index.ts` :
```bash
git fetch origin
git switch -c feat/push-inngest-refactor    # depuis docs/102-114-push-inngest-plan
git rebase origin/main
npx tsc --noEmit && npm test
```
Les commits `3b2970e` et `910e9ca` suivent la nouvelle branche. La branche `docs/102-114-push-inngest-plan` reste en place sans y coder. Si `tsc` casse après rebase, c'est `calculateBossCurrentHp` ou `types/index.ts` qui a bougé : corriger dans le commit L1b.

**3. Dettes annexes, un commit `chore:` chacune :**
- `eslint.config.mjs` : ajouter `**/.next/**` à `globalIgnores` — aujourd'hui seul `.next/**` racine est ignoré, d'où ~658 erreurs de lint venant de `.claude/worktrees/*/.next/`. Vérifier ensuite `npm run lint` vert.
- Caractères corrompus à nettoyer : `app/api/inngest/route.ts:11` (`新品种`) et le commentaire de `lib/inngest/scheduling.ts:4-16` (supprimé de toute façon en L1b).

**4. Plan unique.** Copier ce fichier dans `docs/superpowers/plans/2026-07-30-push-inngest-migration.md` (c'est lui qu'on coche au fil des lots), puis mettre **une seule ligne** en tête de `docs/superpowers/plans/2026-07-28-push-inngest-refactor.md` :
`> ⚠️ OBSOLÈTE — remplacé intégralement par 2026-07-30-push-inngest-migration.md (l'API inngest.schedules.* décrite ici n'existe pas). Conservé pour l'historique des SHA uniquement.`
Ne pas supprimer le fichier, ne pas l'annoter section par section.

**5. Issues GitHub** (réflexe projet) : commenter #102 et #114 — plan initial remplacé, lien du nouveau plan, motif (API `schedules` inexistante).

*Critère de sortie :* rebase fait, 4 contrôles locaux verts, état de `content/guide` tranché, plan unique en place, ancien plan marqué obsolète, issues commentées.

---

### L1b — Correctifs du code L1 déjà livré

Fichiers : `lib/inngest/functions/send-reminder.ts`, `send-reminder.types.ts`, `lib/inngest/scheduling.ts`, `lib/inngest/functions/send-reminder.test.ts`.

**C1 — Non-déterminisme hors `step.run` (le plus important).** Inngest ré-exécute tout le code **hors** step à chaque tentative et ne memoïse que les steps. Aujourd'hui `send-reminder.ts:60` (`new Date()`), `:108` (`dayKey`) et `:110` (`buildReminderPayload`, dont le `pickIndex` par défaut est `Math.random()`) sont hors step : sur retry, la fenêtre horaire peut basculer et **le texte de la notification change**. Ce dernier point contredit la doctrine de stabilité des seeds de CLAUDE.md (§ Volume Intérieur).

Correctif : ces valeurs arrivent **dans l'event**, calculées une fois par le fan-out.
```ts
// send-reminder.types.ts
export interface SendReminderEvent {
  name: "push/send-reminder";
  data: {
    profileId: string;
    dayKey: string;        // jour LOCAL du profil, calculé par le fan-out
    nowIso: string;        // instant de sélection, fige la fenêtre horaire
    variantIndex: number;  // fige la variante de copy (stabilité du seed)
  };
}
```
Dans le handler : `const now = new Date(event.data.nowIso)` ; `const today = event.data.dayKey` ; `buildReminderPayload(remaining, profile.aggressivity_level, () => event.data.variantIndex)` (le 3e paramètre est `(templateCount: number) => number` ; l'index hors bornes est déjà absorbé par le `?? REMINDER_TEMPLATES[0]` existant).

**C2 — Renommer l'event `send-reminder` → `push/send-reminder`.** Préfixe de domaine, conforme aux conventions Inngest. À faire maintenant, avant qu'il existe des events en vol.

**C3 — Supprimer le `step.run("is-eligible")`** (`send-reminder.ts:103-105`) : il enveloppe une fonction pure, coûte un aller-retour et une entrée de state facturée. Appeler `isReminderEligible(candidate, now)` directement.

**C4 — Réaligner le comportement 404 sur l'ancienne route.** `send-reminder.ts:154-160` marque `last_reminder_sent_on` quand la seule souscription a répondu 404. L'ancienne route traitait 404 et 410 **à l'identique** : suppression de la souscription, marquage **seulement si** au moins un envoi a réussi. L'ancien plan disait « comportement à confirmer » et rien n'a été confirmé. Supprimer la branche `saw404` et le bloc `mark-sent-after-404` ; adapter le test T1.5 (404 → souscription supprimée, `last_reminder_sent_on` reste `null`).

**C5 — `lib/inngest/scheduling.ts`** : supprimer `REMINDER_DAILY_CRON`, `buildDailyReminderCron` et le commentaire L4-16 qui documente l'API imaginaire. Garder `buildCandidatesFromDb` et `pickSubscriptionsToSend` (utilisés, testés). La constante du cron de fan-out vivra dans le fichier de la fonction (L2b).

**C6 — Ajouter `idempotency`** sur `send-reminder` : clé dérivée de `profileId` + `dayKey`, pour qu'un double event du même jour ne parte jamais deux fois. **Vérifier la syntaxe exacte de l'expression dans la doc Inngest avant d'écrire** (le type est juste `string`). Si la syntaxe n'est pas certaine à 100 % : **ne rien mettre** et le consigner en § 12 — la protection réelle reste le check DB `lastReminderSentOn === today` de `isReminderEligible` (`lib/push-eligibility.ts:44`), qui ne doit **jamais** être retiré.

**Tests** (étendre `send-reminder.test.ts`, harness décrit en § 3) :
- adapter `invokeSendReminder` au nouveau payload (`dayKey: "2026-07-22"`, `nowIso: NOW_1730_PARIS`, `variantIndex: 0`) ;
- T1.1 (410 → delete, pas de marquage) : inchangé. T1.3 (envoi + marquage), T1.4 (non éligible) : adaptés au payload. T1.5 : **modifié** par C4 ;
- **nouveau T1.6 — déterminisme du texte** : deux invocations du même event produisent un `sendNotification` avec un body identique (assertion sur l'argument capturé).

*Critère de sortie :* `npm test -- lib/inngest` vert, 4 contrôles locaux verts. Commit `fix(push): déterminisme et alignement 404 de send-reminder (lot L1b)`.

---

### L2b — Fonction cron de fan-out

Nouveaux fichiers : `lib/inngest/functions/reminder-fanout.ts`, `lib/inngest/functions/reminder-fanout.test.ts`. Modifié : `app/api/inngest/route.ts`.

**Avant de coder** : lire `https://www.inngest.com/docs/guides/scheduled-functions` pour confirmer la syntaxe exacte du trigger cron statique, et noter au passage ce que dit la doc sur un éventuel préfixe de fuseau dans l'expression (type `TZ=Europe/Paris ...`) — **on n'en a pas besoin ici**, le cron tourne en UTC et le fuseau est géré par `isWithinReminderWindow`, mais la note ira dans CLAUDE.md en L4b. Consigner en § 12.

```ts
// lib/inngest/functions/reminder-fanout.ts
export const REMINDER_FANOUT_CRON = "*/15 * * * *"; // UTC ; couvre les offsets :00/:15/:30/:45

// ATTENTION : inngest@4.x prend DEUX arguments — la config (avec `triggers`
// dedans) puis le handler. La signature à 3 args du SDK 3.x ne compile plus
// (cf. § 12, décision du 2026-07-29).
export const reminderFanout = inngest.createFunction(
  {
    id: "reminder-fanout",
    triggers: { cron: REMINDER_FANOUT_CRON }, // forme exacte à confirmer dans la doc
    onFailure: /* cf. L3b */,
  },
  async ({ step }) => {
    const selection = await step.run("select-eligible", async () => {
      // 1. now = new Date() ICI (dans le step) → memoïsé, déterministe au retry
      // 2. requêtes service-role : push_subscriptions (toutes) → profiles des user_id trouvés
      //    → tasks + day_results sur adjacentUtcDates(now)
      //    Référence : git show 910e9ca^:app/api/cron/push-reminders/route.ts
      // 3. buildCandidatesFromDb(subs, profiles, tasks, dayResults, now)      [scheduling.ts]
      // 4. selectReminderEligibleProfiles(candidates, now)                    [push-eligibility.ts]
      // 5. retourner [{ profileId, dayKey: dayKey(now, tz), nowIso: now.toISOString(),
      //                 variantIndex }]
    });
    if (selection.length === 0) return { fanned: 0 };
    await step.sendEvent("fan-out", selection.map((s) => ({ name: "push/send-reminder", data: s })));
    return { fanned: selection.length };
  },
);
```
Contraintes non négociables :
- `now` **doit** être créé dans le `step.run`, jamais au-dessus (même piège que C1) ;
- `variantIndex` : entier **déterministe**, pas `Math.random()` — par exemple somme des codes de `profileId + dayKey` modulo un nombre ≥ 6. Un seul texte par utilisateur et par jour, stable au retry ;
- ne **pas** dupliquer `buildCandidatesFromDb` / `selectReminderEligibleProfiles` ; extraire une fonction pure supplémentaire seulement si ça facilite le test ;
- `app/api/inngest/route.ts` → `functions: [reminderFanout, sendReminder]`.

**Tests** (`reminder-fanout.test.ts`, même harness) :
- **F1** — 2 profils dont 1 seul dans la fenêtre 17h30 locale (`Europe/Paris` vs `Asia/Tokyo` à 15:30 UTC) → `step.sendEvent` reçoit **1** event, bons `profileId` et `dayKey`.
- **F2** — profil déjà notifié (`last_reminder_sent_on` = jour local) → 0 event.
- **F3** — aucun éligible → `step.sendEvent` **non appelé**, retour `{ fanned: 0 }`.
- **F4** — payload complet et typé ; deux exécutions à la même date donnent le **même** `variantIndex`.
- **F5** — profil sans souscription → exclu.

*Critère de sortie :* F1–F5 verts, 4 contrôles locaux verts, et **vérification manuelle locale** : `npx inngest-cli@latest dev` (terminal séparé) + `npm run dev` → sur http://localhost:8288 les **deux** fonctions apparaissent sous l'app `dodojo` ; déclencher `reminder-fanout` (« Invoke ») et voir le fan-out puis les runs `send-reminder`. Attention : hors du créneau 17h20–17h40 local, le run renverra `{ fanned: 0 }` — c'est normal, cf. § 8 pour le contournement. Commit `feat(push): fonction cron de fan-out des rappels (lot L2b)`.

---

### L3b — Mise en service prod + observabilité

Le lot que l'ancien plan n'avait pas. Sans lui, PR1 peut être verte partout et la prod muette.

1. **Intégration Vercel ↔ Inngest — décidée : sync automatique.** Installer l'intégration officielle Inngest depuis le Marketplace Vercel sur le projet `dodojo` (action opérateur). Elle synchronise l'app à **chaque déploiement** ; aucun sync manuel à refaire ensuite. Elle provisionne aussi `INNGEST_SIGNING_KEY` et `INNGEST_EVENT_KEY` côté Vercel : **vérifier qu'elles sont apparues** (Settings → Environment Variables) plutôt que de les saisir, et ne pas créer de doublon manuel. `INNGEST_APP_ID` reste optionnel (défaut codé `"dodojo"`).
   À consigner en § 12 : (a) chaque déploiement de **preview** se synchronise aussi et apparaît comme un environnement distinct côté Inngest — bruit attendu, à ne pas confondre avec la prod pendant la recette ; (b) le nom exact de l'app/environnement de production tel qu'affiché dans Inngest.
2. **Variables d'env de la chaîne push, en Production** — le maillon le plus suspect, vu que la feature n'a jamais fonctionné : `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `NEXT_PRIVATE_KEY_SUPABASE` (lues au runtime par `send-reminder.ts:40-53`). Si l'une manque, la fonction lève « VAPID env missing » / « Supabase env missing » ; et côté navigateur l'absence de `NEXT_PUBLIC_VAPID_PUBLIC_KEY` produit exactement le message d'erreur de #102 (`PushReminderToggle.tsx:62`). **Vérifier avant d'écrire une ligne de L5b.** La CLI Vercel n'est pas installée (`npm i -g vercel` puis `vercel env ls` si l'utilisateur la veut) ; sinon dashboard.
3. **Sécurité de l'endpoint.** `/api/inngest` est exempté de la garde de session par la règle `/api/*` de `lib/supabase/middleware.ts` (`isPublicRoute`). Sa seule protection est la vérification de signature du SDK, qui **exige `INNGEST_SIGNING_KEY` en production** — sans clé, n'importe qui peut POSTer. Case bloquante de la checklist PR1. Normalement provisionnée par l'intégration : le vérifier, pas le supposer. Note connexe : Vercel Deployment Protection est **désactivé par défaut** en palier Hobby, donc Inngest atteint l'URL sans challenge ; si elle est activée un jour, il faudra prévoir un bypass.
4. **Observabilité.** `onFailure` sur `reminder-fanout` et `send-reminder`, avec un `console.error` identifiable (visible dans les logs Vercel et le dashboard Inngest). Vérifier si le palier gratuit expose des alertes e-mail sur échec ; si oui, l'activer (opérateur) ; sinon consigner « surveillance manuelle » en § 12. **C'est précisément l'absence d'alerte qui a permis au cron GHA d'échouer 100 % du temps pendant des jours sans que personne le voie** — si le palier gratuit n'offre rien, proposer une alternative simple (relevé hebdomadaire de l'historique des runs) plutôt que de laisser le trou ouvert en silence.
5. **Chiffrage du palier.** Vérifier sur `https://www.inngest.com/pricing` les limites réelles du palier gratuit et leur unité (runs vs **steps**). Consommation : 96 runs de fan-out/jour × ~2 steps + 1 run/utilisateur éligible/jour × ~3 steps. Corriger le commentaire de `.env.example` (« 50K exec/mois + schedules illimités » : le second membre est faux) et consigner le vrai chiffre.
6. **Rollback — il n'y en a pas, l'écrire noir sur blanc.** Un `git revert` du merge de PR1 restaurerait la route et le workflow GHA, mais **ce mécanisme n'a jamais fonctionné** (100 % d'échec, `schedule` arrêté le 2026-07-27) : ce n'est pas un filet. Le seul recours en cas de panne Inngest est le **déclenchement manuel de `reminder-fanout` depuis le dashboard**. Le documenter tel quel dans CLAUDE.md en L4b, sans faire croire à un rollback qui n'existe pas.

*Critère de sortie :* les 6 points tranchés et écrits en § 12, cases opérateur cochées. Commit `chore(push): observabilité onFailure + doc de mise en service Inngest (lot L3b)`.

---

### L4b — Suppression du cron GHA + documentation

| Fichier | Action |
|---|---|
| `.github/workflows/push-reminders-cron.yml` | Supprimer (21 lignes). Zéro risque : 100 % de ses runs échouaient, son `schedule` ne part plus depuis le 2026-07-27, sa cible a disparu avec L1. |
| `app/sw.ts:78` | Commentaire périmé (« payload envoyé par `app/api/cron/push-reminders/route.ts` ») → pointer `lib/inngest/functions/send-reminder.ts`. Le handler `push` lui-même (`:80`) est correct, ne pas y toucher. |
| `.env.example` | Retirer le bloc `# Cron externe (US-11)` / `CRON_SECRET`. Corriger le commentaire Inngest (chiffres réels du palier, retirer « schedules illimités »). `CRON_SECRET` peut rester dans le `.env.local` de l'opérateur, inoffensif. |
| `lib/push-eligibility.ts:5-8` | Réécrire le commentaire de `REMINDER_WINDOW_MINUTES` : la fenêtre ±10 min n'est plus calée sur « la cadence du cron GitHub Actions » mais sur celle du cron Inngest `*/15`. **Garder la valeur 20** : avec le fan-out, cette fenêtre *est* le sélecteur des utilisateurs dus. Documenter le mode de défaillance : un retard de queue Inngest > 10 min fait sauter le rappel du jour pour les profils concernés (le lendemain repart normalement). |
| `CLAUDE.md` | Remplacer § « Cron push — GitHub Actions plutôt que Vercel Cron natif (US-11) » par une entrée Inngest : fan-out cron `*/15` + fonction par utilisateur ; **pourquoi pas de schedule par utilisateur (l'API n'existe pas)** ; sync automatique par l'intégration Vercel ; `INNGEST_SIGNING_KEY` obligatoire en prod ; absence de rollback réel ; **déterminisme obligatoire via `step.run`** (le piège C1). Ajouter une note courte : « CI GitHub Actions inopérante faute de crédits — le gate de merge est la vérification locale (`lint`, `test`, `tsc`, `build`, `e2e`) ». Mettre la date à jour en tête de fichier. |
| `CHANGELOG.md` | Une ligne sous `## [Unreleased]`, format des lignes voisines. |
| `docs/superpowers/specs/2026-07-22-us11-push-design.md` | Section `## Refactor Inngest (2026-07-30)`, ≤ 20 lignes : pointe vers ce plan, résume la décision (QStash écarté, Inngest retenu, cron statique + fan-out, pas de schedule par utilisateur). Ne pas toucher `docs/superpowers/plans/2026-07-22-us11-push.md` (plan historique livré). |

Vérifications : `git status` montre la suppression du workflow ; l'onglet Actions ne liste plus « Push reminders cron » comme actif ;
```bash
rg "CRON_SECRET" --glob '!{.env.local,.env.*.local,CHANGELOG.md,docs/superpowers/**}'
```
→ 0 résultat. Commit `feat(push): suppression du cron GitHub Actions au profit d'Inngest (lot L4b)`.

---

## 7. Gate PR1

```bash
npm run lint && npm test && npx tsc --noEmit && npm run build && npm run e2e
npx supabase migration list --linked     # aucun écart Local/Remote (aucune migration dans PR1)
git restore content/guide                # si L-0.1 n'est pas encore soldé
```
Cases humaines : les 2 fonctions visibles dans le dev server Inngest ; intégration Vercel installée et clés Inngest présentes ; `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` / `NEXT_PRIVATE_KEY_SUPABASE` présentes en Production ; absence de rollback documentée.

`gh pr create --base main --head feat/push-inngest-refactor` en décrivant les lots, les identifiants de test (T1.x, F1–F5) et le recours manuel en cas de panne. **Le CI sera rouge (crédits épuisés) : ce n'est pas un motif de blocage, mentionner dans la PR que les 5 contrôles locaux sont verts.** **Ne pas merger — demander.**

Après merge validé : dérouler la § 8. C'est la seule preuve qui compte, et la première fois que cette chaîne sera vérifiée.

---

## 8. Recette de validation de bout en bout (la vraie livraison)

Aucun maillon n'est prouvé. Cette recette les valide un par un, dans l'ordre, en s'arrêtant au premier qui casse. À dérouler d'abord en **local** (dev server Inngest), puis en **prod** après le merge de PR1.

### Piège n°1 : la fenêtre horaire bloque tout test hors 17h20–17h40

`isWithinReminderWindow` (`lib/push-eligibility.ts:23`) n'accepte que 17h30 ± 10 min **heure locale du profil**. Déclencher `reminder-fanout` à 10h du matin renvoie donc `{ fanned: 0 }`, et envoyer un event à la main est rejeté par le re-check de `isReminderEligible`. Ce n'est pas un bug : c'est le sélecteur.

**Contournement propre, sans toucher au code : déplacer le fuseau du profil de test.** Choisir un fuseau IANA sans DST dont l'heure locale vaut ~17h30 maintenant :
```
offset_cible = 17.5 − (heure UTC actuelle en décimal)
```
Exemples : 08h00 UTC → +9:30 → `Australia/Darwin` · 09h30 UTC → +8:00 → `Asia/Singapore` · 12h00 UTC → +5:30 → `Asia/Kolkata` · 14h30 UTC → +3:00 → `Africa/Nairobi` · 15h30 UTC → +2:00 → `Europe/Paris` (été).
```sql
update profiles set timezone = 'Australia/Darwin' where id = '<uid_test>';  -- avant
update profiles set timezone = 'Europe/Paris'     where id = '<uid_test>';  -- après, remettre le vrai
```
Bonus : ce détour valide la logique de fuseau, qui est le cœur de l'affaire.

### Préconditions sur le compte de test (les 5 conditions d'US-11)

Si une seule manque, le profil est exclu **silencieusement** — c'est là que le temps se perd.

| # | Condition | Vérification / remise à zéro |
|---|---|---|
| 1 | une souscription push existe | `select * from push_subscriptions where user_id = '<uid>';` → ≥ 1 ligne (sinon activer le toggle au Vestiaire, sur un device où la PWA est installée) |
| 2 | on est dans la fenêtre 17h30 locale | bascule de fuseau ci-dessus |
| 3 | pas déjà notifié aujourd'hui | `update profiles set last_reminder_sent_on = null where id = '<uid>';` |
| 4 | le Boss est vivant | ≥ 1 tâche du jour local **non cochée, non abandonnée** → `calculateBossCurrentHp > 0` |
| 5 | la journée n'est pas clôturée | `select * from day_results where user_id='<uid>' and day_date='<jour local>';` → aucune ligne (sinon choisir un autre jour ; **ne pas supprimer** la ligne, RG-04) |

### Les 8 maillons, dans l'ordre

1. **Toggle → DB.** Au Vestiaire, activer les notifications → une ligne apparaît dans `push_subscriptions`. Si une erreur s'affiche → c'est #102, aller à L5b, ne pas continuer la recette.
2. **Fonctions enregistrées.** Dashboard Inngest, environnement de production : `reminder-fanout` et `send-reminder` listées sous l'app `dodojo`. Absentes → l'intégration Vercel n'a pas synchronisé (L3b.1).
3. **Sélection.** Déclencher `reminder-fanout` (« Invoke ») → le run retourne `{ fanned: 1 }`. Si `0` → une des 5 préconditions manque ; les reprendre une par une plutôt que deviner.
4. **Fan-out.** Le run montre un `step.sendEvent` et un event `push/send-reminder` apparaît dans l'onglet Events, avec `profileId` / `dayKey` / `nowIso` / `variantIndex` renseignés.
5. **Run `send-reminder`.** Un run enfant démarre et passe `fetch-context` → `send-push` → `mark-sent`. Un échec sur « VAPID env missing » ou « Supabase env missing » = variables d'env manquantes (L3b.2) : cause la plus probable de l'échec historique.
6. **Envoi web-push accepté.** Pas de 401/403 du service push. Une 401 = paire de clés VAPID dépareillée (clé publique côté navigateur ne correspondant pas à la privée côté serveur — cas classique si les clés ont été régénérées après la première souscription) : il faut alors se désabonner/réabonner pour recréer la souscription avec la bonne clé.
7. **Notification affichée.** Le service worker (`app/sw.ts:80`) affiche « Dodojo — Le Boss t'attend » + un corps mentionnant le nombre de tâches restantes, avec l'action « Plus tard ». Rien qui s'affiche alors que l'envoi est accepté = problème côté SW (DevTools → Application → Service Workers : vérifier que la dernière version est active).
8. **Clic → app.** Le clic ouvre ou refocalise l'Arène (`/`) ; « Plus tard » referme sans ouvrir.

Puis l'effet de bord : `profiles.last_reminder_sent_on` vaut le jour local, et un second déclenchement de `reminder-fanout` renvoie `{ fanned: 0 }` (idempotence).

### Recette naturelle finale

Une fois les 8 maillons validés avec le fuseau bidouillé : remettre le vrai fuseau, remettre `last_reminder_sent_on = null`, et **attendre 17h30 heure locale réelle sans rien déclencher à la main**. La notification doit arriver seule. C'est le seul test qui prouve que le cron tourne. Consigner la date et l'heure de cette réussite en § 12 — c'est la première fois que la feature fonctionne.

Si un maillon casse : historique des runs Inngest + logs Vercel **avant** toute modification de code, et consigner le maillon fautif.

---

## 9. L5b — Diagnostic **puis** fix de #102

> Ce lot commence par une enquête, pas par du code. **N'écris aucune ligne de `PushReminderToggle.tsx` avant d'avoir coché une hypothèse.**

Branche : `git switch -c feat/102-push-toggle-fix` depuis `main` à jour (après merge de PR1).

Symptômes de #102 : (a) au retour sur le Vestiaire le bouton propose toujours « Activer » ; (b) un message d'erreur apparaît quand on clique alors que les notifs sont déjà actives.

**Étape 0 — commencer par les variables d'env Vercel, pas par le code.** L'auteur du projet n'a pas mémoire du texte de l'erreur, et la feature n'a jamais fonctionné en prod. L'hypothèse H1 (clés VAPID absentes ou dépareillées en Production) expliquerait à elle seule **les deux symptômes de #102 et l'échec historique du cron** — une seule cause pour trois observations. Elle se vérifie en 30 secondes dans le dashboard Vercel (L3b.2), sans écrire une ligne. **Faire ça d'abord.**

**Étape 1 — reproduire et capturer.** En prod (ou preview), sur le device où le bug a été vu : DevTools Console + Network ouverts, cliquer « Activer », **noter le texte exact de l'erreur**. Les 4 messages possibles sont dans `components/qg/PushReminderToggle.tsx` : « Rappels indisponibles (app non installée ou service worker inactif). » (:56), « Configuration push manquante. » (:62), « Souscription push incomplète. » (:76), ou le retour de l'action serveur « Impossible d'activer les rappels. Réessaie. » (`app/actions/push.ts:39`). Chacun désigne une cause différente. Si l'erreur ne se reproduit plus (une correction d'env a pu la faire disparaître), **le dire** et ne garder que les correctifs de l'étape 3 — ne pas inventer un bug pour justifier du code.

**Étape 2 — table de décision** (H1 en tête : le plus probable et le moins cher à écarter).

| # | Hypothèse | Comment vérifier | Correctif si confirmée |
|---|---|---|---|
| H1 | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` absente ou dépareillée de `VAPID_PRIVATE_KEY` en prod → `activate()` sort en erreur avant toute souscription. **Expliquerait les 2 symptômes de #102 ET l'échec du cron** : aucune ligne DB créée → bouton toujours « Activer », erreur à chaque clic, rien à notifier côté serveur. | Env vars Vercel Production ; erreur affichée = « Configuration push manquante. ». Si les clés existent mais ont été régénérées : les souscriptions créées avec l'ancienne clé publique échouent en 401 → désabonner/réabonner. | Renseigner / réaligner la paire de clés côté Vercel (opérateur) + redéployer. Côté code, rien à corriger — mais rendre le message actionnable pour l'utilisateur. |
| H2 | Service worker inactif / app non installée sur ce device. | Erreur = « Rappels indisponibles… » ; DevTools → Application → Service Workers. | Message d'aide explicite (« installe l'app depuis le menu du navigateur »), pas de refonte du toggle. |
| H3 | Mismatch d'hydratation : `useState(() => computeStatus(...))` (`PushReminderToggle.tsx:34`) appelle `readNotificationPermission()`, qui renvoie `"unsupported"` côté serveur (`typeof window === "undefined"`, :15). Le HTML serveur rend donc la branche « indisponible » (:104), le client rend autre chose. | Avertissement d'hydratation en console ; `view-source` de `/vestiaire` contient « indisponible sur ce navigateur/appareil ». | Adopter le patron déjà utilisé dans le repo pour exactement ce problème : `useSyncExternalStore` avec snapshot serveur constant (CLAUDE.md § Web Speech API, `hooks/useSpeechToText.ts`). |
| H4 | Prop serveur périmée après navigation client : `hasSubscription` vient de `app/vestiaire/page.tsx:80` et **aucune des deux actions de `app/actions/push.ts` n'appelle `revalidatePath`**. | Comparer un retour via `BottomNav` (nav client) et un `F5` : si F5 affiche « Désactiver » et la nav client « Activer », c'est ça. | `revalidatePath("/vestiaire")` dans `subscribeToPush` **et** `unsubscribeFromPush`. |
| H5 | Ligne DB réellement absente alors que le navigateur a une souscription. | `select id, endpoint, created_at from push_subscriptions where user_id = '<uid>';` + DevTools → Application → Service Workers → Push. | Au montage, si le navigateur a une souscription et que la DB n'en a pas, **ré-upserter** (appeler `subscribeToPush` avec la souscription existante). Ne jamais se contenter d'afficher « Désactiver ». |

**Étape 3 — correctifs à appliquer dans tous les cas** (sûrs, indépendants du diagnostic) :
- `revalidatePath("/vestiaire")` dans les deux actions de `app/actions/push.ts` (import depuis `next/cache`) ;
- `activate()` commence par `const existing = await registration.pushManager.getSubscription()` ; si une souscription existe : ne pas rappeler `subscribe()`, et **réconcilier la DB** (appeler `subscribeToPush` avec `existing.toJSON()`) plutôt que de juste passer le statut à « on » — c'est ce qui distingue un vrai fix d'un masquage (piège H5) ;
- `deactivate()` : pas d'erreur affichée s'il n'y a aucune souscription (no-op propre) ;
- **ne pas** introduire la logique « navigateur OU DB » de l'ancien plan : elle rend H5 invisible. La DB reste la source de vérité, l'état navigateur sert à détecter et réparer l'écart ;
- si un `useEffect` est ajouté (listener `window.focus`), nettoyer le listener au démontage ; préférer `useSyncExternalStore` si H3 est confirmée.

**Étape 4 — tests** `components/qg/PushReminderToggle.test.tsx` (nouveau ; patron et contraintes jsdom en § 3). Mocks : `vi.stubGlobal("Notification", …)`, `navigator.serviceWorker.ready.pushManager` (jsdom ne fournit ni l'un ni l'autre), `vi.mock("@/app/actions/push", …)`.
- **T3.1** — souscription navigateur existante → `pushManager.subscribe` **non appelé**, aucune erreur, statut « on ».
- **T3.2** — souscription navigateur existante + `hasSubscription={false}` → `subscribeToPush` **appelé** (réconciliation, piège H5).
- **T3.3** — `Notification.permission === "denied"` → bouton `disabled` + texte d'aide.
- **T3.4** — le cas confirmé à l'étape 2, écrit d'après le diagnostic réel.

**Étape 5** — rejouer les 4 vérifications humaines du « Plan de test » de l'issue #102 (`gh issue view 102`), consigner le diagnostic retenu en § 12 et en commentaire de l'issue.

Commit `fix(vestiaire): <cause réelle> — toggle notifications (issue #102)`.

---

## 10. L6b — Fondation #114 : migration `reminder_offset_minutes`

Périmètre validé avec l'auteur : **migration + types + note de design**. Pas de helper, pas de stub, aucune API Inngest appelée.

1. **Timestamp — calculer au moment de créer le fichier**, jamais d'après ce plan (bug prod #70, CLAUDE.md § Migrations hors-ordre) :
   ```bash
   git fetch origin && git ls-tree --name-only origin/main supabase/migrations/ | tail -3
   ```
   Timestamp **strictement postérieur** au dernier affiché (au 2026-07-30 : `20260729090100`). Toujours bumper plutôt que forcer `--include-all`.
2. **Une seule migration, deux colonnes** — évite d'en reposer une quand #114 attaquera son lot 4 (granularité par tâche, explicitement demandée par l'issue) :
   - `profiles.reminder_offset_minutes int not null default 30 check (reminder_offset_minutes between 0 and 240)` — défaut de l'utilisateur. **Non nullable** : le défaut vaut toujours quelque chose ; l'extinction se gère par tâche ou par le toggle push, pas par un `null` ambigu (l'ancien plan disait « null = désactivé » puis backfillait tout le monde à 30, contradiction).
   - `tasks.reminder_offset_minutes int null check (reminder_offset_minutes is null or reminder_offset_minutes between 0 and 240)` — override par tâche ; `null` = hérite du profil.
   - `comment on column` sur les deux, mentionnant #114. Aucune policy `UPDATE`/`DELETE` ajoutée (RG-04 inchangé).
3. `types/index.ts` : `reminder_offset_minutes: number` sur `Profile`, `reminder_offset_minutes: number | null` sur `Task`. `npx tsc --noEmit` pour vérifier qu'aucun objet littéral existant ne casse.
4. **Note de design dans `docs/superpowers/specs/2026-07-22-us11-push-design.md`** (≤ 25 lignes, `## Notifs avant deadline (#114) — design retenu`) : à la pose/modification d'une `deadline_at`, émettre un event Inngest et laisser la fonction faire `step.sleepUntil(deadline − offset)` puis re-lire la DB dans un `step.run` (tâche encore active ? non cochée ? deadline inchangée ?) avant d'envoyer ; annulation via `cancelOn` sur un event d'effacement ; idempotence par `taskId`. **Écrire explicitement pourquoi pas de cron one-shot** : un cron n'a pas de champ année, `"0 15 30 7 *"` se redéclencherait chaque 30 juillet — et manipuler des instants absolus supprime la question DST que l'ancien plan laissait ouverte.
5. Commenter #114 : fondation posée + lien vers la note de design.

Vérifications :
```bash
npx supabase migration list --linked     # avant : aucun écart préexistant. STOP si écart.
npx supabase db push --linked            # opérateur, sur le Supabase lié
```
puis dans le Studio : les deux colonnes avec leur `default` et leur `check`, et `select id, reminder_offset_minutes from profiles limit 5` → 30 partout. Aucun changement visible dans l'UI : c'est attendu.

Commit `feat(push): colonnes reminder_offset_minutes profil et tâche (préparation issue #114)`.

### Gate PR2

```bash
npm run lint && npm test && npx tsc --noEmit && npm run build && npm run e2e
npx supabase migration list --linked
git restore content/guide                # si L-0.1 n'est pas encore soldé
```
Plus les 4 vérifications humaines de #102. `gh pr create --base main --head feat/102-push-toggle-fix`. CI rouge attendu (crédits). **Ne pas merger — demander.**

---

## 11. Vérification — tableau récapitulatif

| Niveau | Commande / geste | Ce que ça prouve |
|---|---|---|
| Unitaire | `npm test -- lib/inngest` | Sélection, fan-out, envoi, 410/404, déterminisme du texte |
| Unitaire | `npm test -- components/qg/PushReminderToggle.test.tsx` | Comportement du toggle, réconciliation DB |
| Typage | `npx tsc --noEmit` | Aucune API Inngest inventée ne compile |
| Lint | `npm run lint` | Vert après le correctif `globalIgnores` de L-0.3 |
| Build | `npm run build` | Route `/api/inngest` et fonctions compilent en Next 16. Attention : re-pull le Guide (cf. L-0.1) |
| e2e | `npm run e2e` | Non-régression navigation / Vestiaire. Web Push non testable en headless — exclusion actée dans la spec US-11, ne pas la révoquer |
| DB | `npx supabase migration list --linked` | Aucune migration hors-ordre (bug prod #70) |
| Intégration locale | `npx inngest-cli@latest dev` + `npm run dev`, http://localhost:8288 | Les 2 fonctions enregistrées ; fan-out → events → runs `send-reminder` |
| **Prod** | § 8, 8 maillons puis attente réelle de 17h30 | **La seule preuve que la feature marche**, et la première de son histoire. Ne pas déclarer le job terminé avant la recette naturelle finale |
| CI | — | **Inopérant : crédits GitHub Actions épuisés.** Rouge attendu, jamais un motif de blocage. Le gate est la colonne locale ci-dessus |

---

## 12. Décisions (historique complet, L0 → aujourd'hui)

| Date | Décision | Lot | SHA | Rationale |
|---|---|---|---|---|
| 2026-07-28 | Inngest retenu, QStash écarté | — | — | QStash : 1K msg/jour + 10 schedules max, casserait dès #114. |
| 2026-07-28 | `buildReminderPayload` importé de `@/lib/copy/notifications` (et non d'un `lib/push-copy.ts`) | L1 | — | `lib/push-copy.ts` n'a jamais existé ; le refactor Volume Intérieur (US-49/54) a placé le contenu dans `lib/copy/notifications.ts` avec le paramètre `level`. |
| 2026-07-29 | `inngest@^4.13.0` | L0 | `3b2970e` | Dernière stable au moment du lot. |
| 2026-07-29 | Route `/api/inngest` exporte `{ GET, POST, PUT }`, pas `POST` seul | L0 | `3b2970e` | Le SDK exige ce triplet pour le handshake de sync (`node_modules/inngest/next.d.ts`). N'exposer que `POST` empêche la découverte de l'app. |
| 2026-07-29 | `INNGEST_APP_ID` documenté dans `.env.example` | L0 | `3b2970e` | Le client lit `process.env.INNGEST_APP_ID ?? "dodojo"` ; utile pour pointer un environnement Inngest alternatif. |
| 2026-07-29 | `signingKey` passé explicitement au constructeur malgré l'auto-détection du SDK | L0 | `3b2970e` | Redondant mais plus lisible pour un repreneur qui cherche où la clé est lue. |
| 2026-07-29 | `createFunction` en **2 arguments** (`{ id, triggers }`, handler) — la signature à 3 args du SDK 3.x est obsolète | L1 | `910e9ca` | Vérifié dans `node_modules/inngest/components/Inngest.d.ts` + message d'erreur runtime explicite. Le mock de test capture le handler en 2e argument. |
| 2026-07-30 | **`inngest.schedules.*` n'existe pas** dans le SDK 4.13.0 → abandon du schedule par utilisateur, remplacé par un cron statique `*/15` + fan-out d'events | L2b | — | 0 occurrence de `schedules` dans tout `node_modules/inngest`. Réutilise `buildCandidatesFromDb` + `selectReminderEligibleProfiles` sans les modifier. |
| 2026-07-30 | Sync Inngest ↔ Vercel : **intégration officielle, automatique à chaque déploiement** | L3b | — | Choix de l'auteur. Provisionne aussi les clés Inngest côté Vercel — à vérifier plutôt qu'à saisir. |
| 2026-07-30 | Préparation #114 : **une** migration, deux colonnes (`profiles` + `tasks`), sans helper ni stub | L6b | — | L'issue #114 vise son lot 4 (granularité par tâche + défaut au profil) ; une seule migration évite d'en reposer une. |
| 2026-07-30 | La feature push n'a **jamais** fonctionné en prod ; cron GHA à 100 % d'échec, `schedule` arrêté le 2026-07-27, logs expirés | tous | — | Confirmé par l'auteur + `gh run list`. Reclasse le job en première mise en service, justifie la § 8, retire toute valeur au « rollback par revert ». |
| 2026-07-30 | CI GitHub Actions **inopérante faute de crédits** → gate de merge = vérification locale (`lint`, `test`, `tsc`, `build`, `e2e`) | tous | — | Décision de l'auteur. Un CI rouge n'est pas un motif de STOP dans ce job ; à documenter dans CLAUDE.md (L4b) car ça contredit la règle écrite « zéro merge si la CI est rouge ». |
| 2026-07-30 | Notion est la source de vérité du Guide, mais `hp.md` est plus récent dans le repo (`majLe` recule au pull) | L-0 | — | Réparer Notion d'abord, puis puller et committer : committer le pull en l'état ferait perdre 2 sections publiées. |
| 2026-07-30 | Rebase sur `origin/main` (26 commits) : **aucun cassage** `tsc`/tests, contrairement au risque anticipé | L-0.2 | — | `lib/game-engine.ts`/`types/index.ts` ont bougé (+141 LOC combo server-authoritative) mais sans conflit ni régression de typage sur le domaine push. |
| 2026-07-30 | `hp` : correction aussi du champ Notion `Résumé` (pas seulement le contenu) | L-0.1 | `7b96e69` | Le résumé Notion ne mentionnait que le Boss alors que le contenu restauré couvre Boss + Héros + Perfect/K.O. — incohérence non explicitement listée par le plan mais relevant du même travail de réconciliation. |
| | | | | |

---

## 13. Modèle recommandé : **Sonnet**

Deux lots que Haiku exécuterait mal :
- **L5b est une enquête**, pas une implémentation : tenir 5 hypothèses en parallèle, choisir d'après une observation, et surtout **résister au fix évident** (la logique « navigateur OU DB ») qui masquerait le vrai bug. C'est le type de tâche où un petit modèle applique la première solution plausible.
- **L2b/L3b exigent de vérifier une API contre la doc et de savoir dire « je ne sais pas »** (syntaxe de `idempotency`, forme exacte du trigger cron). Le risque n°1 du job est de re-halluciner l'API Inngest — d'autant que l'ancien plan, toujours dans le repo, **affirme** qu'elle existe.

Opus n'apporterait pas assez pour le surcoût maintenant que le design est tranché. Si Haiku doit intervenir : lui confier **L-0** et **L4b** seulement (mécaniques, périmètre fermé, aucune décision d'architecture), L-0 en premier et à part pour que l'ancien plan soit neutralisé avant que quiconque le relise.
