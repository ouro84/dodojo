# Spec — Notifs avant deadline de tâche (issue #114)

> Statut : validé en brainstorming, prêt pour plan d'implémentation.
> Cible directement le **lot 4** de l'issue (granularité par tâche + défaut réglable) : le schéma DB le supporte déjà en entier (`profiles.reminder_offset_minutes` + `tasks.reminder_offset_minutes`, migration `20260730180000`, foundation déjà en prod).
> Design moteur déjà tranché en commentaire d'issue (2026-07-30) : event Inngest à la pose de deadline → `step.sleepUntil` sur instant absolu → re-check DB avant envoi → `cancelOn` sur événement d'effacement. Cette spec détaille et complète ce design pour être implémentable sans ambiguïté.

## Contexte

`DeadlineControl.tsx` (popover ⏰ sur `TaskRow`) fixe/modifie/efface `tasks.deadline_at`, seul point d'entrée pour poser une deadline (jamais à la création de tâche). Aujourd'hui, dépasser une deadline inflige juste -10 HP au Héros (détecté par polling client, US-05) — aucune notification proactive n'existe **avant** l'échéance.

Deux colonnes existent déjà, posées en fondation (migration `20260730180000_add_reminder_offset_minutes.sql`) :
- `profiles.reminder_offset_minutes` : `int not null default 30`, check `between 0 and 240`.
- `tasks.reminder_offset_minutes` : `int null`, même check, `null` = hérite du profil.

**Gap identifié en spec'ant** : aucune des deux colonnes ne permet de désactiver la notif pour une tâche précise (l'issue demande explicitement "à quel moment... **ou pas**", façon Google Agenda). Cette spec ajoute une 3e colonne pour couvrir ce cas (cf. Migration ci-dessous).

## Migration additionnelle

`supabase/migrations/20260801100000_add_task_reminder_enabled.sql` :

```sql
alter table tasks
  add column reminder_enabled boolean not null default true;

comment on column tasks.reminder_enabled is
  'Issue #114 : désactive la notif de rappel pour cette tâche précise, indépendamment de reminder_offset_minutes.';
```

Pas de colonne équivalente sur `profiles` : désactiver globalement toutes les notifs se fait déjà via le toggle push existant (`PushReminderToggle`, US-11) — pas de nouveau réglage à inventer pour ce cas.

## Moteur de notification

### Événements Inngest (nouveau fichier `lib/inngest/functions/schedule-deadline-reminder.types.ts`)

```ts
export interface ScheduleDeadlineReminderEvent {
  name: "task/deadline-reminder-set";
  data: {
    taskId: string;
    userId: string;
    deadlineAt: string;      // ISO UTC, valeur de tasks.deadline_at au moment de l'émission
    offsetMinutes: number;   // résolu (task.reminder_offset_minutes ?? profile.reminder_offset_minutes), figé à l'émission
  };
}

export interface CancelDeadlineReminderEvent {
  name: "task/deadline-reminder-cleared";
  data: { taskId: string };
}
```

### Helper d'émission (nouveau fichier `lib/inngest/deadline-reminder.ts`)

Centralise l'émission, **best-effort** (ne bloque jamais une action utilisateur si Inngest est indisponible — même philosophie que l'envoi push existant, qui catch ses propres erreurs) :

```ts
import { inngest } from "@/lib/inngest/client";

export async function scheduleDeadlineReminder(params: {
  taskId: string;
  userId: string;
  deadlineAt: string;
  offsetMinutes: number;
}): Promise<void> {
  try {
    await inngest.send({ name: "task/deadline-reminder-set", data: params });
  } catch {
    // best-effort : un échec d'émission ne doit jamais faire échouer l'action utilisateur.
  }
}

export async function cancelDeadlineReminder(taskId: string): Promise<void> {
  try {
    await inngest.send({ name: "task/deadline-reminder-cleared", data: { taskId } });
  } catch {
    // idem
  }
}
```

### Fonction Inngest (nouveau fichier `lib/inngest/functions/schedule-deadline-reminder.ts`)

Même patron que `send-reminder.ts` (`makeSupabaseClient()`/`configureVapid()` locaux au fichier, `step.run` pour chaque effet de bord) :

```ts
export const scheduleDeadlineReminder = inngest.createFunction(
  {
    id: "schedule-deadline-reminder",
    triggers: { event: "task/deadline-reminder-set" satisfies ScheduleDeadlineReminderEvent["name"] },
    cancelOn: [{ event: "task/deadline-reminder-cleared", match: "data.taskId" }],
    // Dédoublonne un run identique (même tâche, même deadline) — un changement
    // de deadline change la clé, donc ne dédoublonne jamais un vrai reschedule.
    // Inclut offsetMinutes (pas seulement taskId+deadlineAt) : le snooze
    // (amélioration C ci-dessous) réémet le même event avec un offsetMinutes
    // synthétique différent pour reprogrammer un nouveau réveil — sans
    // offsetMinutes dans la clé, ce second event serait à tort dédoublonné
    // contre le premier (même taskId+deadlineAt) et jamais programmé.
    idempotency: "event.data.taskId + \"-\" + event.data.deadlineAt + \"-\" + event.data.offsetMinutes",
    onFailure: async ({ event, error }) => {
      console.error("[inngest:schedule-deadline-reminder] échec définitif", {
        taskId: event.data.event.data.taskId,
        error: error.message,
      });
    },
  },
  async ({ event, step }) => {
    const { taskId, userId, deadlineAt, offsetMinutes } = event.data;
    const wakeAt = new Date(new Date(deadlineAt).getTime() - offsetMinutes * 60_000);

    // Si wakeAt est déjà passé (deadline très proche posée avec un offset
    // supérieur au temps restant), step.sleepUntil ne bloque pas : la notif
    // part quasi immédiatement. Assumé (comportement Google Agenda identique).
    await step.sleepUntil("wait-until-reminder", wakeAt);

    const context = await step.run("check-still-valid", async () => {
      const supabase = makeSupabaseClient();
      const { data: task } = await supabase
        .from("tasks")
        .select("id, title, deadline_at, is_completed, is_abandoned, reminder_enabled")
        .eq("id", taskId)
        .maybeSingle();
      if (!task || task.is_completed || task.is_abandoned || !task.reminder_enabled) return null;
      if (task.deadline_at !== deadlineAt) return null; // deadline changée depuis (belt-and-suspenders vs cancelOn)

      const { data: profile } = await supabase
        .from("profiles")
        .select("aggressivity_level")
        .eq("id", userId)
        .maybeSingle();
      const { data: subs } = await supabase
        .from("push_subscriptions")
        .select("endpoint, p256dh, auth")
        .eq("user_id", userId);

      return { taskTitle: task.title, level: profile?.aggressivity_level ?? "direct", subs: subs ?? [] };
    });

    if (!context || context.subs.length === 0) return;

    await step.run("send-push", async () => {
      configureVapid();
      const payload = JSON.stringify(
        buildDeadlineReminderPayload(context.taskTitle, offsetMinutes, context.level),
      );
      const supabase = makeSupabaseClient();
      for (const sub of context.subs) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
          );
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
          }
        }
      }
    });
  },
);
```

Enregistrer dans `app/api/inngest/route.ts` : ajouter `scheduleDeadlineReminder` au tableau `functions`.

### Copy — `lib/copy/deadline.ts`

Ajouter (à côté de `deadlineAlertLine`, même patron pools/`pickVariant`) :

```ts
export function buildDeadlineReminderPayload(
  taskTitle: string,
  offsetMinutes: number,
  level: AggressivityLevel,
  seed: number = randomSeed(),
): { title: string; body: string; url: string } {
  // pools 5-6 variantes par niveau (même patron pickVariant/randomSeed que
  // deadlineAlertLine), ex. offsetMinutes > 0 :
  //   direct: (t, n) => `⏰ « ${t} » arrive dans ${n} min.`
  //   brut:   (t, n) => `⏰ « ${t} », ${n} min et c'est fini, bouge.`
  //   doux:   (t, n) => `⏰ « ${t} » approche, encore ${n} min.`
  // et une variante dédiée quand offsetMinutes === 0 (pas de "dans 0 min") :
  //   direct: (t) => `⏰ « ${t} » : c'est l'heure.`
  // body = template(level)(taskTitle, offsetMinutes) ; url = "/".
}
```
`title` fixe : `"Dodojo — Deadline qui approche"`. Cohérent avec `deadlineAlertLine` existant (même emoji ⏰, même registre par niveau).

## Émission des événements — tous les points de mutation de `app/actions/tasks.ts`

`setTaskDeadline` est étendu (paramètres optionnels, **aucun changement requis sur ses appelants existants**) :

```ts
export async function setTaskDeadline(
  id: string,
  deadlineAt: string | null,
  reminderOffsetMinutes?: number | null, // undefined = ne touche pas la colonne
  reminderEnabled?: boolean,             // undefined = ne touche pas la colonne
): Promise<TaskActionResult>
```

Logique après le `.update()` réussi :
1. Construire l'objet `update` en incluant `reminder_offset_minutes`/`reminder_enabled` **seulement si** le paramètre correspondant n'est pas `undefined`.
2. Si `deadlineAt === null` → `await cancelDeadlineReminder(id)`.
3. Sinon → refetch `reminder_enabled, reminder_offset_minutes` sur la tâche + `reminder_offset_minutes` sur le profil (une requête chacun, résout la valeur effective même quand cet appel ne changeait que l'heure — ex. "Repousser +1h"). Si `reminder_enabled` effectif est `true` : `cancelDeadlineReminder(id)` (supersède un éventuel schedule existant) puis `scheduleDeadlineReminder({ taskId: id, userId: user.id, deadlineAt, offsetMinutes: resolved })`. Sinon (désactivé) : `cancelDeadlineReminder(id)` seul.

**Toutes les autres fonctions ci-dessous** émettent `cancelDeadlineReminder` pour chaque id affecté, après leur `.update()` existant — sans condition sur "avait-elle une deadline avant" (un `cancelOn` sur un run inexistant est un no-op côté Inngest, coût négligeable, évite de complexifier des `select` existants) :

| Fonction | Ligne actuelle | Id(s) à annuler | Changement requis |
|---|---|---|---|
| `setTaskCompleted` | ~214 | `id`, **seulement si `isCompleted === true`** (un décochage ne réémet rien) | aucun `.select()` à ajouter, `id` déjà connu |
| `rageQuitTask` | ~353 | tous les ids de `cascadeIds` (déjà calculé) | aucun `.select()` à ajouter |
| `completeOverdueTask` | ~548 | tous les ids affectés | ajouter `.select("id")` à la requête existante |
| `deferOverdueTask` | ~586 | ids de `updated` (déjà retourné) | aucun changement de requête |
| `annihilateOverdueTask` | ~625 | tous les ids affectés | ajouter `.select("id")` |
| `deferAllOverdue` | ~646 | ids de `updated` (déjà retourné) | aucun changement de requête |
| `annihilateOverdueOlderThan` | ~682 | tous les ids affectés | ajouter `.select("id")` |
| `reportToTomorrow` | ~805 | ids de `updated` (déjà retourné) | aucun changement de requête |
| `bringToToday` | ~850 | ids de `updated` (déjà retourné) | aucun changement de requête |

Pour les fonctions à plusieurs ids, boucler avec `Promise.allSettled(ids.map(cancelDeadlineReminder))` (best-effort, un échec d'annulation individuelle ne doit pas faire échouer l'action).

## UI — `DeadlineControl.tsx`

Nouvelles props :
```ts
interface DeadlineControlProps {
  // ...props existantes inchangées
  reminderOffsetMinutes: number | null; // valeur actuelle de tasks.reminder_offset_minutes
  reminderEnabled: boolean;
  profileDefaultOffsetMinutes: number;   // pour l'affichage "Par défaut (X min)"
  onSave: (deadlineAt: string | null, reminderOffsetMinutes: number | null, reminderEnabled: boolean) => void;
}
```

Un `<select>` supplémentaire dans le popover, sous le champ heure, label `"Me notifier"` :

| Valeur select | `reminderOffsetMinutes` envoyé | `reminderEnabled` envoyé | Libellé |
|---|---|---|---|
| `"default"` | `null` | `true` | `Par défaut (${profileDefaultOffsetMinutes} min)` |
| `"0"` | `0` | `true` | `À l'heure` |
| `"5"` | `5` | `true` | `5 min avant` |
| `"10"` | `10` | `true` | `10 min avant` |
| `"15"` | `15` | `true` | `15 min avant` |
| `"30"` | `30` | `true` | `30 min avant` |
| `"60"` | `60` | `true` | `1h avant` |
| `"120"` | `120` | `true` | `2h avant` |
| `"240"` | `240` | `true` | `4h avant` |
| `"off"` | *(inchangé, cf. state local)* | `false` | `Pas de notif` |

État initial du select dérivé des props : `!reminderEnabled` → `"off"` ; sinon `reminderOffsetMinutes === null` → `"default"` ; sinon `String(reminderOffsetMinutes)`.

`handleSave` passe les 3 valeurs à `onSave`. `handleClear` (bouton "Effacer" existant) appelle `onSave(null, reminderOffsetMinutes, reminderEnabled)` (les 2 derniers inchangés, ignorés côté serveur puisque `deadlineAt === null`).

### Propagation `TaskRow.tsx` → `Arena.tsx`

- `TaskRow` reçoit et retransmet `reminderOffsetMinutes`/`reminderEnabled`/`profileDefaultOffsetMinutes` (nouvelles props, source = `task.reminder_offset_minutes`/`task.reminder_enabled`/`profile.reminder_offset_minutes`).
- `onSetDeadline` (actuellement `(id, deadlineAt) => void`) devient `(id, deadlineAt, reminderOffsetMinutes, reminderEnabled) => void`.
- Dans `Arena.tsx`, le handler qui appelle `setTaskDeadlineAction(id, deadlineAt)` (2 sites : popover normal + mutation optimiste) passe désormais les 4 arguments ; le state optimiste `tasks` inclut aussi `reminder_offset_minutes`/`reminder_enabled` dans le patch local.
- Le bouton "Repousser +1h" (Attaque Surprise) continue d'appeler `setTaskDeadlineAction(id, newDeadlineAt)` **sans** les 2 derniers arguments (`undefined` implicite) — comportement inchangé, le serveur résout les valeurs effectives existantes.

### Types (`types/index.ts`)

`Task.reminder_offset_minutes: number | null` existe déjà (`types/index.ts:71`). Ajouter uniquement `reminder_enabled: boolean` (nouveau, colonne de la migration ci-dessus).

## Améliorations A + B + C (identifiées en 2e passe de brainstorming)

Trois gaps réels identifiés une fois le moteur de base spec'é :
1. **Aucun filet si push n'est pas activé** — toute la mécanique tourne pour rien (`context.subs.length === 0` → return silencieux), l'utilisateur ne reçoit jamais rien sans le savoir.
2. **Clic sur la notif → juste `/`** — pas de deep-link vers la tâche concernée.
3. **Popover muet sur l'état push** — possible de configurer un rappel qui ne partira jamais, sans avertissement.

### A. Filet in-app (toast si l'Arène est ouverte)

Complète le polling deadline existant (~45s, US-05, `Arena.tsx`) plutôt que d'en créer un second : à chaque tick, calcule aussi `upcomingReminders` — tâches avec `deadline_at` non nul, `reminder_enabled`, non complétées/abandonnées, où `now` est dans la fenêtre `[deadlineAt − offsetEffectif, deadlineAt[`. Même mécanique de suivi "nouvellement franchi" qu'`missedDeadlineTasks` (`Set` de refs, pas de comparaison d'égalité de tableau) pour ne déclencher qu'une fois par tâche par fenêtre.

Sur franchissement : `FloatingText`/toast local avec le texte de `buildDeadlineReminderPayload(taskTitle, offsetMinutes, aggressivityLevel)` (fonction pure `lib/copy/deadline.ts`, importable côté client sans souci — aucune dépendance serveur). **Aucune dépendance à push** : fonctionne même sans permission notif accordée.

Optionnel, non bloquant : le handler `push` du service worker pourrait vérifier `self.clients.matchAll({ type: "window" })` et ne pas appeler `showNotification` si un client visible existe déjà, pour éviter un double rappel (toast + notif système) quand l'app est au premier plan. À trancher en implémentation si le doublon gêne à l'usage — pas un prérequis.

### B. Deep-link + highlight de la tâche

`buildDeadlineReminderPayload` retourne `url: "/?highlightTask=${taskId}"` (au lieu de `"/"` fixe) pour ce type de notif spécifiquement.

Côté `Arena.tsx` (déjà client component) : `useSearchParams()` (`next/navigation`) au montage, si `highlightTask` présent → `document.getElementById(`task-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })` + classe CSS d'un flash temporaire (même famille que les pulses existants, `triggerPulse`/`triggerXpPulse`, 1 nouvelle variante courte). Nettoyer le paramètre d'URL ensuite (`router.replace("/", { scroll: false })` ou équivalent) pour ne pas re-déclencher au prochain refresh. Nécessite que chaque `TaskRow` racine porte un `id={`task-${task.id}`}` sur son conteneur (vérifier/ajouter si absent).

### C. Snooze directement depuis la notification (Notification Actions API)

Un bouton "+15 min" sur la notif elle-même — repousse **le rappel**, pas la deadline (garde-fou volontaire : silencieusement repousser la vraie deadline via une action de notif contournerait la pénalité HP de l'Attaque Surprise sans aucune friction en jeu, contraire à la philosophie du jeu). Sémantique : "renvoie-moi un rappel dans 15 min", identique à un snooze de réveil téléphone — ne touche jamais `tasks.deadline_at`/`reminder_offset_minutes`.

**Réutilise la fonction Inngest existante** (`scheduleDeadlineReminder`/event `task/deadline-reminder-set`) avec un `offsetMinutes` synthétique calculé pour que le réveil retombe ~15 min plus tard — aucune nouvelle fonction Inngest à créer.

**`app/sw.ts`** — extension du `push`/`notificationclick` déjà en place (US-11, actions `later`/snooze déjà supportées par `NotificationOptionsWithActions`) :
- `push` : si `payload.taskId` présent (discrimine "rappel de deadline" du rappel quotidien générique), ajoute une 2e action `{ action: "snooze15", title: "+15 min" }` à côté de `later` existant, et pose `data: { url, taskId, userId }` (au lieu de `{ url }` seul).
- `notificationclick` : nouveau branch `event.action === "snooze15"` → `fetch("/api/push/snooze-deadline-reminder", { method: "POST", body: JSON.stringify({ taskId, userId }) })` dans `event.waitUntil(...)`, `return` avant le focus/openWindow existant (pas d'ouverture d'onglet, comme "later").

**`PushReminderPayload`** (`lib/copy/notifications.ts`) étendu : `taskId?: string; userId?: string` (optionnels, absents pour le rappel quotidien existant — aucun changement sur `buildReminderPayload`/`send-reminder.ts`). `buildDeadlineReminderPayload` les renseigne.

**Nouvelle route `app/api/push/snooze-deadline-reminder/route.ts`** (`export const runtime = "nodejs"`), même patron que `app/api/webhook/add-task/route.ts` : client Supabase **service-role** (pas de cookie — l'appel vient du service worker, pas d'un onglet avec session active garantie), déjà exempté de la garde de session par `isPublicRoute` (`/api/*`, cf. entrée CLAUDE.md existante).

Logique :
1. `POST` body `{ taskId: string, userId: string }`.
2. Fetch `tasks` : `select("id, deadline_at, is_completed, is_abandoned, reminder_enabled").eq("id", taskId).eq("user_id", userId).maybeSingle()` — le filtre combiné `id`+`user_id` fait déjà office de vérification d'appartenance (pas de token supplémentaire à générer : un payload push n'est déjà déliverable qu'à l'appareil réellement souscrit, canal chiffré VAPID — même niveau de confiance assumé que la route `share-card`, cf. CLAUDE.md).
3. Si tâche introuvable / complétée / abandonnée / `reminder_enabled=false` / `deadline_at` nul → `return NextResponse.json({ scheduled: false })` (no-op silencieux, rien à afficher côté SW).
4. `candidateWake = Date.now() + 15 * 60_000`. Si `candidateWake >= new Date(deadline_at).getTime()` → `{ scheduled: false, reason: "too-close" }` (pas de snooze au-delà de la deadline elle-même — au-delà, c'est le flow Attaque Surprise existant qui prend le relai).
5. Sinon, `offsetMinutes = Math.round((deadlineAtMs − candidateWake) / 60_000)`, `await scheduleDeadlineReminder({ taskId, userId, deadlineAt: deadline_at, offsetMinutes })` (le helper existant du ticket 2, cancelOn n'a rien à annuler ici — le run précédent est déjà terminé au moment du clic). `return { scheduled: true }`.

Pas de nouvelle colonne DB, pas de nouvelle fonction Inngest — uniquement un nouvel appelant de l'event existant avec un `offsetMinutes` calculé à la volée (jamais persisté en base, donc pas soumis au CHECK `between 0 and 240` de la migration — c'est une valeur de scheduling éphémère, pas un réglage utilisateur).

## UI — Page Profil (réglage par défaut)

Nouveau composant `components/qg/ReminderOffsetDefaultSection.tsx`, même patron exact que `PlanTomorrowSection.tsx` (état local + `useTransition` + rollback), inséré dans le bloc "Préférences de jeu" de `/vestiaire/profil` (spec #69), après `PlanTomorrowSection` :

```tsx
<ReminderOffsetDefaultSection initialMinutes={profile.reminder_offset_minutes} />
```

Select avec les mêmes valeurs minute que le tableau ci-dessus, **sans** les options `"default"`/`"off"` (n'ont pas de sens pour un réglage global) : 0/5/10/15/30/60/120/240, défaut 30.

Server action `updateReminderOffsetDefault(minutes: number): Promise<{ error: string | null }>` dans `app/actions/profile.ts`, même garde que `updatePlanTomorrowAfterHour` (`Number.isInteger`, borne 0-240 — reflète le CHECK SQL existant), message d'erreur `"Délai de rappel invalide."` / `"Dodojo n'a pas pu enregistrer ce réglage. Réessaie."`.

Nécessite d'ajouter `reminder_offset_minutes` à la requête `profiles` de `app/vestiaire/profil/page.tsx` (déjà une colonne existante, simple ajout à la liste `.select(...)`).

## Découpage pour délégation (tickets indépendants)

1. Migration `20260801100000_add_task_reminder_enabled.sql` + ajout `reminder_offset_minutes`/`reminder_enabled` à `types/index.ts` (`Task`).
2. `lib/inngest/deadline-reminder.ts` (helpers d'émission) + `schedule-deadline-reminder.types.ts`.
3. `buildDeadlineReminderPayload` dans `lib/copy/deadline.ts` (+ test unitaire des variantes, même patron que les tests `lib/copy/*` existants).
4. `lib/inngest/functions/schedule-deadline-reminder.ts` (fonction Inngest complète) + enregistrement dans `app/api/inngest/route.ts` — dépend du ticket 2 et 3 pour les imports, sinon indépendant.
5. `setTaskDeadline` (app/actions/tasks.ts) — logique d'émission schedule/cancel + nouveaux paramètres optionnels. Dépend du ticket 2.
6. Les 8 autres fonctions du tableau (`setTaskCompleted`, `rageQuitTask`, `completeOverdueTask`, `deferOverdueTask`, `annihilateOverdueTask`, `deferAllOverdue`, `annihilateOverdueOlderThan`, `reportToTomorrow`, `bringToToday`) — ajout mécanique d'un appel `cancelDeadlineReminder`/boucle après chaque `.update()` réussi, suivant le tableau exact. Dépend du ticket 2 seul, chaque fonction est un edit indépendant des autres (peut être split en plusieurs tickets encore plus petits si besoin, ex. 1 ticket par fonction).
7. `DeadlineControl.tsx` (nouveau select + props) — dépend du ticket 1 pour les types.
8. Propagation `TaskRow.tsx` → `Arena.tsx` (nouvelles props/state optimiste) — dépend du ticket 7.
9. `ReminderOffsetDefaultSection.tsx` + `updateReminderOffsetDefault` (`app/actions/profile.ts`) + intégration dans `app/vestiaire/profil/page.tsx` — dépend de la page Profil (#69) déjà livrée, sinon indépendant du reste de cette spec.

Tickets 2-3-4 peuvent être menés en parallèle. Ticket 5 avant ticket 6 (partage le même helper). Tickets 7-8 après 1, en parallèle de 2-6. Ticket 9 en dernier (dépend de #69).

**Améliorations A/B/C** (indépendantes du reste, à mener après le ticket 4 — ont besoin de `buildDeadlineReminderPayload`/`scheduleDeadlineReminder`) :

10. **(A)** Calcul `upcomingReminders` + toast dans `Arena.tsx` (même patron que `missedDeadlineTasks`). Indépendant de B/C.
11. **(B)** `url: "/?highlightTask=${taskId}"` dans `buildDeadlineReminderPayload` + lecture `useSearchParams`/scroll/flash dans `Arena.tsx` + `id={`task-${task.id}`}` sur `TaskRow`. Indépendant de A/C.
12. **(C)** Extension `PushReminderPayload` (`taskId?`/`userId?`) + `app/sw.ts` (action `snooze15`) + nouvelle route `app/api/push/snooze-deadline-reminder/route.ts`. Dépend du ticket 2 (`scheduleDeadlineReminder`) et de la correction d'idempotency ci-dessus. Indépendant de A/B.

## Tests à couvrir

- `lib/inngest/functions/schedule-deadline-reminder.test.ts` : re-check DB (tâche complétée/abandonnée/deadline changée/`reminder_enabled=false` → aucun envoi), résolution offset (task override vs héritage profil), même patron que `send-reminder.test.ts`/`reminder-fanout.test.ts` existants.
- `app/actions/tasks.test.ts` (existe déjà, `tasks.test.ts`) : cas `setTaskDeadline` avec/sans paramètres reminder, résolution effective.
- `lib/copy/deadline.test.ts` si inexistant : variantes présentes pour les 3 niveaux, pas de variante vide.
- `app/api/push/snooze-deadline-reminder/route.test.ts` : tâche introuvable/complétée/abandonnée/`reminder_enabled=false` → `scheduled: false` ; `candidateWake >= deadlineAt` → `{ scheduled: false, reason: "too-close" }` ; cas nominal → `scheduled: true` avec `offsetMinutes` calculé correct (vérifier l'arrondi).
- Vérification manuelle post-déploiement obligatoire pour C (comme le reste de la stack push, US-11) : les actions de notification (`notification.actions`) ne sont pas simulables en Vitest/Playwright de façon fiable — tester sur un vrai appareil (Android Chrome a des comportements différents d'iOS Safari sur les actions de notif PWA, cf. limites connues de la plateforme).

## Documentation

- `CLAUDE.md` : nouvelle entrée "Piège" décrivant le moteur (event `task/deadline-reminder-set`/`-cleared`, `cancelOn`, re-check DB, `reminder_enabled` vs `reminder_offset_minutes` null=hérite) — même esprit que l'entrée existante sur `send-reminder`/`reminder-fanout`.
- Le Guide (Notion) : nouvel article ou mise à jour de l'article existant sur les deadlines, mentionnant le réglage de rappel (par tâche + défaut dans Profil).
- `CHANGELOG.md` : ligne sous `[Unreleased]`.
