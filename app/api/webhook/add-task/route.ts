import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertTaskForUser } from "../../../../lib/task-insertion";
import { validateTaskTitle } from "../../../../lib/task-title";
import { hashWebhookToken } from "../../../../lib/webhook-token";

// hashWebhookToken utilise node:crypto — pas compatible edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface WebhookProfileRow {
  id: string;
  timezone: string;
}

function extractBearerToken(header: string | null): string | null {
  if (!header) return null;
  const [scheme, value] = header.split(" ");
  if (scheme !== "Bearer" || !value) return null;
  return value;
}

// US-03 : ajoute une tâche sans session Supabase (raccourci iOS Shortcuts,
// action "Obtenir le contenu de l'URL"). Auth par token personnel hashé
// (profiles.webhook_token_hash) — jamais de cookie, jamais d'OAuth (pas de
// flow interactif possible côté Shortcuts). Réutilise insertTaskForUser
// (lib/task-insertion.ts) : même logique d'insertion + recalcul HP que le
// formulaire d'ajout in-app, pas de duplication (RG-01/RG-02). Client
// Supabase service-role (comme app/api/cron/push-reminders, US-11) — hors
// RLS, user_id retrouvé explicitement via le hash du token.
export async function POST(request: Request): Promise<Response> {
  const token = extractBearerToken(request.headers.get("authorization"));
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.NEXT_PRIVATE_KEY_SUPABASE;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, timezone")
    .eq("webhook_token_hash", hashWebhookToken(token))
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const profileRow = profile as WebhookProfileRow;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const rawTitle = (body as { title?: unknown } | null)?.title;
  if (typeof rawTitle !== "string") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const validation = validateTaskTitle(rawTitle);
  if ("error" in validation) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const outcome = await insertTaskForUser(supabase, {
    userId: profileRow.id,
    title: validation.title,
    timezone: profileRow.timezone,
  });

  await supabase
    .from("profiles")
    .update({ webhook_token_last_used_at: new Date().toISOString() })
    .eq("id", profileRow.id);

  return NextResponse.json(
    {
      id: outcome.taskId,
      dayDate: outcome.dayDate,
      bossMaxHp: outcome.bossMaxHp,
      bossCurrentHp: outcome.bossCurrentHp,
    },
    { status: 201 },
  );
}
