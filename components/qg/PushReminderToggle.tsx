"use client";

import { useState, useTransition } from "react";
import { getServiceWorkerRegistration } from "@/lib/pwa/update-prompt-client";
import { urlBase64ToUint8Array } from "@/lib/pwa/push-subscribe";
import { subscribeToPush, unsubscribeFromPush } from "@/app/actions/push";

interface PushReminderToggleProps {
  hasSubscription: boolean; // état initial connu côté serveur (au chargement du Vestiaire)
}

type ToggleStatus = "unsupported" | "denied" | "off" | "on";

function readNotificationPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

function computeStatus(hasSubscription: boolean): ToggleStatus {
  const permission = readNotificationPermission();
  if (permission === "unsupported") return "unsupported";
  if (permission === "denied") return "denied";
  return hasSubscription && permission === "granted" ? "on" : "off";
}

// US-11 : toggle d'opt-in explicite — aucun prompt navigateur non sollicité
// (Notification.requestPermission() déclenché uniquement au clic ici).
// Reflète l'état RÉEL du navigateur (Notification.permission), pas
// seulement la ligne en base — cf. edge case "permission révoquée après
// souscription" du design.
export default function PushReminderToggle({ hasSubscription }: PushReminderToggleProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<ToggleStatus>(() => computeStatus(hasSubscription));
  // Ajustement d'état pendant le rendu (pattern React recommandé) plutôt
  // qu'un useEffect : évite le rendu en cascade signalé par
  // react-hooks/set-state-in-effect tout en recalculant le statut si la
  // prop serveur change (ex. navigation retour au Vestiaire).
  const [prevHasSubscription, setPrevHasSubscription] = useState(hasSubscription);
  if (hasSubscription !== prevHasSubscription) {
    setPrevHasSubscription(hasSubscription);
    setStatus(computeStatus(hasSubscription));
  }

  function activate() {
    setError(null);
    startTransition(async () => {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        return;
      }

      const registration = await getServiceWorkerRegistration();
      if (!registration) {
        setError("Rappels indisponibles (app non installée ou service worker inactif).");
        return;
      }

      // Réconciliation (piège H5) : si le navigateur a déjà une souscription
      // active (ex. ligne DB perdue/jamais créée), ne jamais rappeler
      // subscribe() — ça échouerait ou recréerait une souscription
      // équivalente pour rien. On réutilise l'existante et on s'assure juste
      // que la DB est à jour, plutôt que de se contenter d'afficher "on"
      // sans vérifier : la DB reste la source de vérité.
      const existing = await registration.pushManager.getSubscription();
      let pushSubscription = existing;
      if (!pushSubscription) {
        const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!publicKey) {
          setError("Configuration push manquante.");
          return;
        }

        pushSubscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          // TS 5.9 distingue Uint8Array<ArrayBuffer> de Uint8Array<ArrayBufferLike> ;
          // BufferSource (défini pour SharedArrayBuffer aussi) n'infère pas l'un
          // depuis l'autre — le cast est sûr, le buffer vient bien d'un ArrayBuffer
          // neuf (new Uint8Array(length) dans urlBase64ToUint8Array).
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        });
      }
      const json = pushSubscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        setError("Souscription push incomplète.");
        return;
      }

      const result = await subscribeToPush({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setStatus("on");
    });
  }

  function deactivate() {
    setError(null);
    startTransition(async () => {
      const registration = await getServiceWorkerRegistration();
      const pushSubscription = await registration?.pushManager.getSubscription();
      const endpoint = pushSubscription?.endpoint;
      await pushSubscription?.unsubscribe();
      if (endpoint) await unsubscribeFromPush(endpoint);
      setStatus("off");
    });
  }

  if (status === "unsupported") {
    return (
      <p className="text-xs text-faint">🔔 Rappel du soir : indisponible sur ce navigateur/appareil.</p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink">🔔 Rappel du soir (17h30)</p>
        <button
          type="button"
          disabled={pending || status === "denied"}
          onClick={status === "on" ? deactivate : activate}
          className="rounded-md border border-border bg-bg px-3 py-2.5 font-display text-[10px] uppercase tracking-wide text-gold disabled:opacity-50"
        >
          {status === "on" ? "Désactiver" : status === "denied" ? "Bloqué par le navigateur" : "Activer"}
        </button>
      </div>
      {status === "denied" && (
        <p className="text-xs text-faint">
          Autorise les notifications dans les réglages du navigateur pour activer ce rappel.
        </p>
      )}
      {error && <p className="text-xs text-hp-text">{error}</p>}
    </div>
  );
}
