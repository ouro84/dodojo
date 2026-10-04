import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { inngest } from "@/lib/inngest/client";
import { buildCandidatesFromDb, pickSubscriptionsToSend } from "@/lib/inngest/scheduling";
import { isReminderEligible } from "@/lib/push-eligibility";
import { buildReminderPayload } from "@/lib/copy/notifications";
import { calculateBossCurrentHp } from "@/lib/game-engine";
import { isExpiredPushStatus, markPushSubscriptionExpired } from "@/lib/inngest/push-subscriptions";
import type { SendReminderEvent } from "./send-reminder.types";

interface SubscriptionRow {
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}
interface ProfileRow {
  id: string;
  timezone: string;
  last_reminder_sent_on: string | null;
  aggressivity_level: "doux" | "direct" | "brut";
}
interface TaskRow {
  user_id: string;
  day_date: string;
  parent_id: string | null;
  is_abandoned: boolean;
  is_completed: boolean;
}
interface DayResultRow {
  user_id: string;
  day_date: string;
}

function adjacentUtcDates(now: Date): string[] {
  const dayMs = 86_400_000;
  return [-1, 0, 1].map((offset) => new Date(now.getTime() + offset * dayMs).toISOString().slice(0, 10));
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

export const sendReminder = inngest.createFunction(
  {
    id: "send-reminder",
    triggers: { event: "push/send-reminder" satisfies SendReminderEvent["name"] },
    // Dédoublonne un event du même jour pour le même profil (fenêtre 24h,
    // cf. doc Inngest). Protection best-effort : la garde réelle reste le
    // check DB `lastReminderSentOn === today` de isReminderEligible, qui ne
    // doit jamais être retiré (cf. plan §6 L1b C6).
    idempotency: "event.data.profileId + \"-\" + event.data.dayKey",
    // Aucune alerte automatique connue sur le palier gratuit Inngest (cf.
    // plan §6 L3b) : ce console.error, visible dans les logs Vercel et le
    // dashboard Inngest, est la seule trace en cas d'échec après retries.
    onFailure: async ({ event, error }) => {
      console.error("[inngest:send-reminder] échec définitif", {
        profileId: event.data.event.data.profileId,
        dayKey: event.data.event.data.dayKey,
        error: error.message,
      });
    },
  },
  async ({ event, step }) => {
    const profileId: string = event.data.profileId;
    const today = event.data.dayKey;
    const now = new Date(event.data.nowIso);

    const subs = await step.run("fetch-context-subs", async () => {
      const supabase = makeSupabaseClient();
      const { data } = await supabase
        .from("push_subscriptions")
        .select("user_id, endpoint, p256dh, auth")
        .eq("user_id", profileId)
        .is("expired_at", null);
      return (data ?? []) as SubscriptionRow[];
    });

    const context = await step.run("fetch-context-profile-tasks", async () => {
      const supabase = makeSupabaseClient();
      const profileRes = await supabase
        .from("profiles")
        .select("id, timezone, last_reminder_sent_on, aggressivity_level")
        .eq("id", profileId)
        .limit(1);
      const profile = (profileRes.data ?? [])[0] as ProfileRow | undefined;
      if (!profile) return null;
      const candidateDates = adjacentUtcDates(now);
      const tasksRes = await supabase
        .from("tasks")
        .select("user_id, day_date, parent_id, is_abandoned, is_completed")
        .eq("user_id", profileId)
        .in("day_date", candidateDates);
      const dayResultsRes = await supabase
        .from("day_results")
        .select("user_id, day_date")
        .eq("user_id", profileId)
        .in("day_date", candidateDates);
      return {
        profile,
        tasks: (tasksRes.data ?? []) as TaskRow[],
        dayResults: (dayResultsRes.data ?? []) as DayResultRow[],
      };
    });

    if (!context) return;
    const { profile, tasks, dayResults } = context;

    const [candidate] = buildCandidatesFromDb(subs, [profile], tasks, dayResults, now);
    if (!isReminderEligible(candidate, now)) return;

    const remainingTaskCount = candidate.todayTasks.filter(
      (t) => !t.is_completed && !t.is_abandoned,
    ).length;
    const remainingHp = calculateBossCurrentHp(candidate.todayTasks);
    const payload = JSON.stringify(
      buildReminderPayload(
        { remainingTaskCount, remainingHp },
        profile.aggressivity_level,
        () => event.data.variantIndex,
      ),
    );

    const pushResult = await step.run("send-push", async () => {
      configureVapid();
      const subsByUser = new Map<string, SubscriptionRow[]>();
      for (const sub of subs) {
        const bucket = subsByUser.get(sub.user_id) ?? [];
        bucket.push(sub);
        subsByUser.set(sub.user_id, bucket);
      }
      const supabase = makeSupabaseClient();
      let didSend = false;
      for (const sub of pickSubscriptionsToSend(profileId, subsByUser)) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
          );
          didSend = true;
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode !== undefined && isExpiredPushStatus(statusCode)) {
            await markPushSubscriptionExpired(supabase, sub, statusCode, "inngest:send-reminder");
          } else {
            // Issue #183 (C2) : même trou d'observabilité que schedule-deadline-reminder.
            console.error("[inngest:send-reminder] envoi push échoué", {
              endpoint: sub.endpoint,
              statusCode,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }
      return { didSend };
    });

    if (pushResult.didSend) {
      await step.run("mark-sent", async () => {
        const supabase = makeSupabaseClient();
        await supabase.from("profiles").update({ last_reminder_sent_on: today }).eq("id", profileId);
        return { marked: true };
      });
    }
  },
);
