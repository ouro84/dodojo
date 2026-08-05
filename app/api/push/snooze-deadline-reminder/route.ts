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
