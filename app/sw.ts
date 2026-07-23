/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { CacheFirst, ExpirationPlugin, Serwist } from "serwist";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import type { PushReminderPayload } from "../lib/push-copy";

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
const RUNTIME_CACHED_IMAGE_PREFIXES = ["/sprites/", "/backgrounds/", "/vfx/"];

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
// app/api/cron/push-reminders/route.ts via web-push). "Plus tard" (action)
// referme sans ouvrir l'app — évite de forcer l'ouverture juste pour dismiss.
self.addEventListener("push", (event: PushEvent) => {
  if (!event.data) return;
  const payload = event.data.json() as PushReminderPayload;
  const options: NotificationOptionsWithActions = {
    body: payload.body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: payload.url },
    actions: [{ action: "later", title: "Plus tard" }],
  };
  event.waitUntil(self.registration.showNotification(payload.title, options));
});

// Clic sur la notification : focus un onglet existant sinon ouvre l'Arène
// (data.url). L'action "Plus tard" ferme déjà la notification (ligne
// suivante, commune à toutes les actions) sans rien ouvrir de plus.
self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  if (event.action === "later") return;

  const url = (event.notification.data as { url?: string } | undefined)?.url ?? "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsList) => {
      const existing = clientsList[0];
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    }),
  );
});
