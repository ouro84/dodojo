"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { getServiceWorkerRegistration } from "@/lib/pwa/update-prompt-client";
import { urlBase64ToUint8Array } from "@/lib/pwa/push-subscribe";
import { subscribeToPush, unsubscribeFromPush } from "@/app/actions/push";
import GameIcon from "@/components/ui/GameIcon";

interface PushReminderToggleProps {
  hasSubscription: boolean; // état initial connu côté serveur (au chargement du Vestiaire)
}

// "pending" = rendu serveur et rendu d'hydratation, avant que la permission
// réelle du navigateur ne soit lisible (cf. commentaire du store ci-dessous).
type ToggleStatus = "pending" | "unsupported" | "denied" | "off" | "on";
type BrowserPermission = "pending" | "unsupported" | NotificationPermission;

// Issue #194 : la permission était lue dans l'initialiseur d'un
// `useState(() => computeStatus(...))`, donc évaluée **aussi pendant le SSR**
// (un composant client est rendu sur le serveur avant hydratation). Sans
// `window`, la lecture renvoyait "unsupported" : le HTML serveur portait le
// `<p>` "indisponible sur ce navigateur" là où le client rendait le `<div>` du
// toggle. Mismatch d'hydratation (#418) sur `/vestiaire/profil` à chaque
// chargement → React régénère tout l'arbre client et **abandonne le replay des
// évènements discrets** capturés pendant l'hydratation, donc un clic parti
// juste après l'affichage est perdu sans trace (cause du rouge déterministe de
// `e2e/volume-interieur.spec.ts`).
//
// `useSyncExternalStore` est le patron projet pour exposer une valeur
// browser-only sans mismatch (cf. `hooks/useBrowserTimezone.ts`,
// `hooks/useSpeechToText.ts`) : React rend avec `getServerSnapshot` pendant
// l'hydratation — même sortie que le HTML serveur — puis re-rend avec la
// valeur client juste après, sans erreur. Ne jamais revenir à une lecture de
// `Notification` dans le rendu initial.
function subscribeToPermission(): () => void {
  // `Notification.permission` ne notifie aucun changement ; une révocation en
  // cours de session est de toute façon rattrapée au prochain chargement.
  return () => {};
}

function getClientPermission(): BrowserPermission {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

function getServerPermission(): BrowserPermission {
  return "pending";
}

function computeStatus(permission: BrowserPermission, hasSubscription: boolean): ToggleStatus {
  if (permission === "pending") return "pending";
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
  const permission = useSyncExternalStore(
    subscribeToPermission,
    getClientPermission,
    getServerPermission,
  );
  // Statut dérivé de la permission du navigateur, sauf après une action de
  // l'utilisateur dans cette session (activate/deactivate), qui prime.
  const [override, setOverride] = useState<ToggleStatus | null>(null);
  // Ajustement d'état pendant le rendu (pattern React recommandé) plutôt
  // qu'un useEffect : évite le rendu en cascade signalé par
  // react-hooks/set-state-in-effect tout en repartant de la permission réelle
  // si la prop serveur change (ex. navigation retour au Vestiaire).
  const [prevHasSubscription, setPrevHasSubscription] = useState(hasSubscription);
  if (hasSubscription !== prevHasSubscription) {
    setPrevHasSubscription(hasSubscription);
    setOverride(null);
  }
  const status = override ?? computeStatus(permission, hasSubscription);

  function activate() {
    setError(null);
    startTransition(async () => {
      // Nom distinct de la `permission` du store ci-dessus (shadowing) : ici
      // c'est le résultat frais du prompt, pas le snapshot du rendu.
      const prompted = await Notification.requestPermission();
      if (prompted !== "granted") {
        setOverride(prompted === "denied" ? "denied" : "off");
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
      setOverride("on");
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
      setOverride("off");
    });
  }

  if (status === "unsupported") {
    return (
      <p className="inline-flex items-center gap-1.5 text-xs text-faint">
        <GameIcon name="bell" className="h-3.5 w-3.5" /> Rappel du soir : indisponible sur ce
        navigateur/appareil.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3">
        <p className="inline-flex items-center gap-1.5 text-sm text-ink">
          <GameIcon name="bell" className="h-4 w-4" /> Rappel du soir (17h30)
        </p>
        <button
          type="button"
          // "pending" : la permission réelle n'est pas encore lisible (rendu
          // serveur / hydratation). Le bouton est de toute façon inerte avant
          // hydratation — l'afficher désactivé est honnête, et ça garde
          // surtout un HTML identique de part et d'autre de l'hydratation.
          disabled={pending || status === "denied" || status === "pending"}
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
