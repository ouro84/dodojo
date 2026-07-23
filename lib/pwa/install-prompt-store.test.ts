import { describe, expect, test } from "vitest";
import { canInstall, initialInstallPromptState } from "./install-prompt-store";

describe("canInstall (CTA d'installation maison)", () => {
  test("faux par défaut (aucun beforeinstallprompt capté)", () => {
    expect(canInstall(initialInstallPromptState)).toBe(false);
  });

  test("vrai quand un prompt a été capturé et que l'app n'est ni installée ni en standalone", () => {
    const state = {
      ...initialInstallPromptState,
      deferredPrompt: {} as BeforeInstallPromptEvent,
    };
    expect(canInstall(state)).toBe(true);
  });

  test("faux si déjà installée", () => {
    const state = {
      ...initialInstallPromptState,
      deferredPrompt: {} as BeforeInstallPromptEvent,
      installed: true,
    };
    expect(canInstall(state)).toBe(false);
  });

  test("faux si déjà lancée en mode standalone", () => {
    const state = {
      ...initialInstallPromptState,
      deferredPrompt: {} as BeforeInstallPromptEvent,
      standalone: true,
    };
    expect(canInstall(state)).toBe(false);
  });
});
