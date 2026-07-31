"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getHero } from "@/lib/heroes";
import { applyNewAchievements, assembleAchievementContext } from "@/app/actions/achievements";
import type { AggressivityLevel } from "@/types";

export interface CreateProfileState {
  error: string | null;
}

export async function createProfile(
  _previous: CreateProfileState,
  formData: FormData,
): Promise<CreateProfileState> {
  const username = String(formData.get("username") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "UTC").trim() || "UTC";
  const starterId = String(formData.get("starterId") ?? "").trim();
  const aggressivityLevelRaw = String(formData.get("aggressivityLevel") ?? "direct").trim();
  const aggressivityLevel: AggressivityLevel = (
    ["doux", "direct", "brut"] as const
  ).includes(aggressivityLevelRaw as AggressivityLevel)
    ? (aggressivityLevelRaw as AggressivityLevel)
    : "direct";

  if (!username) {
    return { error: "Un pseudo de combattant, ça se choisit. Tape quelque chose." };
  }
  if (!getHero(starterId)) {
    return { error: "Choisis ton combattant avant d'entrer." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // US-29 : profil + starter équipé + starter offert (seul héros gratuit).
  const { error } = await supabase.from("profiles").insert({
    id: user.id,
    username,
    timezone,
    equipped_hero_id: starterId,
    aggressivity_level: aggressivityLevel,
  });

  if (error) {
    return { error: "Dodojo n'a pas pu enregistrer ton nom. Réessaie." };
  }

  await supabase.from("unlocked_heroes").insert({
    user_id: user.id,
    hero_id: starterId,
    price_paid: 0,
  });

  // Issue #72 : enregistre le succès du héros starter. Pas de toast possible
  // ici (redirect() interrompt l'exécution, aucune valeur de retour lue par
  // le client) — l'achievement est simplement persisté, il apparaîtra dans
  // le catalogue et sera de toute façon re-catché par resolveDailyBoss au
  // premier chargement de l'Arène juste après.
  const ctx = await assembleAchievementContext(supabase, user.id);
  await applyNewAchievements(supabase, user.id, ctx);

  redirect("/");
}
