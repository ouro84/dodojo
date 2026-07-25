"use client";

import { useSyncExternalStore } from "react";

// La timezone IANA du navigateur (ex: "Europe/Paris"). Constante après le
// montage du composant — un navigateur ne change pas de timezone en cours de
// session sans reload. On n'a donc pas de vraie souscription à faire.
//
// useSyncExternalStore est le pattern projet (cf. hooks/useSpeechToText.ts,
// usePwaUpdatePrompt.ts) pour exposer une valeur browser-only sans mismatch
// d'hydration Next.js :
//   - getServerSnapshot retourne "UTC" pendant le SSR
//   - getClientSnapshot retourne la vraie tz après hydratation
// React réconcilie le deux sans warning (snapshot serveur supposé différer).
//
// Contexte : bug #92. Avant, un useEffect au montage écrivait la tz détectée
// dans un ref d'input qui n'existait pas encore à l'étape "pseudo" → tzRef.current
// toujours null → tous les profils créés avec timezone="UTC" → reset du jour
// calculé en UTC au lieu de l'heure locale (00h04 Paris = 22h04 UTC la veille).

const FALLBACK = "UTC";

function subscribe(): () => void {
  return () => {};
}

function getClientSnapshot(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz || FALLBACK;
  } catch {
    return FALLBACK;
  }
}

function getServerSnapshot(): string {
  return FALLBACK;
}

export function useBrowserTimezone(): string {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}
