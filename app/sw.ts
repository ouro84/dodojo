/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { CacheFirst, ExpirationPlugin, Serwist } from "serwist";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import type { PushReminderPayload } from "../lib/copy/notifications";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Chemins publics dont les images sont mises en cache runtime À LA DEMANDE
// (jamais précachées en bloc — 12 boss × dizaines de frames, l'utilisateur
// ne verra jamais la plupart des boss, cf.
// docs/superpowers/specs/2026-07-22-pwa-design.md) : sprites de boss/héros,
// décors, effets visuels.
const RUNTIME_CACHED_IMAGE_PREFIXES = ["/sprites/", "/backgrounds/"];

const serwist = new Serwist({
  // self.__SW_MANIFEST est injecté par app/serwist/[path]/route.ts : les
  // chunks JS/CSS du build Next.js (hashés, donc déjà versionnés) +
  // additionalPrecacheEntries (police, manifest, page offline — voir route.ts).
  precacheEntries: self.__SW_MANIFEST,
  // false : le nouveau SW doit rester en `waiting` (pas d'activation auto) pour
  // que l'évènement `waiting` de @serwist/window se déclenche → toast "Nouvelle
  // version disponible" (usePwaUpdatePrompt) → l'utilisateur choisit de recharger
  // via reloadForUpdate()/messageSkipWaiting() (lib/pwa/update-prompt-client.ts).
  // À `true`, le SW s'auto-active immédiatement : le toast ne s'affiche jamais
  // et le rechargement (guardé par hadControllerBeforeRegistration) survient
  // silencieusement, sans consentement utilisateur.
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher({ request }) {
        if (request.destination !== "image") return false;
        const { pathname } = new URL(request.url);
        return RUNTIME_CACHED_IMAGE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
      },
      handler: new CacheFirst({
        cacheName: "dodojo-sprites",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 250,
            maxAgeSeconds: 60 * 60 * 24 * 90, // 90 jours
          }),
        ],
      }),
    },
  ],
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();

// lib.dom.d.ts n'expose pas encore `actions` sur NotificationOptions (support
// navigateur réel via ServiceWorkerRegistration.showNotification pourtant
// bien standard) — extension locale plutôt qu'un cast qui masquerait une
// vraie erreur de forme sur les autres champs.
interface NotificationOptionsWithActions extends NotificationOptions {
  actions?: Array<{ action: string; title: string; icon?: string }>;
}

// US-11 : notification de rappel (payload JSON envoyé par
// lib/inngest/functions/send-reminder.ts via web-push). "Plus tard" (action)
// referme sans ouvrir l'app — évite de forcer l'ouverture juste pour dismiss.
// Issue #114 (amélioration C) : payload.taskId présent uniquement pour un
// rappel de deadline (jamais le rappel quotidien générique) — ajoute alors
// l'action "snooze15".
self.addEventListener("push", (event: PushEvent) => {
  if (!event.data) return;
  const payload = event.data.json() as PushReminderPayload;
  const actions: Array<{ action: string; title: string }> = payload.taskId
    ? [
        { action: "snooze15", title: "+15 min" },
        { action: "later", title: "Plus tard" },
      ]
    : [{ action: "later", title: "Plus tard" }];
  const options: NotificationOptionsWithActions = {
    body: payload.body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: payload.url, taskId: payload.taskId, userId: payload.userId },
    actions,
  };
  event.waitUntil(self.registration.showNotification(payload.title, options));
});

// Clic sur la notification : focus un onglet existant sinon ouvre l'Arène
// (data.url). L'action "Plus tard" ferme déjà la notification (ligne
// suivante, commune à toutes les actions) sans rien ouvrir de plus.
// Issue #114 (amélioration C) : "snooze15" repousse le RAPPEL (pas la
// deadline elle-même) via la route dédiée, sans ouvrir de fenêtre — garde-fou
// volontaire contre un contournement silencieux de la pénalité HP.
self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  if (event.action === "later") return;

  const data = event.notification.data as
    | { url?: string; taskId?: string; userId?: string }
    | undefined;

  if (event.action === "snooze15" && data?.taskId && data?.userId) {
    event.waitUntil(
      fetch("/api/push/snooze-deadline-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: data.taskId, userId: data.userId }),
      }),
    );
    return;
  }

  const url = data?.url ?? "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsList) => {
      const existing = clientsList[0];
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    }),
  );
});
