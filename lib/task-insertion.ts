import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateBossCurrentHp, calculateBossMaxHp, dayKey, nextSiblingPosition, type HpTask } from "./game-engine";

export interface InsertTaskParams {
  userId: string;
  title: string;
  timezone: string;
  // Issue #116 : jour cible explicite (ex. demain, pour la section "Demain").
  // Omis = comportement inchangé (aujourd'hui, dérivé de timezone).
  dayDate?: string;
}

export interface InsertTaskOutcome {
  taskId: string;
  dayDate: string;
  bossMaxHp: number;
  bossCurrentHp: number;
}

type DayTaskRow = HpTask & { position: number };

// US-03/US-22 : logique d'insertion de tâche + recalcul des HP du Boss
// (RG-01/RG-02), extraite du formulaire d'ajout in-app (app/actions/tasks.ts,
// addTask) pour être réutilisée par une route API SANS session cookie —
// paramétrée par un user_id EXPLICITE (jamais supabase.auth.getUser() ici).
// Le webhook Siri (US-03) et le futur serveur MCP Gemini (US-22) l'appellent
// avec un client Supabase service-role ; addTask l'appelle avec le client
// cookie-session habituel. `title` est supposé déjà validé/trim() par
// l'appelant (voir lib/task-title.ts) — pas de re-validation ici. Import
// relatif volontaire (pas d'alias @/) : ce fichier est chargé directement
// par Vitest (voir Global Constraints du plan US-03).
export async function insertTaskForUser(
  supabase: SupabaseClient,
  params: InsertTaskParams,
): Promise<InsertTaskOutcome> {
  const { userId, title, timezone } = params;
  const dayDate = params.dayDate ?? dayKey(new Date(), timezone);

  const { data: todayTasks, error: fetchError } = await supabase
    .from("tasks")
    .select("parent_id, is_abandoned, is_completed, position")
    .eq("user_id", userId)
    .eq("day_date", dayDate);

  if (fetchError) {
    throw new Error("insert_task_fetch_failed");
  }

  const rows = (todayTasks ?? []) as DayTaskRow[];
  const roots = rows.filter((task) => task.parent_id === null);

  const { data: inserted, error: insertError } = await supabase
    .from("tasks")
    .insert({
      user_id: userId,
      title,
      day_date: dayDate,
      position: nextSiblingPosition(roots),
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    throw new Error("insert_task_failed");
  }

  const tasksAfterInsert: HpTask[] = [
    ...rows,
    { parent_id: null, is_abandoned: false, is_completed: false },
  ];

  return {
    taskId: (inserted as { id: string }).id,
    dayDate,
    bossMaxHp: calculateBossMaxHp(tasksAfterInsert),
    bossCurrentHp: calculateBossCurrentHp(tasksAfterInsert),
  };
}
