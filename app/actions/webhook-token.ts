"use server";

import { createClient } from "@/lib/supabase/server";
import { generateWebhookToken, hashWebhookToken } from "@/lib/webhook-token";

export interface WebhookTokenActionResult {
  error: string | null;
  token?: string;
  createdAt?: string;
}

// US-03 : (ré)génère le token webhook personnel (Siri/iOS Shortcuts). Écrase
// l'ancien hash — invalidation immédiate, sans DELETE (pas une donnée RG-04,
// pas un historique de combat). Le token en clair n'est renvoyé qu'ICI, une
// seule fois : jamais relu depuis la base ensuite (seul son hash SHA-256 est
// persisté, cf. lib/webhook-token.ts). webhook_token_last_used_at repart à
// null : la précédente "dernière utilisation" concernait l'ancien token.
export async function regenerateWebhookToken(): Promise<WebhookTokenActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const token = generateWebhookToken();
  const createdAt = new Date().toISOString();

  const { error } = await supabase
    .from("profiles")
    .update({
      webhook_token_hash: hashWebhookToken(token),
      webhook_token_created_at: createdAt,
      webhook_token_last_used_at: null,
    })
    .eq("id", user.id);

  if (error) return { error: "Impossible de générer le token. Réessaie." };
  return { error: null, token, createdAt };
}
