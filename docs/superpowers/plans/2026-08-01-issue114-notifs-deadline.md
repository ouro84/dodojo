# Notifs avant deadline (issue #114) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notifier l'utilisateur avant qu'une deadline de tâche n'expire (délai réglable par tâche + défaut par profil), avec un moteur Inngest (`step.sleepUntil` + re-check DB + `cancelOn`), un filet in-app si push n'est pas activé, un deep-link vers la tâche concernée, et un snooze directement depuis la notification.

**Architecture:** Un event Inngest (`task/deadline-reminder-set`) émis à la pose d'une deadline, traité par une fonction qui dort jusqu'à l'instant de rappel puis relit la base avant d'envoyer un push. Toute mutation qui rend la tâche inactive (complétée/abandonnée/deadline effacée) émet un event d'annulation (`task/deadline-reminder-cleared`, `cancelOn`). Deux améliorations client pures (toast in-app, deep-link) et une extension du service worker (snooze).

**Tech Stack:** Next.js 16 (Server Actions, API routes), Supabase (Postgres + service-role client), Inngest (fonctions durables), web-push, Serwist (service worker), TypeScript strict, Vitest.

## Global Constraints

- TypeScript strict : jamais de `any`.
- Toute communication utilisateur en français.
- Commits Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`).
- RG-04 : jamais de DELETE destructif sur `tasks`/`day_results` (n/a directement ici, mais les fonctions modifiées appartiennent à ce périmètre — ne rien changer à leur logique métier existante, seulement ajouter l'émission d'annulation).
- Migration : timestamp strictement postérieur à la dernière migration existante au moment de la création du fichier (`20260731200000` au 2026-08-01 — vérifier `ls supabase/migrations/ | tail -3` avant de nommer le fichier si du temps s'est écoulé).
- Spec de référence : `docs/superpowers/specs/2026-08-01-issue114-notifs-deadline-design.md` (déjà postée en commentaire sur l'issue #114).
- Avant toute PR : `npm run lint`, `npm test`, `npx tsc --noEmit`, `npm run build` doivent passer localement.
- Vérification manuelle obligatoire pour les actions de notification (Task 14) : non simulables de façon fiable en Vitest/Playwright.

---

## File Structure

- Create: `supabase/migrations/20260801100000_add_task_reminder_enabled.sql`
- Modify: `types/index.ts` — ajoute `reminder_enabled: boolean` à `Task`.
- Create: `lib/inngest/functions/schedule-deadline-reminder.types.ts`
- Create: `lib/inngest/deadline-reminder.ts` — helpers d'émission `scheduleDeadlineReminder`/`cancelDeadlineReminder`.
- Modify: `lib/copy/deadline.ts` — ajoute `buildDeadlineReminderPayload`.
- Create: `lib/copy/deadline.test.ts`
- Create: `lib/inngest/functions/schedule-deadline-reminder.ts`
- Create: `lib/inngest/functions/schedule-deadline-reminder.test.ts`
- Modify: `app/api/inngest/route.ts` — enregistre la nouvelle fonction.
- Modify: `app/actions/tasks.ts` — `setTaskDeadline` étendu + émission cancel dans 8 autres fonctions.
- Modify: `app/actions/tasks.test.ts` — nouveaux cas.
- Modify: `components/combat/DeadlineControl.tsx` — nouveau select "Me notifier".
- Modify: `components/combat/TaskList.tsx`, `components/combat/TaskRow.tsx` — propagation des props reminder + ancre `id` (amélioration B).
- Modify: `components/combat/Arena.tsx` — signature `handleSetDeadline`/`handleSetTomorrowDeadline` étendue, filet in-app (amélioration A), lecture `highlightTask` (amélioration B).
- Modify: `lib/game-engine.ts` — ajoute `upcomingReminderTasks` (amélioration A).
- Modify: `lib/game-engine.test.ts` — tests de `upcomingReminderTasks`.
- Create: `components/qg/ReminderOffsetDefaultSection.tsx`
- Modify: `app/actions/profile.ts` — ajoute `updateReminderOffsetDefault`.
- Modify: `app/vestiaire/profil/page.tsx` — intègre `ReminderOffsetDefaultSection` (dépend du plan #69, déjà livré).
- Modify: `lib/copy/notifications.ts` — étend `PushReminderPayload` (`taskId?`, `userId?`).
- Modify: `app/sw.ts` — action `snooze15`.
- Create: `app/api/push/snooze-deadline-reminder/route.ts`
- Create: `app/api/push/snooze-deadline-reminder/route.test.ts`

---

### Task 1: Migration `reminder_enabled` + type `Task`

**Files:**
- Create: `supabase/migrations/20260801100000_add_task_reminder_enabled.sql`
- Modify: `types/index.ts`

**Interfaces:**
- Produces: colonne `tasks.reminder_enabled boolean not null default true` ; `Task.reminder_enabled: boolean`.

- [ ] **Step 1: Créer la migration**

```sql
alter table tasks
  add column reminder_enabled boolean not null default true;

comment on column tasks.reminder_enabled is
  'Issue #114 : désactive la notif de rappel pour cette tâche précise, indépendamment de reminder_offset_minutes.';
```

- [ ] **Step 2: Appliquer la migration en local**

Run: `npx supabase db push` (ou la commande locale habituelle du projet pour appliquer les migrations — vérifier `npx supabase migration list --linked` avant/après si un doute sur l'ordre, cf. CLAUDE.md « Migrations Supabase hors-ordre »).

- [ ] **Step 3: Ajouter le champ à `Task`**

Dans `types/index.ts`, juste après `reminder_offset_minutes: number | null;` (ligne ~71) :

```ts
  // Issue #114 : désactive le rappel pour cette tâche précise (opt-out par
  // tâche, indépendant de reminder_offset_minutes qui ne fait que régler le
  // délai). true par défaut (migration 20260801100000).
  reminder_enabled: boolean;
```

- [ ] **Step 4: Vérifier les types**

Run: `npx tsc --noEmit`
Expected: aucune nouvelle erreur (les objets `Task` littéraux existants dans les tests devront inclure `reminder_enabled` — corriger au fil des erreurs si le compilateur en signale).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260801100000_add_task_reminder_enabled.sql types/index.ts
git commit -m "feat: colonne tasks.reminder_enabled (#114)"
```

---

### Task 2: Helpers d'émission Inngest + types d'event

**Files:**
- Create: `lib/inngest/functions/schedule-deadline-reminder.types.ts`
- Create: `lib/inngest/deadline-reminder.ts`

**Interfaces:**
- Produces: `ScheduleDeadlineReminderEvent`, `CancelDeadlineReminderEvent`, `scheduleDeadlineReminder(params): Promise<void>`, `cancelDeadlineReminder(taskId: string): Promise<void>`.

- [ ] **Step 1: Créer les types d'event**

`lib/inngest/functions/schedule-deadline-reminder.types.ts` :

```ts
// Issue #114 : events du moteur de rappel avant deadline. offsetMinutes
// voyage dans l'event (jamais recalculé côté fonction Inngest, cohérent avec
// le déterminisme requis par les retries — cf. SendReminderEvent).
export interface ScheduleDeadlineReminderEvent {
  name: "task/deadline-reminder-set";
  data: {
    taskId: string;
    userId: string;
    deadlineAt: string; // ISO UTC, valeur de tasks.deadline_at à l'émission
    offsetMinutes: number; // résolu (task.reminder_offset_minutes ?? profile.reminder_offset_minutes)
  };
}

export interface CancelDeadlineReminderEvent {
  name: "task/deadline-reminder-cleared";
  data: { taskId: string };
}
```

- [ ] **Step 2: Créer les helpers d'émission**

`lib/inngest/deadline-reminder.ts` :

```ts
import { inngest } from "@/lib/inngest/client";

interface ScheduleDeadlineReminderParams {
  taskId: string;
  userId: string;
  deadlineAt: string;
  offsetMinutes: number;
}

// Issue #114 : émission best-effort — un échec ne doit jamais faire échouer
// l'action utilisateur qui l'a déclenché (même philosophie que l'envoi push
// existant, qui catch ses propres erreurs réseau).
export async function scheduleDeadlineReminder(params: ScheduleDeadlineReminderParams): Promise<void> {
  try {
    await inngest.send({ name: "task/deadline-reminder-set", data: params });
  } catch {
    // best-effort
  }
}

export async function cancelDeadlineReminder(taskId: string): Promise<void> {
  try {
    await inngest.send({ name: "task/deadline-reminder-cleared", data: { taskId } });
  } catch {
    // best-effort
  }
}
```

- [ ] **Step 3: Vérifier les types**

Run: `npx tsc --noEmit`
Expected: aucune nouvelle erreur.

- [ ] **Step 4: Commit**

```bash
git add lib/inngest/functions/schedule-deadline-reminder.types.ts lib/inngest/deadline-reminder.ts
git commit -m "feat: helpers d'émission du moteur de rappel deadline (#114)"
```

---

### Task 3: Copy `buildDeadlineReminderPayload`

**Files:**
- Modify: `lib/copy/deadline.ts`
- Create: `lib/copy/deadline.test.ts`

**Interfaces:**
- Produces: `buildDeadlineReminderPayload(taskTitle: string, offsetMinutes: number, level: AggressivityLevel, seed?: number): { title: string; body: string; url: string }`.

- [ ] **Step 1: Write the failing test**

Create `lib/copy/deadline.test.ts` :

```ts
import { describe, expect, test } from "vitest";
import { buildDeadlineReminderPayload, deadlineAlertLine } from "./deadline";

describe("buildDeadlineReminderPayload", () => {
  const levels = ["doux", "direct", "brut"] as const;

  test("chaque niveau produit un body non vide pour un offset > 0", () => {
    for (const level of levels) {
      const payload = buildDeadlineReminderPayload("Ranger la chambre", 15, level, 0);
      expect(payload.body.length).toBeGreaterThan(0);
      expect(payload.title).toBe("Dodojo — Deadline qui approche");
      expect(payload.url).toBe("/");
    }
  });

  test("gère offsetMinutes === 0 sans jamais écrire 'dans 0 min'", () => {
    for (const level of levels) {
      const payload = buildDeadlineReminderPayload("Ranger la chambre", 0, level, 0);
      expect(payload.body).not.toMatch(/dans 0 min/);
    }
  });

  test("le titre de la tâche apparaît dans le corps du message", () => {
    const payload = buildDeadlineReminderPayload("Appeler le dentiste", 10, "direct", 0);
    expect(payload.body).toContain("Appeler le dentiste");
  });

  test("le seed est déterministe (même seed → même variante)", () => {
    const a = buildDeadlineReminderPayload("Tâche", 10, "direct", 2);
    const b = buildDeadlineReminderPayload("Tâche", 10, "direct", 2);
    expect(a.body).toBe(b.body);
  });
});

// Garde de non-régression : deadlineAlertLine existant n'est pas cassé par
// l'ajout du nouvel export dans le même fichier.
describe("deadlineAlertLine (non-régression)", () => {
  test("reste fonctionnel", () => {
    const line = deadlineAlertLine("direct", { taskTitle: "Test", damage: 10 }, 0);
    expect(line).toContain("Test");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/copy/deadline.test.ts`
Expected: FAIL — `buildDeadlineReminderPayload` n'est pas exporté.

- [ ] **Step 3: Implement `buildDeadlineReminderPayload`**

Ajouter à la fin de `lib/copy/deadline.ts` (le fichier a déjà `deadlineAlertLine` + les imports `AggressivityLevel`/`pickVariant`/`randomSeed`) :

```ts
export interface DeadlineReminderPayload {
  title: string;
  body: string;
  url: string;
}

// Issue #114 : notif envoyée par lib/inngest/functions/schedule-deadline-reminder.ts
// avant l'échéance d'une deadline (≠ deadlineAlertLine, envoyée APRÈS coup).
export function buildDeadlineReminderPayload(
  taskTitle: string,
  offsetMinutes: number,
  level: AggressivityLevel,
  seed: number = randomSeed(),
): DeadlineReminderPayload {
  if (offsetMinutes === 0) {
    const atTimePools: Record<AggressivityLevel, Array<(t: string) => string>> = {
      doux: [
        (t) => `⏰ « ${t} » arrive à son heure, doucement.`,
        (t) => `⏰ C'est le moment pour « ${t} ».`,
      ],
      direct: [
        (t) => `⏰ « ${t} » : c'est l'heure.`,
        (t) => `⏰ Deadline atteinte pour « ${t} ».`,
      ],
      brut: [
        (t) => `⏰ « ${t} », c'est maintenant, bouge.`,
        (t) => `⏰ L'heure de « ${t} » est là, merde.`,
      ],
    };
    return {
      title: "Dodojo — Deadline qui approche",
      body: pickVariant(atTimePools[level], seed)(taskTitle),
      url: "/",
    };
  }

  const pools: Record<AggressivityLevel, Array<(t: string, n: number) => string>> = {
    doux: [
      (t, n) => `⏰ « ${t} » approche, encore ${n} min.`,
      (t, n) => `⏰ Dans ${n} min, « ${t} » arrive à son heure.`,
      (t, n) => `⏰ « ${t} » : ${n} min avant l'échéance, à ton rythme.`,
      (t, n) => `⏰ Un petit rappel pour « ${t} », ${n} min encore.`,
      (t, n) => `⏰ « ${t} » se rapproche, ${n} min restantes.`,
    ],
    direct: [
      (t, n) => `⏰ « ${t} » arrive dans ${n} min.`,
      (t, n) => `⏰ Rappel : ${n} min avant « ${t} ».`,
      (t, n) => `⏰ « ${t} » : deadline dans ${n} min.`,
      (t, n) => `⏰ Plus que ${n} min pour « ${t} ».`,
      (t, n) => `⏰ « ${t} » approche à grands pas (${n} min).`,
    ],
    brut: [
      (t, n) => `⏰ « ${t} », ${n} min et c'est fini, bouge.`,
      (t, n) => `⏰ ${n} min avant « ${t} », grouille.`,
      (t, n) => `⏰ « ${t} » te tombe dessus dans ${n} min.`,
      (t, n) => `⏰ Yo, ${n} min avant « ${t} », merde.`,
      (t, n) => `⏰ « ${t} » : ${n} min, magne-toi.`,
    ],
  };

  return {
    title: "Dodojo — Deadline qui approche",
    body: pickVariant(pools[level], seed)(taskTitle, offsetMinutes),
    url: "/",
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/copy/deadline.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/copy/deadline.ts lib/copy/deadline.test.ts
git commit -m "feat: copy des rappels de deadline (#114)"
```

---

### Task 4: Fonction Inngest `schedule-deadline-reminder`

**Files:**
- Create: `lib/inngest/functions/schedule-deadline-reminder.ts`
- Create: `lib/inngest/functions/schedule-deadline-reminder.test.ts`
- Modify: `app/api/inngest/route.ts`

**Interfaces:**
- Consumes: `ScheduleDeadlineReminderEvent`/`CancelDeadlineReminderEvent` (Task 2), `buildDeadlineReminderPayload` (Task 3).
- Produces: export `scheduleDeadlineReminder` (fonction Inngest — nom identique au helper d'émission du Task 2 mais dans un fichier différent ; l'implémenteur doit importer le bon selon le contexte : le helper depuis `lib/inngest/deadline-reminder.ts`, la fonction Inngest depuis `lib/inngest/functions/schedule-deadline-reminder.ts`).

- [ ] **Step 1: Write the failing test**

Create `lib/inngest/functions/schedule-deadline-reminder.test.ts` :

```ts
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const { sendNotificationMock, setVapidDetailsMock } = vi.hoisted(() => ({
  sendNotificationMock: vi.fn(),
  setVapidDetailsMock: vi.fn(),
}));

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: setVapidDetailsMock,
    sendNotification: sendNotificationMock,
  },
}));

type Row = Record<string, unknown>;

class FakeQueryBuilder implements PromiseLike<{ data: Row | Row[] | null; error: null }> {
  private filters: Array<(row: Row) => boolean> = [];
  private single = false;

  constructor(private readonly rows: Row[]) {}

  select(): this {
    return this;
  }
  eq(column: string, value: unknown): this {
    this.filters.push((row) => row[column] === value);
    return this;
  }
  maybeSingle(): this {
    this.single = true;
    return this;
  }

  private matched(): Row[] {
    return this.rows.filter((row) => this.filters.every((f) => f(row)));
  }

  then<TResult1 = { data: Row | Row[] | null; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Row | Row[] | null; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const matched = this.matched();
    const data = this.single ? (matched[0] ?? null) : matched;
    return Promise.resolve({ data, error: null as null }).then(onfulfilled ?? undefined) as PromiseLike<
      TResult1 | TResult2
    >;
  }
}

class FakeSupabaseClient {
  constructor(private readonly tables: Record<string, Row[]>) {}
  from(table: string): FakeQueryBuilder {
    return new FakeQueryBuilder(this.tables[table] ?? []);
  }
}

interface EventData {
  taskId: string;
  userId: string;
  deadlineAt: string;
  offsetMinutes: number;
}
const { inngestClientMock, capturedFns } = vi.hoisted(() => ({
  inngestClientMock: { createFunction: vi.fn() },
  capturedFns: [] as Array<{
    id: string;
    fn: (args: {
      event: { data: EventData };
      step: {
        sleepUntil: (id: string, date: Date) => Promise<void>;
        run: <T>(id: string, cb: () => T | Promise<T>) => Promise<T>;
      };
    }) => Promise<unknown>;
  }>,
}));

inngestClientMock.createFunction.mockImplementation(
  (
    opts: { id: string },
    fn: (args: {
      event: { data: EventData };
      step: {
        sleepUntil: (id: string, date: Date) => Promise<void>;
        run: <T>(id: string, cb: () => T | Promise<T>) => Promise<T>;
      };
    }) => Promise<unknown>,
  ) => {
    capturedFns.push({ id: opts.id, fn });
    return { id: opts.id, fn };
  },
);

vi.mock("@/lib/inngest/client", () => ({ inngest: inngestClientMock }));

let dbTables: Record<string, Row[]> = {};
vi.mock("@supabase/supabase-js", () => ({ createClient: () => new FakeSupabaseClient(dbTables) }));

function makeFakeStep() {
  return {
    sleepUntil: vi.fn(async () => undefined),
    run: vi.fn(async <T>(_id: string, cb: () => T | Promise<T>): Promise<T> => cb()),
  };
}

function baseTables(): Record<string, Row[]> {
  return {
    tasks: [
      {
        id: "t1",
        title: "Ranger la chambre",
        deadline_at: "2026-07-22T16:00:00.000Z",
        is_completed: false,
        is_abandoned: false,
        reminder_enabled: true,
      },
    ],
    profiles: [{ id: "u1", aggressivity_level: "direct" }],
    push_subscriptions: [{ endpoint: "https://push.example/u1", p256dh: "p", auth: "a" }],
  };
}

function stubEnv(): void {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fake.supabase.co");
  vi.stubEnv("NEXT_PRIVATE_KEY_SUPABASE", "fake-service-role-key");
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "fake-public-key");
  vi.stubEnv("VAPID_PRIVATE_KEY", "fake-private-key");
  vi.stubEnv("VAPID_SUBJECT", "mailto:test@dodojo.app");
}

beforeEach(async () => {
  dbTables = baseTables();
  stubEnv();
  sendNotificationMock.mockReset();
  setVapidDetailsMock.mockReset();
  capturedFns.length = 0;
  await import("./schedule-deadline-reminder");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function invoke(eventData: EventData) {
  const step = makeFakeStep();
  const captured = capturedFns.find((f) => f.id === "schedule-deadline-reminder");
  if (!captured) throw new Error("fonction non enregistrée");
  await captured.fn({ event: { data: eventData }, step });
  return step;
}

describe("schedule-deadline-reminder", () => {
  const baseEvent: EventData = {
    taskId: "t1",
    userId: "u1",
    deadlineAt: "2026-07-22T16:00:00.000Z",
    offsetMinutes: 15,
  };

  test("envoie le push si la tâche est toujours active et le rappel activé", async () => {
    await invoke(baseEvent);
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
  });

  test("n'envoie rien si la tâche est complétée depuis", async () => {
    dbTables.tasks[0].is_completed = true;
    await invoke(baseEvent);
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  test("n'envoie rien si la tâche est abandonnée depuis", async () => {
    dbTables.tasks[0].is_abandoned = true;
    await invoke(baseEvent);
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  test("n'envoie rien si reminder_enabled est passé à false depuis", async () => {
    dbTables.tasks[0].reminder_enabled = false;
    await invoke(baseEvent);
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  test("n'envoie rien si la deadline a changé depuis l'émission de l'event", async () => {
    dbTables.tasks[0].deadline_at = "2026-07-22T18:00:00.000Z";
    await invoke(baseEvent);
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  test("n'envoie rien si aucune souscription push n'existe", async () => {
    dbTables.push_subscriptions = [];
    await invoke(baseEvent);
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  test("dort jusqu'à deadlineAt − offsetMinutes", async () => {
    const step = await invoke(baseEvent);
    expect(step.sleepUntil).toHaveBeenCalledWith(
      "wait-until-reminder",
      new Date("2026-07-22T15:45:00.000Z"),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/inngest/functions/schedule-deadline-reminder.test.ts`
Expected: FAIL — le module `./schedule-deadline-reminder` n'existe pas.

- [ ] **Step 3: Implement the Inngest function**

Create `lib/inngest/functions/schedule-deadline-reminder.ts` :

```ts
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { inngest } from "@/lib/inngest/client";
import { buildDeadlineReminderPayload } from "@/lib/copy/deadline";
import type { AggressivityLevel } from "@/types";
import type { ScheduleDeadlineReminderEvent } from "./schedule-deadline-reminder.types";

interface TaskRow {
  id: string;
  title: string;
  deadline_at: string | null;
  is_completed: boolean;
  is_abandoned: boolean;
  reminder_enabled: boolean;
}
interface ProfileRow {
  aggressivity_level: AggressivityLevel;
}
interface SubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

function makeSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.NEXT_PRIVATE_KEY_SUPABASE;
  if (!url || !serviceKey) throw new Error("Supabase env missing");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

function configureVapid() {
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT;
  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    throw new Error("VAPID env missing");
  }
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

// Issue #114 : dort jusqu'à l'instant de rappel (deadlineAt − offsetMinutes)
// puis relit la base avant d'envoyer — jamais de replay si la tâche a changé
// d'état entre-temps. cancelOn sur l'event d'effacement (émis par
// app/actions/tasks.ts) supprime le run en amont ; ce re-check DB est un
// filet en profondeur pour les autres transitions (complétion, abandon,
// désactivation, changement de deadline).
export const scheduleDeadlineReminder = inngest.createFunction(
  {
    id: "schedule-deadline-reminder",
    triggers: { event: "task/deadline-reminder-set" satisfies ScheduleDeadlineReminderEvent["name"] },
    cancelOn: [{ event: "task/deadline-reminder-cleared", match: "data.taskId" }],
    // Inclut offsetMinutes : le snooze (amélioration C) réémet le même event
    // avec un offsetMinutes synthétique différent pour reprogrammer un
    // nouveau réveil — sans offsetMinutes dans la clé, ce second event serait
    // à tort dédoublonné contre le premier.
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

    // Si wakeAt est déjà passé, sleepUntil ne bloque pas — la notif part
    // quasi immédiatement (comportement assumé, cf. spec).
    await step.sleepUntil("wait-until-reminder", wakeAt);

    const context = await step.run("check-still-valid", async () => {
      const supabase = makeSupabaseClient();
      const { data: taskData } = await supabase
        .from("tasks")
        .select("id, title, deadline_at, is_completed, is_abandoned, reminder_enabled")
        .eq("id", taskId)
        .maybeSingle();
      const task = taskData as TaskRow | null;
      if (!task || task.is_completed || task.is_abandoned || !task.reminder_enabled) return null;
      if (task.deadline_at !== deadlineAt) return null;

      const { data: profileData } = await supabase
        .from("profiles")
        .select("aggressivity_level")
        .eq("id", userId)
        .maybeSingle();
      const profile = profileData as ProfileRow | null;

      const { data: subsData } = await supabase
        .from("push_subscriptions")
        .select("endpoint, p256dh, auth")
        .eq("user_id", userId);
      const subs = (subsData ?? []) as SubscriptionRow[];

      return { taskTitle: task.title, level: profile?.aggressivity_level ?? ("direct" as const), subs };
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/inngest/functions/schedule-deadline-reminder.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Enregistrer la fonction dans la route Inngest**

Modifier `app/api/inngest/route.ts` :

```ts
import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { sendReminder } from "@/lib/inngest/functions/send-reminder";
import { reminderFanout } from "@/lib/inngest/functions/reminder-fanout";
import { scheduleDeadlineReminder } from "@/lib/inngest/functions/schedule-deadline-reminder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [reminderFanout, sendReminder, scheduleDeadlineReminder],
});
```

- [ ] **Step 6: Commit**

```bash
git add lib/inngest/functions/schedule-deadline-reminder.ts lib/inngest/functions/schedule-deadline-reminder.test.ts app/api/inngest/route.ts
git commit -m "feat: fonction Inngest schedule-deadline-reminder (#114)"
```

---

### Task 5: `setTaskDeadline` étendu

**Files:**
- Modify: `app/actions/tasks.ts` (fonction `setTaskDeadline`, ligne ~698)
- Modify: `app/actions/tasks.test.ts`

**Interfaces:**
- Consumes: `scheduleDeadlineReminder`/`cancelDeadlineReminder` (Task 2).
- Produces: `setTaskDeadline(id: string, deadlineAt: string | null, reminderOffsetMinutes?: number | null, reminderEnabled?: boolean): Promise<TaskActionResult>` — signature étendue, **compatible avec tous les appels existants** (2 arguments toujours valides).

- [ ] **Step 1: Write the failing tests**

Ajouter à `app/actions/tasks.test.ts`, dans le describe existant ou un nouveau `describe("setTaskDeadline — moteur de rappel (#114)", ...)` :

```ts
describe("setTaskDeadline — moteur de rappel (#114)", () => {
  test("émet un cancel puis un schedule quand une deadline non nulle est posée", async () => {
    fakeClient = new FakeSupabaseClient({
      profiles: [{ id: "u1", level: 1, xp: 0, timezone: "UTC", reminder_offset_minutes: 30 }],
      tasks: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          user_id: "u1",
          reminder_enabled: true,
          reminder_offset_minutes: null,
        },
      ],
    });
    const { setTaskDeadline } = await import("./tasks");
    const result = await setTaskDeadline(
      "11111111-1111-1111-1111-111111111111",
      "2026-08-01T16:00:00.000Z",
    );
    expect(result.error).toBeNull();
    expect(cancelCalls).toEqual(["11111111-1111-1111-1111-111111111111"]);
    expect(scheduleCalls).toEqual([
      {
        taskId: "11111111-1111-1111-1111-111111111111",
        userId: "u1",
        deadlineAt: "2026-08-01T16:00:00.000Z",
        offsetMinutes: 30,
      },
    ]);
  });

  test("utilise l'override par tâche plutôt que le défaut du profil", async () => {
    fakeClient = new FakeSupabaseClient({
      profiles: [{ id: "u1", level: 1, xp: 0, timezone: "UTC", reminder_offset_minutes: 30 }],
      tasks: [
        {
          id: "22222222-2222-2222-2222-222222222222",
          user_id: "u1",
          reminder_enabled: true,
          reminder_offset_minutes: 5,
        },
      ],
    });
    const { setTaskDeadline } = await import("./tasks");
    await setTaskDeadline("22222222-2222-2222-2222-222222222222", "2026-08-01T16:00:00.000Z");
    expect(scheduleCalls[0].offsetMinutes).toBe(5);
  });

  test("n'émet qu'un cancel quand reminder_enabled est false", async () => {
    fakeClient = new FakeSupabaseClient({
      profiles: [{ id: "u1", level: 1, xp: 0, timezone: "UTC", reminder_offset_minutes: 30 }],
      tasks: [
        {
          id: "33333333-3333-3333-3333-333333333333",
          user_id: "u1",
          reminder_enabled: false,
          reminder_offset_minutes: null,
        },
      ],
    });
    const { setTaskDeadline } = await import("./tasks");
    await setTaskDeadline("33333333-3333-3333-3333-333333333333", "2026-08-01T16:00:00.000Z");
    expect(cancelCalls).toEqual(["33333333-3333-3333-3333-333333333333"]);
    expect(scheduleCalls).toEqual([]);
  });

  test("n'émet qu'un cancel quand deadlineAt est null (effacement)", async () => {
    fakeClient = new FakeSupabaseClient({
      profiles: [{ id: "u1", level: 1, xp: 0, timezone: "UTC", reminder_offset_minutes: 30 }],
      tasks: [
        {
          id: "44444444-4444-4444-4444-444444444444",
          user_id: "u1",
          reminder_enabled: true,
          reminder_offset_minutes: null,
        },
      ],
    });
    const { setTaskDeadline } = await import("./tasks");
    await setTaskDeadline("44444444-4444-4444-4444-444444444444", null);
    expect(cancelCalls).toEqual(["44444444-4444-4444-4444-444444444444"]);
    expect(scheduleCalls).toEqual([]);
  });
});
```

En tête de `app/actions/tasks.test.ts`, ajouter les mocks (à côté des mocks existants `@/lib/supabase/server`/`next/cache`) :

```ts
let cancelCalls: string[] = [];
let scheduleCalls: Array<{ taskId: string; userId: string; deadlineAt: string; offsetMinutes: number }> = [];

vi.mock("@/lib/inngest/deadline-reminder", () => ({
  cancelDeadlineReminder: async (taskId: string) => {
    cancelCalls.push(taskId);
  },
  scheduleDeadlineReminder: async (params: {
    taskId: string;
    userId: string;
    deadlineAt: string;
    offsetMinutes: number;
  }) => {
    scheduleCalls.push(params);
  },
}));
```

Et dans le `beforeEach` existant, ajouter :

```ts
  cancelCalls = [];
  scheduleCalls = [];
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/actions/tasks.test.ts`
Expected: FAIL — `cancelCalls`/`scheduleCalls` restent vides (le mock n'est pas encore appelé par `setTaskDeadline`).

- [ ] **Step 3: Implement the extended `setTaskDeadline`**

Ajouter l'import en tête de `app/actions/tasks.ts` :

```ts
import { cancelDeadlineReminder, scheduleDeadlineReminder } from "@/lib/inngest/deadline-reminder";
```

Remplacer la fonction existante (lignes ~698-729) :

```ts
// US-05 : fixe/modifie/efface l'heure limite d'une tâche (popover ⏰ sur
// TaskRow, ou le bouton "Repousser +1h" de l'Attaque Surprise). `deadlineAt` =
// ISO complet (UTC) ou null pour effacer.
// Issue #114 : reminderOffsetMinutes/reminderEnabled optionnels — undefined =
// ne touche pas la colonne correspondante (ex. "Repousser +1h" ne change que
// l'heure, les réglages de rappel existants sont conservés).
export async function setTaskDeadline(
  id: string,
  deadlineAt: string | null,
  reminderOffsetMinutes?: number | null,
  reminderEnabled?: boolean,
): Promise<TaskActionResult> {
  if (!UUID_RE.test(id)) {
    return { error: "Cette tâche n'est pas encore prête, réessaie dans un instant." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Session expirée. Reconnecte-toi." };
  }

  const updates: Record<string, unknown> = { deadline_at: deadlineAt };
  if (reminderOffsetMinutes !== undefined) updates.reminder_offset_minutes = reminderOffsetMinutes;
  if (reminderEnabled !== undefined) updates.reminder_enabled = reminderEnabled;

  const { error } = await supabase.from("tasks").update(updates).eq("id", id).eq("user_id", user.id);

  if (error) {
    return { error: "Impossible de fixer cette deadline. Réessaie." };
  }

  if (deadlineAt === null) {
    await cancelDeadlineReminder(id);
  } else {
    const { data: resolved } = await supabase
      .from("tasks")
      .select("reminder_enabled, reminder_offset_minutes")
      .eq("id", id)
      .maybeSingle();

    if (resolved?.reminder_enabled) {
      const { data: profileRow } = await supabase
        .from("profiles")
        .select("reminder_offset_minutes")
        .eq("id", user.id)
        .maybeSingle();
      const offset = resolved.reminder_offset_minutes ?? profileRow?.reminder_offset_minutes ?? 30;
      await cancelDeadlineReminder(id);
      await scheduleDeadlineReminder({ taskId: id, userId: user.id, deadlineAt, offsetMinutes: offset });
    } else {
      await cancelDeadlineReminder(id);
    }
  }

  revalidatePath("/");
  return { error: null };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/actions/tasks.test.ts`
Expected: PASS (tous les tests existants + les 4 nouveaux).

- [ ] **Step 5: Commit**

```bash
git add app/actions/tasks.ts app/actions/tasks.test.ts
git commit -m "feat: setTaskDeadline programme/annule le rappel Inngest (#114)"
```

---

### Task 6: Annulation — fonctions à id unique déjà connu

**Files:**
- Modify: `app/actions/tasks.ts` (`setTaskCompleted` ligne ~212, `rageQuitTask` ligne ~353)
- Modify: `app/actions/tasks.test.ts`

**Interfaces:**
- Consumes: `cancelDeadlineReminder` (Task 2, déjà importé au Task 5).

- [ ] **Step 1: Write the failing tests**

Ajouter à `app/actions/tasks.test.ts` :

```ts
describe("Annulation du rappel deadline sur transition (#114)", () => {
  test("setTaskCompleted(true) annule le rappel de la tâche", async () => {
    fakeClient = new FakeSupabaseClient({
      profiles: [{ id: "u1", level: 1, xp: 0, timezone: "UTC" }],
      tasks: [
        {
          id: "55555555-5555-5555-5555-555555555555",
          user_id: "u1",
          is_completed: false,
          is_abandoned: false,
          xp_awarded: null,
        },
      ],
    });
    const { setTaskCompleted } = await import("./tasks");
    await setTaskCompleted("55555555-5555-5555-5555-555555555555", true);
    expect(cancelCalls).toContain("55555555-5555-5555-5555-555555555555");
  });

  test("setTaskCompleted(false) n'annule rien (décochage, pas de reschedule)", async () => {
    fakeClient = new FakeSupabaseClient({
      profiles: [{ id: "u1", level: 1, xp: 0, timezone: "UTC" }],
      tasks: [
        {
          id: "66666666-6666-6666-6666-666666666666",
          user_id: "u1",
          is_completed: true,
          is_abandoned: false,
          xp_awarded: 10,
        },
      ],
    });
    const { setTaskCompleted } = await import("./tasks");
    await setTaskCompleted("66666666-6666-6666-6666-666666666666", false);
    expect(cancelCalls).toEqual([]);
  });

  test("rageQuitTask annule le rappel de toutes les tâches de la cascade", async () => {
    fakeClient = new FakeSupabaseClient({
      profiles: [{ id: "u1", level: 1, xp: 0 }],
      tasks: [
        {
          id: "77777777-7777-7777-7777-777777777777",
          user_id: "u1",
          parent_id: null,
          is_completed: false,
          is_abandoned: false,
        },
        {
          id: "88888888-8888-8888-8888-888888888888",
          user_id: "u1",
          parent_id: "77777777-7777-7777-7777-777777777777",
          is_completed: false,
          is_abandoned: false,
        },
      ],
    });
    const { rageQuitTask } = await import("./tasks");
    await rageQuitTask("77777777-7777-7777-7777-777777777777");
    expect(cancelCalls).toEqual(
      expect.arrayContaining([
        "77777777-7777-7777-7777-777777777777",
        "88888888-8888-8888-8888-888888888888",
      ]),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/actions/tasks.test.ts`
Expected: FAIL sur les 3 nouveaux tests (`cancelCalls` reste vide).

- [ ] **Step 3: Wire `cancelDeadlineReminder` in `setTaskCompleted`**

Dans `setTaskCompleted` (app/actions/tasks.ts, après le bloc `if (updateError) { ... }`, avant `const isRealTransition = ...`) :

```ts
  if (isCompleted) {
    await cancelDeadlineReminder(id);
  }
```

- [ ] **Step 4: Wire `cancelDeadlineReminder` in `rageQuitTask`**

Dans `rageQuitTask`, juste après le bloc `if (error) { return { error: ... }; }` qui suit le `.update(...).in("id", cascadeIds)` :

```ts
  await Promise.allSettled(cascadeIds.map((cascadeId) => cancelDeadlineReminder(cascadeId)));
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run app/actions/tasks.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/actions/tasks.ts app/actions/tasks.test.ts
git commit -m "feat: annule le rappel deadline à la complétion/Rage Quit (#114)"
```

---

### Task 7: Annulation — fonctions nécessitant un `.select("id")` ajouté

**Files:**
- Modify: `app/actions/tasks.ts` (`completeOverdueTask` ligne ~548, `annihilateOverdueTask` ligne ~625, `annihilateOverdueOlderThan` ligne ~682)
- Modify: `app/actions/tasks.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
describe("Annulation du rappel deadline — actions du Réveil (#114)", () => {
  test("completeOverdueTask annule le rappel de la tâche et de sa cascade", async () => {
    fakeClient = new FakeSupabaseClient({
      profiles: [{ id: "u1", level: 1, xp: 0 }],
      tasks: [
        { id: "aaaaaaaa-0000-0000-0000-000000000001", user_id: "u1", is_abandoned: false },
      ],
    });
    const { completeOverdueTask } = await import("./tasks");
    await completeOverdueTask("aaaaaaaa-0000-0000-0000-000000000001");
    expect(cancelCalls).toContain("aaaaaaaa-0000-0000-0000-000000000001");
  });

  test("annihilateOverdueTask annule le rappel de la tâche", async () => {
    fakeClient = new FakeSupabaseClient({
      profiles: [{ id: "u1", level: 1, xp: 0 }],
      tasks: [{ id: "aaaaaaaa-0000-0000-0000-000000000002", user_id: "u1" }],
    });
    const { annihilateOverdueTask } = await import("./tasks");
    await annihilateOverdueTask("aaaaaaaa-0000-0000-0000-000000000002");
    expect(cancelCalls).toContain("aaaaaaaa-0000-0000-0000-000000000002");
  });

  test("annihilateOverdueOlderThan annule le rappel de toutes les tâches affectées", async () => {
    fakeClient = new FakeSupabaseClient({
      profiles: [{ id: "u1", level: 1, xp: 0 }],
      tasks: [
        {
          id: "aaaaaaaa-0000-0000-0000-000000000003",
          user_id: "u1",
          day_date: "2026-01-01",
          is_completed: false,
          is_abandoned: false,
        },
      ],
    });
    const { annihilateOverdueOlderThan } = await import("./tasks");
    await annihilateOverdueOlderThan(3);
    expect(cancelCalls).toContain("aaaaaaaa-0000-0000-0000-000000000003");
  });
});
```

> Note pour l'implémenteur : le `FakeQueryBuilder`/`FakeSupabaseClient` existant dans `app/actions/tasks.test.ts` fait matcher `.eq()` sur tout (`filters.push(() => true)`, cf. ligne 34-37) — les filtres `lt`/`gt` éventuels ne sont pas simulés finement, ce qui suffit pour ces tests (ils vérifient seulement que `cancelDeadlineReminder` est appelé, pas la précision du filtre SQL). Si le fake ne supporte pas encore `.lt()`, l'ajouter comme `eq()` (retourne `this`, ignore la comparaison) avant de lancer ces tests.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/actions/tasks.test.ts`
Expected: FAIL sur les 3 nouveaux tests.

- [ ] **Step 3: Implement**

Dans `completeOverdueTask` (app/actions/tasks.ts ~548), ajouter `.select("id")` à la requête et boucler sur le résultat :

```ts
  const { data: updated, error } = await supabase
    .from("tasks")
    .update({ is_completed: true, deferred_at: null })
    .or(`id.eq.${id},parent_id.eq.${id}`)
    .eq("user_id", user.id)
    .eq("is_abandoned", false)
    .select("id");

  if (error) return { error: "Impossible de valider ce reste. Réessaie." };
  await Promise.allSettled((updated ?? []).map((row) => cancelDeadlineReminder(row.id as string)));
  revalidatePath("/");
  return { error: null };
```

Dans `annihilateOverdueTask` (~625), même principe :

```ts
  const { data: updated, error } = await supabase
    .from("tasks")
    .update({ is_abandoned: true, abandon_reason: "annihilated" })
    .or(`id.eq.${id},parent_id.eq.${id}`)
    .eq("user_id", user.id)
    .select("id");

  if (error) return { error: "Impossible d'annihiler ce reste. Réessaie." };
  await Promise.allSettled((updated ?? []).map((row) => cancelDeadlineReminder(row.id as string)));
  revalidatePath("/");
  return { error: null };
```

Dans `annihilateOverdueOlderThan` (~682) :

```ts
  const { data: updated, error } = await supabase
    .from("tasks")
    .update({ is_abandoned: true, abandon_reason: "annihilated" })
    .eq("user_id", user.id)
    .lt("day_date", cutoff)
    .eq("is_completed", false)
    .eq("is_abandoned", false)
    .select("id");

  if (error) return { error: "Impossible d'annihiler les vieux restes. Réessaie." };
  await Promise.allSettled((updated ?? []).map((row) => cancelDeadlineReminder(row.id as string)));
  revalidatePath("/");
  return { error: null };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/actions/tasks.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/actions/tasks.ts app/actions/tasks.test.ts
git commit -m "feat: annule le rappel deadline sur les actions groupées du Réveil (#114)"
```

---

### Task 8: Annulation — fonctions retournant déjà les lignes modifiées

**Files:**
- Modify: `app/actions/tasks.ts` (`deferOverdueTask` ~586, `deferAllOverdue` ~646, `reportToTomorrow` ~805, `bringToToday` ~850)
- Modify: `app/actions/tasks.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
describe("Annulation du rappel deadline — report/retour (#114)", () => {
  test("deferOverdueTask annule le rappel des lignes reportées", async () => {
    fakeClient = new FakeSupabaseClient({
      profiles: [{ id: "u1", level: 1, xp: 0, timezone: "UTC" }],
      tasks: [{ id: "bbbbbbbb-0000-0000-0000-000000000001", user_id: "u1", is_abandoned: false }],
    });
    const { deferOverdueTask } = await import("./tasks");
    await deferOverdueTask("bbbbbbbb-0000-0000-0000-000000000001");
    expect(cancelCalls).toContain("bbbbbbbb-0000-0000-0000-000000000001");
  });

  test("deferAllOverdue annule le rappel de toutes les lignes reportées", async () => {
    fakeClient = new FakeSupabaseClient({
      profiles: [{ id: "u1", level: 1, xp: 0, timezone: "UTC" }],
      tasks: [
        {
          id: "bbbbbbbb-0000-0000-0000-000000000002",
          user_id: "u1",
          day_date: "2026-01-01",
          is_completed: false,
          is_abandoned: false,
        },
      ],
    });
    const { deferAllOverdue } = await import("./tasks");
    await deferAllOverdue();
    expect(cancelCalls).toContain("bbbbbbbb-0000-0000-0000-000000000002");
  });

  test("reportToTomorrow annule le rappel des lignes reportées", async () => {
    fakeClient = new FakeSupabaseClient({
      profiles: [{ id: "u1", level: 1, xp: 0, timezone: "UTC" }],
      tasks: [
        {
          id: "bbbbbbbb-0000-0000-0000-000000000003",
          user_id: "u1",
          day_date: "2026-08-01",
          is_completed: false,
          is_abandoned: false,
        },
      ],
    });
    const { reportToTomorrow } = await import("./tasks");
    await reportToTomorrow("bbbbbbbb-0000-0000-0000-000000000003");
    expect(cancelCalls).toContain("bbbbbbbb-0000-0000-0000-000000000003");
  });

  test("bringToToday annule le rappel des lignes ramenées", async () => {
    fakeClient = new FakeSupabaseClient({
      profiles: [{ id: "u1", level: 1, xp: 0, timezone: "UTC" }],
      tasks: [
        { id: "bbbbbbbb-0000-0000-0000-000000000004", user_id: "u1", is_abandoned: false },
      ],
    });
    const { bringToToday } = await import("./tasks");
    await bringToToday("bbbbbbbb-0000-0000-0000-000000000004");
    expect(cancelCalls).toContain("bbbbbbbb-0000-0000-0000-000000000004");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/actions/tasks.test.ts`
Expected: FAIL sur les 4 nouveaux tests.

- [ ] **Step 3: Implement**

Dans chacune des 4 fonctions, juste après le bloc `if (error) return { error: ... }` et **avant** `revalidatePath("/")`, ajouter (adapter le nom de variable selon la fonction — `updated` est déjà le nom utilisé dans les 4) :

```ts
  await Promise.allSettled((updated ?? []).map((row) => cancelDeadlineReminder(row.id as string)));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/actions/tasks.test.ts`
Expected: PASS — l'ensemble de `app/actions/tasks.test.ts` passe (aucune régression sur les tests pré-existants).

- [ ] **Step 5: Commit**

```bash
git add app/actions/tasks.ts app/actions/tasks.test.ts
git commit -m "feat: annule le rappel deadline sur report/retour de tâches (#114)"
```

---

### Task 9: `lib/game-engine.ts` — `upcomingReminderTasks` (amélioration A)

**Files:**
- Modify: `lib/game-engine.ts`
- Modify: `lib/game-engine.test.ts`

**Interfaces:**
- Produces: `upcomingReminderTasks(tasks: ReminderTask[], now: Date, profileDefaultOffsetMinutes: number): ReminderTask[]`.

- [ ] **Step 1: Write the failing tests**

Ajouter à `lib/game-engine.test.ts` :

```ts
describe("upcomingReminderTasks", () => {
  const base = {
    id: "t1",
    title: "Tâche",
    is_completed: false,
    is_abandoned: false,
    reminder_enabled: true,
    reminder_offset_minutes: null as number | null,
  };

  test("inclut une tâche dans sa fenêtre de rappel (offset profil)", () => {
    const now = new Date("2026-08-01T15:45:00.000Z");
    const tasks = [{ ...base, deadline_at: "2026-08-01T16:00:00.000Z" }];
    expect(upcomingReminderTasks(tasks, now, 30)).toHaveLength(1);
  });

  test("exclut une tâche hors fenêtre (trop tôt)", () => {
    const now = new Date("2026-08-01T15:00:00.000Z");
    const tasks = [{ ...base, deadline_at: "2026-08-01T16:00:00.000Z" }];
    expect(upcomingReminderTasks(tasks, now, 30)).toHaveLength(0);
  });

  test("exclut une tâche dont la deadline est déjà passée", () => {
    const now = new Date("2026-08-01T16:30:00.000Z");
    const tasks = [{ ...base, deadline_at: "2026-08-01T16:00:00.000Z" }];
    expect(upcomingReminderTasks(tasks, now, 30)).toHaveLength(0);
  });

  test("utilise l'override par tâche plutôt que le défaut du profil", () => {
    const now = new Date("2026-08-01T15:57:00.000Z");
    const tasks = [{ ...base, deadline_at: "2026-08-01T16:00:00.000Z", reminder_offset_minutes: 5 }];
    expect(upcomingReminderTasks(tasks, now, 30)).toHaveLength(1);
  });

  test("exclut une tâche avec reminder_enabled=false", () => {
    const now = new Date("2026-08-01T15:45:00.000Z");
    const tasks = [{ ...base, deadline_at: "2026-08-01T16:00:00.000Z", reminder_enabled: false }];
    expect(upcomingReminderTasks(tasks, now, 30)).toHaveLength(0);
  });

  test("exclut une tâche complétée ou abandonnée", () => {
    const now = new Date("2026-08-01T15:45:00.000Z");
    const completed = { ...base, deadline_at: "2026-08-01T16:00:00.000Z", is_completed: true };
    const abandoned = { ...base, deadline_at: "2026-08-01T16:00:00.000Z", is_abandoned: true };
    expect(upcomingReminderTasks([completed, abandoned], now, 30)).toHaveLength(0);
  });

  test("exclut une tâche sans deadline", () => {
    const now = new Date("2026-08-01T15:45:00.000Z");
    const tasks = [{ ...base, deadline_at: null }];
    expect(upcomingReminderTasks(tasks, now, 30)).toHaveLength(0);
  });
});
```

Ajouter l'import correspondant en tête de `lib/game-engine.test.ts` si les imports sont nommés (`import { ..., upcomingReminderTasks } from "./game-engine"`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/game-engine.test.ts`
Expected: FAIL — `upcomingReminderTasks` n'est pas exporté.

- [ ] **Step 3: Implement**

Ajouter à `lib/game-engine.ts`, juste après `deadlineHpPenalties` (~ligne 411) :

```ts
export type ReminderTask = Pick<
  Task,
  "id" | "title" | "deadline_at" | "is_completed" | "is_abandoned" | "reminder_enabled" | "reminder_offset_minutes"
>;

// Issue #114 (amélioration A) : tâches actuellement dans leur fenêtre de
// rappel (deadline − offset effectif ≤ now < deadline), non complétées/
// abandonnées, rappel activé. Alimente le filet in-app (toast, Arena.tsx)
// quand l'app est ouverte — fonctionne indépendamment de push. `now` explicite
// pour rester testable sans horloge système réelle (même patron que
// missedDeadlineTasks).
export function upcomingReminderTasks(
  tasks: ReminderTask[],
  now: Date,
  profileDefaultOffsetMinutes: number,
): ReminderTask[] {
  const nowMs = now.getTime();
  return tasks.filter((task) => {
    if (task.deadline_at === null || task.is_completed || task.is_abandoned || !task.reminder_enabled) {
      return false;
    }
    const deadlineMs = new Date(task.deadline_at).getTime();
    const offsetMinutes = task.reminder_offset_minutes ?? profileDefaultOffsetMinutes;
    const windowStart = deadlineMs - offsetMinutes * 60_000;
    return nowMs >= windowStart && nowMs < deadlineMs;
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/game-engine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/game-engine.ts lib/game-engine.test.ts
git commit -m "feat: upcomingReminderTasks pour le filet in-app (#114)"
```

---

### Task 10: `DeadlineControl.tsx` — select "Me notifier"

**Files:**
- Modify: `components/combat/DeadlineControl.tsx`

**Interfaces:**
- Produces: `DeadlineControlProps` étendu (`reminderOffsetMinutes`, `reminderEnabled`, `profileDefaultOffsetMinutes`), `onSave(deadlineAt, reminderOffsetMinutes, reminderEnabled)`.

- [ ] **Step 1: Modify the component**

Remplacer le contenu de `components/combat/DeadlineControl.tsx` :

```tsx
"use client";

import { useRef, useState } from "react";
import { deadlineIso, localTimeFromIso } from "@/lib/game-engine";
import { useFocusTrap } from "@/hooks/useFocusTrap";

interface DeadlineControlProps {
  taskId: string;
  taskTitle: string;
  deadlineAt: string | null;
  dayDate: string;
  timezone: string;
  disabled?: boolean;
  // Issue #114 : état actuel du réglage de rappel de cette tâche.
  reminderOffsetMinutes: number | null;
  reminderEnabled: boolean;
  profileDefaultOffsetMinutes: number;
  onSave: (
    deadlineAt: string | null,
    reminderOffsetMinutes: number | null,
    reminderEnabled: boolean,
  ) => void;
}

const OFFSET_OPTIONS = [0, 5, 10, 15, 30, 60, 120, 240];

function offsetLabel(minutes: number): string {
  if (minutes === 0) return "À l'heure";
  if (minutes < 60) return `${minutes} min avant`;
  return `${minutes / 60}h avant`;
}

function reminderSelectValue(reminderEnabled: boolean, reminderOffsetMinutes: number | null): string {
  if (!reminderEnabled) return "off";
  if (reminderOffsetMinutes === null) return "default";
  return String(reminderOffsetMinutes);
}

// US-05 : icône ⏰ sur TaskRow (racine et sous-tâche) — popover inline avec un
// sélecteur d'heure natif pour fixer/modifier/effacer la deadline du jour de
// la tâche. Issue #114 : ajoute un select "Me notifier" (délai avant deadline
// + option "Pas de notif").
export default function DeadlineControl({
  taskId,
  taskTitle,
  deadlineAt,
  dayDate,
  timezone,
  disabled = false,
  reminderOffsetMinutes,
  reminderEnabled,
  profileDefaultOffsetMinutes,
  onSave,
}: DeadlineControlProps) {
  const [open, setOpen] = useState(false);
  const [time, setTime] = useState(() =>
    deadlineAt ? localTimeFromIso(deadlineAt, timezone) : "",
  );
  const [reminderValue, setReminderValue] = useState(() =>
    reminderSelectValue(reminderEnabled, reminderOffsetMinutes),
  );

  function handleOpen() {
    setTime(deadlineAt ? localTimeFromIso(deadlineAt, timezone) : "");
    setReminderValue(reminderSelectValue(reminderEnabled, reminderOffsetMinutes));
    setOpen(true);
  }

  function resolveReminder(): { offsetMinutes: number | null; enabled: boolean } {
    if (reminderValue === "off") return { offsetMinutes: reminderOffsetMinutes, enabled: false };
    if (reminderValue === "default") return { offsetMinutes: null, enabled: true };
    return { offsetMinutes: Number(reminderValue), enabled: true };
  }

  function handleSave() {
    if (!time) return;
    const resolved = resolveReminder();
    onSave(deadlineIso(dayDate, time, timezone), resolved.offsetMinutes, resolved.enabled);
    setOpen(false);
  }

  function handleClear() {
    const resolved = resolveReminder();
    onSave(null, resolved.offsetMinutes, resolved.enabled);
    setOpen(false);
  }

  const label = deadlineAt ? localTimeFromIso(deadlineAt, timezone) : null;
  const popoverRef = useRef<HTMLDivElement>(null);
  useFocusTrap(popoverRef, { active: open, onEscape: () => setOpen(false) });

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={handleOpen}
        aria-label={
          label
            ? `Modifier la deadline de "${taskTitle}" (${label})`
            : `Fixer une deadline pour "${taskTitle}"`
        }
        className={`rounded px-2 py-2.5 text-xs ${
          label ? "text-alert" : "text-faint hover:text-ink focus-visible:text-ink"
        } disabled:cursor-wait disabled:opacity-40`}
      >
        ⏰{label ? ` ${label}` : ""}
      </button>
      {open && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-modal="true"
          aria-label={`Deadline de "${taskTitle}"`}
          className="absolute right-0 top-full z-20 mt-1 flex flex-col gap-2 rounded-md border border-border bg-surface p-2"
        >
          <label htmlFor={`deadline-${taskId}`} className="text-xs text-muted">
            Heure limite
          </label>
          <input
            id={`deadline-${taskId}`}
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
            className="rounded border border-border bg-transparent px-2 py-1 text-xs text-ink"
          />
          <label htmlFor={`reminder-${taskId}`} className="text-xs text-muted">
            Me notifier
          </label>
          <select
            id={`reminder-${taskId}`}
            value={reminderValue}
            onChange={(event) => setReminderValue(event.target.value)}
            className="rounded border border-border bg-transparent px-2 py-1 text-xs text-ink"
          >
            <option value="default">Par défaut ({profileDefaultOffsetMinutes} min)</option>
            {OFFSET_OPTIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {offsetLabel(minutes)}
              </option>
            ))}
            <option value="off">Pas de notif</option>
          </select>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={!time}
              className="flex-1 rounded bg-hp px-2 py-1 text-xs uppercase tracking-wide text-ink disabled:opacity-40"
            >
              Enregistrer
            </button>
            {deadlineAt && (
              <button
                type="button"
                onClick={handleClear}
                className="rounded border border-border px-2 py-1 text-xs text-muted"
              >
                Effacer
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fermer"
              className="rounded px-1.5 py-1 text-xs text-faint hover:text-alert"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: erreurs attendues sur les appelants (`TaskRow.tsx`, `TomorrowTaskRow.tsx`) qui n'ont pas encore les nouvelles props — corrigées au Task 11.

- [ ] **Step 3: Commit**

```bash
git add components/combat/DeadlineControl.tsx
git commit -m "feat: select Me notifier dans le popover deadline (#114)"
```

---

### Task 11: Propagation `TaskList`/`TaskRow`/`Arena` + ancre deep-link (amélioration B)

**Files:**
- Modify: `components/combat/TaskList.tsx`
- Modify: `components/combat/TaskRow.tsx`
- Modify: `components/combat/Arena.tsx`
- Modify: `components/combat/TomorrowTaskRow.tsx` (même changement que `TaskRow.tsx`, propagation directe)

**Interfaces:**
- Consumes: `DeadlineControlProps` étendu (Task 10).
- Produces: `TaskRowProps.onSetDeadline` étendu ; ancre `id={`task-${task.id}`}` sur chaque `<li>` de `TaskList`.

- [ ] **Step 1: Modifier `TaskRow.tsx`**

Dans `components/combat/TaskRow.tsx`, changer la signature de `onSetDeadline` (interface `TaskRowProps`, ligne ~21) :

```ts
  onSetDeadline: (
    id: string,
    deadlineAt: string | null,
    reminderOffsetMinutes: number | null,
    reminderEnabled: boolean,
  ) => void;
```

Ajouter la prop `profileDefaultOffsetMinutes: number;` à l'interface `TaskRowProps` et à la déstructuration des props de la fonction.

Remplacer le bloc `<DeadlineControl ... />` (ligne ~138-146) :

```tsx
      <DeadlineControl
        taskId={task.id}
        taskTitle={task.title}
        deadlineAt={task.deadline_at}
        dayDate={task.day_date}
        timezone={timezone}
        disabled={isLocked}
        reminderOffsetMinutes={task.reminder_offset_minutes}
        reminderEnabled={task.reminder_enabled}
        profileDefaultOffsetMinutes={profileDefaultOffsetMinutes}
        onSave={(deadlineAt, reminderOffsetMinutes, reminderEnabled) =>
          onSetDeadline(task.id, deadlineAt, reminderOffsetMinutes, reminderEnabled)
        }
      />
```

- [ ] **Step 2: Modifier `TaskList.tsx`**

Dans `components/combat/TaskList.tsx`, étendre `TaskListProps` :

```ts
  onSetDeadline: (
    id: string,
    deadlineAt: string | null,
    reminderOffsetMinutes: number | null,
    reminderEnabled: boolean,
  ) => void;
  profileDefaultOffsetMinutes: number;
```

Ajouter `profileDefaultOffsetMinutes` à la déstructuration, et modifier le rendu (amélioration B : ancre `id` pour le scroll/highlight) :

```tsx
      {orderedTasks.map((task) => (
        <li key={task.id} id={`task-${task.id}`}>
          <TaskRow
            task={task}
            timezone={timezone}
            onToggle={onToggle}
            onAbandon={onAbandon}
            onAddSubtask={onAddSubtask}
            onSetDeadline={onSetDeadline}
            onReportTomorrow={onReportTomorrow}
            showReportTomorrow={showReportTomorrow}
            isAddingSubtask={addingSubtaskParentId === task.id}
            isMutating={pendingMutationIds?.has(task.id) ?? false}
            isMissedDeadline={missedDeadlineIds?.has(task.id) ?? false}
            isOverdueRest={overdueRestIds?.has(task.id) ?? false}
            dropIndicator={dragOverInfo?.overTaskId === task.id ? dragOverInfo : null}
            profileDefaultOffsetMinutes={profileDefaultOffsetMinutes}
          />
        </li>
      ))}
```

- [ ] **Step 3: Modifier `TomorrowTaskRow.tsx`**

Appliquer le même changement qu'à l'étape 1 (`onSetDeadline` étendu, props `reminderOffsetMinutes`/`reminderEnabled`/`profileDefaultOffsetMinutes` passées à `DeadlineControl`) — lire le fichier existant et répliquer le patron exact de `TaskRow.tsx` pour cohérence (le composant utilise le même `DeadlineControl`).

- [ ] **Step 4: Modifier `Arena.tsx`**

Étendre `handleSetDeadline` (ligne ~1495) :

```tsx
  function handleSetDeadline(
    id: string,
    deadlineAt: string | null,
    reminderOffsetMinutes: number | null,
    reminderEnabled: boolean,
  ) {
    if (isOptimisticId(id)) return;
    knownMissedDeadlineIdsRef.current.delete(id);
    const previousSnapshot = tasks;
    setTasks((prev) =>
      prev.map((task) =>
        task.id === id
          ? {
              ...task,
              deadline_at: deadlineAt,
              reminder_offset_minutes: reminderOffsetMinutes,
              reminder_enabled: reminderEnabled,
            }
          : task,
      ),
    );
    markPending(id);
    void setTaskDeadlineAction(id, deadlineAt, reminderOffsetMinutes, reminderEnabled).then((result) => {
      unmarkPending(id);
      if (result.error) {
        setTasks(previousSnapshot);
        setBanner(result.error);
      }
    });
  }
```

`handlePushDeadlineOneHour` (ligne ~1523) reste inchangé — il appelle `handleSetDeadline(id, nextDeadline)` avec seulement 2 arguments, ce qui échouera à la compilation TypeScript une fois `handleSetDeadline` étendu à 4 paramètres obligatoires. Corriger l'appel :

```ts
  function handlePushDeadlineOneHour(id: string) {
    const nextDeadline = new Date(Date.now() + 3_600_000).toISOString();
    const task = tasks.find((t) => t.id === id);
    handleSetDeadline(
      id,
      nextDeadline,
      task?.reminder_offset_minutes ?? null,
      task?.reminder_enabled ?? true,
    );
    setDeadlineAlert(null);
  }
```

Ajouter la prop `profileDefaultOffsetMinutes={profile.reminder_offset_minutes}` au `<TaskList .../>` existant (ligne ~1876) et au `<TomorrowSheet .../>` si celui-ci passe aussi par un composant équivalent (vérifier `components/combat/TomorrowSheet.tsx` — appliquer le même ajout de prop si `TomorrowSheet` rend directement une liste de `TomorrowTaskRow`).

De même pour `handleSetTomorrowDeadline` (chercher sa définition dans `Arena.tsx` — même patron que `handleSetDeadline`, à étendre à l'identique).

- [ ] **Step 5: Verify types compile**

Run: `npx tsc --noEmit`
Expected: aucune erreur restante.

- [ ] **Step 6: Manual check**

Run: `npm run dev`. Ouvrir l'Arène, poser une deadline avec un délai de rappel personnalisé sur une tâche, vérifier que le popover se rouvre avec la bonne valeur sélectionnée après un refresh.

- [ ] **Step 7: Commit**

```bash
git add components/combat/TaskList.tsx components/combat/TaskRow.tsx components/combat/TomorrowTaskRow.tsx components/combat/Arena.tsx
git commit -m "feat: propage le réglage de rappel deadline dans l'UI (#114)"
```

---

### Task 12: `ReminderOffsetDefaultSection` + réglage par défaut sur Profil

**Files:**
- Create: `components/qg/ReminderOffsetDefaultSection.tsx`
- Modify: `app/actions/profile.ts`
- Modify: `app/actions/profile.test.ts`
- Modify: `app/vestiaire/profil/page.tsx` (dépend du plan #69, déjà livré)

**Interfaces:**
- Produces: `updateReminderOffsetDefault(minutes: number): Promise<{ error: string | null }>`, `<ReminderOffsetDefaultSection initialMinutes={number} />`.

- [ ] **Step 1: Write the failing test**

Ajouter à `app/actions/profile.test.ts` :

```ts
describe("updateReminderOffsetDefault", () => {
  test("rejette une valeur hors 0-240", async () => {
    const { updateReminderOffsetDefault } = await import("./profile");
    const result = await updateReminderOffsetDefault(300);
    expect(result.error).toMatch(/invalide/i);
    expect(updateCalls.length).toBe(0);
  });

  test("enregistre une valeur valide", async () => {
    const { updateReminderOffsetDefault } = await import("./profile");
    const result = await updateReminderOffsetDefault(60);
    expect(result.error).toBeNull();
    expect(updateCalls).toEqual([{ reminder_offset_minutes: 60 }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/actions/profile.test.ts`
Expected: FAIL — export manquant.

- [ ] **Step 3: Implement**

Ajouter à `app/actions/profile.ts` :

```ts
// Issue #114 : délai par défaut avant deadline, réglable depuis Le Profil.
// Reflète le CHECK SQL existant (0-240 min, migration 20260730180000).
export async function updateReminderOffsetDefault(minutes: number): Promise<{ error: string | null }> {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 240) {
    return { error: "Délai de rappel invalide." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const { error } = await supabase
    .from("profiles")
    .update({ reminder_offset_minutes: minutes })
    .eq("id", user.id);

  if (error) return { error: "Dodojo n'a pas pu enregistrer ce réglage. Réessaie." };
  return { error: null };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/actions/profile.test.ts`
Expected: PASS.

- [ ] **Step 5: Create `ReminderOffsetDefaultSection.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { updateReminderOffsetDefault } from "@/app/actions/profile";

interface ReminderOffsetDefaultSectionProps {
  initialMinutes: number;
}

const OPTIONS = [0, 5, 10, 15, 30, 60, 120, 240];

function label(minutes: number): string {
  if (minutes === 0) return "À l'heure";
  if (minutes < 60) return `${minutes} min avant`;
  return `${minutes / 60}h avant`;
}

// Issue #114 : délai par défaut appliqué à toute tâche sans override
// (tasks.reminder_offset_minutes = null hérite de cette valeur).
export default function ReminderOffsetDefaultSection({
  initialMinutes,
}: ReminderOffsetDefaultSectionProps) {
  const [minutes, setMinutes] = useState(initialMinutes);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function select(next: number) {
    const previous = minutes;
    setMinutes(next);
    setError(null);
    startTransition(async () => {
      const result = await updateReminderOffsetDefault(next);
      if (result.error) {
        setMinutes(previous);
        setError(result.error);
      }
    });
  }

  return (
    <section className="flex w-full max-w-sm flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <p className="font-display text-xs uppercase tracking-wide text-muted">Rappel de deadline</p>
      <label htmlFor="reminder-offset-default" className="text-xs text-muted">
        Délai par défaut avant une deadline
      </label>
      <select
        id="reminder-offset-default"
        value={minutes}
        disabled={isPending}
        onChange={(event) => select(Number(event.target.value))}
        className="rounded border border-border bg-transparent px-2 py-1 text-sm text-ink disabled:opacity-50"
      >
        {OPTIONS.map((option) => (
          <option key={option} value={option}>
            {label(option)}
          </option>
        ))}
      </select>
      {error && (
        <p role="alert" className="text-xs text-alert">
          {error}
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 6: Intégrer à `app/vestiaire/profil/page.tsx`**

Ajouter l'import `ReminderOffsetDefaultSection`, ajouter `reminder_offset_minutes` à la liste `.select(...)` de la requête `profiles`, et insérer le composant juste après `<PlanTomorrowSection ... />` :

```tsx
<ReminderOffsetDefaultSection initialMinutes={profile.reminder_offset_minutes} />
```

- [ ] **Step 7: Verify types compile + run tests**

Run: `npx tsc --noEmit && npx vitest run app/actions/profile.test.ts`
Expected: tout passe.

- [ ] **Step 8: Commit**

```bash
git add components/qg/ReminderOffsetDefaultSection.tsx app/actions/profile.ts app/actions/profile.test.ts app/vestiaire/profil/page.tsx
git commit -m "feat: réglage du délai de rappel par défaut sur le profil (#114)"
```

---

### Task 13: Filet in-app + deep-link dans `Arena.tsx` (améliorations A + B)

**Files:**
- Modify: `components/combat/Arena.tsx`

**Interfaces:**
- Consumes: `upcomingReminderTasks` (Task 9), `buildDeadlineReminderPayload` (Task 3).

- [ ] **Step 1: Ajouter les imports**

En tête de `Arena.tsx`, à côté des imports existants de `lib/game-engine` et `lib/copy/deadline` :

```ts
import { upcomingReminderTasks } from "@/lib/game-engine";
import { buildDeadlineReminderPayload } from "@/lib/copy/deadline";
import { useSearchParams, useRouter } from "next/navigation";
```

> Note : `useRouter` est probablement déjà importé ailleurs dans `Arena.tsx` — vérifier avant d'ajouter un import dupliqué, fusionner dans l'import existant de `next/navigation` le cas échéant.

- [ ] **Step 2: Ajouter les refs/state pour le filet in-app (amélioration A)**

Près de `knownMissedDeadlineIdsRef` (ligne ~322) :

```ts
  // Issue #114 (amélioration A) : même patron que knownMissedDeadlineIdsRef —
  // initialisé aux tâches déjà dans leur fenêtre de rappel au montage, pour
  // ne pas re-toaster ce qui était déjà vrai avant l'ouverture (pas de replay).
  const knownUpcomingReminderIdsRef = useRef<Set<string>>(
    new Set(
      upcomingReminderTasks(
        initialTasks.filter((task) => !task.is_abandoned),
        new Date(),
        profile.reminder_offset_minutes,
      ).map((task) => task.id),
    ),
  );
  const reminderToastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [reminderToast, setReminderToast] = useState<{ taskId: string; message: string } | null>(null);
```

- [ ] **Step 3: Étendre le polling existant (amélioration A)**

Dans le `useEffect` du polling (ligne ~504-538), juste avant `setNow(tick);` :

```ts
      const upcomingNow = upcomingReminderTasks(
        tasksRef.current.filter((task) => !task.is_abandoned),
        tick,
        profile.reminder_offset_minutes,
      );
      const knownReminders = knownUpcomingReminderIdsRef.current;
      const freshlyUpcoming = upcomingNow.filter((task) => !knownReminders.has(task.id));
      if (freshlyUpcoming.length > 0) {
        for (const task of freshlyUpcoming) knownReminders.add(task.id);
        const target = freshlyUpcoming[0];
        const offsetMinutes = target.reminder_offset_minutes ?? profile.reminder_offset_minutes;
        setReminderToast({
          taskId: target.id,
          message: buildDeadlineReminderPayload(target.title, offsetMinutes, level).body,
        });
        if (reminderToastTimeoutRef.current) clearTimeout(reminderToastTimeoutRef.current);
        reminderToastTimeoutRef.current = setTimeout(() => setReminderToast(null), 6000);
      }
```

> Note pour l'implémenteur : `level` (résolu via `resolveAggressivityLevel(profile.aggressivity_level)`, ligne ~171) doit être en portée à cet endroit — c'est déjà le cas, réutilisé tel quel comme pour `deadlineAlertLine` un peu plus bas dans le même effet.

- [ ] **Step 4: Rendre le toast (JSX)**

Juste après le bloc `{deadlineAlert && (...)}` (ligne ~1842) :

```tsx
      {reminderToast && (
        <div
          role="status"
          className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs text-muted"
        >
          <span>{reminderToast.message}</span>
          <button type="button" onClick={() => setReminderToast(null)} className="shrink-0 underline">
            Fermer
          </button>
        </div>
      )}
```

- [ ] **Step 5: Deep-link + highlight (amélioration B)**

Ajouter, près des autres `useEffect` de montage :

```ts
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const highlightId = searchParams.get("highlightTask");
    if (!highlightId) return;
    const el = document.getElementById(`task-${highlightId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    router.replace("/", { scroll: false });
  }, [searchParams, router]);
```

- [ ] **Step 6: Mettre `url` du payload deadline sur le deep-link**

Dans `lib/inngest/functions/schedule-deadline-reminder.ts` (Task 4), la fonction `buildDeadlineReminderPayload` renvoie `url: "/"` codé en dur — remplacer par un deep-link explicite construit côté appelant plutôt que de complexifier la signature de `buildDeadlineReminderPayload` (le toast in-app, Task 13 Step 3, n'a pas besoin d'`url`). Dans `lib/inngest/functions/schedule-deadline-reminder.ts`, au moment de construire le `payload` JSON pour `webpush.sendNotification` (step "send-push") :

```ts
      const basePayload = buildDeadlineReminderPayload(context.taskTitle, offsetMinutes, context.level);
      const payload = JSON.stringify({ ...basePayload, url: `/?highlightTask=${taskId}` });
```

- [ ] **Step 7: Verify types compile**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 8: Manual check**

Run: `npm run dev`. Naviguer sur `/?highlightTask=<id d'une tâche existante>`, vérifier le scroll + que l'URL est nettoyée après coup.

- [ ] **Step 9: Commit**

```bash
git add components/combat/Arena.tsx lib/inngest/functions/schedule-deadline-reminder.ts
git commit -m "feat: filet in-app et deep-link vers la tâche (améliorations A+B, #114)"
```

---

### Task 14: Snooze depuis la notification (amélioration C)

**Files:**
- Modify: `lib/copy/notifications.ts` — étend `PushReminderPayload`.
- Modify: `app/sw.ts`
- Create: `app/api/push/snooze-deadline-reminder/route.ts`
- Create: `app/api/push/snooze-deadline-reminder/route.test.ts`

**Interfaces:**
- Consumes: `scheduleDeadlineReminder` (Task 2).
- Produces: `POST /api/push/snooze-deadline-reminder`.

- [ ] **Step 1: Étendre `PushReminderPayload`**

Dans `lib/copy/notifications.ts`, modifier l'interface (ligne ~3) :

```ts
export interface PushReminderPayload {
  title: string;
  body: string;
  url: string;
  // Issue #114 (amélioration C) : présents uniquement pour un rappel de
  // deadline (jamais pour le rappel quotidien générique) — permet au service
  // worker d'ajouter l'action "snooze15" et de savoir quoi envoyer à la route
  // de snooze.
  taskId?: string;
  userId?: string;
}
```

- [ ] **Step 2: Write the failing test for the snooze route**

Create `app/api/push/snooze-deadline-reminder/route.test.ts` :

```ts
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

type Row = Record<string, unknown>;

let dbTables: Record<string, Row[]> = {};

class FakeQueryBuilder implements PromiseLike<{ data: Row | null; error: null }> {
  private filters: Array<(row: Row) => boolean> = [];
  constructor(private readonly rows: Row[]) {}
  select(): this {
    return this;
  }
  eq(column: string, value: unknown): this {
    this.filters.push((row) => row[column] === value);
    return this;
  }
  maybeSingle(): Promise<{ data: Row | null; error: null }> {
    const matched = this.rows.filter((row) => this.filters.every((f) => f(row)));
    return Promise.resolve({ data: matched[0] ?? null, error: null });
  }
}

class FakeSupabaseClient {
  from(table: string): FakeQueryBuilder {
    return new FakeQueryBuilder(dbTables[table] ?? []);
  }
}

vi.mock("@supabase/supabase-js", () => ({ createClient: () => new FakeSupabaseClient() }));

const { scheduleDeadlineReminderMock } = vi.hoisted(() => ({
  scheduleDeadlineReminderMock: vi.fn(async () => undefined),
}));
vi.mock("@/lib/inngest/deadline-reminder", () => ({
  scheduleDeadlineReminder: scheduleDeadlineReminderMock,
}));

function stubEnv(): void {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fake.supabase.co");
  vi.stubEnv("NEXT_PRIVATE_KEY_SUPABASE", "fake-service-role-key");
}

function makeRequest(body: unknown): Request {
  return new Request("https://dodojo.test/api/push/snooze-deadline-reminder", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  stubEnv();
  scheduleDeadlineReminderMock.mockClear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-01T15:30:00.000Z"));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.resetModules();
});

describe("POST /api/push/snooze-deadline-reminder", () => {
  test("programme un nouveau rappel ~15 min plus tard si la deadline est assez loin", async () => {
    dbTables = {
      tasks: [
        {
          id: "t1",
          user_id: "u1",
          deadline_at: "2026-08-01T16:30:00.000Z",
          is_completed: false,
          is_abandoned: false,
          reminder_enabled: true,
        },
      ],
    };
    const { POST } = await import("./route");
    const response = await POST(makeRequest({ taskId: "t1", userId: "u1" }));
    const json = await response.json();
    expect(json).toEqual({ scheduled: true });
    expect(scheduleDeadlineReminderMock).toHaveBeenCalledWith({
      taskId: "t1",
      userId: "u1",
      deadlineAt: "2026-08-01T16:30:00.000Z",
      offsetMinutes: 45,
    });
  });

  test("ne programme rien si la tâche est introuvable", async () => {
    dbTables = { tasks: [] };
    const { POST } = await import("./route");
    const response = await POST(makeRequest({ taskId: "t1", userId: "u1" }));
    expect(await response.json()).toEqual({ scheduled: false });
    expect(scheduleDeadlineReminderMock).not.toHaveBeenCalled();
  });

  test("ne programme rien si la tâche est complétée", async () => {
    dbTables = {
      tasks: [
        {
          id: "t1",
          user_id: "u1",
          deadline_at: "2026-08-01T16:30:00.000Z",
          is_completed: true,
          is_abandoned: false,
          reminder_enabled: true,
        },
      ],
    };
    const { POST } = await import("./route");
    const response = await POST(makeRequest({ taskId: "t1", userId: "u1" }));
    expect(await response.json()).toEqual({ scheduled: false });
  });

  test("ne programme rien si la deadline est trop proche (moins de 15 min)", async () => {
    dbTables = {
      tasks: [
        {
          id: "t1",
          user_id: "u1",
          deadline_at: "2026-08-01T15:40:00.000Z",
          is_completed: false,
          is_abandoned: false,
          reminder_enabled: true,
        },
      ],
    };
    const { POST } = await import("./route");
    const response = await POST(makeRequest({ taskId: "t1", userId: "u1" }));
    expect(await response.json()).toEqual({ scheduled: false, reason: "too-close" });
    expect(scheduleDeadlineReminderMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run app/api/push/snooze-deadline-reminder/route.test.ts`
Expected: FAIL — le module `./route` n'existe pas.

- [ ] **Step 4: Implement the route**

Create `app/api/push/snooze-deadline-reminder/route.ts` :

```ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { scheduleDeadlineReminder } from "@/lib/inngest/deadline-reminder";

// Appelée depuis le service worker (notificationclick, action "snooze15"),
// sans cookie de session — client Supabase service-role, même patron que
// app/api/webhook/add-task/route.ts (US-03). Le filtre combiné id+user_id
// fait office de vérification d'appartenance ; un payload push n'est déjà
// déliverable qu'à l'appareil réellement souscrit (canal chiffré VAPID),
// même niveau de confiance assumé que la route share-card.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SNOOZE_MINUTES = 15;

interface TaskRow {
  id: string;
  deadline_at: string | null;
  is_completed: boolean;
  is_abandoned: boolean;
  reminder_enabled: boolean;
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ scheduled: false }, { status: 400 });
  }

  const taskId = (body as { taskId?: unknown } | null)?.taskId;
  const userId = (body as { userId?: unknown } | null)?.userId;
  if (typeof taskId !== "string" || typeof userId !== "string") {
    return NextResponse.json({ scheduled: false }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.NEXT_PRIVATE_KEY_SUPABASE;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ scheduled: false }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data } = await supabase
    .from("tasks")
    .select("id, deadline_at, is_completed, is_abandoned, reminder_enabled")
    .eq("id", taskId)
    .eq("user_id", userId)
    .maybeSingle();
  const task = data as TaskRow | null;

  if (!task || task.is_completed || task.is_abandoned || !task.reminder_enabled || !task.deadline_at) {
    return NextResponse.json({ scheduled: false });
  }

  const deadlineMs = new Date(task.deadline_at).getTime();
  const candidateWakeMs = Date.now() + SNOOZE_MINUTES * 60_000;
  if (candidateWakeMs >= deadlineMs) {
    return NextResponse.json({ scheduled: false, reason: "too-close" });
  }

  const offsetMinutes = Math.round((deadlineMs - candidateWakeMs) / 60_000);
  await scheduleDeadlineReminder({
    taskId: task.id,
    userId,
    deadlineAt: task.deadline_at,
    offsetMinutes,
  });

  return NextResponse.json({ scheduled: true });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run app/api/push/snooze-deadline-reminder/route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Extend the service worker**

Dans `app/sw.ts`, remplacer le handler `push` :

```ts
self.addEventListener("push", (event: PushEvent) => {
  if (!event.data) return;
  const payload = event.data.json() as PushReminderPayload;
  const actions: Array<{ action: string; title: string }> = payload.taskId
    ? [
        { action: "snooze15", title: "+15 min" },
        { action: "later", title: "Plus tard" },
      ]
    : [{ action: "later", title: "Plus tard" }];
  const options: NotificationOptionsWithActions = {
    body: payload.body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: payload.url, taskId: payload.taskId, userId: payload.userId },
    actions,
  };
  event.waitUntil(self.registration.showNotification(payload.title, options));
});
```

Remplacer le handler `notificationclick` :

```ts
self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  if (event.action === "later") return;

  const data = event.notification.data as
    | { url?: string; taskId?: string; userId?: string }
    | undefined;

  if (event.action === "snooze15" && data?.taskId && data?.userId) {
    event.waitUntil(
      fetch("/api/push/snooze-deadline-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: data.taskId, userId: data.userId }),
      }),
    );
    return;
  }

  const url = data?.url ?? "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsList) => {
      const existing = clientsList[0];
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    }),
  );
});
```

- [ ] **Step 7: Verify types compile + run full test suite**

Run: `npx tsc --noEmit && npm test`
Expected: tout passe.

- [ ] **Step 8: Commit**

```bash
git add lib/copy/notifications.ts app/sw.ts app/api/push/snooze-deadline-reminder/route.ts app/api/push/snooze-deadline-reminder/route.test.ts
git commit -m "feat: snooze +15 min directement depuis la notification (amélioration C, #114)"
```

- [ ] **Step 9: Vérification manuelle obligatoire**

Sur un vrai appareil (PWA installée, permission notif accordée) : poser une deadline avec un rappel court, attendre la notif, taper "+15 min", vérifier qu'une nouvelle notif arrive ~15 min plus tard. Tester sur Android Chrome ET iOS Safari si possible (comportements des actions de notif connus pour différer entre les deux, cf. spec).

---

### Task 15: Vérification finale, migrations Supabase, docs, CHANGELOG

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Vérifier l'état des migrations en production**

Run: `npx supabase migration list --linked`
Expected: `20260801100000_add_task_reminder_enabled` apparaît en Local ET Remote après déploiement — sinon suivre la procédure `--include-all` documentée dans CLAUDE.md (« Migrations Supabase hors-ordre »).

- [ ] **Step 2: Vérifier l'app Inngest après déploiement**

Sur le dashboard Inngest (section Apps), vérifier que `schedule-deadline-reminder` apparaît bien parmi les fonctions synchronisées après le déploiement Vercel — sinon resynchroniser manuellement (« Sync new app », cf. CLAUDE.md « Cron push — Inngest »).

- [ ] **Step 3: Lancer la suite complète**

Run: `npm run lint && npm test && npx tsc --noEmit && npm run build`
Expected: tout passe.

- [ ] **Step 4: Ajouter l'entrée CHANGELOG**

Sous `## [Unreleased]` dans `CHANGELOG.md` :

```md
- feat: notifications avant deadline de tâche — délai réglable par tâche et par défaut, filet in-app si push désactivé, deep-link vers la tâche, snooze +15 min depuis la notification (#114)
```

- [ ] **Step 5: Ajouter une entrée "Piège" dans CLAUDE.md**

Documenter le moteur (event `task/deadline-reminder-set`/`-cleared`, `cancelOn`, re-check DB, `reminder_enabled` vs `reminder_offset_minutes` null=hérite, snooze réutilisant le même event avec un offset synthétique) — même esprit que l'entrée existante sur `send-reminder`/`reminder-fanout`.

- [ ] **Step 6: Commit final**

```bash
git add CHANGELOG.md CLAUDE.md
git commit -m "docs: changelog et piège moteur de rappel deadline (#114)"
```

---

## Self-Review Notes

- **Spec coverage** : moteur Inngest (Tasks 2-4), extension `setTaskDeadline` + annulation dans les 8 autres fonctions (Tasks 5-8), UI popover + propagation (Tasks 10-11), réglage par défaut sur Profil (Task 12), améliorations A/B/C (Tasks 9, 13, 14) — tous les blocs de la spec sont couverts.
- **Placeholder scan** : aucun "TBD" — la seule zone d'incertitude (comportement exact de `TomorrowTaskRow.tsx`/`TomorrowSheet.tsx`, non lus intégralement pendant ce plan) est traitée comme une instruction explicite de répliquer un patron déjà montré, pas un renvoi vague (Task 11, Steps 3-4).
- **Type consistency** : `setTaskDeadline(id, deadlineAt, reminderOffsetMinutes?, reminderEnabled?)` (Task 5) a la même signature partout où il est appelé (Task 11). `scheduleDeadlineReminder`/`cancelDeadlineReminder` (Task 2) ont des signatures identiques entre leur définition et tous leurs appels (Tasks 5-8, 14). `ReminderTask`/`upcomingReminderTasks` (Task 9) utilisent les mêmes noms de champs que `Task` (`types/index.ts`) après le Task 1.
- **Dépendance externe** : Task 12 dépend du plan #69 (page Profil) déjà livré — si ce n'est pas encore le cas au moment d'exécuter ce plan, reporter uniquement le Step 6 du Task 12 (intégration à la page) jusqu'à ce que `/vestiaire/profil` existe ; le reste de la Task (action serveur + composant) ne dépend de rien d'autre.
