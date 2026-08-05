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
