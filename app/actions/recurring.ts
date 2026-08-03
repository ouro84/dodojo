"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  dayKey,
  nextSiblingPosition,
  planRecurringGeneration,
  type RecurringTemplateRule,
} from "@/lib/game-engine";
import type { Task } from "@/types";

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

// Cache de saut (issue #156) : écrit APRÈS un passage réussi, jamais avant —
// voir generateRecurringInstances pour le raisonnement complet.
async function markGenDay(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  today: string,
): Promise<void> {
  await supabase
    .from("profiles")
    .update({ last_recurring_gen_day: today })
    .eq("id", userId);
}

async function userDayAndGenFlag(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<{ today: string; lastGenDay: string | null }> {
  const { data } = await supabase
    .from("profiles")
    .select("timezone, last_recurring_gen_day")
    .eq("id", userId)
    .maybeSingle();
  return {
    today: dayKey(new Date(), data?.timezone ?? "UTC"),
    lastGenDay: (data?.last_recurring_gen_day as string | null) ?? null,
  };
}

// US-17 : génère les instances de routines manquantes pour le jour local courant.
// Idempotent (B1) : ne crée jamais de doublon (anti-doublon D5 via les instances
// déjà présentes) et ne génère jamais pour un jour passé (D6 : seul `today`).
// Appelée au chargement de l'Arène (couvre les jours sans reste, où Le Réveil
// Réveil bloquant ne se monte pas) — pas de revalidate ici, la page lit ensuite.
export async function generateRecurringInstances(
  options: { force?: boolean } = {},
): Promise<{ error: string | null; created: number; createdTasks: Task[] }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: null, created: 0, createdTasks: [] };

  const { today, lastGenDay } = await userDayAndGenFlag(supabase, user.id);

  // Cache de saut (issue #156) : évite de rejouer six requêtes à chaque GET de
  // /, prefetch RSC de BottomNav compris. `force` court-circuite ce cache pour
  // les appels déclenchés par une action utilisateur (création de routine, fin
  // du Réveil), qui doivent produire leur effet le jour même.
  if (!options.force && lastGenDay === today) {
    return { error: null, created: 0, createdTasks: [] };
  }

  const { data: templates, error: templatesError } = await supabase
    .from("recurring_templates")
    .select("id, title, weekdays, is_active, position")
    .eq("user_id", user.id)
    .eq("is_active", true);

  if (templatesError) {
    return { error: null, created: 0, createdTasks: [] };
  }
  if (!templates || templates.length === 0) {
    // Aucune routine à générer : passage réussi malgré tout, le cache évite
    // de rejouer cette requête à chaque GET de / pour un profil sans routine.
    await markGenDay(supabase, user.id, today);
    return { error: null, created: 0, createdTasks: [] };
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

  // Issue #156 (P2) : restes actifs d'un jour antérieur portés par une routine.
  // Le Réveil va les traiter ; générer une instance fraîche maintenant créerait
  // un doublon dès que l'utilisateur clique « Reporter ».
  const { data: overdueRecurring } = await supabase
    .from("tasks")
    .select("recurring_template_id")
    .eq("user_id", user.id)
    .lt("day_date", today)
    .eq("is_completed", false)
    .eq("is_abandoned", false)
    .not("recurring_template_id", "is", null);

  const existingIds = new Set(
    (existingToday ?? []).map((r) => r.recurring_template_id as string),
  );
  const restIds = new Set((restDays ?? []).map((r) => r.template_id as string));
  const overdueIds = new Set(
    (overdueRecurring ?? []).map((r) => r.recurring_template_id as string),
  );

  const toCreate = planRecurringGeneration(
    templates as RecurringTemplateRule[],
    today,
    existingIds,
    restIds,
    overdueIds,
  );
  if (toCreate.length === 0) {
    await markGenDay(supabase, user.id, today);
    return { error: null, created: 0, createdTasks: [] };
  }

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

  // Bug #70 : les lignes créées sont renvoyées explicitement. WakeUpRitual est
  // un overlay client bloquant — revalidatePath n'atteint pas le state déjà
  // hydraté d'Arena, qui initialise `tasks` une seule fois depuis les props
  // serveur. Sans ce retour, une routine régénérée en fin de rituel resterait
  // invisible jusqu'au prochain rechargement complet.
  //
  // Issue #156 (P1) : insertion ligne par ligne plutôt qu'en un seul batch.
  // `tasks_recurring_unique_per_day` étant un index PARTIEL (where is_abandoned
  // = false), PostgREST ne peut pas le cibler via `.upsert({onConflict: "..."})`
  // — celui-ci génère un `ON CONFLICT (colonnes)` sans le prédicat `WHERE` de
  // l'index, que Postgres rejette avec `42P10` ("no unique or exclusion
  // constraint matching the ON CONFLICT specification"), vérifié en direct
  // avant d'écrire ce correctif. On insère donc une ligne à la fois et on
  // intercepte `23505` (violation d'unicité) comme "quelqu'un d'autre a gagné
  // la course" plutôt qu'une vraie erreur. Un insert multi-lignes unique
  // aurait par ailleurs annulé tout le lot dès qu'UNE ligne entrait en
  // conflit — chaque routine doit pouvoir réussir indépendamment des autres.
  const createdTasks: Task[] = [];
  for (const row of rows) {
    const { data, error } = await supabase.from("tasks").insert(row).select().single();
    if (!error) {
      createdTasks.push(data as Task);
      continue;
    }
    if (error.code === "23505") continue; // course perdue : l'autre exécution a créé la ligne.
    return {
      error: "Impossible de générer les quêtes du jour.",
      created: createdTasks.length,
      createdTasks,
    };
  }

  await markGenDay(supabase, user.id, today);

  return { error: null, created: createdTasks.length, createdTasks };
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

  // force : le cache de saut a déjà été posé au chargement de l'Arène ce matin,
  // sans quoi créer une routine à 14 h ne produirait aucune instance le jour même.
  await generateRecurringInstances({ force: true });
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
  revalidatePath("/vestiaire/entrainement");
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
  revalidatePath("/vestiaire/entrainement");
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

  revalidatePath("/vestiaire/entrainement");
  return { error: null };
}
