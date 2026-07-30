import { dayKey, type HpTask } from "@/lib/game-engine";
import type { ReminderCandidate } from "@/lib/push-eligibility";

// Interfaces DB brutes (relevantes pour les deux L1 et send-reminder).
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
interface TaskRow extends HpTask {
  user_id: string;
  day_date: string;
}
interface DayResultRow {
  user_id: string;
  day_date: string;
}

// Construit la liste des ReminderCandidate à partir des rows DB brutes.
// Reprend à l'identique le bloc L97-113 de l'ancienne route
// app/api/cron/push-reminders/route.ts, en version pur & testable.
export function buildCandidatesFromDb(
  subs: SubscriptionRow[],
  profiles: ProfileRow[],
  tasks: TaskRow[],
  dayResults: DayResultRow[],
  nowUtc: Date,
): ReminderCandidate[] {
  const subsByUser = new Map<string, SubscriptionRow[]>();
  for (const sub of subs) {
    const bucket = subsByUser.get(sub.user_id) ?? [];
    bucket.push(sub);
    subsByUser.set(sub.user_id, bucket);
  }
  const tasksByUser = new Map<string, TaskRow[]>();
  for (const task of tasks) {
    const bucket = tasksByUser.get(task.user_id) ?? [];
    bucket.push(task);
    tasksByUser.set(task.user_id, bucket);
  }
  const dayResultKeys = new Set(dayResults.map((r) => `${r.user_id}:${r.day_date}`));

  return profiles.map((profile) => {
    const today = dayKey(nowUtc, profile.timezone);
    const todayTasks = (tasksByUser.get(profile.id) ?? []).filter((t) => t.day_date === today);
    return {
      profileId: profile.id,
      timezone: profile.timezone,
      lastReminderSentOn: profile.last_reminder_sent_on,
      hasSubscription: (subsByUser.get(profile.id) ?? []).length > 0,
      todayTasks,
      dayResultExists: dayResultKeys.has(`${profile.id}:${today}`),
    };
  });
}

// Sélectionne les subscriptions à envoyer pour un profileId donné. Pur.
export function pickSubscriptionsToSend(
  profileId: string,
  subsByUser: Map<string, SubscriptionRow[]>,
): SubscriptionRow[] {
  return subsByUser.get(profileId) ?? [];
}
