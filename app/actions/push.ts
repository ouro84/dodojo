"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface SerializedPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

interface PushActionResult {
  error: string | null;
}

// Issue #215 : état, pour l'utilisateur courant, de la souscription locale du
// navigateur. "unknown" couvre aussi un endpoint enregistré par un AUTRE
// compte sur cet appareil (RLS + filtre user_id) — jamais une raison de
// réabonner d'office cet utilisateur-ci.
export type PushSubscriptionState = "active" | "expired" | "unknown";

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
      // Réenregistrer un endpoint marqué expiré le réactive (sinon la purge
      // ci-dessous le supprimerait aussitôt).
      expired_at: null,
    },
    { onConflict: "endpoint" },
  );

  if (error) return { error: "Impossible d'activer les rappels. Réessaie." };

  // Issue #215 : la nouvelle souscription remplace les anciennes que le
  // service push a rejetées (404/410) — plus rien à resynchroniser pour elles.
  await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .not("expired_at", "is", null);

  revalidatePath("/vestiaire");
  return { error: null };
}

export async function getPushSubscriptionState(endpoint: string): Promise<PushSubscriptionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !endpoint) return "unknown";

  const { data } = await supabase
    .from("push_subscriptions")
    .select("expired_at")
    .eq("user_id", user.id)
    .eq("endpoint", endpoint)
    .maybeSingle();
  if (!data) return "unknown";
  return data.expired_at ? "expired" : "active";
}

// US-11 : désinscription explicite (toggle désactivé côté Le Vestiaire). Pas un DELETE
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
  revalidatePath("/vestiaire");
  return { error: null };
}
