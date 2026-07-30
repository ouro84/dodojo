import { createClient } from "@supabase/supabase-js";
import { inngest } from "@/lib/inngest/client";
import { buildCandidatesFromDb } from "@/lib/inngest/scheduling";
import { selectReminderEligibleProfiles } from "@/lib/push-eligibility";
import { dayKey } from "@/lib/game-engine";
import type { SendReminderEvent } from "./send-reminder.types";

// UTC ; couvre les offsets locaux :00/:15/:30/:45 (Inde UTC+5:30, Népal
// UTC+5:45 inclus). Pas de préfixe TZ= : le fuseau est géré par
// isWithinReminderWindow, pas par le cron (cf. plan §6 L2b).
export const REMINDER_FANOUT_CRON = "*/15 * * * *";

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

// Entier déterministe (jamais Math.random) : un seul texte par profil et par
// jour, stable au retry. Modulo 6 = nombre de templates de buildReminderPayload
// (lib/copy/notifications.ts) au jour de l'écriture ; un futur ajout de
// template n'exige pas de resynchroniser cette valeur, l'index hors bornes
// étant déjà absorbé par le "?? REMINDER_TEMPLATES[0]" de buildReminderPayload.
function computeVariantIndex(profileId: string, day: string): number {
  const key = profileId + day;
  let sum = 0;
  for (let i = 0; i < key.length; i += 1) sum += key.charCodeAt(i);
  return sum % 6;
}

export const reminderFanout = inngest.createFunction(
  {
    id: "reminder-fanout",
    triggers: { cron: REMINDER_FANOUT_CRON },
    // Aucune alerte automatique connue sur le palier gratuit Inngest (cf.
    // plan §6 L3b) : ce console.error, visible dans les logs Vercel et le
    // dashboard Inngest, est la seule trace en cas d'échec après retries.
    // Un run de fan-out en échec silencieux = aucun rappel envoyé ce jour-là
    // pour tous les profils, sans qu'aucune alerte ne se déclenche.
    onFailure: async ({ error }) => {
      console.error("[inngest:reminder-fanout] échec définitif", { error: error.message });
    },
  },
  async ({ step }) => {
    const selection = await step.run("select-eligible", async () => {
      // now DOIT être créé ici, dans le step → memoïsé, déterministe au retry
      // (même piège que C1 sur send-reminder, cf. plan §6 L1b).
      const now = new Date();
      const supabase = makeSupabaseClient();

      const { data: subsData } = await supabase
        .from("push_subscriptions")
        .select("user_id, endpoint, p256dh, auth");
      const subs = (subsData ?? []) as SubscriptionRow[];
      if (subs.length === 0) return [];

      const userIds = [...new Set(subs.map((s) => s.user_id))];
      const candidateDates = adjacentUtcDates(now);

      const [profilesRes, tasksRes, dayResultsRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, timezone, last_reminder_sent_on, aggressivity_level")
          .in("id", userIds),
        supabase
          .from("tasks")
          .select("user_id, day_date, parent_id, is_abandoned, is_completed")
          .in("user_id", userIds)
          .in("day_date", candidateDates),
        supabase
          .from("day_results")
          .select("user_id, day_date")
          .in("user_id", userIds)
          .in("day_date", candidateDates),
      ]);

      const profiles = (profilesRes.data ?? []) as ProfileRow[];
      const tasks = (tasksRes.data ?? []) as TaskRow[];
      const dayResults = (dayResultsRes.data ?? []) as DayResultRow[];

      const candidates = buildCandidatesFromDb(subs, profiles, tasks, dayResults, now);
      const eligibleIds = new Set(selectReminderEligibleProfiles(candidates, now));
      const profileById = new Map(profiles.map((p) => [p.id, p]));

      return [...eligibleIds].map((profileId) => {
        const profile = profileById.get(profileId);
        const timezone = profile?.timezone ?? "UTC";
        const day = dayKey(now, timezone);
        return {
          profileId,
          dayKey: day,
          nowIso: now.toISOString(),
          variantIndex: computeVariantIndex(profileId, day),
        };
      });
    });

    if (selection.length === 0) return { fanned: 0 };

    await step.sendEvent(
      "fan-out",
      selection.map((data) => ({ name: "push/send-reminder" satisfies SendReminderEvent["name"], data })),
    );

    return { fanned: selection.length };
  },
);
