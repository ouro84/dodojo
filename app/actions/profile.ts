"use server";

import { createClient } from "@/lib/supabase/server";

// US-29 : marque le coach du 1er combat comme vu. Échoue silencieusement sans
// bloquer le jeu (au pire le coach réapparaît une fois).
export async function markTutorialSeen(): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: null };
  await supabase.from("profiles").update({ has_seen_tutorial: true }).eq("id", user.id);
  return { error: null };
}
