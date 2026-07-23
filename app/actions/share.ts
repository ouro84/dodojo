"use server";

import { createClient } from "@/lib/supabase/server";
import type { ShareCardParams, ShareEventType, ShareSource } from "@/lib/share-card";

// US-20 : analytics minimal de partage — n'affecte jamais l'UX si ça échoue
// (feature additive, jamais bloquante, cf. design). Erreurs avalées, comme
// markTutorialSeen (app/actions/profile.ts).
export async function logShareEvent(
  event: ShareEventType,
  source: ShareSource,
  outcome: ShareCardParams["outcome"],
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: null };

  await supabase.from("share_events").insert({
    user_id: user.id,
    source,
    event,
    outcome,
  });

  return { error: null };
}
