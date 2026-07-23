export interface InstallPromptState {
  deferredPrompt: BeforeInstallPromptEvent | null;
  installed: boolean;
  standalone: boolean;
}

export const initialInstallPromptState: InstallPromptState = {
  deferredPrompt: null,
  installed: false,
  standalone: false,
};

// Pure : dérive la visibilité du CTA maison depuis l'état capturé. La
// capture de l'évènement navigateur elle-même (lib/pwa/install-prompt-client.ts)
// dépend du DOM et n'est pas testable unitairement.
export function canInstall(state: InstallPromptState): boolean {
  return state.deferredPrompt !== null && !state.installed && !state.standalone;
}
