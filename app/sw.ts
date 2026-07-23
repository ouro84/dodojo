/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { CacheFirst, ExpirationPlugin, Serwist } from "serwist";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";

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
