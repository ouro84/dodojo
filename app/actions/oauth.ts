"use server";

import { createClient } from "@/lib/supabase/server";
import { findGeminiClientIds } from "@/lib/oauth-gemini";

export interface GeminiDisconnectResult {
  error: string | null;
}

// US-22 : revoque, depuis Le Vestiaire, les autorisations MCP dont le client_name
// ressemble a "Gemini" (heuristique assumee - la DCR RFC 7591 n'impose
// aucun identifiant stable pour un client, cf. CLAUDE.md/Risques du
// design). Symetrique de POST /oauth/revoke (declenche, lui, depuis les
// reglages Gemini) : les deux chemins doivent laisser le QG refleter
// l'etat reel.
export async function disconnectGemini(): Promise<GeminiDisconnectResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expiree. Reconnecte-toi." };

  const clientIds = await findGeminiClientIds(supabase);
  if (clientIds.length === 0) return { error: null };

  const { error } = await supabase.from("oauth_tokens").delete().eq("user_id", user.id).in("client_id", clientIds);

  if (error) return { error: "Impossible de deconnecter Gemini. Reessaie." };
  return { error: null };
}
