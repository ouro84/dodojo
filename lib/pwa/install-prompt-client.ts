import {
  canInstall as canInstallPure,
  initialInstallPromptState,
  type InstallPromptState,
} from "./install-prompt-store";

let state: InstallPromptState = initialInstallPromptState;
const listeners = new Set<() => void>();
let initialized = false;

function emit(): void {
  for (const listener of listeners) listener();
}

function detectStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const mql = window.matchMedia?.("(display-mode: standalone)");
  return Boolean(mql?.matches) || window.navigator.standalone === true;
}

// Idempotent : appelable depuis plusieurs montages, n'attache les listeners
// qu'une fois. Doit être appelé le plus tôt possible (layout racine) car
// `beforeinstallprompt` ne se rejoue pas s'il est manqué.
export function initInstallPromptCapture(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  state = { ...state, standalone: detectStandalone() };

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state = { ...state, deferredPrompt: event, installed: false };
    emit();
  });

  window.addEventListener("appinstalled", () => {
    state = { ...state, deferredPrompt: null, installed: true };
    emit();
  });
}

export function subscribeInstallPrompt(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getInstallPromptSnapshot(): InstallPromptState {
  return state;
}

export { canInstallPure as canInstall };

export async function promptInstall(): Promise<void> {
  const prompt = state.deferredPrompt;
  if (!prompt) return;
  await prompt.prompt();
  await prompt.userChoice;
  state = { ...state, deferredPrompt: null };
  emit();
}
