import type { SupabaseClient } from "@supabase/supabase-js";

export const GEMINI_CLIENT_NAME_PATTERN = "%gemini%";

// US-22 : identifie les client_id enregistres dont le nom ressemble a
// "Gemini" (heuristique - la DCR RFC 7591 n'impose pas d'identifiant client
// stable ; documente comme risque/hypothese dans CLAUDE.md). Reutilise par
// le statut affiche au QG ET par la deconnexion (une seule requete, jamais
// dupliquee).
export async function findGeminiClientIds(supabase: SupabaseClient): Promise<string[]> {
  const { data } = await supabase
    .from("oauth_clients")
    .select("client_id")
    .ilike("client_name", GEMINI_CLIENT_NAME_PATTERN);
  return (data ?? []).map((row: { client_id: string }) => row.client_id);
}

export async function isGeminiConnected(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const clientIds = await findGeminiClientIds(supabase);
  if (clientIds.length === 0) return false;
  const { count } = await supabase
    .from("oauth_tokens")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("client_id", clientIds);
  return (count ?? 0) > 0;
}
