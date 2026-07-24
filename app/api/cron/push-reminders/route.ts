import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { calculateBossCurrentHp, dayKey, type HpTask } from "@/lib/game-engine";
import { selectReminderEligibleProfiles, type ReminderCandidate } from "@/lib/push-eligibility";
import { buildReminderPayload } from "@/lib/copy/notifications";

// web-push utilise des API Node (crypto) — pas compatible edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

// Un instant UTC donné correspond, selon le fuseau, à une des 3 dates
// calendaires UTC adjacentes (offsets de -12 à +14). Borne la requête tasks
// /day_results sans avoir à connaître le fuseau de chaque profil à l'avance.
function adjacentUtcDates(now: Date): string[] {
  const dayMs = 86_400_000;
  return [-1, 0, 1].map((offset) => new Date(now.getTime() + offset * dayMs).toISOString().slice(0, 10));
}

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.NEXT_PRIVATE_KEY_SUPABASE;
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT;
  if (!supabaseUrl || !serviceKey || !vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const now = new Date();

  const { data: subscriptions } = await supabase
    .from("push_subscriptions")
    .select("user_id, endpoint, p256dh, auth");
  const subs = (subscriptions ?? []) as SubscriptionRow[];
  if (subs.length === 0) return NextResponse.json({ notified: 0 });

  const userIds = [...new Set(subs.map((s) => s.user_id))];
  const candidateDates = adjacentUtcDates(now);

  const [profilesResult, tasksResult, dayResultsResult] = await Promise.all([
    supabase.from("profiles").select("id, timezone, last_reminder_sent_on, aggressivity_level").in("id", userIds),
    supabase
      .from("tasks")
      .select("user_id, day_date, parent_id, is_abandoned, is_completed")
      .in("user_id", userIds)
      .in("day_date", candidateDates),
    supabase.from("day_results").select("user_id, day_date").in("user_id", userIds).in("day_date", candidateDates),
  ]);

  const profileById = new Map(((profilesResult.data ?? []) as ProfileRow[]).map((p) => [p.id, p]));
  const subsByUser = new Map<string, SubscriptionRow[]>();
  for (const sub of subs) {
    const bucket = subsByUser.get(sub.user_id) ?? [];
    bucket.push(sub);
    subsByUser.set(sub.user_id, bucket);
  }
  const tasksByUser = new Map<string, TaskRow[]>();
  for (const task of (tasksResult.data ?? []) as TaskRow[]) {
    const bucket = tasksByUser.get(task.user_id) ?? [];
    bucket.push(task);
    tasksByUser.set(task.user_id, bucket);
  }
  const dayResultKeys = new Set(
    ((dayResultsResult.data ?? []) as DayResultRow[]).map((r) => `${r.user_id}:${r.day_date}`),
  );

  const candidates: ReminderCandidate[] = userIds
    .map((id) => profileById.get(id))
    .filter((p): p is ProfileRow => Boolean(p))
    .map((profile) => {
      const today = dayKey(now, profile.timezone);
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

  const candidateByProfile = new Map(candidates.map((c) => [c.profileId, c]));
  const eligibleIds = selectReminderEligibleProfiles(candidates, now);
  let notified = 0;

  for (const profileId of eligibleIds) {
    const profile = profileById.get(profileId);
    const candidate = candidateByProfile.get(profileId);
    if (!profile || !candidate) continue;

    const today = dayKey(now, profile.timezone);
    const remaining = calculateBossCurrentHp(candidate.todayTasks);
    const payload = JSON.stringify(buildReminderPayload(remaining, profile.aggressivity_level));

    let sentOnce = false;
    for (const sub of subsByUser.get(profileId) ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
        sentOnce = true;
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        }
      }
    }

    if (sentOnce) {
      await supabase.from("profiles").update({ last_reminder_sent_on: today }).eq("id", profileId);
      notified += 1;
    }
  }

  return NextResponse.json({ notified });
}
