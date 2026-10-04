"use client";

import { useEffect } from "react";
import { getServiceWorkerRegistration } from "@/lib/pwa/update-prompt-client";
import { createFreshPushSubscription } from "@/lib/pwa/push-subscribe";
import { getPushSubscriptionState, subscribeToPush } from "@/app/actions/push";

export type PushResyncOutcome = "skipped" | "up-to-date" | "resubscribed" | "failed";

// Issue #215 : quand le service push rejette une souscription (404/410), les
// fonctions Inngest la marquent expirée. Sans resync, l'appareil ne reçoit
// plus rien et rien ne le signale à l'utilisateur. Au chargement de l'Arène,
// si CET appareil porte une souscription que la base connaît comme expirée
// pour CET utilisateur, on la remplace par une neuve, sans interaction.
//
// Jamais d'abonnement d'office : un endpoint inconnu (appareil jamais abonné
// par ce compte, désactivation explicite, autre compte sur l'appareil) ne
// déclenche rien — l'opt-in reste le toggle du Vestiaire.
export async function resyncPushSubscription(): Promise<PushResyncOutcome> {
  if (typeof window === "undefined" || !("Notification" in window)) return "skipped";
  if (Notification.permission !== "granted") return "skipped";

  const registration = await getServiceWorkerRegistration();
  const local = await registration?.pushManager.getSubscription();
  if (!registration || !local) return "skipped";

  const state = await getPushSubscriptionState(local.endpoint);
  if (state !== "expired") return state === "active" ? "up-to-date" : "skipped";

  try {
    const fresh = await createFreshPushSubscription(registration);
    if (!fresh) return "failed";
    const result = await subscribeToPush(fresh);
    return result.error ? "failed" : "resubscribed";
  } catch (err) {
    // Certains navigateurs (Safari) peuvent exiger un geste utilisateur pour
    // subscribe() : la ligne reste expirée, le toggle du Vestiaire affiche
    // "Activer" et la réactivation manuelle reste possible.
    console.warn("[push] resync de la souscription échouée", err);
    return "failed";
  }
}

export default function PushSubscriptionResync() {
  useEffect(() => {
    void resyncPushSubscription();
  }, []);
  return null;
}
