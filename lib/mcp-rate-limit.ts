import type { SupabaseClient } from "@supabase/supabase-js";

// Defense en profondeur : garde IP en memoire (lib/rate-limit.ts, best-effort)
// PUIS ce quota autoritaire par utilisateur (D4 du spec). Fail-open sur une
// erreur RPC : une panne de la fonction elle-meme (migration pas encore
// appliquee, table absente) ne doit jamais bloquer un appel MCP legitime -
// le rate limit est une protection contre l'abus, pas un point unique de
// defaillance pour le service.
export async function consumeMcpQuota(
  supabase: SupabaseClient,
  userId: string,
  limit = 120,
  windowSeconds = 60,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("consume_mcp_quota", {
    p_user_id: userId,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) return true;
  return data === true;
}
