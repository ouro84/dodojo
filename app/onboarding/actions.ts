"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getHero } from "@/lib/heroes";

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
  });

  if (error) {
    return { error: "Le dojo n'a pas pu enregistrer ton nom. Réessaie." };
  }

  await supabase.from("unlocked_heroes").insert({
    user_id: user.id,
    hero_id: starterId,
    price_paid: 0,
  });

  redirect("/");
}
