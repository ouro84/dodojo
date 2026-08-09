"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceRoleClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;

export interface ExportedUserData {
  profile: Record<string, unknown>;
  tasks: Record<string, unknown>[];
  dayResults: Record<string, unknown>[];
  unlockedHeroes: Record<string, unknown>[];
  unlockedSkins: Record<string, unknown>[];
  unlockedAchievements: Record<string, unknown>[];
  dailyBoss: Record<string, unknown>[];
  recurringTemplates: Record<string, unknown>[];
  pushSubscriptions: { endpoint: string; created_at: string }[];
}

// Issue #154 (art. 20 RGPD) : agrège toutes les tables personnelles de
// l'utilisateur via le client de session (RLS suffit, mêmes lectures que le
// reste de l'app — pas besoin de service-role ici, contrairement à
// deleteAccount). Exclut volontairement webhook_token_hash (hash inutile
// pour l'utilisateur, jamais le clair stocké) et les clés de chiffrement
// push (p256dh/auth, techniques au navigateur, pas une donnée exploitable
// par l'utilisateur) — cf. spec pour le raisonnement complet.
export async function exportUserData(): Promise<{
  data: ExportedUserData | null;
  error: string | null;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Session expirée. Reconnecte-toi." };

  const [
    { data: profile },
    { data: tasks },
    { data: dayResults },
    { data: unlockedHeroes },
    { data: unlockedSkins },
    { data: unlockedAchievements },
    { data: dailyBoss },
    { data: recurringTemplates },
    { data: pushSubscriptions },
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id),
    supabase.from("tasks").select("*").eq("user_id", user.id),
    supabase.from("day_results").select("*").eq("user_id", user.id),
    supabase.from("unlocked_heroes").select("*").eq("user_id", user.id),
    supabase.from("unlocked_skins").select("*").eq("user_id", user.id),
    supabase.from("unlocked_achievements").select("*").eq("user_id", user.id),
    supabase.from("daily_boss").select("*").eq("user_id", user.id),
    supabase.from("recurring_templates").select("*").eq("user_id", user.id),
    supabase.from("push_subscriptions").select("*").eq("user_id", user.id),
  ]);

  const profileRow: Row = { ...((profile as Row[] | null)?.[0] ?? {}) };
  delete profileRow.webhook_token_hash;

  return {
    error: null,
    data: {
      profile: profileRow,
      tasks: (tasks as Row[] | null) ?? [],
      dayResults: (dayResults as Row[] | null) ?? [],
      unlockedHeroes: (unlockedHeroes as Row[] | null) ?? [],
      unlockedSkins: (unlockedSkins as Row[] | null) ?? [],
      unlockedAchievements: (unlockedAchievements as Row[] | null) ?? [],
      dailyBoss: (dailyBoss as Row[] | null) ?? [],
      recurringTemplates: (recurringTemplates as Row[] | null) ?? [],
      pushSubscriptions: ((pushSubscriptions as Row[] | null) ?? []).map((row) => ({
        endpoint: row.endpoint as string,
        created_at: row.created_at as string,
      })),
    },
  };
}

const DELETE_CONFIRM_TEXT = "SUPPRIMER";
const DELETE_USER_ATTEMPTS = 3;

// Issue #154 (art. 17 RGPD) : suppression réelle et définitive du compte.
// Toutes les FK vers profiles.id sont `on delete cascade` (vérifié dans les
// migrations) — cet appel unique purge tasks/day_results/unlocked_*/
// daily_boss/recurring_*/push_subscriptions/share_events/oauth_* en cascade,
// aucune purge manuelle table par table nécessaire. Client service-role
// requis pour auth.admin.* (bypass RLS) — jamais @/lib/supabase/server pour
// cet appel. Retry sur le flake JWT Admin GoTrue documenté (CLAUDE.md) :
// confirmé qu'un retry immédiat guérit systématiquement ce 403 intermittent.
export async function deleteAccount(confirmText: string): Promise<{ error: string | null }> {
  if (confirmText !== DELETE_CONFIRM_TEXT) {
    return { error: `Tape exactement "${DELETE_CONFIRM_TEXT}" pour confirmer.` };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.NEXT_PRIVATE_KEY_SUPABASE;
  if (!supabaseUrl || !serviceKey) {
    return { error: "Dodojo n'a pas pu supprimer ton compte. Réessaie." };
  }
  const admin = createServiceRoleClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  for (let attempt = 0; attempt < DELETE_USER_ATTEMPTS; attempt++) {
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (!error) return { error: null };
  }

  return { error: "Dodojo n'a pas pu supprimer ton compte. Réessaie." };
}
