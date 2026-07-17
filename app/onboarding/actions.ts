"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface CreateProfileState {
  error: string | null;
}

export async function createProfile(
  _previous: CreateProfileState,
  formData: FormData,
): Promise<CreateProfileState> {
  const username = String(formData.get("username") ?? "").trim();

  if (!username) {
    return { error: "Un pseudo de combattant, ça se choisit. Tape quelque chose." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase.from("profiles").insert({
    id: user.id,
    username,
  });

  if (error) {
    return { error: "Le dojo n'a pas pu enregistrer ton nom. Réessaie." };
  }

  redirect("/");
}
