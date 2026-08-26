"use client";

import { useSyncExternalStore } from "react";

// Issue #194 : `prefers-reduced-motion` était lu dans l'initialiseur d'un
// `useState(() => typeof window !== "undefined" && matchMedia(...).matches)`
// (`Arena.tsx`), donc évalué **aussi pendant le SSR** — un composant client est
// rendu sur le serveur avant hydratation. Le serveur répondait toujours
// `false`, le navigateur d'un utilisateur en reduced-motion `true` : les
// sprites de combat sortaient avec la classe `sprite-run` côté serveur et sans
// côté client (plus les styles d'animation), donc un mismatch d'hydratation
// React (#418) sur l'Arène. React régénère alors tout l'arbre client et
// **abandonne le replay des évènements discrets** capturés pendant
// l'hydratation — un clic parti juste après l'affichage est perdu sans trace
// (cf. le rouge déterministe de `e2e/volume-interieur.spec.ts`, même cause sur
// `/vestiaire/profil`).
//
// Même patron que `hooks/useBrowserTimezone.ts`/`useSpeechToText.ts` : React
// rend avec `getServerSnapshot` pendant l'hydratation (sortie identique au HTML
// serveur) puis re-rend avec la valeur client juste après, sans erreur. Ne
// jamais revenir à une lecture de `matchMedia` dans le rendu initial.
//
// À noter : ce réglage est le seul des trois qui peut changer **en cours de
// session** (l'utilisateur bascule l'option système sans recharger), d'où une
// vraie souscription au `MediaQueryList` plutôt qu'un `subscribe` no-op.
const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const list = window.matchMedia(QUERY);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

function getClientSnapshot(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(QUERY).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}
