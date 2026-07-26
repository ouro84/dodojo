"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  dayKey,
  nextSiblingPosition,
  planRecurringGeneration,
  type RecurringTemplateRule,
} from "@/lib/game-engine";

interface RecurringActionResult {
  error: string | null;
  id?: string;
}

async function userToday(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string> {
  const { data } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", userId)
    .maybeSingle();
  return dayKey(new Date(), data?.timezone ?? "UTC");
}

// US-17 : génère les instances de routines manquantes pour le jour local courant.
// Idempotent (B1) : ne crée jamais de doublon (anti-doublon D5 via les instances
// déjà présentes) et ne génère jamais pour un jour passé (D6 : seul `today`).
// Appelée au chargement de l'Arène (couvre les jours sans reste, où Le Réveil
// Réveil bloquant ne se monte pas) — pas de revalidate ici, la page lit ensuite.
export async function generateRecurringInstances(): Promise<{
  error: string | null;
  created: number;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: null, created: 0 };

  const today = await userToday(supabase, user.id);

  const { data: templates, error: templatesError } = await supabase
    .from("recurring_templates")
    .select("id, title, weekdays, is_active, position")
    .eq("user_id", user.id)
    .eq("is_active", true);

  if (templatesError || !templates || templates.length === 0) {
    return { error: null, created: 0 };
  }

  // Instances déjà présentes aujourd'hui pour ces routines (fraîches OU restes
  // reportés → D5) + jours de repos du jour (A2).
  const { data: existingToday } = await supabase
    .from("tasks")
    .select("recurring_template_id")
    .eq("user_id", user.id)
    .eq("day_date", today)
    .not("recurring_template_id", "is", null);

  const { data: restDays } = await supabase
    .from("recurring_rest_days")
    .select("template_id")
    .eq("user_id", user.id)
    .eq("day_date", today);

  const existingIds = new Set(
    (existingToday ?? []).map((r) => r.recurring_template_id as string),
  );
  const restIds = new Set((restDays ?? []).map((r) => r.template_id as string));

  const toCreate = planRecurringGeneration(
    templates as RecurringTemplateRule[],
    today,
    existingIds,
    restIds,
  );
  if (toCreate.length === 0) return { error: null, created: 0 };

  // Position en tête de la fratrie racine du jour.
  const { data: roots } = await supabase
    .from("tasks")
    .select("position")
    .eq("user_id", user.id)
    .eq("day_date", today)
    .is("parent_id", null);
  let position = nextSiblingPosition(roots ?? []);

  const byId = new Map(templates.map((t) => [t.id, t]));
  const rows = toCreate.map((templateId) => {
    const tpl = byId.get(templateId)!;
    return {
      user_id: user.id,
      title: tpl.title,
      day_date: today,
      is_recurring: true,
      recurring_template_id: templateId,
      position: position++,
    };
  });

  const { error } = await supabase.from("tasks").insert(rows);
  if (error) return { error: "Impossible de générer les quêtes du jour.", created: 0 };

  return { error: null, created: rows.length };
}

// US-17 : crée une routine. Effet immédiat : si aujourd'hui matche, l'instance du
// jour est générée dans la foulée (via la génération idempotente).
export async function createRecurringTemplate(
  title: string,
  weekdays: number[],
): Promise<RecurringActionResult> {
  const trimmed = title.trim();
  if (!trimmed) return { error: "Nomme ta quête récurrente." };
  if (weekdays.length === 0) {
    return { error: "Choisis au moins un jour d'entraînement." };
  }
  if (weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    return { error: "Jours de la semaine invalides." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const { data: existing } = await supabase
    .from("recurring_templates")
    .select("position")
    .eq("user_id", user.id);

  const { data: inserted, error } = await supabase
    .from("recurring_templates")
    .insert({
      user_id: user.id,
      title: trimmed,
      weekdays: [...new Set(weekdays)].sort((a, b) => a - b),
      position: nextSiblingPosition(existing ?? []),
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return { error: "La quête a résisté. Réessaie." };
  }

  await generateRecurringInstances();
  revalidatePath("/");
  return { error: null, id: inserted.id };
}

// US-17 (B4) : édition future-seulement — ne touche jamais les instances déjà créées.
export async function updateRecurringTemplate(
  id: string,
  updates: { title?: string; weekdays?: number[] },
): Promise<RecurringActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const patch: { title?: string; weekdays?: number[] } = {};
  if (updates.title !== undefined) {
    const t = updates.title.trim();
    if (!t) return { error: "Nomme ta quête récurrente." };
    patch.title = t;
  }
  if (updates.weekdays !== undefined) {
    if (updates.weekdays.length === 0) {
      return { error: "Choisis au moins un jour d'entraînement." };
    }
    if (updates.weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
      return { error: "Jours de la semaine invalides." };
    }
    patch.weekdays = [...new Set(updates.weekdays)].sort((a, b) => a - b);
  }

  const { error } = await supabase
    .from("recurring_templates")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: "Impossible de modifier la quête. Réessaie." };
  revalidatePath("/qg/entrainement");
  return { error: null };
}

// US-17 : désactivation (pas de DELETE, esprit RG-04). Effet futur seulement.
export async function deactivateRecurringTemplate(
  id: string,
): Promise<RecurringActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const { error } = await supabase
    .from("recurring_templates")
    .update({ is_active: false })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: "Impossible de désactiver la quête. Réessaie." };
  revalidatePath("/qg/entrainement");
  return { error: null };
}

// US-17 (A2) : bascule le jour de repos du jour courant pour une routine.
export async function toggleRestDay(
  templateId: string,
): Promise<RecurringActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const today = await userToday(supabase, user.id);

  const { data: existing } = await supabase
    .from("recurring_rest_days")
    .select("template_id")
    .eq("user_id", user.id)
    .eq("template_id", templateId)
    .eq("day_date", today)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("recurring_rest_days")
      .delete()
      .eq("user_id", user.id)
      .eq("template_id", templateId)
      .eq("day_date", today);
  } else {
    await supabase.from("recurring_rest_days").insert({
      user_id: user.id,
      template_id: templateId,
      day_date: today,
    });
  }

  revalidatePath("/qg/entrainement");
  return { error: null };
}
