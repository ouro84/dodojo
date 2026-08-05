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

const VALID_AGGRESSIVITY_LEVELS: AggressivityLevel[] = ["doux", "direct", "brut"];

// US-54 : réglage modifiable à tout moment (onboarding ou Le Vestiaire), pas de contrainte
// one-shot contrairement au pseudo.
export async function updateAggressivityLevel(
  level: AggressivityLevel,
): Promise<{ error: string | null }> {
  // Audit #67, PR5 : le typage ne protège pas un appel direct à la server
  // action (bypass du composant). Une valeur hors énumération persistée
  // ferait planter ~12 sites `pools[level]` dans lib/copy/* (cf. le crash
  // déjà documenté dans lib/aggressivity.ts pour la même classe de bug).
  if (!VALID_AGGRESSIVITY_LEVELS.includes(level)) {
    return { error: "Niveau d'agressivité invalide." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const { error } = await supabase
    .from("profiles")
    .update({ aggressivity_level: level })
    .eq("id", user.id);

  if (error) return { error: "Dodojo n'a pas pu enregistrer ton réglage. Réessaie." };
  return { error: null };
}

// Issue #116 : réglable à tout moment depuis Le Vestiaire, pas de contrainte
// one-shot. Borné 12-23 (cf. spec — évite une section "Demain" quasi
// permanente) : le CHECK en base est la garde ultime, rejet précoce ici pour
// un message d'erreur clair côté UI.
export async function updatePlanTomorrowAfterHour(
  hour: number,
): Promise<{ error: string | null }> {
  if (!Number.isInteger(hour) || hour < 12 || hour > 23) {
    return { error: "Heure de planification invalide." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const { error } = await supabase
    .from("profiles")
    .update({ plan_tomorrow_after_hour: hour })
    .eq("id", user.id);

  if (error) return { error: "Dodojo n'a pas pu enregistrer ce réglage. Réessaie." };
  return { error: null };
}

const MAX_USERNAME_LENGTH = 24;

// Issue #69 : pseudo éditable à tout moment depuis Le Profil (fixé une seule
// fois à l'onboarding jusqu'ici). Pas de contrainte d'unicité (aucune en
// base sur profiles.username). Cap à 24 caractères : aligné sur la
// troncature défensive déjà faite côté affichage (lib/share-card.ts).
export async function updateUsername(username: string): Promise<{ error: string | null }> {
  const trimmed = username.trim();
  if (!trimmed) {
    return { error: "Un pseudo, ça se choisit. Tape quelque chose." };
  }
  if (trimmed.length > MAX_USERNAME_LENGTH) {
    return { error: `Le pseudo ne peut pas dépasser ${MAX_USERNAME_LENGTH} caractères.` };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const { error } = await supabase.from("profiles").update({ username: trimmed }).eq("id", user.id);
  if (error) return { error: "Dodojo n'a pas pu enregistrer ton pseudo. Réessaie." };
  return { error: null };
}

// Issue #69 : fuseau horaire éditable à tout moment (fixé une seule fois à
// l'onboarding jusqu'ici, via Intl côté navigateur). Valide contre la même
// liste IANA que le sélecteur (Intl.supportedValuesOf, dispo Node ≥18).
export async function updateTimezone(timezone: string): Promise<{ error: string | null }> {
  if (!Intl.supportedValuesOf("timeZone").includes(timezone)) {
    return { error: "Fuseau horaire invalide." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const { error } = await supabase.from("profiles").update({ timezone }).eq("id", user.id);
  if (error) return { error: "Dodojo n'a pas pu enregistrer ton fuseau. Réessaie." };
  return { error: null };
}
