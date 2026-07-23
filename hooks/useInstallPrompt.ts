"use client";

import { useSyncExternalStore } from "react";
import { canInstall } from "@/lib/pwa/install-prompt-store";
import { initialInstallPromptState } from "@/lib/pwa/install-prompt-store";
import {
  getInstallPromptSnapshot,
  promptInstall,
  subscribeInstallPrompt,
} from "@/lib/pwa/install-prompt-client";

function getServerSnapshot() {
  return initialInstallPromptState;
}

export function useInstallPrompt(): {
  canInstall: boolean;
  promptInstall: () => Promise<void>;
} {
  const state = useSyncExternalStore(
    subscribeInstallPrompt,
    getInstallPromptSnapshot,
    getServerSnapshot,
  );
  return { canInstall: canInstall(state), promptInstall };
}
