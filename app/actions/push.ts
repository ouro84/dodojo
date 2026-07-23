"use server";

import { createClient } from "@/lib/supabase/server";

export interface SerializedPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

interface PushActionResult {
  error: string | null;
}

// US-11 : enregistre une souscription push. Upsert par endpoint (unique en
// base) — une re-souscription après reload ne doit jamais dupliquer la ligne.
export async function subscribeToPush(
  subscription: SerializedPushSubscription,
): Promise<PushActionResult> {
  if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    return { error: "Souscription push invalide." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
    { onConflict: "endpoint" },
  );

  if (error) return { error: "Impossible d'activer les rappels. Réessaie." };
  return { error: null };
}

// US-11 : désinscription explicite (toggle désactivé côté QG). Pas un DELETE
// soumis à RG-04 — donnée technique d'appareil, policy DELETE autorisée
// (cf. supabase/migrations/20260723090000_create_push_subscriptions.sql).
export async function unsubscribeFromPush(endpoint: string): Promise<PushActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée. Reconnecte-toi." };

  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", endpoint);

  if (error) return { error: "Impossible de désactiver les rappels. Réessaie." };
  return { error: null };
}
