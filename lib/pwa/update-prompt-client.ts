import { Serwist } from "@serwist/window";

// Singleton module : une seule registration par onglet, peu importe combien
// de composants montent usePwaUpdatePrompt.
let serwist: Serwist | null = null;
let updateAvailable = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

// Enregistré uniquement en production : en dev, un SW qui cache des chunks
// JS interférerait avec le Fast Refresh de Next.js.
export function initUpdatePrompt(): void {
  if (serwist || typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  if (process.env.NODE_ENV !== "production") return;

  serwist = new Serwist("/serwist/sw.js", { scope: "/" });

  serwist.addEventListener("waiting", () => {
    updateAvailable = true;
    emit();
  });

  serwist.addEventListener("controlling", () => {
    window.location.reload();
  });

  void serwist.register();
}

export function subscribeUpdatePrompt(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getUpdatePromptSnapshot(): boolean {
  return updateAvailable;
}

// Dit au SW en attente d'activer immédiatement (self.skipWaiting()) ; le
// listener "controlling" ci-dessus recharge la page une fois qu'il a pris
// le contrôle.
export function reloadForUpdate(): void {
  serwist?.messageSkipWaiting();
}
