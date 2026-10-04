import type { SupabaseClient } from "@supabase/supabase-js";

// Issue #215 : un 404/410 du service push signifie que l'abonnement n'existe
// plus côté navigateur/OS. La ligne était supprimée en silence — aucune
// trace pour dater la panne, et plus rien pour savoir que cet appareil avait
// été abonné par cet utilisateur. On la marque expirée (ignorée à l'envoi),
// ce qui permet au client de la remplacer (cf. PushSubscriptionResync).
export function isExpiredPushStatus(statusCode: number | undefined): boolean {
  return statusCode === 404 || statusCode === 410;
}

export async function markPushSubscriptionExpired(
  supabase: SupabaseClient,
  sub: { user_id?: string; endpoint: string },
  statusCode: number,
  source: string,
): Promise<void> {
  const { error } = await supabase
    .from("push_subscriptions")
    .update({ expired_at: new Date().toISOString() })
    .eq("endpoint", sub.endpoint);
  console.warn(`[${source}] souscription push expirée`, {
    userId: sub.user_id,
    statusCode,
    error: error?.message,
  });
}
