"use client";

import { useSyncExternalStore } from "react";

// Placeholder rendu côté serveur ET pendant l'hydratation : la valeur réelle
// dépend de l'horloge et du fuseau du navigateur, jamais disponibles au SSR.
const PLACEHOLDER = "--:--";
const TICK_MS = 30_000;

function formatRemainingUntilMidnight(): string {
  const now = new Date();
  const midnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0,
    0,
    0,
    0,
  );
  const totalMinutes = Math.max(
    0,
    Math.floor((midnight.getTime() - now.getTime()) / 60_000),
  );
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

// Issue #194 : le label vivait dans un `useState(() => format...())`, donc
// calculé une première fois **pendant le SSR** — avec l'horloge et le fuseau
// du serveur (UTC sur Vercel), pas ceux du joueur. Le HTML serveur affichait
// donc une autre valeur que le premier rendu client, ce qui déclenchait une
// erreur d'hydratation React (#418) sur l'Arène à chaque chargement hors UTC :
// React régénère alors tout l'arbre client et **abandonne le replay des
// évènements discrets** capturés pendant l'hydratation — un clic parti juste
// après l'affichage est perdu sans trace (cf. `PushReminderToggle`, même
// issue, et le rouge déterministe de `e2e/volume-interieur.spec.ts`).
//
// Le compteur est donc exposé comme un store externe : `getServerSnapshot`
// renvoie le placeholder (identique au HTML serveur, hydratation propre),
// `getClientSnapshot` la vraie valeur, poussée ensuite à chaque tick. Même
// patron que `hooks/useBrowserTimezone.ts`/`useSpeechToText.ts` — préféré à un
// `useEffect` qui poserait l'état au montage (rendu en cascade signalé par
// `react-hooks/set-state-in-effect`).
const listeners = new Set<() => void>();
let snapshot: string | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

function emit(): void {
  const next = formatRemainingUntilMidnight();
  if (next === snapshot) return;
  snapshot = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!timer) {
    // Le premier abonné (re)synchronise immédiatement : entre l'import du
    // module et le montage, la minute a pu tourner.
    emit();
    timer = setInterval(emit, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function getClientSnapshot(): string {
  // `getSnapshot` doit être stable entre deux appels d'un même rendu : on
  // renvoie la valeur mémoïsée, jamais un `format...()` frais (React
  // détecterait une boucle de rendu infinie sur le changement de minute).
  if (snapshot === null) snapshot = formatRemainingUntilMidnight();
  return snapshot;
}

function getServerSnapshot(): string {
  return PLACEHOLDER;
}

export default function MidnightTimer() {
  const label = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);

  return (
    <span
      className="rounded-md border border-alert/50 bg-black/40 px-2 py-0.5 font-display text-xl tabular-nums text-alert drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]"
      aria-label={`Temps restant avant minuit : ${label}`}
    >
      {label}
    </span>
  );
}
