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

  // Un contrôleur déjà présent AVANT cet enregistrement signale une mise à
  // jour réelle (un SW précédent est remplacé) — un premier visiteur n'a
  // encore aucun contrôleur, donc "controlling" y signale juste l'activation
  // initiale, pas une mise à jour : on ne doit recharger que dans le premier
  // cas, sinon chaque nouveau visiteur subit un rechargement silencieux et
  // non sollicité juste après son tout premier chargement.
  const hadControllerBeforeRegistration = navigator.serviceWorker.controller !== null;

  serwist = new Serwist("/serwist/sw.js", { scope: "/" });

  serwist.addEventListener("waiting", () => {
    updateAvailable = true;
    emit();
  });

  serwist.addEventListener("controlling", () => {
    if (hadControllerBeforeRegistration) {
      window.location.reload();
    }
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
