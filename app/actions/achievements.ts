"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Équipement manuel (D8) : dès le premier appel réussi, l'auto-écrasement
// s'arrête définitivement pour ce profil (title_manually_set = true).
export async function equipTitle(code: string | null): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  if (code !== null) {
    const { data: owned } = await supabase
      .from("unlocked_achievements")
      .select("code")
      .eq("user_id", user.id)
      .eq("code", code)
      .maybeSingle();
    if (!owned) return { error: "Ce titre n'est pas encore débloqué." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ equipped_title_code: code, title_manually_set: true })
    .eq("id", user.id);
  if (error) return { error: "Impossible d'équiper ce titre. Réessaie." };

  revalidatePath("/tableau-de-chasse/succes");
  revalidatePath("/tableau-de-chasse");
  revalidatePath("/");
  return { error: null };
}
