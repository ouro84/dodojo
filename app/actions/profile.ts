"use server";

import { createClient } from "@/lib/supabase/server";
import type { AggressivityLevel } from "@/types";

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

// US-54 : réglage modifiable à tout moment (onboarding ou QG), pas de contrainte
// one-shot contrairement au pseudo.
export async function updateAggressivityLevel(
  level: AggressivityLevel,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const { error } = await supabase
    .from("profiles")
    .update({ aggressivity_level: level })
    .eq("id", user.id);

  if (error) return { error: "Le dojo n'a pas pu enregistrer ton réglage. Réessaie." };
  return { error: null };
}
